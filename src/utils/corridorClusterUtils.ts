import { Permit } from '../types/permit';
import {
  calculateDistanceMiles,
  formatPermitCrossStreetAndScope,
  resolvePermitCardContact,
  ResolvedPermitCardContact,
} from './maricopaPermitsData';
import {
  PermitSeverityTier,
  classifyPermitSeverity,
} from './geofenceUtils';
import { getLocalPermitNote } from '../services/driveService';
import {
  extractContactsFromPermitNotes,
  inferPermitLifecycleStage,
} from './permitNotesIntelligence';

export interface CorridorClusterGroup {
  clusterId: string;
  corridorName: string;
  corridorSpanLabel: string;
  contractorDisplay: string;
  resolvedContact: ResolvedPermitCardContact;
  permits: Permit[];
  totalCount: number;
  unvisitedCount: number;
  loggedCount: number;
  minDistanceMiles: number;
  corridorLengthMiles: number;
  dominantSeverity: PermitSeverityTier;
  tcRangeSummary: string;
}

export type CorridorFeedEntry =
  | { kind: 'cluster'; cluster: CorridorClusterGroup; firstRankIndex: number }
  | { kind: 'single'; permit: Permit; rankIndex: number };

const SEVERITY_PRIORITY: Record<PermitSeverityTier, number> = {
  precon_action: 4,
  active_trench: 3,
  issued: 2,
  logged: 1,
};

/**
 * Extracts a normalized primary road corridor name from a permit's location/milepost,
 * e.g. "W Patton Rd & N 203rd Ave" -> { key: "w patton rd", label: "W Patton Rd" }.
 */
export function extractPrimaryCorridor(permit: Permit): { key: string; label: string; crossPart: string } {
  const { crossStreet } = formatPermitCrossStreetAndScope(permit);
  const cleaned = crossStreet
    .replace(/\([^)]*\)/g, '')
    .replace(/\bCorridor\b/gi, '')
    .replace(/,\s*.*$/, '')
    .trim();

  const parts = cleaned
    .split(/\s*(?:&|\/|\bat\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const rawPrimary = parts[0] || cleaned || 'County ROW';
  const crossPart = parts[1] || '';

  const normalizedLabel = rawPrimary
    .replace(/\bRoad\b/gi, 'Rd')
    .replace(/\bDrive\b/gi, 'Dr')
    .replace(/\bAvenue\b/gi, 'Ave')
    .replace(/\bStreet\b/gi, 'St')
    .replace(/\bLane\b/gi, 'Ln')
    .replace(/\bBoulevard\b/gi, 'Blvd')
    .replace(/\bParkway\b/gi, 'Pkwy')
    .replace(/\bHighway\b/gi, 'Hwy')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    key: normalizedLabel.toLowerCase(),
    label: normalizedLabel,
    crossPart: crossPart.trim(),
  };
}

/**
 * Normalizes contractor company strings so "Team Fishel / Utility Fiber Services"
 * and "Corning Optical / Team Fishel" or "Team Fishel" cluster together cleanly.
 */
export function normalizeContractorClusterKey(companyName: string): {
  key: string;
  shortName: string;
} {
  const raw = (companyName || '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('team fishel') || lower.includes('fishel')) {
    return { key: 'team-fishel', shortName: 'Team Fishel' };
  }
  if (lower.includes('michels') || lower.includes('salt river') || lower.includes('srp')) {
    return { key: 'srp-michels', shortName: 'SRP / Michels Power' };
  }
  if (lower.includes('henkels') || lower.includes('aps') || lower.includes('arizona public')) {
    return { key: 'aps-henkels', shortName: 'APS / Henkels & McCoy' };
  }
  if (lower.includes('southwest gas') || lower.includes('npl')) {
    return { key: 'swg-npl', shortName: 'Southwest Gas / NPL' };
  }
  if (lower.includes('cox') || lower.includes('csw')) {
    return { key: 'cox-csw', shortName: 'Cox / CSW Contractors' };
  }
  if (lower.includes('lumen') || lower.includes('centurylink') || lower.includes('b&f')) {
    return { key: 'lumen-bf', shortName: 'Lumen / B&F Contracting' };
  }

  const base = raw
    .replace(/\b(llc|inc\.?|corp\.?|corporation|co\.?|company|group|services)\b/gi, '')
    .replace(/[^a-z0-9\s/&'-]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    key: (base || 'permittee').toLowerCase(),
    shortName: raw || 'Permittee',
  };
}

/**
 * Groups permits in the active feed that lie along the same primary road corridor
 * and share the same contractor (within 4 miles of each other) into expandable
 * 'Corridor Cluster' cards, while leaving standalone permits as single cards.
 */
export function buildSmartCorridorFeed(
  permits: Permit[],
  visitedTcNumbers: Set<string>
): CorridorFeedEntry[] {
  if (permits.length === 0) return [];

  interface Bucket {
    clusterKey: string;
    corridorLabel: string;
    contractorDisplay: string;
    resolvedContact: ResolvedPermitCardContact;
    crossStreets: string[];
    members: Array<{ permit: Permit; originalIdx: number; severity: PermitSeverityTier; isLogged: boolean }>;
  }

  const bucketsByKey = new Map<string, Bucket[]>();

  permits.forEach((permit, idx) => {
    const corridor = extractPrimaryCorridor(permit);
    const localNote = getLocalPermitNote(permit.tcNumber);
    const notes = localNote?.inspectorNotes || [];
    const extractedContacts = extractContactsFromPermitNotes(notes);
    const stage = inferPermitLifecycleStage(notes);
    const isVisited = visitedTcNumbers.has(permit.tcNumber);
    const isLogged = isVisited || stage === 'Closed';
    const severity = classifyPermitSeverity(permit, isVisited, stage);
    const resolvedContact = resolvePermitCardContact(
      permit,
      extractedContacts,
      localNote?.preConContact
    );
    const contractorNorm = normalizeContractorClusterKey(resolvedContact.companyName);

    const groupKey = `${corridor.key}::${contractorNorm.key}`;
    const existingList = bucketsByKey.get(groupKey) || [];

    // Attach to an existing spatial bucket on the same corridor if within 4.0 miles
    let matchedBucket: Bucket | null = null;
    for (const b of existingList) {
      const anchor = b.members[0].permit;
      const dist = calculateDistanceMiles(anchor.lat, anchor.lng, permit.lat, permit.lng);
      if (dist <= 4.0) {
        matchedBucket = b;
        break;
      }
    }

    if (matchedBucket) {
      matchedBucket.members.push({ permit, originalIdx: idx, severity, isLogged });
      if (corridor.crossPart && !matchedBucket.crossStreets.includes(corridor.crossPart)) {
        matchedBucket.crossStreets.push(corridor.crossPart);
      }
    } else {
      const newBucket: Bucket = {
        clusterKey: `${groupKey}::${existingList.length}`,
        corridorLabel: corridor.label,
        contractorDisplay: contractorNorm.shortName,
        resolvedContact,
        crossStreets: corridor.crossPart ? [corridor.crossPart] : [],
        members: [{ permit, originalIdx: idx, severity, isLogged }],
      };
      existingList.push(newBucket);
      bucketsByKey.set(groupKey, existingList);
    }
  });

  const emittedClusterKeys = new Set<string>();
  const feed: CorridorFeedEntry[] = [];
  let runningRank = 0;

  // Flatten buckets by lookup per permit ID
  const bucketByPermitId = new Map<string, Bucket>();
  for (const list of bucketsByKey.values()) {
    for (const b of list) {
      for (const m of b.members) {
        bucketByPermitId.set(m.permit.id, b);
      }
    }
  }

  for (const permit of permits) {
    const bucket = bucketByPermitId.get(permit.id);
    if (!bucket || bucket.members.length < 2) {
      feed.push({
        kind: 'single',
        permit,
        rankIndex: runningRank,
      });
      runningRank += 1;
      continue;
    }

    if (emittedClusterKeys.has(bucket.clusterKey)) {
      continue;
    }
    emittedClusterKeys.add(bucket.clusterKey);

    const orderedPermits = bucket.members.map((m) => m.permit);
    let maxPairDist = 0;
    for (let i = 0; i < orderedPermits.length; i++) {
      for (let j = i + 1; j < orderedPermits.length; j++) {
        const d = calculateDistanceMiles(
          orderedPermits[i].lat,
          orderedPermits[i].lng,
          orderedPermits[j].lat,
          orderedPermits[j].lng
        );
        if (d > maxPairDist) maxPairDist = d;
      }
    }

    const minDist = orderedPermits.reduce(
      (min, p) =>
        p.distanceMiles !== undefined && p.distanceMiles < min ? p.distanceMiles : min,
      orderedPermits[0].distanceMiles ?? 0
    );

    let dominantSeverity: PermitSeverityTier = 'logged';
    let bestPrio = 0;
    let loggedCount = 0;
    for (const m of bucket.members) {
      if (m.isLogged) loggedCount++;
      const prio = SEVERITY_PRIORITY[m.severity];
      if (prio > bestPrio) {
        bestPrio = prio;
        dominantSeverity = m.severity;
      }
    }

    const spanCross =
      bucket.crossStreets.length >= 2
        ? `${bucket.crossStreets[0]} → ${bucket.crossStreets[bucket.crossStreets.length - 1]}`
        : bucket.crossStreets[0] || 'Multi-Lot Corridor';

    const spanMilesStr =
      maxPairDist >= 0.1 ? `${maxPairDist.toFixed(1)} mi span` : 'Adjacent ROW Lots';

    const sortedTcs = orderedPermits.map((p) => p.tcNumber.trim()).sort();
    const tcRangeSummary =
      sortedTcs.length === 2
        ? `${sortedTcs[0]}, ${sortedTcs[1]}`
        : `${sortedTcs[0]} – ${sortedTcs[sortedTcs.length - 1]}`;

    const cluster: CorridorClusterGroup = {
      clusterId: bucket.clusterKey,
      corridorName: bucket.corridorLabel,
      corridorSpanLabel: `${spanCross} · ${spanMilesStr}`,
      contractorDisplay: bucket.contractorDisplay,
      resolvedContact: bucket.resolvedContact,
      permits: orderedPermits,
      totalCount: orderedPermits.length,
      unvisitedCount: orderedPermits.length - loggedCount,
      loggedCount,
      minDistanceMiles: minDist,
      corridorLengthMiles: maxPairDist,
      dominantSeverity,
      tcRangeSummary,
    };

    feed.push({
      kind: 'cluster',
      cluster,
      firstRankIndex: runningRank,
    });
    runningRank += orderedPermits.length;
  }

  return feed;
}

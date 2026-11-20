import { Permit } from '../types/permit';
import { PermitLifecycleStage } from './permitNotesIntelligence';

export const GEOFENCE_RADIUS_METERS = 150;

export interface ScopeComplianceItem {
  id: string;
  label: string;
  specRef: string;
  logPhrase: string;
}

export interface ParsedAiFieldLog {
  workStatus: string;
  trafficControl: string;
  workSafety: string;
  restorationPlates: string;
  crewSummary: string;
  deficiencies: string[];
  cleanNarrative: string;
  fullLogRow: string;
  gpsStamp: string;
  timestamp: string;
}

/**
 * Exact Haversine distance in meters between two WGS84 coordinates.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Returns 3 scope-specific quick compliance checkboxes tailored to the permit's work scope
 * covering: (1) Traffic Control Setup, (2) Trench/Work Safety, and (3) Restoration/Plates.
 */
export function getScopeComplianceChecklist(permit: Permit): ScopeComplianceItem[] {
  switch (permit.permitType) {
    case 'Driveway Access':
      return [
        {
          id: 'tcp',
          label: 'Traffic Control Setup',
          specRef: 'MUTCD / MCDOT Note #17',
          logPhrase: 'Traffic control signs and shoulder cones compliant per approved TCP',
        },
        {
          id: 'safety',
          label: 'Saw-Cut & Forms Safety',
          specRef: 'MAG Detail 250 (No Exp. Joint)',
          logPhrase: 'Neat straight saw-cut along asphalt edge verified with no expansion joint',
        },
        {
          id: 'restoration',
          label: 'Drainage & Apron Finish',
          specRef: 'Slope Away / Culvert Clear',
          logPhrase: 'Positive drainage sloping away from roadway crown and clean ROW shoulder',
        },
      ];
    case 'Pavement Cut':
      return [
        {
          id: 'tcp',
          label: 'Traffic Control Setup',
          specRef: 'Arrow Board & Lane Taper',
          logPhrase: 'Approved TCP lane taper and advance warning signage in place',
        },
        {
          id: 'safety',
          label: 'Cut & Shoring Safety',
          specRef: 'Outside Wheel Path (Note #18)',
          logPhrase: 'Pavement saw-cuts verified outside wheel path with compliant excavation safety',
        },
        {
          id: 'restoration',
          label: 'T-Patch / Steel Plates',
          specRef: 'MAG 336.3 & 1" Pinned Plates',
          logPhrase: '1-inch steel trench plates pinned flush with 1:12 cold-mix ramps / CLSM ready',
        },
      ];
    case 'Signal / ITS Loop':
      return [
        {
          id: 'tcp',
          label: 'Traffic Control Setup',
          specRef: 'MCDOT Intersection TCP',
          logPhrase: 'Intersection lane shift and pedestrian ADA barricades compliant',
        },
        {
          id: 'safety',
          label: 'Loop Saw-Cut & Conduit',
          specRef: 'MCDOT Signal Manual',
          logPhrase: 'Loop detector saw-cut depth and splice vault clearance verified',
        },
        {
          id: 'restoration',
          label: 'Sealant & Pull Box',
          specRef: 'Epoxy Cure & Flush Lid',
          logPhrase: 'Loop sealant cured flush and pull box set to finish grade',
        },
      ];
    case 'Stormwater Tie-in':
      return [
        {
          id: 'tcp',
          label: 'Traffic Control Setup',
          specRef: 'Heavy Haul / Barricades',
          logPhrase: 'Type III barricades and haul route signage compliant per TCP',
        },
        {
          id: 'safety',
          label: 'Trench & Culvert Safety',
          specRef: 'OSHA Shoring & Rule 310 Dust',
          logPhrase: 'Culvert trench shoring and Rule 310 dust suppression verified',
        },
        {
          id: 'restoration',
          label: 'CLSM & Inlet Grade',
          specRef: 'MAG 601 / 1/2-Sack Slurry',
          logPhrase: '1/2-sack CLSM backfill and grate inlet flowline elevation verified',
        },
      ];
    case 'Lane Closure / Barricade':
      return [
        {
          id: 'tcp',
          label: 'Traffic Control Setup',
          specRef: 'ATSSA Flaggers & Tapers',
          logPhrase: 'Advance warning signs, channelizing devices, and tapers per approved TCP',
        },
        {
          id: 'safety',
          label: 'ADA & Work Zone Safety',
          specRef: 'MCDOT ADA & Clear Zone',
          logPhrase: 'ADA pedestrian detour path and equipment clear zone maintained',
        },
        {
          id: 'restoration',
          label: 'Track-Out & Plates',
          specRef: 'Swept Lane & Flush Plates',
          logPhrase: 'Travel lane swept clean of track-out debris and plates secured',
        },
      ];
    case 'Trench / Utility':
    default:
      return [
        {
          id: 'tcp',
          label: 'Traffic Control Setup',
          specRef: 'Approved TCP & Barricades',
          logPhrase: 'Traffic control barricades and advance signage compliant per approved TCP',
        },
        {
          id: 'safety',
          label: 'Trench / Work Safety',
          specRef: '48" Cover & Rule 310 Dust',
          logPhrase: 'Trench safety, minimum cover depth, and Rule 310 dust control verified',
        },
        {
          id: 'restoration',
          label: 'Restoration / Plates',
          specRef: 'MAG 200-1 CLSM / 1" Plates',
          logPhrase: '1/2-sack CLSM backfill / 1-inch pinned steel plates with cold-mix ramps verified',
        },
      ];
  }
}

export type BeaconShape = 'diamond' | 'circle' | 'pill';

/**
 * 4-Tier Tactical Severity Edge System for 2-second scan readability in Arizona desert glare:
 * - 'precon_action': Amber #F59E0B (Pre-Con / Action Required / Stop Work)
 * - 'active_trench': Safety Orange #EA580C (Active Trench / Excavation / Bore)
 * - 'issued': Cyan #0284C7 (Issued / Ready for Patrol Check)
 * - 'logged': Emerald #16A34A (Logged Today / Closed)
 */
export type PermitSeverityTier =
  | 'precon_action'
  | 'active_trench'
  | 'issued'
  | 'logged';

export function classifyPermitSeverity(
  permit: Permit,
  isVisitedToday: boolean,
  lifecycleStage?: PermitLifecycleStage | string
): PermitSeverityTier {
  if (isVisitedToday || lifecycleStage === 'Closed') {
    return 'logged';
  }

  const rawRit = (permit.rawRitStatus || '').toLowerCase();
  const status = (permit.status || '').toLowerCase();

  if (
    rawRit.includes('attention') ||
    rawRit.includes('stop work') ||
    rawRit.includes('in review') ||
    rawRit.includes('submitted') ||
    status === 'pre-con scheduled' ||
    lifecycleStage === 'Pre-Con Needed'
  ) {
    return 'precon_action';
  }

  const isTrenchOrExcavation =
    permit.permitType === 'Trench / Utility' ||
    permit.permitType === 'Pavement Cut' ||
    permit.permitType === 'Stormwater Tie-in' ||
    /trench|bore|excavat|pothole|open[- ]cut|conduit|mainline|slurry|plate|culvert/i.test(
      permit.projectTitle || ''
    );

  if (
    (status === 'active' && isTrenchOrExcavation) ||
    lifecycleStage === 'Active Work'
  ) {
    return 'active_trench';
  }

  return 'issued';
}

/**
 * Thick 8px color-coded left-edge status bar for Solar-Glare Tactical Contrast:
 * - Amber #F59E0B: Pre-Con / Action Required
 * - Safety Orange #EA580C: Active Trench
 * - Cyan #0284C7: Issued
 * - Emerald #16A34A: Logged
 */
export function getSeverityEdgeClass(severity: PermitSeverityTier): string {
  switch (severity) {
    case 'precon_action':
      return 'border-l-[8px] border-l-[#F59E0B]';
    case 'active_trench':
      return 'border-l-[8px] border-l-[#EA580C]';
    case 'logged':
      return 'border-l-[8px] border-l-[#16A34A]';
    case 'issued':
    default:
      return 'border-l-[8px] border-l-[#0284C7]';
  }
}

export function getSeverityMeta(
  severity: PermitSeverityTier,
  isClosed = false
): {
  label: string;
  hex: string;
  dotClass: string;
  textClass: string;
} {
  switch (severity) {
    case 'precon_action':
      return {
        label: 'Pre-Con / Action',
        hex: '#F59E0B',
        dotClass: 'bg-[#F59E0B]',
        textClass: 'text-amber-800 dark:text-amber-300',
      };
    case 'active_trench':
      return {
        label: 'Active Trench',
        hex: '#EA580C',
        dotClass: 'bg-[#EA580C]',
        textClass: 'text-orange-800 dark:text-orange-300',
      };
    case 'logged':
      return {
        label: isClosed ? 'Closed' : 'Logged Today',
        hex: '#16A34A',
        dotClass: 'bg-[#16A34A]',
        textClass: 'text-emerald-800 dark:text-emerald-300',
      };
    case 'issued':
    default:
      return {
        label: 'Issued',
        hex: '#0284C7',
        dotClass: 'bg-[#0284C7]',
        textClass: 'text-sky-800 dark:text-sky-300',
      };
  }
}

/**
 * Shape-coded map beacon classification so status is recognizable
 * by shape + icon + color in bright Arizona truck-cab sunlight:
 * - 'pill': Checkmark Pill -> Logged Today / Permit Closed
 * - 'diamond': Amber Diamond Beacon -> Cust. Attention / Stop Work / Pre-Con Scheduled
 * - 'circle': Circle Beacon -> Issued / Active (Needs Visit)
 */
export function classifyBeaconShape(
  permit: Permit,
  isVisitedToday: boolean,
  lifecycleStage?: PermitLifecycleStage | string
): BeaconShape {
  if (isVisitedToday || lifecycleStage === 'Closed') {
    return 'pill';
  }

  const rawRit = (permit.rawRitStatus || '').toLowerCase();
  const status = (permit.status || '').toLowerCase();

  if (
    rawRit.includes('attention') ||
    rawRit.includes('stop work') ||
    rawRit.includes('in review') ||
    rawRit.includes('submitted') ||
    status === 'pre-con scheduled'
  ) {
    return 'diamond';
  }

  return 'circle';
}

/**
 * Maps BeaconShape to the 8px Severity Edge bar for legacy callers.
 */
export function getCardLeftAccentClass(shape: BeaconShape): string {
  switch (shape) {
    case 'diamond':
      return 'border-l-[8px] border-l-[#F59E0B]';
    case 'pill':
      return 'border-l-[8px] border-l-[#16A34A]';
    case 'circle':
    default:
      return 'border-l-[8px] border-l-[#0284C7]';
  }
}

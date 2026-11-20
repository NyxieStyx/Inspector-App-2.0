import { Permit, StatusUpdate } from '../types/permit';
import { removeDuplicatePhrases, stripLogRowDecorations } from './docxExport';

export type PermitLifecycleStage =
  | 'Logged'
  | 'Pre-Con Done'
  | 'TCP Approved'
  | 'In Progress'
  | 'Final Check'
  | 'Closed';

export interface ExtractedPermitContact {
  name: string;
  company: string;
  phone: string;
  cleanPhone: string;
}

export interface StandardQuickPill {
  id: string;
  label: string;
  shortLabel: string;
  text: string;
  alreadyInNotes: boolean;
  recommended: boolean;
}

/**
 * Exact 5 MCDOT standard 1-tap note entries required for truck logging.
 */
export const MCDOT_STANDARD_NOTE_ENTRIES = {
  LOGGED: 'Permit logged.',
  TCP_APPROVED: 'TCP approved.',
  NO_CREW: 'Site visit performed. No crew observed on site working.',
  FINAL_CHECK:
    'Final site check performed. Confirmed work completed to MCDOT standard within county right-of-way.',
  CLOSED: 'Permit closed.',
} as const;

const NON_NAME_WORDS = new Set([
  'site',
  'visit',
  'performed',
  'permit',
  'logged',
  'closed',
  'tcp',
  'approved',
  'checked',
  'confirmed',
  'work',
  'completed',
  'crew',
  'observed',
  'working',
  'precon',
  'pre-con',
  'pre',
  'con',
  'meeting',
  'conducted',
  'held',
  'phone',
  'cell',
  'mobile',
  'office',
  'call',
  'called',
  'spoke',
  'met',
  'on',
  'at',
  'in',
  'for',
  'to',
  'and',
  'the',
  'with',
  'from',
  'driveway',
  'road',
  'street',
  'ave',
  'avenue',
  'blvd',
  'ln',
  'lane',
  'dr',
  'way',
  'pkwy',
  'hwy',
  'trench',
  'bore',
  'fiber',
  'concrete',
  'asphalt',
  'forms',
  'inspector',
  'county',
  'mcdot',
  'mac',
  'no',
  'none',
  'contact',
  'superintendent',
  'foreman',
  'contractor',
]);

function normalizeNoteBody(input: StatusUpdate | string): string {
  const raw = typeof input === 'string' ? input : input.text || '';
  return stripLogRowDecorations(raw);
}

function formatDisplayPhone(digits: string): string {
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length === 10) {
    return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  }
  return digits;
}

function smartTitleCaseWord(word: string): string {
  if (!word) return '';
  if (/^[A-Z0-9&/.-]{2,6}$/.test(word)) {
    // Preserve acronyms like SRP, APS, COX, SWG, LLC, INC
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function cleanPersonName(raw: string): string {
  if (!raw) return '';
  let candidate = raw
    .replace(/^[\s,.:;(-]+|[\s,.:;(-]+$/g, '')
    .replace(
      /^(?:with|from|by|and|contact|superintendent|supt|foreman|pm|project\s+manager|rep|representative|contractor)\b[\s:,-]*/gi,
      ''
    )
    .trim();

  if (!candidate) return '';

  // Split tokens and take trailing 1 to 3 valid name tokens
  const tokens = candidate.split(/\s+/).filter(Boolean);
  const validTail: string[] = [];

  for (let i = tokens.length - 1; i >= 0 && validTail.length < 3; i--) {
    const cleanTok = tokens[i].replace(/[^A-Za-z'-]/g, '');
    if (!cleanTok || cleanTok.length < 2) break;
    if (NON_NAME_WORDS.has(cleanTok.toLowerCase())) {
      break;
    }
    validTail.unshift(smartTitleCaseWord(cleanTok));
  }

  return validTail.join(' ').trim();
}

function cleanCompanyName(raw: string): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/^[\s,.:;(-]+|[\s,.:;)-]+$/g, '')
    .replace(/\b(?:regarding|for\s+the|for\s+driveway|for\s+underground|for\s+trench|on\s+[A-Z0-9]).*$/i, '')
    .replace(/\b(?:cell|mobile|phone|ph|tel)\b.*$/i, '')
    .trim();

  if (!cleaned || cleaned.length < 2 || cleaned.length > 48) return '';
  if (/^(?:site|work|permit|county|mcdot|pre-?con|tcp)$/i.test(cleaned)) return '';

  return cleaned
    .split(/\s+/)
    .map((w) => (w.includes('/') ? w.split('/').map(smartTitleCaseWord).join('/') : smartTitleCaseWord(w)))
    .join(' ');
}

/**
 * Automatically extracts embedded contacts (name, company, phone) from Permit Notes text.
 * Handles patterns like:
 * - "Abe Garcia (623) 826-4367"
 * - "Rick with Courtland Homes (480-694-5434)"
 * - "Met on site with Jeremy Rockwell with Down 2 Earth Communications/COX 602-418-9271"
 * - "Spoke with Carlos Mendez, SRP Electric, 602.236.8888"
 * - "Rick (Courtland Homes) 480-694-5434"
 */
export function extractContactsFromPermitNotes(
  notesOrTexts: Array<StatusUpdate | string>
): ExtractedPermitContact[] {
  if (!notesOrTexts || notesOrTexts.length === 0) return [];

  const byPhone = new Map<string, ExtractedPermitContact>();

  // Scan chronologically so later notes enrich/update contact details, then return newest first
  const orderedOrder: string[] = [];

  for (const item of notesOrTexts) {
    const text = normalizeNoteBody(item);
    if (!text) continue;

    const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s.]?\d{3}[-.\s.]?\d{4}\b/g;
    let match: RegExpExecArray | null;

    while ((match = phoneRegex.exec(text)) !== null) {
      const rawPhone = match[0];
      const digitsOnly = rawPhone.replace(/\D/g, '');
      const cleanTen =
        digitsOnly.length === 11 && digitsOnly.startsWith('1')
          ? digitsOnly.slice(1)
          : digitsOnly;

      if (cleanTen.length !== 10) continue;

      const matchStart = match.index;
      const matchEnd = matchStart + rawPhone.length;

      // Inspect text immediately preceding the phone number within the same sentence
      const beforeWindow = text.slice(Math.max(0, matchStart - 110), matchStart);
      const sentenceSegments = beforeWindow.split(/[.!?;]\s*/);
      let clause = (sentenceSegments[sentenceSegments.length - 1] || '').trim();

      // Removetrailing open paren or punctuation right before phone e.g. "Abe Garcia (" or "Courtland Homes ("
      clause = clause.replace(/[\s(,:-]+$/, '').trim();

      // Strip conversational/inspection lead-in phrases (non-greedy so second "with" in "Rick with Courtland" is preserved)
      clause = clause.replace(
        /^(?:.*?\b(?:pre-?con(?:struction)?(?:\s+meeting)?(?:\s+(?:conducted|held|completed|performed))?\s+with|met(?:\s+on[- ]site)?\s+with|spoke\s+(?:with|to)|talked\s+(?:with|to)|called|contacted|onsite\s+with|on-site\s+with|contact(?:\s+is)?\s*[:=-]|superintendent\s*[:=-]|foreman\s*[:=-]|pm\s*[:=-]|rep\s*[:=-])\s*)/i,
        ''
      );
      clause = clause.replace(/^(?:with|from|contact|called)\s+/i, '').trim();

      let extractedName = '';
      let extractedCompany = '';

      // Case 1: "Rick (Courtland Homes)" right before phone
      const parenCompanyMatch = clause.match(/^(.+?)\s*\(([^()0-9]{2,45})\)$/);
      if (parenCompanyMatch) {
        extractedName = cleanPersonName(parenCompanyMatch[1]);
        extractedCompany = cleanCompanyName(parenCompanyMatch[2]);
      } else {
        // Case 2: "Rick with Courtland Homes" / "Rick from Courtland Homes" / "Abe Garcia - Sunland" / "Abe Garcia, Sunland"
        const connectorMatch = clause.match(
          /^(.+?)(?:\s+(?:with|from|of|at)\s+|\s+[-–]\s+|,\s+)([A-Za-z0-9&/'\s.-]{2,45})$/i
        );
        if (connectorMatch) {
          const maybeName = cleanPersonName(connectorMatch[1]);
          const maybeComp = cleanCompanyName(connectorMatch[2]);
          if (maybeName) {
            extractedName = maybeName;
            extractedCompany = maybeComp;
          } else {
            extractedName = cleanPersonName(clause);
          }
        } else {
          // Case 3: Direct name before phone: "Abe Garcia (623) 826-4367"
          extractedName = cleanPersonName(clause);
        }
      }

      // Case 4: Check right after the phone number if company or name follows, e.g. "(623) 826-4367 (Sunland)" or "Abe Garcia (623) 826-4367 with Sunland"
      const afterWindow = text.slice(matchEnd, matchEnd + 65);
      if (!extractedCompany) {
        const afterCompMatch = afterWindow.match(
          /^\s*\)?\s*(?:with|from|of)\s+([A-Z0-9][A-Za-z0-9&/'\s.-]{1,36}?)(?=[.,;)]|\s+(?:for|on|at|regarding|to|and\b)|$)/i
        );
        if (afterCompMatch) {
          extractedCompany = cleanCompanyName(afterCompMatch[1]);
        }
      }

      const prev = byPhone.get(cleanTen);
      const merged: ExtractedPermitContact = {
        name: extractedName || prev?.name || 'Site Contact',
        company: extractedCompany || prev?.company || '',
        phone: formatDisplayPhone(cleanTen),
        cleanPhone: cleanTen,
      };

      byPhone.set(cleanTen, merged);
      const existingIdx = orderedOrder.indexOf(cleanTen);
      if (existingIdx !== -1) orderedOrder.splice(existingIdx, 1);
      orderedOrder.unshift(cleanTen);
    }
  }

  return orderedOrder.map((k) => byPhone.get(k)!);
}

/**
 * Builds pre-filled SMS body for a contact extracted from Permit Notes.
 */
export function buildContactSmsHref(
  contact: ExtractedPermitContact,
  tcNumber: string,
  location?: string
): string {
  const firstName =
    contact.name && contact.name !== 'Site Contact'
      ? contact.name.trim().split(/\s+/)[0]
      : '';
  const locPart = location ? ` at ${location}` : '';
  const greeting = firstName
    ? `Hi ${firstName}, this is Marco Canzano with MCDOT regarding Permit ${tcNumber.trim()}${locPart}.`
    : `Hi, this is Marco Canzano with MCDOT regarding Permit ${tcNumber.trim()}${locPart}.`;
  return `sms:${contact.cleanPhone}?body=${encodeURIComponent(greeting)}`;
}

function classifySingleNoteStage(bodyText: string): PermitLifecycleStage | null {
  const t = bodyText.toLowerCase();
  if (!t) return null;

  if (/\bpermit\s+closed\b|\bclosed\s+permit\b|\bfinal\s+acceptance\s+granted\b/.test(t)) {
    return 'Closed';
  }
  if (
    /\bfinal\s+(?:site\s+)?check\b|\bfinal\s+inspection\b|\bcompleted\s+to\s+mcdot\s+standard\b/.test(
      t
    )
  ) {
    return 'Final Check';
  }
  if (
    /^(?:tcp\s+approved|traffic\s+control\s+plan\s+approved)\b/.test(t) ||
    (/\btcp\s+approved\b/.test(t) && !/\bpre-?con/.test(t))
  ) {
    return 'TCP Approved';
  }
  if (/\bpre-?con(?:struction)?\b|\bagenda\s+packet\b/.test(t)) {
    return 'Pre-Con Done';
  }
  if (
    /\bsite\s+visit\b|\bwork\s+in\s+progress\b|\bno\s+crew\b|\bpour(?:ing|ed)?\b|\btrench|\bbore\b|\bpothol|\bbackfill\b|\bslurry\b|\bclsm\b|\bforms?\b|\basphalt\b|\bpaving\b|\bsaw[- ]?cut\b|\binspected\b/.test(
      t
    )
  ) {
    return 'In Progress';
  }
  if (/\bpermit\s+logged\b/.test(t)) {
    return 'Logged';
  }
  return null;
}

/**
 * Automatically infers the permit lifecycle stage strictly from the Permit Notes text:
 * ('Logged' | 'Pre-Con Done' | 'TCP Approved' | 'In Progress' | 'Final Check' | 'Closed')
 */
export function inferPermitLifecycleStage(
  notesOrTexts: Array<StatusUpdate | string>
): PermitLifecycleStage {
  if (!notesOrTexts || notesOrTexts.length === 0) {
    return 'Logged';
  }

  // Sort chronologically if StatusUpdate objects are passed
  const items = [...notesOrTexts];
  if (items.length > 1 && typeof items[0] !== 'string') {
    (items as StatusUpdate[]).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  // Evaluate from latest note backwards so the latest note text drives the stage
  for (let i = items.length - 1; i >= 0; i--) {
    const body = normalizeNoteBody(items[i]);
    const matched = classifySingleNoteStage(body);
    if (matched) {
      return matched;
    }
  }

  // If custom notes exist beyond initial log without matching a specific milestone keyword
  return items.length > 1 ? 'In Progress' : 'Logged';
}

/**
 * Returns subtle, high-legibility badge classes for the inferred lifecycle pill.
 */
export function getLifecyclePillStyle(stage: PermitLifecycleStage): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (stage) {
    case 'Logged':
      return {
        bg: 'bg-slate-800/90',
        text: 'text-slate-200',
        border: 'border-slate-600/70',
        dot: 'bg-slate-400',
      };
    case 'Pre-Con Done':
      return {
        bg: 'bg-sky-950/85',
        text: 'text-sky-200',
        border: 'border-sky-500/50',
        dot: 'bg-sky-400',
      };
    case 'TCP Approved':
      return {
        bg: 'bg-indigo-950/85',
        text: 'text-indigo-200',
        border: 'border-indigo-500/50',
        dot: 'bg-indigo-400',
      };
    case 'In Progress':
      return {
        bg: 'bg-amber-950/85',
        text: 'text-amber-200',
        border: 'border-amber-500/50',
        dot: 'bg-amber-400',
      };
    case 'Final Check':
      return {
        bg: 'bg-teal-950/85',
        text: 'text-teal-200',
        border: 'border-teal-500/50',
        dot: 'bg-teal-400',
      };
    case 'Closed':
      return {
        bg: 'bg-emerald-950/85',
        text: 'text-emerald-200',
        border: 'border-emerald-500/50',
        dot: 'bg-emerald-400',
      };
  }
}

/**
 * Returns the 5 exact MCDOT standard 1-tap entries + metadata adapted to what's already in the notes.
 */
export function getLifecycleAwareQuickPills(
  notesOrTexts: Array<StatusUpdate | string>
): {
  stage: PermitLifecycleStage;
  hasLogged: boolean;
  hasPreCon: boolean;
  hasTcpApproved: boolean;
  hasFinalCheck: boolean;
  hasClosed: boolean;
  recommendPreConBuilder: boolean;
  pills: StandardQuickPill[];
} {
  const bodies = (notesOrTexts || []).map((n) => normalizeNoteBody(n).toLowerCase());
  const stage = inferPermitLifecycleStage(notesOrTexts);

  const hasLogged = bodies.some((b) => /\bpermit\s+logged\b/.test(b));
  const hasPreCon = bodies.some((b) => /\bpre-?con(?:struction)?\b|\bagenda\s+packet\b/.test(b));
  const hasTcpApproved = bodies.some((b) => /\btcp\s+approved\b/.test(b));
  const hasFinalCheck = bodies.some((b) => /\bfinal\s+(?:site\s+)?check\b/.test(b));
  const hasClosed = bodies.some((b) => /\bpermit\s+closed\b/.test(b));

  const recommendPreConBuilder = hasLogged && !hasPreCon && !hasClosed;

  const basePills: StandardQuickPill[] = [
    {
      id: 'logged',
      label: MCDOT_STANDARD_NOTE_ENTRIES.LOGGED,
      shortLabel: 'Permit logged.',
      text: MCDOT_STANDARD_NOTE_ENTRIES.LOGGED,
      alreadyInNotes: hasLogged,
      recommended: !hasLogged,
    },
    {
      id: 'tcp',
      label: MCDOT_STANDARD_NOTE_ENTRIES.TCP_APPROVED,
      shortLabel: 'TCP approved.',
      text: MCDOT_STANDARD_NOTE_ENTRIES.TCP_APPROVED,
      alreadyInNotes: hasTcpApproved,
      recommended: hasLogged && !hasTcpApproved && !hasClosed,
    },
    {
      id: 'no_crew',
      label: MCDOT_STANDARD_NOTE_ENTRIES.NO_CREW,
      shortLabel: 'No crew on site.',
      text: MCDOT_STANDARD_NOTE_ENTRIES.NO_CREW,
      alreadyInNotes: false, // Repeatable daily patrol entry
      recommended:
        hasLogged &&
        (stage === 'Pre-Con Done' || stage === 'TCP Approved' || stage === 'In Progress') &&
        !hasClosed,
    },
    {
      id: 'final_check',
      label: MCDOT_STANDARD_NOTE_ENTRIES.FINAL_CHECK,
      shortLabel: 'Final site check.',
      text: MCDOT_STANDARD_NOTE_ENTRIES.FINAL_CHECK,
      alreadyInNotes: hasFinalCheck,
      recommended:
        (stage === 'In Progress' || stage === 'TCP Approved') && !hasFinalCheck && !hasClosed,
    },
    {
      id: 'closed',
      label: MCDOT_STANDARD_NOTE_ENTRIES.CLOSED,
      shortLabel: 'Permit closed.',
      text: MCDOT_STANDARD_NOTE_ENTRIES.CLOSED,
      alreadyInNotes: hasClosed,
      recommended: stage === 'Final Check' && !hasClosed,
    },
  ];

  // Sort recommended pills first while keeping natural lifecycle order within groups
  const sortedPills = [...basePills].sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    if (a.alreadyInNotes !== b.alreadyInNotes) return a.alreadyInNotes ? 1 : -1;
    return 0;
  });

  return {
    stage,
    hasLogged,
    hasPreCon,
    hasTcpApproved,
    hasFinalCheck,
    hasClosed,
    recommendPreConBuilder,
    pills: sortedPills,
  };
}

/**
 * Formats raw spoken or typed inspector observations into clean MCDOT narrative style:
 * - Collapses repeating speech recognition phrases
 * - Standardizes MCDOT civil terms (MAG Detail 250, 48" cover, 1/2-sack CLSM, MAG Detail 200-1, TCP, forms check, concrete pour)
 * - Prefixes field site observations with "Site visit performed. " when appropriate
 */
export function formatMcdotFieldDictation(
  rawText: string,
  _permit?: Partial<Permit>
): string {
  if (!rawText) return '';

  let cleaned = removeDuplicatePhrases(rawText.trim());

  // Strip conversational fillers
  cleaned = cleaned.replace(
    /\b(um|uh|erm|like|you know|so yeah|basically|sort of|kind of|i guess)\b/gi,
    ''
  );
  cleaned = removeDuplicatePhrases(cleaned);

  // Strip accidental date or inspector prefix/suffix
  cleaned = stripLogRowDecorations(cleaned);
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  if (!cleaned) return '';

  // Exact standard entries shortcuts
  if (/^permit\s+logged[.]?$/i.test(cleaned)) {
    return MCDOT_STANDARD_NOTE_ENTRIES.LOGGED;
  }
  if (/^(?:tcp\s+approved|traffic\s+control\s+plan\s+approved)[.]?$/i.test(cleaned)) {
    return MCDOT_STANDARD_NOTE_ENTRIES.TCP_APPROVED;
  }
  if (/^permit\s+closed[.]?$/i.test(cleaned)) {
    return MCDOT_STANDARD_NOTE_ENTRIES.CLOSED;
  }
  if (
    /^(?:site\s+visit(?:\s+performed)?[\s,.-]*)?(?:no\s+work\s+(?:taking\s+place|in\s+progress|on\s+site)|no\s+crew(?:\s+observed)?(?:\s+on\s+site)?(?:\s+working)?|no\s+one\s+on\s+site|nobody\s+(?:on\s+site|working))[.]?$/i.test(
      cleaned
    )
  ) {
    return MCDOT_STANDARD_NOTE_ENTRIES.NO_CREW;
  }
  if (/^final\s+(?:site\s+)?check(?:\s+performed)?[.]?$/i.test(cleaned)) {
    return MCDOT_STANDARD_NOTE_ENTRIES.FINAL_CHECK;
  }

  // Standardize common MCDOT civil & MAG spec phrases
  cleaned = cleaned
    .replace(/\bmag\s*(?:detail\s*)?250\b/gi, 'MAG Detail 250')
    .replace(/\bmag\s*(?:detail\s*)?200\s*(?:dash|-)\s*1\b/gi, 'MAG Detail 200-1')
    .replace(/\bmag\s*(?:detail\s*)?200-1\b/gi, 'MAG Detail 200-1')
    .replace(/\b(?:half|1\/2)[\s-]*sack(?:\s+clsm)?(?:\s+slurry)?\b/gi, '1/2-sack CLSM')
    .replace(/\bclsm\s+slurry\b/gi, 'CLSM slurry')
    .replace(/\b48\s*(?:inch|inches|in)\s+cover\b/gi, '48" cover')
    .replace(/\b36\s*(?:inch|inches|in)\s+cover\b/gi, '36" cover')
    .replace(/\bsaw\s+cut\b/gi, 'saw-cut')
    .replace(/\bsaw\s+cutting\b/gi, 'saw-cutting')
    .replace(/\bt\s+patch\b/gi, 'T-patch')
    .replace(/\btcp\b/gi, 'TCP')
    .replace(/\bclsm\b/gi, 'CLSM')
    .replace(/\bmcdot\b/gi, 'MCDOT')
    .replace(/\brow\b/g, 'ROW');

  // Ensure capital first letter and period at end
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (!/[.!?]$/.test(cleaned)) {
    cleaned = `${cleaned}.`;
  }

  // Prepend "Site visit performed. " if it's a field observation that doesn't already start with a standard log lead-in
  const alreadyHasLeadIn =
    /^(?:site\s+visit\s+performed|permit\s+logged|permit\s+closed|tcp\s+approved|on-?site\s+pre-?con|phone\s+pre-?con|pre-?con(?:struction)?\s+(?:meeting|held|conducted)|final\s+site\s+check|spoke\s+with|called\b|received\b|emailed\b)/i.test(
      cleaned
    );

  if (!alreadyHasLeadIn) {
    cleaned = `Site visit performed. ${cleaned}`;
  }

  return cleaned;
}

/**
 * Smart [Pre-Con Builder]:
 * Takes minimal spoken or typed input (e.g. "Rick with Courtland Homes (480-694-5434), driveway on Baker Dr"
 * or "Abe Garcia (623) 826-4367 underground fiber on Patton Rd") and generates the complete standard MCDOT
 * pre-construction paragraph including saw-cutting, pouring against asphalt or CLSM backfill, drainage,
 * and providing the 2025 MCDOT Pre-Construction Agenda packet on site.
 */
export function buildMcdotPreConParagraph(
  rawPrompt: string,
  permit?: Partial<Permit>
): {
  paragraph: string;
  scopeKind: 'driveway' | 'underground';
  contactSummary: string;
  roadSummary: string;
} {
  const input = removeDuplicatePhrases((rawPrompt || '').trim());
  const lower = input.toLowerCase();

  // 1. Extract contact from prompt if phone is present; otherwise parse name/company text before comma/for/on
  const extractedContacts = extractContactsFromPermitNotes([input]);
  let contactSummary = '';

  if (extractedContacts.length > 0) {
    const c = extractedContacts[0];
    if (c.name && c.name !== 'Site Contact' && c.company) {
      contactSummary = `${c.name} with ${c.company} ${c.phone}`;
    } else if (c.name && c.name !== 'Site Contact') {
      contactSummary = `${c.name} ${c.phone}`;
    } else {
      contactSummary = c.phone;
    }
  } else if (input) {
    // Try extracting name/company even before phone number is typed
    const beforeScope = input
      .split(/\s*(?:,|;|\bfor\b|\bon\s+[NSEW]?\s*[A-Z0-9])/i)[0]
      .replace(/^(?:pre-?con\s+with|with)\s+/i, '')
      .trim();
    if (
      beforeScope &&
      !/^(?:driveway|underground|trench|bore|fiber|water|sewer|gas|paving|apron)\b/i.test(
        beforeScope
      )
    ) {
      contactSummary = beforeScope;
    }
  }

  if (!contactSummary) {
    contactSummary = permit?.contractor
      ? `contractor representative (${permit.contractor})`
      : 'contractor representative';
  }

  // 2. Detect road / location from prompt ("on Baker Dr", "at Patton Rd & 203rd Ave"), fallback to permit.location
  let roadSummary = '';
  const roadMatch = input.match(
    /\b(?:on|along|at)\s+([NSEW]\.?\s+[A-Za-z0-9\s&.-]+?(?:Rd|Road|Dr|Drive|Ave|Avenue|St|Street|Ln|Lane|Way|Wy|Blvd|Pkwy|Hwy|Trl|Ct|Pl)\b|[A-Z0-9][A-Za-z0-9\s&.-]{1,35}?\s+(?:Rd|Road|Dr|Drive|Ave|Avenue|St|Street|Ln|Lane|Way|Wy|Blvd|Pkwy|Hwy|Trl|Ct|Pl)\b)/i
  );
  if (roadMatch?.[1]) {
    roadSummary = roadMatch[1].trim();
  } else if (permit?.location) {
    roadSummary = permit.location
      .replace(/,\s*Unincorporated.*$/i, '')
      .replace(/^Driveway Access\s*•\s*/i, '')
      .replace(/^Trench \/ Utility\s*•\s*/i, '')
      .trim();
  } else {
    roadSummary = 'county right-of-way';
  }

  // 3. Detect scope kind: Driveway (MAG Detail 250 / pour against asphalt) vs Underground/Utility/Cut (48" cover & 1/2-sack CLSM)
  const isDrivewayPrompt = /\b(driveway|apron|lot\s+\d+|culvert|mag\s*250|curb|residential\s+access|commercial\s+entrance)\b/i.test(
    lower
  );
  const isUndergroundPrompt = /\b(underground|bore|boring|trench|trenching|fiber|conduit|telecom|cox|lumen|srp|aps|swg|gas|water|sewer|main|vault|pothol|clsm|slurry|pavement\s+cut)\b/i.test(
    lower
  );

  let scopeKind: 'driveway' | 'underground' = 'underground';
  if (isDrivewayPrompt && !isUndergroundPrompt) {
    scopeKind = 'driveway';
  } else if (!isUndergroundPrompt && permit?.permitType === 'Driveway Access') {
    scopeKind = 'driveway';
  }

  // Specific scope phrase if spoken
  let scopeDescriptor =
    scopeKind === 'driveway' ? 'driveway construction' : 'underground utility work';
  if (/\bfiber\b/i.test(lower)) scopeDescriptor = 'underground fiber installation';
  else if (/\bgas\b/i.test(lower)) scopeDescriptor = 'underground gas line work';
  else if (/\bwater\b/i.test(lower)) scopeDescriptor = 'underground water line work';
  else if (/\bsewer\b/i.test(lower)) scopeDescriptor = 'underground sewer work';
  else if (/\belectric|\bpower|\bvault\b/i.test(lower))
    scopeDescriptor = 'underground electrical utility work';
  else if (/\bcommercial\s+driveway\b/i.test(lower))
    scopeDescriptor = 'commercial driveway construction';
  else if (/\bresidential\s+driveway\b/i.test(lower))
    scopeDescriptor = 'residential driveway construction';

  const isPhonePreCon = /\bphone\s+pre-?con\b/i.test(lower);
  const meetingLead = isPhonePreCon
    ? `Phone pre-construction meeting conducted with ${contactSummary}`
    : `On-site pre-construction meeting conducted with ${contactSummary}`;

  const paragraph =
    scopeKind === 'driveway'
      ? `${meetingLead} for ${scopeDescriptor} on ${roadSummary}. Reviewed approved plans, traffic control, and MCDOT right-of-way requirements per MAG Detail 250, including making a neat straight saw-cut along the existing pavement edge, pouring concrete directly against existing asphalt with no expansion joint material, maintaining positive drainage sloping away from the roadway, and calling for forms inspection prior to concrete pour. Provided the 2025 MCDOT Pre-Construction Agenda packet on site.`
      : `${meetingLead} for ${scopeDescriptor} on ${roadSummary}. Reviewed approved plans, traffic control, and MCDOT right-of-way requirements per MAG Detail 200-1, including neat straight saw-cutting outside the wheel path, maintaining minimum 48" cover, backfilling with 1/2-sack CLSM slurry within 8 feet of edge of pavement, maintaining positive roadside drainage, and restoring right-of-way to MCDOT standard. Provided the 2025 MCDOT Pre-Construction Agenda packet on site.`;

  return {
    paragraph,
    scopeKind,
    contactSummary,
    roadSummary,
  };
}

/**
 * Comprehensive offline knowledge base of MAG Uniform Standard Specifications & Details,
 * Maricopa County Department of Transportation (MCDOT) Supplement to MAG,
 * MCDOT Roadway Design Manual (RDM), and MCDOT Right-of-Way General Notes.
 * 
 * Optimized for field inspectors (Marco Canzano - MAC) to perform instant offline
 * lookups, compliance checks, and citation-backed note entry.
 */

export interface MagSpecItem {
  id: string;
  category: 'driveways' | 'trenching' | 'telecom' | 'pavement' | 'traffic_control' | 'eor_submittals';
  categoryLabel: string;
  title: string;
  specCitation: string;
  quickSummary: string;
  keyRules: string[];
  inspectorChecklist: string[];
  standardNoteSnippet: string;
  tags: string[];
}

export const MAG_MCDOT_SPECS: MagSpecItem[] = [
  {
    id: 'spec-driveway-250',
    category: 'driveways',
    categoryLabel: 'Driveways & Access',
    title: 'Commercial & Residential Driveway Entrances (MAG Detail 250 & Detail 205)',
    specCitation: 'MAG Detail 250 / Detail 205 / MCDOT Residential Driveway Guidelines',
    quickSummary:
      'Poured directly against neat straight saw-cut existing asphalt pavement edge. Absolutely NO expansion joint or wood form board permitted between concrete driveway and asphalt. Slope away from pavement to preserve sheet flow.',
    keyRules: [
      'Neat straight saw-cut along existing pavement edge is mandatory prior to pouring.',
      'Concrete must be poured directly against existing asphalt edge: NO expansion joint material or form board permitted between asphalt and concrete.',
      'Driveway apron must slope AWAY from the paved roadway to maintain native sheet flow drainage and prevent stormwater ponding on roadway.',
      'After form removal, adjacent ground elevation must be graded within 1 inch of the top of concrete.',
      'Minimum 48-hour advance notice required to MCDOT for forms inspection before concrete pour.',
      'Concrete: Class AA (3,000 psi minimum @ 28 days), 4-inch minimum thickness for residential, 6-inch minimum for commercial/agricultural.',
    ],
    inspectorChecklist: [
      'Verify clean, full-depth saw-cut with no jagged asphalt edges.',
      'Inspect forms prior to pour: verify NO expansion joint between asphalt edge and concrete face.',
      'Check cross-slope with 4-ft digital level: verify positive fall away from road crown.',
      'Verify 1/2" expansion joint installed at property line/sidewalk interface only.',
      'Post-pour: confirm adjacent shoulder backfill graded flush (within 1") to top of concrete.',
    ],
    standardNoteSnippet:
      'Checked driveway forms per MAG Detail 250. Neat saw-cut along asphalt edge verified. No expansion joint against asphalt pavement. Drainage cross-slope slopes away from roadway. 48-hr forms approval granted.',
    tags: ['driveway', 'mag 250', 'detail 205', 'concrete', 'sheet flow', 'saw cut', 'forms', 'expansion joint'],
  },
  {
    id: 'spec-utility-trench-200-1',
    category: 'trenching',
    categoryLabel: 'Utility Trenching & Backfill',
    title: 'Trench Backfill Under Pavement & Within 8 Ft of Pavement (MAG Detail 200-1)',
    specCitation: 'MAG Detail 200-1 / MAG Section 601 / MAG Section 336 / MCDOT Note #18',
    quickSummary:
      'Under existing paved streets and within 8 feet of the edge of pavement, backfill shall be minimum 1/2-sack Controlled Low Strength Material (CLSM) slurry up to bottom of ABC. Shading up to 1 ft above pipe per utility spec.',
    keyRules: [
      'Within 8 feet of edge of pavement (EP) and under all paved roadways: backfill must be 1/2-sack CLSM slurry from top of pipe shading to bottom of Aggregate Base Course (ABC).',
      'Pipe shading: initial backfill up to 1 foot above the crown of pipe placed and compacted per utility specification before slurry pour.',
      'Aggregate Base Course (ABC): Minimum 6 inches or match existing pavement structural section (whichever is greater), compacted to 100% standard proctor.',
      'Sewer manholes and water valve boxes in paved roadway: backfill with 1/2-sack slurry per MAG Section 206.4.4.',
      'Steel plating over open trenches overnight: Minimum 1-inch thick structural steel plate pinned with rebar and ramped on all edges with 1:12 cold mix asphalt.',
    ],
    inspectorChecklist: [
      'Verify distance from trench edge to pavement edge: if ≤ 8 ft, 1/2-sack slurry backfill is mandatory.',
      'Examine ready-mix slurry batch ticket: verify 1/2-sack cementitious mix before pouring.',
      'Confirm pipe shading compacted to 12" over pipe crown before slurry placement to prevent pipe flotation.',
      'Check overnight steel plating: plates must be pinned and ramped with temporary asphalt patch.',
      'Verify ABC compaction test performed by certified testing lab (MAG Section 702).',
    ],
    standardNoteSnippet:
      'Inspected utility trench backfill per MAG Detail 200-1. Verified 1/2-sack CLSM slurry placed from 1 ft above utility up to ABC bottom within 8 ft of edge of pavement. Steel plating pinned with cold mix ramps.',
    tags: ['trench', 'backfill', 'mag 200-1', 'clsm', 'slurry', '1/2 sack', 'pipe shading', 'steel plate', 'abc'],
  },
  {
    id: 'spec-telecom-conduit-depth',
    category: 'telecom',
    categoryLabel: 'Telecom & Conduit Depth',
    title: 'Telecommunication, Fiber & Power Conduit Depth (MAG Section 360 / Detail 2001)',
    specCitation: 'MAG Section 360 / MAG Detail 2001 / MCDOT ROW Telecommunications Rules',
    quickSummary:
      'Minimum 48 inches below finished grade on arterial and collector roadways. Minimum 36 inches depth on local streets. Bore logs must be kept on site at all times.',
    keyRules: [
      'Arterial and Collector Streets: Minimum 48-inch burial depth below finished roadway pavement or ditch flowline.',
      'Local & Residential Streets: Minimum 36-inch burial depth below finished grade.',
      'Horizontal Directional Drilling (HDD): Continuous bore log tracking pitch, depth, and roll must be maintained on site and submitted to MCDOT inspector upon request.',
      'Under roadway drainage ditches and culverts: Maintain minimum 36 inches clearance below ditch invert.',
      'Warning tape: Orange detectable magnetic warning tape placed 12 inches below finished grade directly above conduit run.',
      'Potholing: Permittee must pothole and visually expose all existing cross-utilities prior to directional bore.',
    ],
    inspectorChecklist: [
      'Review on-site bore log sheets: check measured depths at 10-foot intervals.',
      'Confirm minimum 48" depth on arterials/collectors and 36" depth on local roadways.',
      'Inspect pothole excavations: verify existing water, sewer, and gas lines physically located before crossing.',
      'Check orange warning tape placement in trench backfill.',
      'Confirm pull boxes/vaults installed flush with finished ground/sidewalk elevation.',
    ],
    standardNoteSnippet:
      'Verified telecom conduit installation depth per MAG Section 360. Arterial conduit depth confirmed at 48+ inches below finished grade. Potholing records on site; bore log submitted and verified.',
    tags: ['telecom', 'fiber', 'conduit', 'depth', 'mag 360', 'directional bore', 'hdd', 'pothole', '48 inch', '36 inch'],
  },
  {
    id: 'spec-pavement-cuts-336',
    category: 'pavement',
    categoryLabel: 'Pavement Cuts & Restoration',
    title: 'Pavement Cuts, Wheel Paths & Micro-Surfacing (MCDOT General Note #18 / MAG 336)',
    specCitation: 'MCDOT ROW General Note #18 / MAG Section 336.3 / MAG Detail 200-1',
    quickSummary:
      'Saw cuts must avoid wheel paths (no longitudinal cut within 1 ft of lane stripe or within center 2 ft of lane). Trench cuts > 300 linear feet require full lane slurry seal / micro-surfacing.',
    keyRules: [
      'Wheel Path Restriction: Longitudinal saw cuts are NOT permitted in wheel paths. Cuts must be positioned either along lane line (offset min 1 ft) or outside the travel track.',
      'T-Patch Requirement: Pavement must be saw-cut and milled 1 foot beyond trench width on each side into undisturbed asphalt (MAG Section 336).',
      'Slurry Seal / Micro-Surfacing Threshold: Any longitudinal pavement cut or series of cuts exceeding 300 linear feet requires a full-width Type II slurry seal or micro-surfacing across the entire affected travel lane.',
      'Transverse Cuts: If pavement cut crosses more than 50% of lane width, entire lane width must be milled 2 inches and repaved.',
      'Asphalt Mix: MAG Section 710 PG 70-10 or PG 64-22 1/2-inch or 3/4-inch Marshall/Gyratory design. Compaction to 95% minimum density.',
      'Temporary Cold Mix: Permitted for maximum 48 hours; must be maintained flush and inspected daily until permanent AC patch.',
    ],
    inspectorChecklist: [
      'Check saw-cut layout before cutting: verify cut line does not lie in vehicle wheel track.',
      'Measure 12-inch T-cut shelf on undisturbed subgrade / existing asphalt edge.',
      'Check trench length: if >300 ft, verify permittee plans full lane slurry seal / micro-surfacing.',
      'Confirm tack coat applied to all vertical joint faces per MAG Section 329.',
      'Require geotechnical compaction testing report for AC lift density.',
    ],
    standardNoteSnippet:
      'Inspected pavement cut layout per MCDOT General Note #18 and MAG 336. Saw cuts positioned outside wheel path with 1 ft T-patch cutback. Permittee notified of >300 ft slurry seal requirement.',
    tags: ['pavement cut', 'wheel path', 'slurry seal', 'micro-surfacing', 'mag 336', 'mcdot note 18', 't-patch', 'asphalt'],
  },
  {
    id: 'spec-traffic-control-tcp',
    category: 'traffic_control',
    categoryLabel: 'Traffic Control & Safety',
    title: 'Traffic Control, Barricades & Temporary Traffic Management (MCDOT TCM / Note #17)',
    specCitation: 'MCDOT Traffic Control Manual / MCDOT General Note #17 / MUTCD Part 6',
    quickSummary:
      'Approved Traffic Control Plan (TCP) must be physically on site at all times when working within 20 ft of edge of pavement. 24/7 emergency contact signs and certified flaggers required.',
    keyRules: [
      'Work within 20 feet of the edge of pavement requires an approved MCDOT Traffic Control Plan (TCP) physically on site.',
      'Traffic control devices (drums, cones, barricades, signs) must be maintained 24/7 in clean, upright, reflective condition.',
      'Flaggers: Must be ATSSA or AGC certified, equipped with 18" STOP/SLOW paddles, ANSI Class 3 high-visibility garments, and two-way radios if line-of-sight is obstructed.',
      'Speed limit reductions require MCDOT Traffic Engineering approval; unauthorized speed reductions are prohibited.',
      'Drop-offs: Any pavement drop-off > 2 inches adjacent to traffic requires Type II barricades at 25-ft spacing and "UNEVEN LANES" (W8-11) or "SHOULDER DROP-OFF" (W8-17) warning signs.',
      'Two reflective flexible guide posts must mark all raised valve boxes or manhole rims in milled roadway sections.',
    ],
    inspectorChecklist: [
      'Request approved stamped TCP from contractor on site: check permit number matches.',
      'Inspect advance warning sign spacing (e.g. 500 ft on 45 mph rural roads, 350 ft on 35 mph roads).',
      'Verify flagger certification cards (ATSSA/AGC) and high-visibility apparel.',
      'Check night retroreflectivity of signs and barricade sheeting (Type IV minimum).',
      'Confirm 2 reflective flexible guide posts installed at raised utility manholes.',
    ],
    standardNoteSnippet:
      'Inspected work zone traffic control per MCDOT Traffic Control Manual and Note #17. Approved TCP on site. Barricades, advance warning signs, and ATSSA certified flaggers compliant with approved plan.',
    tags: ['traffic control', 'tcp', 'mutcd', 'mcdot tcm', 'barricades', 'flagger', 'lane closure', 'drop off', 'note 17'],
  },
  {
    id: 'spec-eor-submittals',
    category: 'eor_submittals',
    categoryLabel: 'EOR & Quality Submittals',
    title: 'Engineer of Record (EOR) Letters & Quality Submittals (MCDOT Guidelines Sec III-V)',
    specCitation: 'MCDOT ROW Guidelines Sections III-V / MAG Section 105 / MAG Section 106',
    quickSummary:
      'Requires Arizona stamped EOR letter certifying continuous inspection, subgrade & asphalt phase certifications, mix designs, and geotechnical compaction test books.',
    keyRules: [
      'Subgrade Phase Certification: Stamped letter from registered Arizona Professional Engineer certifying subgrade compaction and moisture before aggregate base placement.',
      'ABC Phase Certification: Test reports confirming minimum 100% standard proctor density per MAG Section 702.',
      'Asphalt Concrete Mix Design: Approved MCDOT / MAG 710 mix design submittal prior to paving operations.',
      'Continuous Inspection: Permittee EOR must maintain field inspection logs for all structural, utility, and drainage construction within county right-of-way.',
      'Compaction Test Book: Certified testing lab book with test location maps, probe depths, dry densities, and optimum moisture percentages.',
      'Certificate of Completion: Final stamped EOR certification required before bond release and final permit sign-off.',
    ],
    inspectorChecklist: [
      'Review subgrade compaction test reports: verify 95% standard proctor (100% in top 6" under pavement).',
      'Check asphalt density core results: verify 93%-97% rice theoretical density.',
      'Confirm Arizona PE stamp and signature on all phase certification letters.',
      'Verify as-built record drawings submitted with redlines showing actual utility depths.',
    ],
    standardNoteSnippet:
      'Reviewed geotechnical quality submittals per MCDOT ROW Guidelines Section III. Subgrade density test book and ABC phase certification verified compliant. Approved asphalt mix design on file.',
    tags: ['eor', 'engineer of record', 'submittals', 'compaction', 'density test', 'mix design', 'certification', 'mag 702'],
  },
];

/**
 * Fast client-side search across MAG/MCDOT specifications.
 */
export function searchMagMcdotSpecs(query: string, categoryFilter?: string): MagSpecItem[] {
  let results = MAG_MCDOT_SPECS;

  if (categoryFilter && categoryFilter !== 'all') {
    results = results.filter((item) => item.category === categoryFilter);
  }

  if (!query.trim()) {
    return results;
  }

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return results.filter((item) => {
    const haystack = [
      item.title,
      item.specCitation,
      item.quickSummary,
      ...item.keyRules,
      ...item.inspectorChecklist,
      item.standardNoteSnippet,
      ...item.tags,
    ]
      .join(' ')
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

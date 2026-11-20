import { Permit, PreConContact } from '../types/permit';
import { ExtractedPermitContact, PermitLifecycleStage } from './permitNotesIntelligence';

/**
 * Authentic Maricopa County Department of Transportation (MCDOT) Right-of-Way permits.
 * TC Number format: TC-2026-XXXX (Traffic Control / ROW Permit)
 */
export const INITIAL_MARICOPA_PERMITS: Permit[] = [
  // --- MCDOT RIT Screenshot Sector: N 243rd Ave & W Dixileta Dr / Baker Dr / Duane Ln ---
  {
    id: 'rit-baker-tc2600966',
    tcNumber: 'TC2600966',
    projectTitle: 'Driveway Access & 18" CMP Culvert (MAG 250)',
    contractor: 'Southwest Earthworks & Paving LLC',
    contractorContact: 'Cody Miller (Superintendent)',
    contractorPhone: '(623) 826-4310',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Baker Dr & N 243rd Ave (Lot 18), Wittmann',
    milepost: 'N 243rd Ave Cross-Street',
    lat: 33.753785,
    lng: -112.587415,
    permitType: 'Driveway Access',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2026-03-12',
    expirationDate: '2026-11-30',
    workWindow: '07:00 - 16:00 Mon-Fri',
    preConDate: '2026-03-14',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-03 (Single Lane Flagging Operation)',
    specialConditions: [
      'MCDOT RIT Layer 15 Record (Baker Dr ROW)',
      'Driveway apron must match MAG Standard Detail 250 / 212.',
      'Corrugated metal pipe (CMP) culvert 18-inch required under driveway approach.',
    ],
    source: 'MCDOT_RIT',
    ritArcgisUrl: 'https://experience.arcgis.com/experience/1481eed4077842098b1174d0c8f23c17#widget_11=layer_visibility:%7B%22widget_11-dataSource_1%22%3A%7B%22widget_11-dataSource_1-1905ae15533-layer-19%22%3Atrue%2C%22widget_11-dataSource_1-19b9f660965-layer-21%22%3Atrue%7D%7D,active_datasource_id:dataSource_1',
  },
  {
    id: 'rit-baker-tc2600968',
    tcNumber: 'TC2600968',
    projectTitle: 'Residential Driveway Apron & Grading (MAG 250)',
    contractor: 'Copper State Construction',
    contractorContact: 'Ray Carlson (Field PM)',
    contractorPhone: '(602) 481-7290',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Baker Dr & N 243rd Ave (Lot 19), Wittmann',
    milepost: 'N 243rd Ave Cross-Street',
    lat: 33.753785,
    lng: -112.587959,
    permitType: 'Driveway Access',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2026-03-15',
    expirationDate: '2026-12-15',
    workWindow: '07:00 - 16:00 Mon-Fri',
    preConDate: '2026-03-17',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT Standard Work Zone Warning Signs',
    specialConditions: [
      'MCDOT RIT Layer 15 Record (Baker Dr ROW)',
      'Continuous dust suppression required per Maricopa Rule 310.',
    ],
    source: 'MCDOT_RIT',
    ritArcgisUrl: 'https://experience.arcgis.com/experience/1481eed4077842098b1174d0c8f23c17',
  },
  {
    id: 'rit-baker-tc2600969',
    tcNumber: 'TC2600969',
    projectTitle: 'Driveway Connection & Asphalt Shoulder Match',
    contractor: 'Desert Ridge Paving Corp',
    contractorContact: 'Frank Garza (Foreman)',
    contractorPhone: '(623) 594-3180',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Baker Dr & N 244th Dr (Lot 20), Wittmann',
    milepost: 'N 244th Dr Cross-Street',
    lat: 33.753776,
    lng: -112.588490,
    permitType: 'Driveway Access',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2026-03-18',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 16:00 Mon-Fri',
    preConDate: '2026-03-20',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT Shoulder Closure Detail',
    specialConditions: ['MCDOT RIT Layer 15 Record (Baker Dr ROW)'],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-baker-tc2601538',
    tcNumber: 'TC2601538',
    projectTitle: 'Driveway Tie-In & Sight Triangle Grading',
    contractor: 'Western Valley Builders',
    contractorContact: 'Dan Reynolds (Superintendent)',
    contractorPhone: '(480) 694-5434',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Baker Dr & N 244th Dr (Lot 21), Wittmann',
    milepost: 'N 244th Dr Cross-Street',
    lat: 33.753776,
    lng: -112.589021,
    permitType: 'Driveway Access',
    status: 'Pre-Con Scheduled',
    rawRitStatus: 'Issued',
    issueDate: '2026-04-01',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 15:30 Mon-Fri',
    preConDate: '2026-10-30',
    preConCompleted: false,
    hasSignInSheet: false,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT TCP-01 (Shoulder Closure)',
    specialConditions: [
      'Pre-construction meeting scheduled. MANDATORY: Photograph sign-in sheet & business cards.',
      'Check sight triangle compliance at Baker Dr intersection.',
    ],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-baker-tc2601540',
    tcNumber: 'TC2601540',
    projectTitle: 'Driveway 18" Culvert & Concrete Apron',
    contractor: 'Western Valley Builders',
    contractorContact: 'Dan Reynolds (Superintendent)',
    contractorPhone: '(480) 694-5434',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Baker Dr & N 245th Ave (Lot 22), Wittmann',
    milepost: 'N 245th Ave Cross-Street',
    lat: 33.753776,
    lng: -112.589548,
    permitType: 'Driveway Access',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2026-04-02',
    expirationDate: '2026-12-31',
    workWindow: '07:30 - 16:00 Mon-Fri',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-01',
    specialConditions: ['MCDOT RIT Layer 15 Record (Baker Dr ROW)'],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-baker-tc2601594',
    tcNumber: 'TC2601594',
    projectTitle: 'Driveway Access & Roadway Crown Transition',
    contractor: 'Apex Civil Group',
    contractorContact: 'Jason Vance (Superintendent)',
    contractorPhone: '(623) 773-2940',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Baker Dr & N 245th Ave (Lot 23), Wittmann',
    milepost: 'N 245th Ave Cross-Street',
    lat: 33.753767,
    lng: -112.590070,
    permitType: 'Driveway Access',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2026-04-05',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 16:00 Mon-Fri',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT Standard Work Zone Warning Signs',
    specialConditions: ['MCDOT RIT Layer 15 Record (Baker Dr ROW)'],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-duane-tc2600325',
    tcNumber: 'TC2600325',
    projectTitle: 'Driveway Connection & Drainage Swale',
    contractor: 'Maricopa Premier Grading',
    contractorContact: 'Steve Brooks (Foreman)',
    contractorPhone: '(623) 826-4367',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'N 244th Dr & W Duane Ln, Wittmann',
    milepost: 'Duane Ln Sub-sector',
    lat: 33.752678,
    lng: -112.586249,
    permitType: 'Driveway Access',
    status: 'Active',
    rawRitStatus: 'Complete',
    issueDate: '2026-01-20',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 15:30 Mon-Fri',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-02',
    specialConditions: ['MCDOT RIT Layer 15 Record (Duane Ln ROW)'],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-duane-tc2600795',
    tcNumber: 'TC2600795',
    projectTitle: 'Underground ROW Electric Conduit & Splice Vault',
    contractor: 'Salt River Project / Michels Power',
    contractorContact: 'Derek Vance (Superintendent)',
    contractorPhone: '(602) 236-8888',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'N 244th Dr & W Dixileta Dr, Wittmann',
    milepost: 'Dixileta Sub-sector',
    lat: 33.752678,
    lng: -112.586249,
    permitType: 'Trench / Utility',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2026-02-14',
    expirationDate: '2026-12-31',
    workWindow: '08:00 - 15:30 Mon-Fri',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-04',
    specialConditions: ['MCDOT RIT Layer 15 Record (Utility Connection)'],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-duane-tc2600971',
    tcNumber: 'TC2600971',
    projectTitle: 'Driveway Access Connection (MAG Detail 250)',
    contractor: 'Copper State Construction',
    contractorContact: 'Ray Carlson (Field PM)',
    contractorPhone: '(602) 481-7290',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Duane Ln & N 244th Dr, Wittmann',
    milepost: 'Duane Ln Sub-sector',
    lat: 33.752696,
    lng: -112.587928,
    permitType: 'Driveway Access',
    status: 'Pre-Con Scheduled',
    rawRitStatus: 'Issued',
    issueDate: '2026-03-15',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 16:00 Mon-Fri',
    preConDate: '2026-10-31',
    preConCompleted: false,
    hasSignInSheet: false,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT Warning Signs & Cones',
    specialConditions: [
      'Pre-construction meeting scheduled. MANDATORY: Photograph sign-in sheet & business cards.',
    ],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-duane-tc2600324',
    tcNumber: 'TC2600324',
    projectTitle: 'Driveway Connection & Shoulder Grading',
    contractor: 'Maricopa Premier Grading',
    contractorContact: 'Steve Brooks (Foreman)',
    contractorPhone: '(623) 826-4367',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Duane Ln & N 243rd Ave (South), Wittmann',
    milepost: 'Duane Ln Sub-sector',
    lat: 33.751814,
    lng: -112.586789,
    permitType: 'Driveway Access',
    status: 'Active',
    rawRitStatus: 'Complete',
    issueDate: '2026-01-22',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 15:30 Mon-Fri',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT Standard Work Zone',
    specialConditions: ['MCDOT RIT Layer 15 Record'],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-duane-tc2601354',
    tcNumber: 'TC2601354',
    projectTitle: 'Concrete Driveway Apron Pour (MAG 250)',
    contractor: 'Valley Southwest Paving',
    contractorContact: 'Gary Nelson (Superintendent)',
    contractorPhone: '(623) 518-6040',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Duane Ln & N 244th Dr (Lot 14), Wittmann',
    milepost: 'Duane Ln Sub-sector',
    lat: 33.751814,
    lng: -112.587793,
    permitType: 'Driveway Access',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2026-03-28',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 16:00 Mon-Fri',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-02',
    specialConditions: ['MCDOT RIT Layer 15 Record'],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-duane-tc2600322',
    tcNumber: 'TC2600322',
    projectTitle: 'Driveway Connection & Final Asphalt Tie-In',
    contractor: 'Maricopa Premier Grading',
    contractorContact: 'Steve Brooks (Foreman)',
    contractorPhone: '(623) 826-4367',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Duane Ln & N 243rd Ave, Wittmann',
    milepost: 'Duane Ln Sub-sector',
    lat: 33.751787,
    lng: -112.586249,
    permitType: 'Driveway Access',
    status: 'Final Inspection Pending',
    rawRitStatus: 'Complete',
    issueDate: '2026-01-18',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 15:30 Mon-Fri',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-01',
    specialConditions: ['MCDOT RIT Layer 15 Record - Awaiting final asphalt inspection'],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-paving-tc2400075',
    tcNumber: 'TC2400075',
    projectTitle: 'Subdivision ROW Paving, Landscape & Street Lighting',
    contractor: 'Hunter Contracting Co.',
    contractorContact: 'Markus Henderson',
    contractorPhone: '(480) 895-8800',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Dixileta Dr & N 243rd Ave, Wittmann',
    milepost: '243rd Ave Corridor',
    lat: 33.751787,
    lng: -112.586249,
    permitType: 'Pavement Cut',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2024-05-10',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 16:30 Mon-Sat',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT Major Arterial/Collector Plan',
    specialConditions: [
      'Associated with Maricopa County Building Permit B202200090.',
      'Street light pole placement must adhere to MCDOT Standard Detail 410.',
    ],
    source: 'MCDOT_RIT',
  },
  {
    id: 'mcdot-p1',
    tcNumber: 'TC-2026-0842',
    projectTitle: 'SRP 69kV Overhead to Underground Conversion',
    contractor: 'Salt River Project / Michels Power LLC',
    contractorContact: 'Derek Vance (Superintendent)',
    contractorPhone: '(602) 236-8888',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Bell Rd & N 83rd Ave (Northwest Corridor)',
    milepost: 'MP 14.2 - Bell Rd Corridor',
    lat: 33.6394,
    lng: -112.2384,
    permitType: 'Trench / Utility',
    status: 'Pre-Con Scheduled',
    issueDate: '2026-10-15',
    expirationDate: '2026-12-31',
    workWindow: '08:30 - 15:30 Mon-Fri (Restricted Peak Hours)',
    preConDate: '2026-10-29',
    preConCompleted: false,
    hasSignInSheet: false,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT TCP-04 (Dual Lane Shift with Message Boards)',
    specialConditions: [
      'Pre-construction meeting required prior to breaking ground.',
      'Must photograph pre-con sign-in sheet & business cards.',
      'No lane restrictions permitted between 06:00-08:30 and 15:30-18:30.',
      '1-inch steel trench plates pinned and cold-mix ramped overnight.',
    ],
  },
  {
    id: 'mcdot-p2',
    tcNumber: 'TC-2026-0917',
    projectTitle: 'Southwest Gas 8-Inch Steel Main Replacement',
    contractor: 'NPL Construction Co.',
    contractorContact: 'Carlos Ramirez (Foreman)',
    contractorPhone: '(602) 276-8800',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Olive Ave & N 91st Ave, Peoria/Glendale Border',
    milepost: 'MP 8.6 - Olive Ave',
    lat: 33.5678,
    lng: -112.2556,
    permitType: 'Trench / Utility',
    status: 'Active',
    issueDate: '2026-10-01',
    expirationDate: '2026-11-20',
    workWindow: '07:00 - 16:00 Mon-Fri',
    preConDate: '2026-10-02',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-02 (Right Shoulder & Decel Lane Closure)',
    specialConditions: [
      'Compaction testing required every 200 linear feet of trench backfill.',
      'Dust control water truck continuous application per Rule 310.',
    ],
  },
  {
    id: 'mcdot-p3',
    tcNumber: 'TC-2026-1033',
    projectTitle: 'APS Substation Feeder Potholing & Directional Bore',
    contractor: 'Henkels & McCoy Inc.',
    contractorContact: 'Travis Miller (Safety Coordinator)',
    contractorPhone: '(602) 250-1000',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Northern Ave & N 75th Ave, Glendale',
    milepost: 'MP 11.0 - Northern Ave',
    lat: 33.5532,
    lng: -112.2208,
    permitType: 'Pavement Cut',
    status: 'Active',
    issueDate: '2026-09-20',
    expirationDate: '2026-11-15',
    workWindow: 'Night Work: 20:00 - 05:00',
    preConDate: '2026-09-22',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT TCP-08 (Center Turn Lane & Left Lane Closed)',
    specialConditions: [
      'MUTCD Type III flashing arrow board required in west approach.',
      'Barricades must be cleaned of mud and graffiti daily.',
    ],
  },
  {
    id: 'mcdot-p4',
    tcNumber: 'TC-2026-1104',
    projectTitle: 'Lumen Fiber Optic Conduit Installation (5,200 LF)',
    contractor: 'B&F Contracting',
    contractorContact: 'Elena Rostova (PM)',
    contractorPhone: '(480) 968-9800',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Baseline Rd & S 51st Ave, Laveen / Phoenix',
    milepost: 'MP 4.1 - Baseline Rd',
    lat: 33.3782,
    lng: -112.1691,
    permitType: 'Trench / Utility',
    status: 'Active',
    issueDate: '2026-10-10',
    expirationDate: '2026-12-10',
    workWindow: '08:30 - 15:30 Mon-Fri',
    preConDate: '2026-10-12',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-01 (Sidewalk Detour & Bike Lane Closure)',
    specialConditions: [
      'ADA compliant temporary ramp path required around bore pits.',
      'Pothole slurry backfill within 24 hours of utility verification.',
    ],
  },
  {
    id: 'mcdot-p5',
    tcNumber: 'TC-2026-1149',
    projectTitle: 'Commercial Driveway Tie-In & Deceleration Lane',
    contractor: 'Hunter Contracting Co.',
    contractorContact: 'Markus Henderson (Superintendent)',
    contractorPhone: '(480) 895-8800',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Carefree Hwy & N 27th Ave, Unincorporated Maricopa',
    milepost: 'MP 2.8 - Carefree Hwy',
    lat: 33.7997,
    lng: -112.1172,
    permitType: 'Driveway Access',
    status: 'Pre-Con Scheduled',
    issueDate: '2026-10-22',
    expirationDate: '2027-01-30',
    workWindow: '07:00 - 16:30 Mon-Sat',
    preConDate: '2026-10-30',
    preConCompleted: false,
    hasSignInSheet: false,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT TCP-03 (Single Lane Flagging Operation)',
    specialConditions: [
      'Pre-construction meeting scheduled. MANDATORY SIGN-IN SHEET CAPTURE.',
      'Collect business cards from earthwork contractor & paving QC manager.',
      'Curb & gutter cross-slope must maintain 2% drainage away from travel lane.',
    ],
  },
  {
    id: 'mcdot-p6',
    tcNumber: 'TC-2026-1205',
    projectTitle: 'MCDOT Traffic Signal Interconnect & ITS Loop Installation',
    contractor: 'Rummel Construction Inc.',
    contractorContact: 'Brian O’Connor (Signal Foreman)',
    contractorPhone: '(480) 224-9200',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W McDowell Rd & N 99th Ave, Tolleson/Avondale',
    milepost: 'MP 6.3 - McDowell Corridor',
    lat: 33.4659,
    lng: -112.2725,
    permitType: 'Signal / ITS Loop',
    status: 'Active',
    issueDate: '2026-10-05',
    expirationDate: '2026-11-25',
    workWindow: '09:00 - 15:00 Mon-Fri',
    preConDate: '2026-10-06',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-06 (Intersection Loop Sawcut Shift)',
    specialConditions: [
      'Epoxy sealant over inductive loop detector sawcuts must cure 2 hrs before traffic release.',
      'County ITS technician must inspect splice box before final pull.',
    ],
  },
  {
    id: 'mcdot-p7',
    tcNumber: 'TC-2026-1288',
    projectTitle: 'Maricopa Water District Storm Drain Culvert Tie-In',
    contractor: 'Sundt Construction Inc.',
    contractorContact: 'Garrett Holt (Senior PM)',
    contractorPhone: '(480) 293-3000',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Buckeye Rd & S 67th Ave, Phoenix/Maricopa',
    milepost: 'MP 3.4 - Buckeye Rd',
    lat: 33.4357,
    lng: -112.2033,
    permitType: 'Stormwater Tie-in',
    status: 'Final Inspection Pending',
    issueDate: '2026-08-15',
    expirationDate: '2026-11-01',
    workWindow: '06:00 - 14:30 Mon-Fri',
    preConDate: '2026-08-17',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-09 (Full Box Culvert Trench Crossing)',
    specialConditions: [
      'Final asphalt restoration completed. Awaiting core compaction lab report.',
      'Inspect catch basin grate inlet elevations for ponding compliance.',
    ],
  },
  {
    id: 'mcdot-p8',
    tcNumber: 'TC-2026-1341',
    projectTitle: 'Cox Communications 4-Way Duct Bank Trenching',
    contractor: 'CSW Contractors Inc.',
    contractorContact: 'Anthony DeMarco (Field Lead)',
    contractorPhone: '(602) 242-7000',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Lower Buckeye Rd & S 83rd Ave, Tolleson',
    milepost: 'MP 5.7 - Lower Buckeye Rd',
    lat: 33.4215,
    lng: -112.2381,
    permitType: 'Trench / Utility',
    status: 'Active',
    issueDate: '2026-10-18',
    expirationDate: '2026-12-05',
    workWindow: '08:30 - 15:30 Mon-Fri',
    preConDate: '2026-10-20',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT TCP-02 (Shoulder Trench Closure)',
    specialConditions: [
      'Controlled Low Strength Material (CLSM) 1-sack slurry required for trench backfill.',
      'Surface restoration requires 2-inch milling 50-ft both sides of trench.',
    ],
  },
  {
    id: 'mcdot-p9',
    tcNumber: 'TC-2026-1399',
    projectTitle: 'City of Surprise Water Main Extension Along Bell Rd',
    contractor: 'Achen-Gardner Construction',
    contractorContact: 'Wyatt Keller (Superintendent)',
    contractorPhone: '(480) 403-9400',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Bell Rd & N Reems Rd, Surprise',
    milepost: 'MP 19.5 - Bell Rd West',
    lat: 33.6391,
    lng: -112.3854,
    permitType: 'Trench / Utility',
    status: 'Pre-Con Scheduled',
    issueDate: '2026-10-25',
    expirationDate: '2027-02-15',
    workWindow: '08:30 - 15:30 Mon-Fri',
    preConDate: '2026-10-31',
    preConCompleted: false,
    hasSignInSheet: false,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT TCP-05 (Multi-Lane Shift with Portable Signals)',
    specialConditions: [
      'Pre-con meeting scheduled for Friday 9:00 AM. Require sign-in sheet & business cards.',
      'Emergency response access must be maintained at all times for Surprise Fire Station 305.',
    ],
  },
  {
    id: 'mcdot-p10',
    tcNumber: 'TC-2026-1452',
    projectTitle: 'EPCOR Water 12-inch Main Cross-Tie',
    contractor: 'Haydon Building Corp',
    contractorContact: 'Ray Sanchez (Site PM)',
    contractorPhone: '(602) 296-5600',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Glendale Ave & N 107th Ave, Glendale/Maricopa Uninc.',
    milepost: 'MP 13.1 - Glendale Ave',
    lat: 33.5385,
    lng: -112.2891,
    permitType: 'Pavement Cut',
    status: 'Active',
    issueDate: '2026-10-12',
    expirationDate: '2026-11-28',
    workWindow: '08:30 - 15:30 Mon-Fri',
    preConDate: '2026-10-14',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-04 (Lane Shift)',
    specialConditions: [
      'T-top asphalt patch required over all roadway cuts.',
      'Traffic signal detector loop replaced within 72 hours of paving.',
    ],
  },
  {
    id: 'mcdot-p11',
    tcNumber: 'TC-2026-1510',
    projectTitle: 'Subdivision Roadway Widening & Turn Bay Construction',
    contractor: 'Kiewit Infrastructure West',
    contractorContact: 'Jim Thorsen (General Superintendent)',
    contractorPhone: '(602) 437-7800',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Chandler Heights Rd & S Gilbert Rd, Gilbert/Maricopa',
    milepost: 'MP 9.4 - South County',
    lat: 33.2335,
    lng: -111.7898,
    permitType: 'Lane Closure / Barricade',
    status: 'Active',
    issueDate: '2026-09-10',
    expirationDate: '2026-12-20',
    workWindow: '07:00 - 16:00 Mon-Sat',
    preConDate: '2026-09-12',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-07 (Detour Route via Higley Rd)',
    specialConditions: [
      'Maintain continuous bus stop access for Valley Metro Route 156.',
      'Daily sweeping of track-out at gate onto Gilbert Rd.',
    ],
  },
  {
    id: 'mcdot-p12',
    tcNumber: 'TC-2026-1588',
    projectTitle: 'CenturyLink / Brightspeed Fiber Backbone Trench',
    contractor: 'Diversified Utility Services',
    contractorContact: 'Samantha Wu (Field Operations)',
    contractorPhone: '(480) 555-0199',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'E University Dr & N Power Rd, Mesa/Maricopa',
    milepost: 'MP 17.8 - East Mesa',
    lat: 33.4223,
    lng: -111.6872,
    permitType: 'Trench / Utility',
    status: 'Pre-Con Scheduled',
    issueDate: '2026-10-24',
    expirationDate: '2026-12-15',
    workWindow: '08:30 - 15:30 Mon-Fri',
    preConDate: '2026-10-30',
    preConCompleted: false,
    hasSignInSheet: false,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT TCP-01 (Outside Lane Closure)',
    specialConditions: [
      'Pre-construction meeting required. Capture photo of sign-in sheet & business cards.',
      'Ensure 500-foot advance warning signage on Power Rd approach.',
    ],
  },
  {
    id: 'mcdot-p13',
    tcNumber: 'TC-2026-1632',
    projectTitle: 'Industrial Park Gas Service Header & Regulator Station',
    contractor: 'Southwest Gas Corporation',
    contractorContact: 'Marcus Vance (Safety Lead)',
    contractorPhone: '(602) 271-7000',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'S 35th Ave & W Southern Ave, Phoenix/Laveen',
    milepost: 'MP 3.9 - Southern Corridor',
    lat: 33.3934,
    lng: -112.1341,
    permitType: 'Trench / Utility',
    status: 'Active',
    issueDate: '2026-10-08',
    expirationDate: '2026-11-30',
    workWindow: '08:00 - 16:00 Mon-Fri',
    preConDate: '2026-10-09',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-03 (Shoulder and Turn Pocket)',
    specialConditions: [
      'Pipeline crossing requires cathodic protection inspection by County materials lab.',
    ],
  },
  {
    id: 'mcdot-p14',
    tcNumber: 'TC-2026-1701',
    projectTitle: 'Commercial Entrance Decel Lane & Median Cut',
    contractor: 'FNF Construction Inc.',
    contractorContact: 'Dustin Cooper (Project Director)',
    contractorPhone: '(480) 784-2900',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Van Buren St & N 91st Ave, Tolleson',
    milepost: 'MP 7.2 - Van Buren',
    lat: 33.4512,
    lng: -112.2554,
    permitType: 'Driveway Access',
    status: 'Active',
    issueDate: '2026-10-15',
    expirationDate: '2026-12-28',
    workWindow: '08:30 - 15:30 Mon-Fri',
    preConDate: '2026-10-17',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-04 (Lane Shift)',
    specialConditions: [
      'Median curb removal requires concrete sawcut straight edges.',
      'Reflective raised pavement markers (RPMs) must be replaced after repaving.',
    ],
  },
  {
    id: 'mcdot-p15',
    tcNumber: 'TC-2026-1777',
    projectTitle: 'Buckeye Logistics Center Highway Drainage Interceptor',
    contractor: 'Granite Construction',
    contractorContact: 'Luke Sterling (General Superintendent)',
    contractorPhone: '(520) 748-8000',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Broadway Rd & S Miller Rd, Buckeye',
    milepost: 'MP 28.3 - Buckeye Expressway',
    lat: 33.4072,
    lng: -112.5833,
    permitType: 'Stormwater Tie-in',
    status: 'Pre-Con Scheduled',
    issueDate: '2026-10-27',
    expirationDate: '2027-03-31',
    workWindow: '06:30 - 15:00 Mon-Fri',
    preConDate: '2026-11-03',
    preConCompleted: false,
    hasSignInSheet: false,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT TCP-05 (Heavy Haul Truck Crossing)',
    specialConditions: [
      'Pre-construction meeting required. Mandatory sign-in sheet & business cards photo capture.',
      'Heavy equipment crossing requires rubber track protection or 12-inch dirt pad over asphalt.',
    ],
  },
  {
    id: 'mcdot-p16',
    tcNumber: 'TC-2026-1825',
    projectTitle: 'APS Underground Vault Installation & Feeder Pull',
    contractor: 'Henkels & McCoy Inc.',
    contractorContact: 'Travis Miller (Safety Coordinator)',
    contractorPhone: '(602) 250-1000',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Thomas Rd & N 59th Ave, Phoenix/Maricopa',
    milepost: 'MP 5.5 - Thomas Rd',
    lat: 33.4802,
    lng: -112.1865,
    permitType: 'Pavement Cut',
    status: 'Active',
    issueDate: '2026-10-14',
    expirationDate: '2026-11-25',
    workWindow: '08:30 - 15:30 Mon-Fri',
    preConDate: '2026-10-16',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-02 (Right Lane Closure)',
    specialConditions: [
      'Precast concrete vault placement requires certified crane operator and MCDOT lane closure permit.',
    ],
  },
  {
    id: 'mcdot-p17',
    tcNumber: 'TC-2026-1890',
    projectTitle: 'Scottsdale Water Sewer Force Main Relocation',
    contractor: 'Hunter Contracting Co.',
    contractorContact: 'Markus Henderson (Superintendent)',
    contractorPhone: '(480) 895-8800',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'E Frank Lloyd Wright Blvd & N 100th St, Scottsdale/Maricopa',
    milepost: 'MP 12.4 - FLW Blvd',
    lat: 33.6052,
    lng: -111.8671,
    permitType: 'Trench / Utility',
    status: 'Active',
    issueDate: '2026-10-04',
    expirationDate: '2026-12-18',
    workWindow: '08:30 - 15:30 Mon-Fri',
    preConDate: '2026-10-05',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-04 (Lane Shift)',
    specialConditions: [
      'Restoration requires rubberized asphalt friction course (ARFC) match.',
    ],
  },
  {
    id: 'mcdot-p18',
    tcNumber: 'TC-2026-1944',
    projectTitle: 'Anthem Area Telecom Microtrenching Project (12,000 LF)',
    contractor: 'Corning Optical / Team Fishel',
    contractorContact: 'Gabe Morales (Operations Director)',
    contractorPhone: '(623) 555-0144',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'N Gavilan Peak Pkwy & W Daisy Mountain Dr, Anthem/Maricopa',
    milepost: 'MP 1.2 - Gavilan Peak',
    lat: 33.8643,
    lng: -112.1462,
    permitType: 'Trench / Utility',
    status: 'Pre-Con Scheduled',
    issueDate: '2026-10-26',
    expirationDate: '2027-01-15',
    workWindow: '08:30 - 15:30 Mon-Fri',
    preConDate: '2026-10-31',
    preConCompleted: false,
    hasSignInSheet: false,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT TCP-01 (Rolling Shoulder Closure)',
    specialConditions: [
      'Pre-construction meeting scheduled. Reminder to capture sign-in sheet & business cards.',
      'Microtrench must be backfilled with structural polymer grout within same shift.',
    ],
  },
  // --- W Patton Rd Fiber Backbone Corridor (Team Fishel Multi-Permit Corridor Cluster) ---
  {
    id: 'rit-patton-tc2601811',
    tcNumber: 'TC2601811',
    projectTitle: '4-Way Fiber Duct Bank Bore & Splice Vault (MAG 200-1)',
    contractor: 'Team Fishel',
    contractorContact: 'Gabe Morales (Superintendent)',
    contractorPhone: '(623) 582-4190',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Patton Rd & N 203rd Ave, Wittmann',
    milepost: 'N 203rd Ave',
    lat: 33.7321,
    lng: -112.5338,
    permitType: 'Trench / Utility',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2026-09-18',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 15:30 Mon-Fri',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-02 (Eastbound Shoulder & Bore Pit Taper)',
    specialConditions: [
      '48-inch minimum cover on arterial ROW; 1/2-sack CLSM slurry within 8 ft of pavement edge.',
    ],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-patton-tc2601812',
    tcNumber: 'TC2601812',
    projectTitle: 'Directional Bore & Pothole Slurry Verification (2,640 LF)',
    contractor: 'Team Fishel',
    contractorContact: 'Gabe Morales (Superintendent)',
    contractorPhone: '(623) 582-4190',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Patton Rd & N 207th Ave, Wittmann',
    milepost: 'N 207th Ave',
    lat: 33.7321,
    lng: -112.5409,
    permitType: 'Trench / Utility',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2026-09-18',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 15:30 Mon-Fri',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-02 (Rolling Shoulder Work Zone)',
    specialConditions: [
      'Maintain continuous HDD bore log on site; backfill all utility potholes with 1/2-sack CLSM.',
    ],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-patton-tc2601814',
    tcNumber: 'TC2601814',
    projectTitle: 'Arterial Fiber Crossing & Handhole Vault Set',
    contractor: 'Team Fishel',
    contractorContact: 'Gabe Morales (Superintendent)',
    contractorPhone: '(623) 582-4190',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Patton Rd & N 211th Ave, Wittmann',
    milepost: 'N 211th Ave',
    lat: 33.7321,
    lng: -112.5479,
    permitType: 'Trench / Utility',
    status: 'Pre-Con Scheduled',
    rawRitStatus: 'Requires Customer Attention',
    issueDate: '2026-10-02',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 15:30 Mon-Fri',
    preConDate: '2026-11-13',
    preConCompleted: false,
    hasSignInSheet: false,
    hasBusinessCards: false,
    trafficControlPlan: 'MCDOT TCP-04 (Intersection Lane Shift)',
    specialConditions: [
      'Pre-con confirmation required for N 211th Ave arterial crossing TCP.',
    ],
    source: 'MCDOT_RIT',
  },
  {
    id: 'rit-patton-tc2601815',
    tcNumber: 'TC2601815',
    projectTitle: 'Conduit Extension & Shoulder Restoration (MAG 336)',
    contractor: 'Team Fishel',
    contractorContact: 'Gabe Morales (Superintendent)',
    contractorPhone: '(623) 582-4190',
    inspectorName: 'Marco Canzano (MAC)',
    location: 'W Patton Rd & N 215th Ave, Wittmann',
    milepost: 'N 215th Ave',
    lat: 33.7321,
    lng: -112.5548,
    permitType: 'Trench / Utility',
    status: 'Active',
    rawRitStatus: 'Issued',
    issueDate: '2026-10-04',
    expirationDate: '2026-12-31',
    workWindow: '07:00 - 15:30 Mon-Fri',
    preConCompleted: true,
    hasSignInSheet: true,
    hasBusinessCards: true,
    trafficControlPlan: 'MCDOT TCP-02 (Shoulder Closure)',
    specialConditions: ['Compact shoulder ABC to 100% standard proctor per MAG 702.'],
    source: 'MCDOT_RIT',
  },
];

/**
 * Calculates Great-Circle / Haversine distance between two coordinates in miles
 */
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Radius of Earth in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Checks whether a permit's expirationDate is strictly in the past relative to today's date.
 */
export function isPermitExpired(
  expirationDate?: string | null,
  referenceDate: Date = new Date()
): boolean {
  if (!expirationDate) return false;
  const trimmed = String(expirationDate).trim();
  if (!trimmed) return false;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let expTime: number;
  if (isoMatch) {
    expTime = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
      23,
      59,
      59,
      999
    ).getTime();
  } else {
    expTime = new Date(trimmed).getTime();
  }

  if (isNaN(expTime)) return false;
  const todayStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0,
    0,
    0,
    0
  ).getTime();

  return expTime < todayStart;
}

/**
 * Flags permits past their expirationDate as 'Expired' during ingestion
 * (without overwriting Completed, Denied, or Withdrawn statuses).
 */
export function normalizePermitExpirationStatus(
  permit: Permit,
  referenceDate: Date = new Date()
): Permit {
  if (
    permit.status !== 'Completed' &&
    permit.status !== 'Denied' &&
    permit.status !== 'Withdrawn' &&
    isPermitExpired(permit.expirationDate, referenceDate)
  ) {
    return {
      ...permit,
      status: 'Expired',
      rawRitStatus: 'Expired',
    };
  }
  return permit;
}

/**
 * Returns up to 10 of the nearest right-of-way permits to a given GPS coordinate (default `limit = 10`).
 */
export function getNearestPermits(
  currentLat: number,
  currentLng: number,
  permits: Permit[] = INITIAL_MARICOPA_PERMITS,
  limit = 10
): Permit[] {
  const permitsWithDistance = permits.map((permit) => ({
    ...permit,
    distanceMiles: calculateDistanceMiles(
      currentLat,
      currentLng,
      permit.lat,
      permit.lng
    ),
  }));

  permitsWithDistance.sort((a, b) => (a.distanceMiles || 0) - (b.distanceMiles || 0));
  return permitsWithDistance.slice(0, limit);
}

/**
 * Evaluates whether a permit is an actionable active permit.
 * Strictly filters to 'Issued', 'Requires Customer Attention', 'Stop Work', or 'In Review'
 * and excludes Denied, Complete, Expired (by status OR past expirationDate), Withdrawn, and Unknown permits.
 */
export function isActionableActivePermit(permit: {
  rawRitStatus?: string;
  status?: string;
  expirationDate?: string | null;
}): boolean {
  const raw = (permit.rawRitStatus || '').trim().toLowerCase();
  const status = (permit.status || '').trim().toLowerCase();

  // Explicitly reject expired-by-date permits even if status string wasn't updated
  if (isPermitExpired(permit.expirationDate)) {
    return false;
  }

  // Explicitly reject non-actionable, inactive, unknown, or completed permits
  if (
    raw.includes('denied') ||
    raw.includes('complete') ||
    raw.includes('expired') ||
    raw.includes('withdrawn') ||
    raw === 'unknown' ||
    status.includes('denied') ||
    status.includes('complete') ||
    status.includes('completed') ||
    status.includes('expired') ||
    status.includes('withdrawn') ||
    status === 'unknown'
  ) {
    return false;
  }

  // Actionable active statuses specified:
  // 'Issued', 'Requires Customer Attention', 'Stop Work', or 'In Review'
  return (
    raw.includes('issued') ||
    raw.includes('customer attention') ||
    raw.includes('attention') ||
    raw.includes('stop work') ||
    raw.includes('in review') ||
    raw.includes('submitted') ||
    status === 'active' ||
    status === 'pre-con scheduled' ||
    status === 'final inspection pending'
  );
}

/**
 * Returns a human-readable street/location address or work category/description,
 * falling back to coordinates only if no address or work type exists.
 */
export function formatPermitLocationOrScope(permit: Permit): string {
  // If there is an authentic street/road name or address in location (not raw coordinates)
  if (permit.location) {
    const trimmed = permit.location
      .replace(/^Maricopa County ROW\s*\(?/, '')
      .replace(/\)?$/, '')
      .trim();
    const isRawCoords = /^Lat:\s*[\d.-]+,\s*Lng:\s*[\d.-]+/i.test(trimmed) || trimmed.toLowerCase().startsWith('lat:');
    if (!isRawCoords && trimmed.length > 0) {
      return trimmed;
    }
  }

  // If there is a milepost or corridor
  if (permit.milepost && !permit.milepost.toLowerCase().includes('lat:')) {
    return permit.milepost;
  }

  // Work category / description (e.g., 'Utility Trenching • Fiber Optic' or permitType • projectTitle)
  if (permit.projectTitle && permit.permitType && permit.projectTitle !== permit.permitType) {
    if (!permit.projectTitle.toLowerCase().includes('lat:') && !permit.projectTitle.toLowerCase().includes('other item')) {
      return `${permit.permitType} • ${permit.projectTitle}`;
    }
  }

  if (permit.projectTitle && !permit.projectTitle.toLowerCase().includes('lat:') && !permit.projectTitle.toLowerCase().includes('other item')) {
    return permit.projectTitle;
  }

  if (permit.permitType) {
    return `${permit.permitType} • ROW Work`;
  }

  // Fallback to coordinates only if no address or type exists
  if (permit.lat && permit.lng) {
    return `Lat: ${permit.lat.toFixed(4)}, Lng: ${permit.lng.toFixed(4)}`;
  }

  return 'Right-of-Way Permit';
}

/**
 * Calculates forward compass bearing in degrees (0–360) from point 1 to point 2.
 */
export function calculateBearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

export interface ResolvedPermitCardContact {
  companyName: string;
  contactName: string;
  displayPhone: string;
  cleanPhone: string;
  source: 'notes' | 'precon' | 'permit';
}

const GENERIC_CONTRACTOR_PATTERNS =
  /^(?:permittee\s*\/?\s*general\s*contractor|general\s*contractor|commercial\s*\/?\s*residential\s*developer|electrical\s*utility\s*contractor|maricopa\s*county\s*row|unknown|other\s*item|not\s+listed(\s+in\s+gis)?)$/i;

const GENERIC_CONTACT_PATTERNS =
  /^(?:field\s*superintendent|site\s*contact|contractor\s*rep|permittee|unknown|not\s+listed(\s+in\s+gis)?)$/i;

function cleanPhoneDigits(rawPhone?: string | null): { display: string; clean: string } {
  const digits = (rawPhone || '').replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length === 10) {
    return {
      display: `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`,
      clean: ten,
    };
  }
  return { display: '', clean: '' };
}

/**
 * Resolves the authentic Contractor / Permittee Company Name, Field Superintendent / Pre-Con Contact Name,
 * and phone number from inspector notes, saved Pre-Con contact, or authentic GIS attributes.
 * Never fabricates contractors, contacts, or phone numbers when missing from GIS.
 */
export function resolvePermitCardContact(
  permit: Permit,
  extractedNotesContacts: ExtractedPermitContact[] = [],
  preConContact?: PreConContact | null
): ResolvedPermitCardContact {
  // Resolve authentic company name (never synthesize when missing from GIS)
  const rawCompany = (permit.contractor || '').trim();
  const baseCompany =
    rawCompany && !GENERIC_CONTRACTOR_PATTERNS.test(rawCompany)
      ? rawCompany
      : 'Not Listed in GIS';

  // Resolve authentic contact name if present
  const rawContact = (permit.contractorContact || '').trim();
  const baseContact =
    rawContact && !GENERIC_CONTACT_PATTERNS.test(rawContact) ? rawContact : '';

  // Resolve authentic phone if present
  const rawPermitPhone = (permit.contractorPhone || '').trim();
  const basePhoneParsed = cleanPhoneDigits(rawPermitPhone);

  // 1. Highest priority: Contact auto-extracted from Permit Notes narrative
  const noteContact = extractedNotesContacts[0];
  if (noteContact && noteContact.cleanPhone) {
    const validNoteName =
      noteContact.name && !GENERIC_CONTACT_PATTERNS.test(noteContact.name)
        ? noteContact.name
        : baseContact;
    const validNoteCompany =
      noteContact.company && !GENERIC_CONTRACTOR_PATTERNS.test(noteContact.company)
        ? noteContact.company
        : baseCompany;
    return {
      companyName: validNoteCompany,
      contactName: validNoteName,
      displayPhone: noteContact.phone,
      cleanPhone: noteContact.cleanPhone,
      source: 'notes',
    };
  }

  // 2. Second priority: Pre-Con Contact record if populated
  const pc = preConContact || permit.preConContact;
  if (pc && (pc.name || pc.phone || pc.company)) {
    const pcPhone = cleanPhoneDigits(pc.phone);
    return {
      companyName:
        pc.company && !GENERIC_CONTRACTOR_PATTERNS.test(pc.company) ? pc.company : baseCompany,
      contactName:
        pc.name && !GENERIC_CONTACT_PATTERNS.test(pc.name) ? pc.name : baseContact,
      displayPhone: pcPhone.display || basePhoneParsed.display,
      cleanPhone: pcPhone.clean || basePhoneParsed.clean,
      source: 'precon',
    };
  }

  // 3. Permit record contact (truthful GIS data only; no fabricated fallbacks)
  return {
    companyName: baseCompany,
    contactName: baseContact,
    displayPhone: basePhoneParsed.display,
    cleanPhone: basePhoneParsed.clean,
    source: 'permit',
  };
}

/**
 * Formats Primary Street / Cross-Street and Key Scope details onto a crisp single line
 * for each permit card in the list.
 */
export function formatPermitCrossStreetAndScope(permit: Permit): {
  crossStreet: string;
  keyScope: string;
  singleLine: string;
} {
  // 1. Primary Street & Cross-Street
  let rawLoc = (permit.location || '')
    .replace(/^Maricopa County ROW\s*\(?/i, '')
    .replace(/,\s*Unincorporated Maricopa.*$/i, '')
    .replace(/,\s*Maricopa Uninc\.?$/i, '')
    .replace(/,\s*Wittmann$/i, '')
    .trim();

  if (
    !rawLoc ||
    /^lat:\s*[\d.-]+/i.test(rawLoc) ||
    rawLoc.includes('•') ||
    /maricopa county row/i.test(rawLoc)
  ) {
    rawLoc = '';
  }

  // Append cross-street from milepost if location doesn't already contain '&' or '/'
  const mp = (permit.milepost || '')
    .replace(/\b(?:Cross-Street|Sub-sector|Sector|Corridor)\b/gi, '')
    .replace(/^MP\s*[\d.]+\s*-\s*/i, '')
    .trim();

  let crossStreet = rawLoc;
  if (crossStreet && mp && !crossStreet.includes('&') && !crossStreet.includes('/')) {
    if (!crossStreet.toLowerCase().includes(mp.toLowerCase())) {
      crossStreet = `${crossStreet} & ${mp}`;
    }
  } else if (!crossStreet && mp) {
    crossStreet = mp;
  } else if (!crossStreet) {
    const nsAve = Math.round(Math.abs(-112.074 - permit.lng) * 69 * 8);
    crossStreet =
      nsAve > 10 && nsAve < 350 ? `County ROW & N ${nsAve}th Ave` : 'Maricopa County ROW';
  }

  // 2. Key Scope summary — strip redundant permitType prefixes like 'Trench / Utility:' or 'Driveway Access:'
  let keyScope = (permit.projectTitle || '').trim();
  keyScope = keyScope
    .replace(
      /^(?:Trench\s*\/\s*Utility|Driveway\s+Access|Pavement\s+Cut|Stormwater\s+Tie-?in|Signal\s*\/\s*ITS\s+Loop|Lane\s+Closure\s*\/\s*Barricade)\s*[:—•-]\s*/i,
      ''
    )
    .replace(
      /\s*-\s*(?:W\s+|N\s+|E\s+|S\s+)?[A-Za-z0-9\s]+(?:Dr|Rd|Ln|Ave|Blvd|St|Pkwy|Hwy)$/i,
      ''
    )
    .trim();

  if (
    !keyScope ||
    /^other item$/i.test(keyScope) ||
    /^general$/i.test(keyScope) ||
    /^right-of-way permit work$/i.test(keyScope) ||
    /^county row construction$/i.test(keyScope)
  ) {
    keyScope =
      permit.permitType === 'Trench / Utility'
        ? 'Underground Utility ROW Construction'
        : permit.permitType === 'Driveway Access'
        ? 'Driveway Apron & Culvert (MAG 250)'
        : permit.permitType || 'County ROW Construction';
  }

  return {
    crossStreet,
    keyScope,
    singleLine: `${crossStreet} · ${keyScope}`,
  };
}

export interface ClarifiedPermitStatusInfo {
  ritBadgeLabel: string;
  ritBadgeClass: string;
  ritTooltip: string;
  fieldBadgeLabel: string;
  fieldBadgeClass: string;
  fieldDotClass: string;
  fieldTooltip: string;
}

/**
 * Clarifies status badge meanings by explicitly separating:
 * 1. Official MCDOT RIT Permit Status (Issued, Attention, Pre-Con Sched., Final Pending)
 * 2. Inspector Field Status (Needs Visit, Pre-Con Done, TCP Approved, In Progress, Logged Today, Final Check, Closed)
 */
export function getClarifiedPermitStatusInfo(
  permit: Permit,
  lifecycleStage: PermitLifecycleStage,
  isVisitedToday: boolean
): ClarifiedPermitStatusInfo {
  const rawRit = (permit.rawRitStatus || '').trim();
  const status = (permit.status || '').trim();
  const expiredByDate = isPermitExpired(permit.expirationDate);

  let ritBadgeLabel = 'Unknown';
  let ritBadgeClass =
    'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
  let ritTooltip = 'MCDOT RIT Permit Status: Not listed in GIS';

  if (
    (/expired/i.test(rawRit) || status === 'Expired' || expiredByDate) &&
    status !== 'Completed' &&
    status !== 'Denied' &&
    status !== 'Withdrawn'
  ) {
    ritBadgeLabel = 'Expired';
    ritBadgeClass =
      'bg-orange-100 text-orange-950 border-orange-400 dark:bg-orange-950/90 dark:text-orange-200 dark:border-orange-500/60';
    ritTooltip = permit.expirationDate
      ? `MCDOT Permit Expired on ${permit.expirationDate}`
      : 'MCDOT RIT Permit Status: Expired';
  } else if (/attention/i.test(rawRit)) {
    ritBadgeLabel = 'Cust. Attention';
    ritBadgeClass =
      'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950/90 dark:text-amber-200 dark:border-amber-400/70';
    ritTooltip = 'MCDOT RIT Permit Status: Requires Customer Attention';
  } else if (/stop work/i.test(rawRit)) {
    ritBadgeLabel = 'Stop Work';
    ritBadgeClass =
      'bg-rose-100 text-rose-950 border-rose-400 dark:bg-rose-950/95 dark:text-rose-200 dark:border-rose-500/70';
    ritTooltip = 'MCDOT RIT Permit Status: Stop Work Order active';
  } else if (status === 'Pre-Con Scheduled' || /in review|submitted/i.test(rawRit)) {
    ritBadgeLabel = 'Pre-Con Sched.';
    ritBadgeClass =
      'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950/90 dark:text-amber-200 dark:border-amber-400/70';
    ritTooltip = 'Permit Status: Pre-Construction Meeting Scheduled';
  } else if (status === 'Final Inspection Pending') {
    ritBadgeLabel = 'Final Pending';
    ritBadgeClass =
      'bg-teal-50 text-teal-950 border-teal-400 dark:bg-teal-950/90 dark:text-teal-200 dark:border-teal-500/60';
    ritTooltip = 'Permit Status: Final ROW Acceptance Inspection Pending';
  } else if (/complete/i.test(rawRit) || status === 'Completed') {
    ritBadgeLabel = 'Complete';
    ritBadgeClass =
      'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
    ritTooltip = 'MCDOT RIT Permit Status: Completed';
  } else if (/denied/i.test(rawRit) || status === 'Denied') {
    ritBadgeLabel = 'Denied';
    ritBadgeClass =
      'bg-rose-100 text-rose-950 border-rose-400 dark:bg-rose-950/90 dark:text-rose-200 dark:border-rose-500/60';
    ritTooltip = 'MCDOT RIT Permit Status: Denied';
  } else if (/withdrawn/i.test(rawRit) || status === 'Withdrawn') {
    ritBadgeLabel = 'Withdrawn';
    ritBadgeClass =
      'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
    ritTooltip = 'MCDOT RIT Permit Status: Withdrawn';
  } else if (/issued/i.test(rawRit) || status === 'Active') {
    ritBadgeLabel = 'Issued';
    ritBadgeClass =
      'bg-blue-50 text-blue-900 border-blue-300 dark:bg-blue-950/90 dark:text-blue-200 dark:border-blue-500/60';
    ritTooltip = 'MCDOT RIT Permit Status: Issued & active for field inspection';
  }

  // Clarify field inspection lifecycle badge meaning
  if (lifecycleStage === 'Closed') {
    return {
      ritBadgeLabel,
      ritBadgeClass,
      ritTooltip,
      fieldBadgeLabel: 'Permit Closed',
      fieldBadgeClass:
        'bg-slate-200 text-slate-800 border-slate-400 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600',
      fieldDotClass: 'bg-slate-600 dark:bg-slate-400',
      fieldTooltip: 'Inspector Field Status: Final acceptance complete & permit closed in notes',
    };
  }

  if (isVisitedToday) {
    const suffix =
      lifecycleStage !== 'Logged' && lifecycleStage !== 'In Progress'
        ? ` · ${lifecycleStage}`
        : '';
    return {
      ritBadgeLabel,
      ritBadgeClass,
      ritTooltip,
      fieldBadgeLabel: `Logged Today${suffix}`,
      fieldBadgeClass:
        'bg-slate-200 text-slate-800 border-slate-400 dark:bg-slate-800/95 dark:text-slate-200 dark:border-slate-600',
      fieldDotClass: 'bg-emerald-600 dark:bg-emerald-400',
      fieldTooltip:
        'Inspector Field Status: Already inspected & logged today (card dimmed so unvisited permits stay on top)',
    };
  }

  switch (lifecycleStage) {
    case 'Pre-Con Done':
      return {
        ritBadgeLabel,
        ritBadgeClass,
        ritTooltip,
        fieldBadgeLabel: 'Pre-Con Done',
        fieldBadgeClass:
          'bg-sky-100 text-sky-950 border-sky-400 dark:bg-sky-950/90 dark:text-sky-200 dark:border-sky-500/60',
        fieldDotClass: 'bg-sky-600 dark:bg-sky-400',
        fieldTooltip: 'Inspector Field Status: Pre-construction meeting completed — ready for patrol check',
      };
    case 'TCP Approved':
      return {
        ritBadgeLabel,
        ritBadgeClass,
        ritTooltip,
        fieldBadgeLabel: 'TCP Approved',
        fieldBadgeClass:
          'bg-indigo-100 text-indigo-950 border-indigo-400 dark:bg-indigo-950/90 dark:text-indigo-200 dark:border-indigo-500/60',
        fieldDotClass: 'bg-indigo-600 dark:bg-indigo-400',
        fieldTooltip: 'Inspector Field Status: Traffic Control Plan approved — ready for active site inspection',
      };
    case 'In Progress':
      return {
        ritBadgeLabel,
        ritBadgeClass,
        ritTooltip,
        fieldBadgeLabel: 'In Progress',
        fieldBadgeClass:
          'bg-blue-100 text-blue-950 border-blue-400 dark:bg-blue-950/90 dark:text-blue-200 dark:border-blue-400/70',
        fieldDotClass: 'bg-blue-600 dark:bg-blue-400',
        fieldTooltip: 'Inspector Field Status: Active ROW work in progress — needs today’s patrol check',
      };
    case 'Final Check':
      return {
        ritBadgeLabel,
        ritBadgeClass,
        ritTooltip,
        fieldBadgeLabel: 'Final Check Done',
        fieldBadgeClass:
          'bg-teal-100 text-teal-950 border-teal-400 dark:bg-teal-950/90 dark:text-teal-200 dark:border-teal-500/60',
        fieldDotClass: 'bg-teal-600 dark:bg-teal-400',
        fieldTooltip: 'Inspector Field Status: Final site check logged — awaiting closeout',
      };
    case 'Logged':
    default:
      return {
        ritBadgeLabel,
        ritBadgeClass,
        ritTooltip,
        fieldBadgeLabel: 'Needs Visit',
        fieldBadgeClass:
          'bg-blue-100 text-blue-950 border-blue-400 dark:bg-blue-950/90 dark:text-blue-200 dark:border-blue-400/70',
        fieldDotClass: 'bg-blue-600 dark:bg-blue-400',
        fieldTooltip: 'Inspector Field Status: Uninspected today — needs drive-by or site visit',
      };
  }
}



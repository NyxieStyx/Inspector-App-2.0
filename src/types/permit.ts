export interface PreConContact {
  name: string;
  company: string;
  phone: string;
  savedAt?: string;
}

export interface Permit {
  id: string;
  tcNumber: string; // Unique Maricopa County Traffic Control / ROW permit number
  projectTitle: string;
  contractor: string;
  contractorContact?: string;
  contractorPhone?: string;
  inspectorName?: string;
  location: string;
  milepost?: string;
  lat: number;
  lng: number;
  permitType:
    | 'Trench / Utility'
    | 'Driveway Access'
    | 'Pavement Cut'
    | 'Signal / ITS Loop'
    | 'Stormwater Tie-in'
    | 'Lane Closure / Barricade';
  status:
    | 'Active'
    | 'Pre-Con Scheduled'
    | 'Final Inspection Pending'
    | 'Completed'
    | 'Expired'
    | 'Denied'
    | 'Withdrawn';
  issueDate: string;
  expirationDate: string;
  workWindow: string;
  preConDate?: string;
  preConCompleted: boolean;
  hasSignInSheet: boolean;
  hasBusinessCards: boolean;
  trafficControlPlan: string;
  specialConditions: string[];
  distanceMiles?: number;
  source?: 'MCDOT_RIT' | 'LOCAL';
  rawRitStatus?: string;
  ritColor?: string;
  ritArcgisUrl?: string;
  permitGuid?: string;
  sec?: string;
  township?: string;
  range?: string;
  preConContact?: PreConContact;
}

export interface StatusUpdate {
  id: string;
  timestamp: string;
  inspector: string;
  text: string;
  voiceDictated: boolean;
}

export interface PreConMeetingMinutes {
  recordedAt: string;
  durationSeconds?: number;
  audioAttached: boolean;
  structuredMinutes: string;
  contractorQuestionsCount?: number;
  projectRequirementsCount?: number;
}

export interface PermitPhoto {
  id: string;
  timestamp: string;
  category:
    | 'precon_signin'
    | 'business_card'
    | 'traffic_control'
    | 'trench'
    | 'paving'
    | 'general';
  caption: string;
  dataUrl: string; // Compressed base64 image
  fileSizeKb: number;
  driveFileId?: string;
}

export interface PermitNoteFile {
  tcNumber: string;
  permitId: string;
  lastSyncedAt: string;
  hasUnsyncedChanges?: boolean;
  driveFileId?: string;
  driveFileName?: string;
  driveWebViewLink?: string;
  driveFolderId?: string;
  driveFolderName?: string;
  driveFolderPath?: string;
  driveFolderWebViewLink?: string;
  inspectorNotes: StatusUpdate[];
  preConMeeting?: PreConMeetingMinutes;
  preConContact?: PreConContact;
  photos: PermitPhoto[];
  auditTrail: Array<{
    timestamp: string;
    action: string;
    user: string;
  }>;
}

export interface GPSPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
  isSimulated?: boolean;
}

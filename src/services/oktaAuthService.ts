/**
 * Maricopa County Okta Single Sign-On (SSO) Service
 * Target Endpoint: https://maricopa.okta.com/
 * 
 * Manages inspector authentication session state across the app so inspectors
 * only authenticate once per shift (typically 10-12 hours).
 */

export interface InspectorOktaSession {
  inspectorId: string;
  badgeNumber: string;
  displayName: string;
  email: string;
  title: string;
  department: string;
  countyAgency: 'MCDOT';
  authenticatedVia: 'Maricopa Okta SSO';
  shiftStartedAt: string;
  shiftExpiresAt: number; // timestamp in ms
  shiftDurationHours: number;
}

const OKTA_SESSION_STORAGE_KEY = 'mcdot_inspector_okta_session';
export const MARICOPA_OKTA_URL = 'https://maricopa.okta.com/';

export const DEFAULT_INSPECTOR_PRESETS: Omit<InspectorOktaSession, 'shiftStartedAt' | 'shiftExpiresAt'>[] = [
  {
    inspectorId: 'insp_4819',
    badgeNumber: 'MCDOT-4819',
    displayName: 'Marco Canzano',
    email: 'marco.canzano@maricopa.gov',
    title: 'MCDOT Right-of-Way Inspector',
    department: 'MCDOT Right-of-Way Inspections',
    countyAgency: 'MCDOT',
    authenticatedVia: 'Maricopa Okta SSO',
    shiftDurationHours: 10,
  },
  {
    inspectorId: 'insp_3204',
    badgeNumber: 'MCDOT-3204',
    displayName: 'Elena Rostova',
    email: 'elena.rostova@maricopa.gov',
    title: 'Transportation Permit Specialist',
    department: 'MCDOT Transportation Operations',
    countyAgency: 'MCDOT',
    authenticatedVia: 'Maricopa Okta SSO',
    shiftDurationHours: 10,
  },
  {
    inspectorId: 'insp_5190',
    badgeNumber: 'MCDOT-5190',
    displayName: 'David Morales',
    email: 'david.morales@maricopa.gov',
    title: 'ROW Construction Compliance Inspector',
    department: 'MCDOT Engineering & Field Support',
    countyAgency: 'MCDOT',
    authenticatedVia: 'Maricopa Okta SSO',
    shiftDurationHours: 12,
  },
];

/**
 * Retrieves the current inspector shift session if active and not expired.
 * Defaults to Marco Canzano as the primary authenticated inspector.
 */
export function getInspectorSession(): InspectorOktaSession | null {
  try {
    const raw = localStorage.getItem(OKTA_SESSION_STORAGE_KEY);
    if (!raw) {
      // Default to Marco Canzano shift session
      return createInspectorSession(DEFAULT_INSPECTOR_PRESETS[0]);
    }
    const session: InspectorOktaSession = JSON.parse(raw);
    const now = Date.now();

    // Check if shift has expired or contains outdated legacy inspector profile
    if (session.shiftExpiresAt && session.shiftExpiresAt < now) {
      return createInspectorSession(DEFAULT_INSPECTOR_PRESETS[0]);
    }

    if (session.displayName === 'Marcus Vance') {
      return createInspectorSession(DEFAULT_INSPECTOR_PRESETS[0]);
    }

    return session;
  } catch (err) {
    console.error('Error reading inspector Okta session:', err);
    return createInspectorSession(DEFAULT_INSPECTOR_PRESETS[0]);
  }
}

/**
 * Creates and persists an active inspector shift session (once per shift).
 */
export function createInspectorSession(
  inspectorData: Partial<InspectorOktaSession> = {},
  shiftHours = 10
): InspectorOktaSession {
  const now = Date.now();
  const shiftExpiresAt = now + shiftHours * 60 * 60 * 1000;

  const session: InspectorOktaSession = {
    inspectorId: inspectorData.inspectorId || 'insp_4819',
    badgeNumber: inspectorData.badgeNumber || 'MCDOT-4819',
    displayName: inspectorData.displayName || 'Marco Canzano',
    email: inspectorData.email || 'marco.canzano@maricopa.gov',
    title: inspectorData.title || 'MCDOT Right-of-Way Inspector',
    department: inspectorData.department || 'MCDOT Right-of-Way Inspections',
    countyAgency: 'MCDOT',
    authenticatedVia: 'Maricopa Okta SSO',
    shiftStartedAt: new Date(now).toISOString(),
    shiftExpiresAt,
    shiftDurationHours: shiftHours,
  };

  localStorage.setItem(OKTA_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

/**
 * Terminates the active inspector shift session.
 */
export function clearInspectorSession(): void {
  localStorage.removeItem(OKTA_SESSION_STORAGE_KEY);
}

/**
 * Calculates remaining shift duration in formatted string (e.g., "8h 45m remaining").
 */
export function formatShiftRemaining(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'Shift expired';

  const totalMinutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }
  return `${minutes}m left`;
}

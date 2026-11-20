import firebaseConfig from '../../firebase-applet-config.json';

/**
 * Google Drive OAuth Scope
 * Uses 'https://www.googleapis.com/auth/drive.file' exclusively so the app can
 * create, read, and PATCH-update 'My Drive > Spark Notes > Permit Notes > [PermitNumber] Permit Notes.docx'
 * without triggering restricted unverified-app OAuth blocks.
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const REQUIRED_DRIVE_SCOPES = [DRIVE_FILE_SCOPE];

export const DRIVE_SCOPES_STRING = REQUIRED_DRIVE_SCOPES.join(' ');

/**
 * LocalStorage key for user-configured Google OAuth 2.0 Web Client ID (public identifier, NOT a secret or token).
 * Access tokens are NEVER stored in localStorage/sessionStorage.
 */
export const GOOGLE_CLIENT_ID_STORAGE_KEY = 'mcdot_google_oauth_client_id';

let gapiInitialized = false;
let gapiInitPromise: Promise<void> | null = null;
let tokenClient: any = null;
let tokenClientConfiguredId: string | null = null;
let currentAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;

// Track active callback listeners for token acquisition
let activeTokenResolve: ((token: string) => void) | null = null;
let activeTokenReject: ((error: Error) => void) | null = null;

/**
 * Checks whether a candidate string is a valid Google OAuth 2.0 Web Client ID
 * (e.g. "1234567890-abcdefg.apps.googleusercontent.com").
 */
export function isValidGoogleClientId(candidate?: string | null): boolean {
  if (!candidate || typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.length < 28) return false;
  if (/^(YOUR_|MY_|INSERT_|REPLACE_|TODO)/i.test(trimmed)) return false;
  return /^[0-9]+-[a-z0-9_.-]+\.apps\.googleusercontent\.com$/i.test(trimmed);
}

/**
 * Reads user-saved Google OAuth Client ID from localStorage if present.
 */
export function getSavedLocalGoogleClientId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

/**
 * Saves a Google OAuth 2.0 Web Client ID to localStorage and resets the GIS tokenClient
 * so the next OAuth popup uses the updated client_id immediately.
 */
export function saveLocalGoogleClientId(clientId: string): void {
  if (typeof window === 'undefined') return;
  const clean = clientId.trim();
  try {
    if (clean) {
      localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Unable to save Google OAuth Client ID to localStorage:', e);
  }
  tokenClient = null;
  tokenClientConfiguredId = null;
}

/**
 * Returns the provisioned Firebase applet OAuth Client ID if available (optional helper).
 */
export function getProvisionedAppletClientId(): string {
  const candidate = (firebaseConfig?.oAuthClientId || '').trim();
  return isValidGoogleClientId(candidate) ? candidate : '';
}

/**
 * Checks VITE_GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_ID, and localStorage
 * for a valid configured Google OAuth Client ID.
 * Returns empty string if missing or invalid so the UI can open the inline Client ID configuration modal.
 */
export function getConfiguredGoogleClientId(): string {
  const fromLocal = getSavedLocalGoogleClientId();
  if (isValidGoogleClientId(fromLocal)) {
    return fromLocal;
  }

  const fromViteEnv = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  if (isValidGoogleClientId(fromViteEnv)) {
    return fromViteEnv;
  }

  const fromProcessEnv = String((process.env as any)?.GOOGLE_CLIENT_ID || '').trim();
  if (isValidGoogleClientId(fromProcessEnv)) {
    return fromProcessEnv;
  }

  return '';
}

/**
 * Validates and retrieves Client ID and API Key
 */
export function getGoogleApiCredentials(): {
  clientId: string;
  apiKey: string;
  hasExplicitClientId: boolean;
} {
  const explicitClientId = getConfiguredGoogleClientId();
  const apiKey = firebaseConfig.apiKey || '';

  return {
    clientId: explicitClientId,
    apiKey,
    hasExplicitClientId: Boolean(explicitClientId),
  };
}

export function getCurrentOriginUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

/**
 * Ensures gapi script is loaded in the browser
 */
async function ensureGapiScriptLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  if ((window as any).gapi) return;

  const start = Date.now();
  while (Date.now() - start < 3000) {
    if ((window as any).gapi) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

export interface DriveAuthErrorInfo {
  code: string;
  title: string;
  message: string;
  remediation: string;
  isIframeBlocked: boolean;
  isPopupBlocked: boolean;
  isCancelled: boolean;
  isClientConfigError?: boolean;
}

/**
 * Detects whether the application is running inside an embedded iframe
 * (such as the AI Studio preview pane) versus a standalone browser tab.
 */
export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Returns the standalone URL for opening the app in a dedicated top-level browser tab
 */
export function getStandaloneAppUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.href;
}

/**
 * Classifies Google OAuth / GIS popup / iframe errors into clear, actionable guidance,
 * including exact instructions on authorizing the preview URL in Google Cloud Console.
 */
export function classifyDriveOAuthError(err: any): DriveAuthErrorInfo {
  const inIframe = isRunningInIframe();
  const originUrl = getCurrentOriginUrl() || 'https://*.run.app';
  const rawCode = String(
    err?.code || err?.type || err?.error || err?.name || 'oauth_error'
  );
  const rawMessage = String(
    err?.message || err?.error_description || err?.details || err || ''
  );
  const combined = `${rawCode} ${rawMessage}`.toLowerCase();

  const isMissingOrInvalidClient =
    combined.includes('missing_client_id') ||
    combined.includes('invalid_client') ||
    combined.includes('deleted_client') ||
    combined.includes('oauth client was not found');

  if (isMissingOrInvalidClient) {
    return {
      code: rawCode,
      title: 'Google OAuth Client ID Missing or Invalid',
      message:
        'Google rejected the OAuth Client ID or none is configured yet.',
      remediation: `Click "Configure Client ID" to paste a valid Web OAuth Client ID (*.apps.googleusercontent.com) and add ${originUrl} under Authorized JavaScript origins in Google Cloud Console.`,
      isIframeBlocked: false,
      isPopupBlocked: false,
      isCancelled: false,
      isClientConfigError: true,
    };
  }

  const isPopupBlocked =
    combined.includes('popup-blocked') ||
    combined.includes('popup_blocked') ||
    combined.includes('popup_failed_to_open') ||
    combined.includes('unable to open a popup');

  const isCancelled =
    combined.includes('popup-closed-by-user') ||
    combined.includes('popup_closed') ||
    combined.includes('cancelled-popup-request') ||
    combined.includes('user_cancel');

  const isOriginOrIframeError =
    combined.includes('origin_mismatch') ||
    combined.includes('redirect_uri_mismatch') ||
    combined.includes('unauthorized-domain') ||
    combined.includes('unauthorized_domain') ||
    combined.includes('idpiframe') ||
    combined.includes('cross-origin') ||
    combined.includes('storage-partitioned') ||
    combined.includes('disallowed_useragent');

  if (isPopupBlocked) {
    return {
      code: rawCode,
      title: 'Popup Blocked by Browser or Preview Iframe',
      message:
        'Your browser blocked the Google Drive OAuth popup window from opening.',
      remediation: `Allow popups for ${originUrl} in your browser address bar (and ensure ${originUrl} is listed under Authorized JavaScript origins in Google Cloud Console → APIs & Services → Credentials), or open in a Standalone Tab.`,
      isIframeBlocked: inIframe,
      isPopupBlocked: true,
      isCancelled: false,
    };
  }

  if (isOriginOrIframeError) {
    return {
      code: rawCode,
      title: 'Authorize Preview URL in Google Cloud Console',
      message: `Google OAuth blocked this origin (${originUrl}) or cross-origin iframe session.`,
      remediation: `In Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Web Client ID, add "${originUrl}" under Authorized JavaScript origins, save, and click "Connect Drive" again.`,
      isIframeBlocked: inIframe,
      isPopupBlocked: false,
      isCancelled: false,
      isClientConfigError: true,
    };
  }

  if (isCancelled) {
    return {
      code: rawCode,
      title: inIframe
        ? 'Google Sign-In Popup Closed (Check Authorized Origins)'
        : 'Google Drive Sign-In Cancelled',
      message:
        'The Google OAuth popup closed before returning an access token.',
      remediation: `If the popup showed "Error 400: origin_mismatch" or closed immediately, add "${originUrl}" under Authorized JavaScript origins in Google Cloud Console → APIs & Services → Credentials, then click "Connect Drive" again.`,
      isIframeBlocked: inIframe,
      isPopupBlocked: false,
      isCancelled: true,
    };
  }

  if (combined.includes('access_denied') || combined.includes('insufficient')) {
    return {
      code: rawCode,
      title: 'Google Drive File Permission Not Granted',
      message:
        'Google Drive write access (https://www.googleapis.com/auth/drive.file) was declined.',
      remediation:
        'Click "Connect Drive" and check the box granting Google Drive file access on the consent screen.',
      isIframeBlocked: false,
      isPopupBlocked: false,
      isCancelled: false,
    };
  }

  return {
    code: rawCode,
    title: 'Google Drive OAuth Connection Issue',
    message:
      rawMessage || 'Unable to complete Google Identity Services OAuth popup.',
    remediation: `Verify "${originUrl}" is added to Authorized JavaScript origins in Google Cloud Console (APIs & Services → Credentials) and popups are allowed, then click "Connect Drive".`,
    isIframeBlocked: inIframe,
    isPopupBlocked: false,
    isCancelled: false,
  };
}

/**
 * Ensures Google Identity Services (GSI) script is loaded in the browser
 */
export async function ensureGsiScriptLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  if ((window as any).google?.accounts?.oauth2) return;

  const existingScript = document.querySelector(
    'script[src*="accounts.google.com/gsi/client"]'
  );
  if (!existingScript) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  const start = Date.now();
  while (Date.now() - start < 4000) {
    if ((window as any).google?.accounts?.oauth2) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Lightweight gapi token synchronizer.
 */
export async function initGapiClient(): Promise<void> {
  if (gapiInitialized) return;
  if (gapiInitPromise) return gapiInitPromise;

  gapiInitPromise = (async () => {
    try {
      await ensureGapiScriptLoaded();
      const gapi = (window as any).gapi;
      if (gapi?.client && currentAccessToken) {
        try {
          gapi.client.setToken({ access_token: currentAccessToken });
        } catch {}
      }
      gapiInitialized = true;
    } catch {
      gapiInitialized = true;
    }
  })();

  return gapiInitPromise;
}

/**
 * Initializes or returns the Google Identity Services OAuth tokenClient synchronously
 * in popup mode (`ux_mode: 'popup'`) with `https://www.googleapis.com/auth/drive.file`.
 */
export function initDriveOAuthClient(explicitClientId?: string): any {
  if (typeof window === 'undefined') return null;
  const google = (window as any).google;
  if (!google?.accounts?.oauth2?.initTokenClient) return null;

  const resolvedClientId = (explicitClientId || getConfiguredGoogleClientId()).trim();
  if (!isValidGoogleClientId(resolvedClientId)) {
    return null;
  }

  if (tokenClient && tokenClientConfiguredId === resolvedClientId) {
    return tokenClient;
  }

  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: resolvedClientId,
      scope: DRIVE_FILE_SCOPE,
      ux_mode: 'popup',
      callback: (tokenResponse: any) => {
        if (tokenResponse.error) {
          console.warn('OAuth Token Client returned error:', tokenResponse);
          if (activeTokenReject) {
            const err: any = new Error(
              tokenResponse.error_description || tokenResponse.error
            );
            err.code = tokenResponse.error;
            activeTokenReject(err);
            activeTokenReject = null;
            activeTokenResolve = null;
          }
          return;
        }

        if (tokenResponse.access_token) {
          currentAccessToken = tokenResponse.access_token;
          tokenExpiresAt =
            Date.now() + (Number(tokenResponse.expires_in) || 3600) * 1000;

          if ((window as any).gapi?.client) {
            try {
              (window as any).gapi.client.setToken({
                access_token: tokenResponse.access_token,
              });
            } catch {}
          }

          if (activeTokenResolve) {
            activeTokenResolve(tokenResponse.access_token);
            activeTokenResolve = null;
            activeTokenReject = null;
          }
        } else {
          if (activeTokenReject) {
            activeTokenReject(
              new Error('No access token returned from Google OAuth')
            );
            activeTokenReject = null;
            activeTokenResolve = null;
          }
        }
      },
      error_callback: (err: any) => {
        console.warn('OAuth Token Client error callback:', err);
        if (activeTokenReject) {
          const wrapped: any = new Error(
            err?.message || err?.type || 'OAuth authorization popup failed'
          );
          wrapped.code = err?.type || 'gis_popup_error';
          activeTokenReject(wrapped);
          activeTokenReject = null;
          activeTokenResolve = null;
        }
      },
    });
    tokenClientConfiguredId = resolvedClientId;
    return tokenClient;
  } catch (e) {
    console.warn('initDriveOAuthClient error:', e);
    return null;
  }
}

export async function getOrCreateTokenClient(explicitClientId?: string): Promise<any> {
  const immediate = initDriveOAuthClient(explicitClientId);
  if (immediate) return immediate;
  await ensureGsiScriptLoaded();
  return initDriveOAuthClient(explicitClientId);
}

/**
 * Pre-initialize tokenClient on script import if a valid Client ID is already configured
 */
if (typeof window !== 'undefined') {
  ensureGsiScriptLoaded().then(() => {
    if (getConfiguredGoogleClientId()) {
      initDriveOAuthClient();
    }
  });
}

/**
 * Strictly SYNCHRONOUS user-gesture OAuth trigger for Google Identity Services (`initTokenClient`).
 * Executes `client.requestAccessToken` in popup mode (`ux_mode: 'popup'`) within the exact click stack
 * so browser popup blockers inside `*.run.app` preview iframes do not suppress the popup.
 */
export function requestDriveAccessTokenSync(options: {
  clientId?: string;
  prompt?: 'consent' | 'select_account' | '';
  onSuccess: (token: string) => void;
  onError: (errorInfo: DriveAuthErrorInfo) => void;
}): boolean {
  const promptValue =
    options.prompt !== undefined ? options.prompt : 'consent';
  const targetClientId = (options.clientId || getConfiguredGoogleClientId()).trim();

  if (!isValidGoogleClientId(targetClientId)) {
    options.onError(
      classifyDriveOAuthError({
        code: 'missing_client_id',
        message: 'Google OAuth Client ID is not configured yet.',
      })
    );
    return false;
  }

  const client = initDriveOAuthClient(targetClientId);

  if (!client) {
    ensureGsiScriptLoaded().then(() => initDriveOAuthClient(targetClientId));
    options.onError(
      classifyDriveOAuthError({
        code: 'gsi_not_loaded',
        message:
          'Google Identity Services script is still initializing or blocked. Please click Connect Drive again in a moment.',
      })
    );
    return false;
  }

  activeTokenResolve = (token: string) => {
    options.onSuccess(token);
  };
  activeTokenReject = (err: Error) => {
    options.onError(classifyDriveOAuthError(err));
  };

  try {
    client.requestAccessToken({ prompt: promptValue });
    return true;
  } catch (err: any) {
    activeTokenResolve = null;
    activeTokenReject = null;
    options.onError(classifyDriveOAuthError(err));
    return false;
  }
}

/**
 * Promise wrapper around Google Identity Services `initTokenClient` (`ux_mode: 'popup'`).
 */
export function requestDriveAccessToken(options?: {
  clientId?: string;
  prompt?: 'consent' | '';
}): Promise<string> {
  const promptValue =
    options?.prompt !== undefined ? options.prompt : 'consent';
  const targetClientId = (options?.clientId || getConfiguredGoogleClientId()).trim();

  if (!isValidGoogleClientId(targetClientId)) {
    return Promise.reject(
      Object.assign(new Error('Google OAuth Client ID is not configured'), {
        code: 'missing_client_id',
      })
    );
  }

  const syncClient = initDriveOAuthClient(targetClientId);
  if (syncClient) {
    return new Promise((resolve, reject) => {
      activeTokenResolve = resolve;
      activeTokenReject = reject;
      try {
        syncClient.requestAccessToken({ prompt: promptValue });
      } catch (err: any) {
        activeTokenResolve = null;
        activeTokenReject = null;
        reject(err);
      }
    });
  }

  return (async () => {
    await ensureGsiScriptLoaded();
    const client = await getOrCreateTokenClient(targetClientId);
    if (!client) {
      throw new Error(
        'Google Identity Services token client could not be initialized'
      );
    }

    return new Promise<string>((resolve, reject) => {
      activeTokenResolve = resolve;
      activeTokenReject = reject;

      try {
        client.requestAccessToken({ prompt: promptValue });
      } catch (err: any) {
        activeTokenResolve = null;
        activeTokenReject = null;
        reject(err);
      }
    });
  })();
}

/**
 * Fetches the authenticated Google Drive user's profile (email, displayName, photoLink)
 * using the authorized Drive v3 'about' endpoint.
 */
export async function fetchDriveUserProfile(accessToken: string): Promise<{
  email: string;
  displayName: string;
  photoURL?: string;
} | null> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.user?.emailAddress) return null;
    return {
      email: data.user.emailAddress,
      displayName: data.user.displayName || data.user.emailAddress,
      photoURL: data.user.photoLink,
    };
  } catch {
    return null;
  }
}

/**
 * Returns currently held in-memory access token if not expired
 */
export function getCachedDriveAccessToken(): string | null {
  if (
    currentAccessToken &&
    tokenExpiresAt &&
    Date.now() < tokenExpiresAt - 30000
  ) {
    return currentAccessToken;
  }
  return null;
}

/**
 * Sets or clears the active in-memory drive access token
 */
export function setCachedDriveAccessToken(
  token: string | null,
  expiresInSeconds = 3600
): void {
  currentAccessToken = token;
  tokenExpiresAt = token ? Date.now() + expiresInSeconds * 1000 : null;
  if (token && (window as any).gapi?.client) {
    try {
      (window as any).gapi.client.setToken({ access_token: token });
    } catch {}
  }
}

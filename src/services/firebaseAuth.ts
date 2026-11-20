import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  DRIVE_FILE_SCOPE,
  REQUIRED_DRIVE_SCOPES,
  requestDriveAccessTokenSync,
  setCachedDriveAccessToken,
  getCachedDriveAccessToken,
  getConfiguredGoogleClientId,
  fetchDriveUserProfile,
} from './googleDriveClient';

// Initialize Firebase only once
const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();

// Explicitly request write permissions via 'https://www.googleapis.com/auth/drive.file'
export const GOOGLE_DRIVE_SCOPES = REQUIRED_DRIVE_SCOPES;
GOOGLE_DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));

provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
// Cached access token strictly in memory (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;

export const setInMemoryDriveToken = (
  token: string | null,
  expiresInSeconds = 3500
) => {
  cachedAccessToken = token;
  tokenExpiresAt = token ? Date.now() + expiresInSeconds * 1000 : null;
  setCachedDriveAccessToken(token, expiresInSeconds);
};

export const clearCachedToken = () => {
  cachedAccessToken = null;
  tokenExpiresAt = null;
  setCachedDriveAccessToken(null);
};

/**
 * Synchronous check used inside button click handlers so expired sessions trigger
 * OAuth popup on the very first click without losing browser user-gesture activation.
 */
export const hasValidCachedDriveToken = (candidateToken?: string | null): boolean => {
  const gisToken = getCachedDriveAccessToken();
  if (gisToken && (!candidateToken || candidateToken === gisToken)) {
    return true;
  }
  if (
    cachedAccessToken &&
    (!candidateToken || candidateToken === cachedAccessToken) &&
    tokenExpiresAt !== null &&
    Date.now() < tokenExpiresAt - 45000
  ) {
    return true;
  }
  return false;
};

export const initAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    const activeToken =
      (cachedAccessToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 45000
        ? cachedAccessToken
        : null) || getCachedDriveAccessToken();
    if (user && activeToken) {
      setInMemoryDriveToken(activeToken);
      if (onAuthSuccess) onAuthSuccess(user, activeToken);
    } else if (!user && !activeToken) {
      clearCachedToken();
      if (onAuthFailure) onAuthFailure();
    } else if (!activeToken && !isSigningIn) {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Optional Firebase signInWithPopup fallback when explicitly invoked.
 */
export const googleSignIn = async (options?: {
  forceConsent?: boolean;
}): Promise<{ user: any; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    provider.setCustomParameters({
      prompt: options?.forceConsent ? 'consent select_account' : 'select_account',
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google Drive access token from Google Auth Provider');
    }

    setInMemoryDriveToken(credential.accessToken, 3500);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request' ||
      error?.message?.includes('popup-closed-by-user')
    ) {
      return null;
    }
    console.error('Firebase Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Verifies if the provided in-memory token is valid and holds 'https://www.googleapis.com/auth/drive.file'.
 * Never purges valid drive.file tokens and never triggers background popups outside user gestures.
 */
export const verifyAndRefreshDriveToken = async (
  currentToken: string | null,
  options?: { forceCheck?: boolean }
): Promise<string | null> => {
  const tokenToTest = currentToken || cachedAccessToken || getCachedDriveAccessToken();
  if (!tokenToTest) {
    return null;
  }

  if (
    !options?.forceCheck &&
    tokenExpiresAt &&
    Date.now() < tokenExpiresAt - 60000 &&
    cachedAccessToken === tokenToTest
  ) {
    return cachedAccessToken;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(tokenToTest)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const info = await res.json();
      const scopes = String(info.scope || '').split(/\s+/);
      const hasDriveWriteScope = scopes.some(
        (s: string) =>
          s === DRIVE_FILE_SCOPE ||
          s.endsWith('/auth/drive.file') ||
          s === 'https://www.googleapis.com/auth/drive' ||
          s.endsWith('/auth/drive')
      );
      const expiresIn = Number(info.expires_in) || 0;

      if (expiresIn < 60 || !hasDriveWriteScope) {
        clearCachedToken();
        return null;
      }

      setInMemoryDriveToken(tokenToTest, expiresIn);
      return tokenToTest;
    } else if (res.status === 400 || res.status === 401) {
      clearCachedToken();
      return null;
    }
  } catch (err) {
    console.warn('Tokeninfo verification timeout or network error, proceeding with cached token:', err);
  }

  setInMemoryDriveToken(tokenToTest, 1800);
  return tokenToTest;
};

/**
 * Synchronously triggers Google Identity Services (`google.accounts.oauth2.initTokenClient`)
 * in popup mode (`ux_mode: 'popup'`) with `https://www.googleapis.com/auth/drive.file`.
 * If `VITE_GOOGLE_CLIENT_ID` / `process.env.GOOGLE_CLIENT_ID` / `localStorage` is missing or invalid,
 * calls `onError` with `code: 'missing_client_id'` so the caller opens the inline Client ID configuration modal.
 */
export const requestDriveReauthorization = (
  onSuccess: (token: string, user?: any) => void,
  onError?: (err: any) => void,
  explicitClientId?: string
) => {
  clearCachedToken();

  const resolvedClientId = (explicitClientId || getConfiguredGoogleClientId()).trim();
  if (!resolvedClientId) {
    if (onError) {
      const missingErr: any = new Error('Google OAuth Client ID is missing or invalid.');
      missingErr.code = 'missing_client_id';
      onError(missingErr);
    }
    return;
  }

  requestDriveAccessTokenSync({
    clientId: resolvedClientId,
    prompt: 'consent',
    onSuccess: async (gisToken) => {
      setInMemoryDriveToken(gisToken, 3500);
      const profile = await fetchDriveUserProfile(gisToken);
      onSuccess(
        gisToken,
        profile
          ? {
              email: profile.email,
              displayName: profile.displayName,
              photoURL: profile.photoURL,
            }
          : undefined
      );
    },
    onError: (errInfo) => {
      if (onError) {
        onError(errInfo);
      }
    },
  });
};

export const requestDriveReauthorizationAsync = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    requestDriveReauthorization(
      (token) => resolve(token),
      (err) => reject(err)
    );
  });
};

export const getAccessToken = async (): Promise<string | null> => {
  return verifyAndRefreshDriveToken(cachedAccessToken || getCachedDriveAccessToken());
};

export const logout = async () => {
  const token = cachedAccessToken || getCachedDriveAccessToken();
  if (token && typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2?.revoke) {
    try {
      (window as any).google.accounts.oauth2.revoke(token, () => {});
    } catch {}
  }
  try {
    await signOut(auth);
  } catch {}
  clearCachedToken();
};

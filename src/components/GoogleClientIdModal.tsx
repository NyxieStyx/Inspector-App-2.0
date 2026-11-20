import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Copy,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  getSavedLocalGoogleClientId,
  getConfiguredGoogleClientId,
  getProvisionedAppletClientId,
  saveLocalGoogleClientId,
  isValidGoogleClientId,
  getCurrentOriginUrl,
  getStandaloneAppUrl,
  isRunningInIframe,
} from '../services/googleDriveClient';

interface GoogleClientIdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAndConnect: (clientId: string) => void;
  initialError?: string | null;
}

/**
 * Inline Google OAuth 2.0 Web Client ID Configuration Modal/Popover.
 * Opens whenever `VITE_GOOGLE_CLIENT_ID` / `process.env.GOOGLE_CLIENT_ID` / `localStorage`
 * is missing or invalid when the user clicks "Connect Drive", or when the user chooses
 * to update their OAuth Client ID.
 */
export default function GoogleClientIdModal({
  isOpen,
  onClose,
  onSaveAndConnect,
  initialError,
}: GoogleClientIdModalProps) {
  const [clientIdInput, setClientIdInput] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copiedOrigin, setCopiedOrigin] = useState<boolean>(false);

  const originUrl = getCurrentOriginUrl();
  const standaloneUrl = getStandaloneAppUrl();
  const inIframe = isRunningInIframe();
  const provisionedId = getProvisionedAppletClientId();

  useEffect(() => {
    if (!isOpen) return;
    const current = getSavedLocalGoogleClientId() || getConfiguredGoogleClientId();
    setClientIdInput(current);
    setValidationError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyOrigin = async () => {
    if (!originUrl) return;
    try {
      await navigator.clipboard.writeText(originUrl);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2200);
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = clientIdInput.trim();
    if (!isValidGoogleClientId(cleaned)) {
      setValidationError(
        'Please paste a valid Google OAuth 2.0 Web Client ID ending in .apps.googleusercontent.com'
      );
      return;
    }
    setValidationError(null);
    saveLocalGoogleClientId(cleaned);
    // Synchronously invoke GIS initTokenClient popup within this click/submit event!
    onSaveAndConnect(cleaned);
  };

  const handleUseProvisionedId = () => {
    if (!provisionedId) return;
    setValidationError(null);
    setClientIdInput(provisionedId);
    saveLocalGoogleClientId(provisionedId);
    onSaveAndConnect(provisionedId);
  };

  const handleClearSaved = () => {
    saveLocalGoogleClientId('');
    setClientIdInput('');
    setValidationError(null);
  };

  return (
    <div
      className="fixed inset-0 z-[85] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-oauth-client-id-title"
        className="w-full max-w-lg bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl text-[#090D16] dark:text-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0">
              <Settings className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h2
                id="google-oauth-client-id-title"
                className="text-sm sm:text-base font-extrabold tracking-tight truncate"
              >
                Configure Google Drive OAuth Client ID
              </h2>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                Scope: https://www.googleapis.com/auth/drive.file (Popup Mode)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
            aria-label="Close OAuth configuration"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {(initialError || validationError) && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-500 text-[#090D16] dark:text-amber-100 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <span className="font-semibold leading-relaxed">
                {validationError || initialError}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="oauth-client-id-input"
              className="block text-xs font-extrabold uppercase tracking-wide text-slate-800 dark:text-slate-200"
            >
              1. Google OAuth 2.0 Web Client ID
            </label>
            <input
              id="oauth-client-id-input"
              type="text"
              value={clientIdInput}
              onChange={(e) => {
                setClientIdInput(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="1234567890-abcdefg.apps.googleusercontent.com"
              autoFocus
              className="w-full min-h-[46px] bg-slate-50 dark:bg-slate-950 border-2 border-slate-300 dark:border-slate-700 focus:border-blue-600 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-mono text-[#090D16] dark:text-white placeholder-slate-400 focus:outline-none"
            />
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Saved locally in your browser (<code className="font-mono">localStorage</code>) when{' '}
              <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> is not set in environment variables.
            </p>
          </div>

          {/* Step 2: Preview Origin Authorization Guide */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 space-y-2">
            <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
              2. Authorize Preview URL in Google Cloud Console
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              In <strong>Google Cloud Console → APIs &amp; Services → Credentials</strong>, open your{' '}
              <strong>OAuth 2.0 Web Client ID</strong> and add this exact origin under{' '}
              <strong>Authorized JavaScript origins</strong>:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-blue-800 dark:text-blue-300 truncate select-all">
                {originUrl || 'https://*.run.app'}
              </code>
              <button
                type="button"
                onClick={handleCopyOrigin}
                className="min-h-[40px] px-3 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copiedOrigin ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy URL</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Primary Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 active:bg-blue-800 text-white font-extrabold text-xs sm:text-sm shadow flex items-center justify-center gap-2 transition cursor-pointer select-none"
            >
              <Cloud className="w-4 h-4 shrink-0" />
              <span>Save Client ID &amp; Connect Google Drive</span>
            </button>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              {provisionedId && (
                <button
                  type="button"
                  onClick={handleUseProvisionedId}
                  className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-bold text-[#090D16] dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Use the built-in applet OAuth Client ID if you already authorized this origin on it"
                >
                  <span>Use Applet Default Client ID</span>
                </button>
              )}

              {getSavedLocalGoogleClientId() && (
                <button
                  type="button"
                  onClick={handleClearSaved}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs font-bold text-rose-800 dark:text-rose-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Clear Saved</span>
                </button>
              )}

              {inIframe && standaloneUrl && (
                <a
                  href={standaloneUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Standalone Tab</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

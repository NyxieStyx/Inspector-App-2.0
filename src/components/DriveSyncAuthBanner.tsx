import React from 'react';
import {
  AlertTriangle,
  Cloud,
  ExternalLink,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import { DriveAuthErrorInfo, getCurrentOriginUrl } from '../services/googleDriveClient';

interface DriveSyncAuthBannerProps {
  errorInfo?: DriveAuthErrorInfo | null;
  errorMessage?: string | null;
  isSyncingOrAuthenticating?: boolean;
  inPreviewIframe?: boolean;
  standaloneAppUrl?: string;
  unsyncedCount?: number;
  compact?: boolean;
  onAuthorize: () => void;
  onConfigureClientId?: () => void;
  onDismiss?: () => void;
}

/**
 * Centralized Google Drive Sync Authorization Warning Banner.
 * Triggers Google Identity Services (`google.accounts.oauth2.initTokenClient`) with
 * `https://www.googleapis.com/auth/drive.file` in popup mode (`ux_mode: 'popup'`),
 * or opens the inline Google OAuth Client ID configuration modal if Client ID is missing.
 */
export default function DriveSyncAuthBanner({
  errorInfo,
  errorMessage,
  isSyncingOrAuthenticating = false,
  inPreviewIframe = false,
  standaloneAppUrl = '',
  unsyncedCount = 0,
  compact = false,
  onAuthorize,
  onConfigureClientId,
  onDismiss,
}: DriveSyncAuthBannerProps) {
  const hasError = Boolean(errorInfo || errorMessage);
  const originUrl = getCurrentOriginUrl();
  const showStandaloneLink =
    Boolean(standaloneAppUrl) &&
    (inPreviewIframe || Boolean(errorInfo?.isIframeBlocked));

  const headline = errorInfo?.title
    ? errorInfo.title
    : errorMessage
    ? 'Google Drive Sync Authorization Needed'
    : unsyncedCount > 0
    ? 'Google Drive Not Connected — Notes Save Locally Until Authorized'
    : 'Google Drive Not Connected — Notes Save Locally Until Authorized';

  const detailText = errorInfo
    ? `${errorInfo.message} ${errorInfo.remediation}`.trim()
    : errorMessage
    ? errorMessage
    : inPreviewIframe
    ? `Click "Connect Drive" to authorize Google Drive (drive.file) via popup and auto-sync [PermitNumber] Permit Notes.docx to My Drive › Spark Notes › Permit Notes.${
        unsyncedCount > 0
          ? ` (${unsyncedCount} local note${unsyncedCount === 1 ? '' : 's'} queued)`
          : ''
      } Ensure ${originUrl || 'this preview URL'} is added to Authorized JavaScript origins in Google Cloud Console.`
    : `Click "Connect Drive" to authorize Google Drive (drive.file) and auto-sync [PermitNumber] Permit Notes.docx to My Drive › Spark Notes › Permit Notes.${
        unsyncedCount > 0
          ? ` (${unsyncedCount} local note${unsyncedCount === 1 ? '' : 's'} queued)`
          : ''
      }`;

  return (
    <div
      role="status"
      className={`border-2 rounded-xl shadow-sm ${
        hasError
          ? 'bg-rose-50 border-rose-400 text-gray-900'
          : 'bg-amber-50 border-amber-400 text-gray-900'
      } ${compact ? 'px-3.5 py-2.5' : 'p-3.5 sm:p-4'}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <AlertTriangle
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              hasError ? 'text-rose-700' : 'text-amber-700'
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs sm:text-sm font-extrabold text-gray-900 leading-snug">
                {headline}
              </p>
              {errorInfo?.code && (
                <span className="text-[11px] font-mono font-semibold text-slate-800">
                  ({errorInfo.code})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-800 font-medium leading-relaxed mt-0.5">
              {detailText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAuthorize();
            }}
            disabled={isSyncingOrAuthenticating}
            className="min-h-[44px] min-w-[44px] h-11 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 active:bg-blue-800 disabled:opacity-60 text-white font-bold text-xs sm:text-sm shadow flex items-center justify-center gap-2 transition cursor-pointer select-none"
          >
            {isSyncingOrAuthenticating ? (
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <Cloud className="w-4 h-4 shrink-0" />
            )}
            <span>{isSyncingOrAuthenticating ? 'Authorizing...' : 'Connect Drive'}</span>
          </button>

          {onConfigureClientId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onConfigureClientId();
              }}
              className="min-h-[44px] min-w-[44px] h-11 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-gray-900 font-bold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer select-none"
              title="Configure or update Google OAuth Client ID"
            >
              <Settings className="w-4 h-4 text-slate-700 shrink-0" />
              <span className="hidden md:inline">Client ID</span>
            </button>
          )}

          {showStandaloneLink && (
            <a
              href={standaloneAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] min-w-[44px] h-11 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm shadow flex items-center justify-center gap-1.5 transition cursor-pointer select-none"
              title="Open app in a standalone browser tab"
            >
              <span>Standalone Tab</span>
              <ExternalLink className="w-4 h-4 shrink-0" />
            </a>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="min-w-[44px] min-h-[44px] p-3 rounded-xl text-slate-700 hover:text-gray-900 hover:bg-black/5 flex items-center justify-center transition cursor-pointer"
              title="Dismiss notice"
              aria-label="Dismiss Drive sync warning"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

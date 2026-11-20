import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Permit,
  PermitNoteFile,
  StatusUpdate,
  PermitPhoto,
} from '../types/permit';
import {
  searchDriveForPermitNotes,
  getLocalPermitNote,
  saveLocalPermitNote,
  createInitialLocalNotes,
  isDriveScopeError,
  isDriveQuotaError,
  resolveTemplateSealForDocx,
  syncPermitNoteStateToDrive,
  discoverPermitNotesDriveFolder,
  buildDriveFileWebLink,
  buildDriveFolderWebLink,
  DriveSyncSummary,
} from '../services/driveService';
import {
  requestDriveReauthorization,
  verifyAndRefreshDriveToken,
  getAccessToken,
  hasValidCachedDriveToken,
} from '../services/firebaseAuth';
import {
  MCDOT_INSPECTOR_NAME,
  MCDOT_INSPECTOR_CODE,
  MCDOT_FOOTER_LINE_1,
  MCDOT_FOOTER_LINE_2,
  formatMcdotDate,
  formatMcdotLogRow,
  stripLogRowDecorations,
  downloadMcdotDocx,
  generateMcdotFormattedTableText,
  removeDuplicatePhrases,
  collapseRepeatingTokenSequences,
  getCachedOfficialSealDataUrl,
  importOfficialTemplateDocxFile,
} from '../utils/docxExport';
import {
  classifyDriveOAuthError,
  getConfiguredGoogleClientId,
  DriveAuthErrorInfo,
} from '../services/googleDriveClient';
import {
  extractContactsFromPermitNotes,
  buildContactSmsHref,
  inferPermitLifecycleStage,
  getLifecyclePillStyle,
  getLifecycleAwareQuickPills,
  formatMcdotFieldDictation,
  buildMcdotPreConParagraph,
} from '../utils/permitNotesIntelligence';
import { compressImage } from '../utils/imageCompressor';
import {
  savePhotoBlob,
  getPhotoBlob,
  deletePhotoBlob,
  enqueueOfflineSync,
  clearOfflineSyncByTcNumber,
} from '../services/offlineStorage';
import { searchMagMcdotSpecs } from '../data/magMcdotSpecsData';
import GoogleClientIdModal from './GoogleClientIdModal';
import {
  FileText,
  Mic,
  MicOff,
  Camera,
  Upload,
  AlertTriangle,
  CheckCircle2,
  X,
  Phone,
  Sparkles,
  Cloud,
  CloudCheck,
  RefreshCw,
  Trash2,
  ExternalLink,
  Download,
  Copy,
  Check,
  Folder,
  Plus,
  Send,
  BookOpen,
  MessageSquare,
  CornerDownLeft,
  Loader2,
  Search,
  Pencil,
  Pin,
  Wand2,
  ArrowLeft,
} from 'lucide-react';

interface PermitDetailModalProps {
  permit: Permit;
  accessToken: string | null;
  userEmail?: string;
  embedded?: boolean;
  corridorName?: string;
  corridorSiblings?: Permit[];
  onSelectSiblingPermit?: (permit: Permit) => void;
  onClose: () => void;
  onSignInRequired: (options?: { forceConsent?: boolean }) => void;
  onAccessTokenUpdated?: (token: string, user?: any) => void;
  onPermitUpdated: (updatedPermit: Permit) => void;
  onShowToast?: (msg: string, type?: 'info' | 'success' | 'warning') => void;
  externalNotesRevision?: number;
}

export { removeDuplicatePhrases, collapseRepeatingTokenSequences };

export function cleanMcdotVoiceText(text: string): string {
  return formatMcdotFieldDictation(text);
}

/**
 * Merges consecutive Web Speech API chunks without duplicating cumulative phrases
 * emitted by mobile Chrome/Android SpeechRecognition engines.
 */
function appendSpeechChunkCleanly(accumulated: string, nextChunk: string): string {
  const prev = accumulated.trim();
  const next = nextChunk.trim();
  if (!next) return prev;
  if (!prev) return next;

  const prevLower = prev.toLowerCase();
  const nextLower = next.toLowerCase();

  // Android Chrome cumulative mode: next chunk starts with the entire previous transcript
  if (nextLower.startsWith(prevLower)) {
    return next;
  }
  // Exact duplicate or trailing repeat already present
  if (prevLower.endsWith(nextLower)) {
    return prev;
  }

  // Word-boundary suffix/prefix overlap check (up to 12 words)
  const prevWords = prev.split(/\s+/);
  const nextWords = next.split(/\s+/);
  const maxOverlap = Math.min(12, prevWords.length, nextWords.length);
  for (let k = maxOverlap; k >= 2; k--) {
    const tail = prevWords
      .slice(-k)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .join(' ');
    const head = nextWords
      .slice(0, k)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .join(' ');
    if (tail && tail === head) {
      return [...prevWords, ...nextWords.slice(k)].join(' ');
    }
  }

  return `${prev} ${next}`;
}

export default function PermitDetailModal({
  permit,
  accessToken,
  embedded = false,
  corridorName,
  corridorSiblings,
  onSelectSiblingPermit,
  onClose,
  onAccessTokenUpdated,
  onPermitUpdated,
  onShowToast,
  externalNotesRevision,
}: PermitDetailModalProps) {
  // Primary view is always 'notes'; 'specs' and 'photos' are optional reference drawers
  const [activeView, setActiveView] = useState<'notes' | 'specs' | 'photos'>('notes');

  // Permit Notes single-source-of-truth state (keyed by permit.tcNumber so live GPS updates never reset state)
  const [noteFile, setNoteFile] = useState<PermitNoteFile>(() =>
    createInitialLocalNotes(permit)
  );
  const noteFileRef = useRef<PermitNoteFile>(noteFile);
  useEffect(() => {
    noteFileRef.current = noteFile;
  }, [noteFile]);

  const activeTcRef = useRef<string>(permit.tcNumber);
  useEffect(() => {
    if (activeTcRef.current !== permit.tcNumber) {
      activeTcRef.current = permit.tcNumber;
      const fresh = createInitialLocalNotes(permit);
      setNoteFile(fresh);
      noteFileRef.current = fresh;
      setEditingEntryId(null);
      setEditingEntryText('');
      setConfirmDeleteEntryId(null);
      setIsPreConOpen(false);
      setPreConPrompt('');
      setPreConCustomPreview(null);
    }
  }, [permit]);

  useEffect(() => {
    if (externalNotesRevision === undefined) return;
    const stored = getLocalPermitNote(permit.tcNumber);
    if (
      stored &&
      (stored.inspectorNotes?.length || 0) > (noteFileRef.current.inspectorNotes?.length || 0)
    ) {
      setNoteFile(stored);
      noteFileRef.current = stored;
    }
  }, [externalNotesRevision, permit.tcNumber]);

  const [driveStatus, setDriveStatus] = useState<
    'idle' | 'unsynced' | 'searching' | 'found' | 'not_found' | 'syncing' | 'synced' | 'error'
  >(() => (accessToken ? 'idle' : 'unsynced'));
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveAuthErrorInfo, setDriveAuthErrorInfo] = useState<DriveAuthErrorInfo | null>(null);
  const [, setDriveIframeBlocked] = useState<boolean>(false);
  const [, setIsDriveWarningDismissed] = useState<boolean>(false);
  const [isClientIdModalOpen, setIsClientIdModalOpen] = useState<boolean>(false);
  const [showConfirmDriveOverwrite, setShowConfirmDriveOverwrite] = useState<boolean>(false);
  const [driveSyncInfo, setDriveSyncInfo] = useState<Partial<DriveSyncSummary>>(() => ({
    fileId: noteFile.driveFileId,
    fileName: noteFile.driveFileName,
    webViewLink: noteFile.driveWebViewLink,
    folderId: noteFile.driveFolderId,
    folderPath: noteFile.driveFolderPath || 'My Drive > Spark Notes > Permit Notes',
    folderWebViewLink: noteFile.driveFolderWebViewLink,
    syncedAt: noteFile.lastSyncedAt || undefined,
  }));

  const [copiedDoc, setCopiedDoc] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [sealPreviewUrl, setSealPreviewUrl] = useState<string>(() =>
    getCachedOfficialSealDataUrl()
  );
  const [isImportingTemplate, setIsImportingTemplate] = useState(false);
  const [isReauthorizing, setIsReauthorizing] = useState(false);
  const [photoObjectUrls, setPhotoObjectUrls] = useState<Record<string, string>>({});
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);

  // Hydrate photo preview object URLs from IndexedDB Blobs and revoke cleanly on unmount/change
  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];
    const photos = noteFile.photos || [];

    async function loadPhotoUrls() {
      const nextMap: Record<string, string> = {};
      for (const p of photos) {
        if (p.dataUrl) {
          nextMap[p.id] = p.dataUrl;
          continue;
        }
        const blob = await getPhotoBlob(p.id);
        if (cancelled) return;
        if (blob) {
          const objUrl = URL.createObjectURL(blob);
          createdUrls.push(objUrl);
          nextMap[p.id] = objUrl;
        }
      }
      if (!cancelled) {
        setPhotoObjectUrls(nextMap);
      }
    }

    void loadPhotoUrls();

    return () => {
      cancelled = true;
      for (const url of createdUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [noteFile.photos, permit.tcNumber]);

  // In-place chronological note editing & delete confirmation state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryText, setEditingEntryText] = useState<string>('');
  const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<string | null>(null);

  // Continuous Voice Dictation & Bottom Bar Input State
  const [noteInputText, setNoteInputText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isFormattingVoice, setIsFormattingVoice] = useState(false);

  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  const sessionCommittedRef = useRef<string>('');
  const currentSegmentFinalRef = useRef<string>('');
  const currentSegmentInterimRef = useRef<string>('');
  const safetyTimerRef = useRef<any>(null);

  // Smart [Pre-Con Builder] Quick-Prompt State
  const [isPreConOpen, setIsPreConOpen] = useState(false);
  const [preConPrompt, setPreConPrompt] = useState('');
  const [preConCustomPreview, setPreConCustomPreview] = useState<string | null>(null);
  const [isRecordingPreCon, setIsRecordingPreCon] = useState(false);
  const [preConInterim, setPreConInterim] = useState('');
  const preConRecRef = useRef<any>(null);
  const isRecordingPreConRef = useRef<boolean>(false);
  const preConCommittedRef = useRef<string>('');
  const preConSegmentFinalRef = useRef<string>('');
  const preConSegmentInterimRef = useRef<string>('');

  // Monotonic local revision & serialized Drive sync queue so rapid 1-tap pills + voice logs never overwrite each other
  const localRevisionRef = useRef<number>(0);
  const isSyncInFlightRef = useRef<boolean>(false);
  const queuedSyncRequestRef = useRef<{
    actionLabel?: string;
    permitTarget: Permit;
    explicitToken?: string;
  } | null>(null);
  const lastQuickAppendRef = useRef<{ text: string; at: number } | null>(null);

  // Optional Specs & Photos drawers state
  const [specCategory, setSpecCategory] = useState<string>('all');
  const [specSearchQuery, setSpecSearchQuery] = useState<string>('');
  const [specAiQuestion, setSpecAiQuestion] = useState<string>('');
  const [isSpecAiLoading, setIsSpecAiLoading] = useState<boolean>(false);
  const [specAiResult, setSpecAiResult] = useState<any>(null);
  const [specAiError, setSpecAiError] = useState<string | null>(null);
  const [copiedSpecId, setCopiedSpecId] = useState<string | null>(null);

  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [photoCaption, setPhotoCaption] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up speech recognition instances on unmount
  useEffect(() => {
    return () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      if (recognitionRef.current) {
        try {
          isRecordingRef.current = false;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      if (preConRecRef.current) {
        try {
          isRecordingPreConRef.current = false;
          preConRecRef.current.onresult = null;
          preConRecRef.current.onend = null;
          preConRecRef.current.onerror = null;
          preConRecRef.current.abort();
        } catch {}
        preConRecRef.current = null;
      }
    };
  }, []);

  // Chronological entries sorted oldest -> newest
  const sortedLogEntries = useMemo(() => {
    return [...(noteFile.inspectorNotes || [])].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [noteFile.inspectorNotes]);

  // SINGLE SOURCE OF TRUTH INTELLIGENCE:
  // 1. Auto-extract contacts (Name, Company, Phone) directly from Permit Notes text
  const extractedContacts = useMemo(() => {
    return extractContactsFromPermitNotes(sortedLogEntries);
  }, [sortedLogEntries]);

  // 2. Auto-infer lifecycle stage pill directly from latest Permit Notes text
  const lifecycleStage = useMemo(() => {
    return inferPermitLifecycleStage(sortedLogEntries);
  }, [sortedLogEntries]);

  const lifecyclePillStyle = useMemo(
    () => getLifecyclePillStyle(lifecycleStage),
    [lifecycleStage]
  );

  // 3. Lifecycle-aware 1-tap standard pills adapted to what is already in the notes
  const lifecycleBarState = useMemo(() => {
    return getLifecycleAwareQuickPills(sortedLogEntries);
  }, [sortedLogEntries]);

  // 4. Smart [Pre-Con Builder] live paragraph preview
  const builtPreCon = useMemo(() => {
    return buildMcdotPreConParagraph(preConPrompt, permit);
  }, [preConPrompt, permit]);

  const effectivePreConParagraph =
    preConCustomPreview !== null ? preConCustomPreview : builtPreCon.paragraph;

  // Discover Google Drive ('My Drive > Spark Notes > Permit Notes') and load/sync existing '[PermitNumber] Permit Notes.docx'
  useEffect(() => {
    let isMounted = true;

    async function checkDrive() {
      let activeToken = accessToken;
      if (!activeToken) {
        activeToken = await getAccessToken();
        if (activeToken) {
          onAccessTokenUpdated?.(activeToken);
        }
      }

      if (!activeToken) {
        if (isMounted) {
          setDriveStatus('unsynced');
        }
        return;
      }

      setDriveStatus('searching');
      setDriveError(null);
      setDriveIframeBlocked(false);

      const revisionBeforeSearch = localRevisionRef.current;

      try {
        const validToken = await verifyAndRefreshDriveToken(activeToken);
        if (!validToken) {
          if (!isMounted) return;
          setDriveStatus('unsynced');
          setDriveError('Google Drive session expired. Click Connect Drive to sync.');
          return;
        }

        if (validToken !== activeToken) {
          onAccessTokenUpdated?.(validToken);
        }

        const result = await searchDriveForPermitNotes(validToken, permit.tcNumber);
        if (!isMounted) return;

        setSealPreviewUrl(getCachedOfficialSealDataUrl());

        // If the inspector added/edited notes while the initial Drive search was in flight,
        // keep the newer local state and only attach Drive folder/file metadata.
        const hadLocalEditsDuringSearch = localRevisionRef.current !== revisionBeforeSearch;

        if (result.found && result.fileId) {
          const loadedContent: PermitNoteFile = hadLocalEditsDuringSearch
            ? {
                ...noteFileRef.current,
                driveFileId: noteFileRef.current.driveFileId || result.fileId,
                driveFileName: noteFileRef.current.driveFileName || result.fileName,
                driveWebViewLink:
                  noteFileRef.current.driveWebViewLink ||
                  result.webViewLink ||
                  buildDriveFileWebLink(result.fileId),
                driveFolderId: result.folderId,
                driveFolderPath: result.folderPath || 'My Drive > Spark Notes > Permit Notes',
                driveFolderWebViewLink:
                  result.folderWebViewLink || buildDriveFolderWebLink(result.folderId || ''),
                hasUnsyncedChanges: true,
              }
            : result.content || noteFileRef.current;

          setNoteFile(loadedContent);
          noteFileRef.current = loadedContent;
          saveLocalPermitNote(loadedContent);

          setDriveSyncInfo({
            fileId: result.fileId,
            fileName: result.fileName,
            webViewLink: result.webViewLink || buildDriveFileWebLink(result.fileId),
            folderId: result.folderId,
            folderPath: result.folderPath || 'My Drive > Spark Notes > Permit Notes',
            folderWebViewLink:
              result.folderWebViewLink || buildDriveFolderWebLink(result.folderId || ''),
            syncedAt: result.syncedAt,
          });
          setDriveStatus('found');

          // Notify parent so sidebar/map also reflects contacts & visited status loaded from Drive
          onPermitUpdated({ ...permit });

          if (loadedContent.hasUnsyncedChanges) {
            await persistAndAutoSyncNoteFile(loadedContent, undefined, permit, validToken);
          }
        } else {
          setDriveSyncInfo({
            folderId: result.folderId,
            folderPath: result.folderPath || 'My Drive > Spark Notes > Permit Notes',
            folderWebViewLink:
              result.folderWebViewLink || buildDriveFolderWebLink(result.folderId || ''),
          });
          setDriveStatus('not_found');

          // If local notes were logged offline before opening Drive, sync immediately
          if (
            noteFileRef.current.inspectorNotes.length > 0 ||
            noteFileRef.current.hasUnsyncedChanges
          ) {
            await persistAndAutoSyncNoteFile(noteFileRef.current, undefined, permit, validToken);
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.warn('Drive check warning:', err?.message || err);
        setDriveStatus('error');
        setDriveError(err?.message || 'Unable to connect to Google Drive');
      }
    }

    checkDrive();

    return () => {
      isMounted = false;
    };
  }, [permit.tcNumber, accessToken]);

  /**
   * Serialized Google Drive auto-sync worker.
   * Ensures rapid consecutive 1-tap quick pills + voice notes never race or overwrite newer local notes.
   */
  const flushDriveSyncQueue = async (
    initialActionLabel?: string,
    initialPermit?: Permit,
    initialExplicitToken?: string
  ) => {
    if (isSyncInFlightRef.current) {
      queuedSyncRequestRef.current = {
        actionLabel: initialActionLabel || queuedSyncRequestRef.current?.actionLabel,
        permitTarget: initialPermit || permit,
        explicitToken: initialExplicitToken || queuedSyncRequestRef.current?.explicitToken,
      };
      return;
    }

    isSyncInFlightRef.current = true;
    let nextLabel = initialActionLabel;
    let nextPermit = initialPermit || permit;
    let nextExplicitToken = initialExplicitToken;

    try {
      while (true) {
        queuedSyncRequestRef.current = null;
        const snapshotToSync = noteFileRef.current;
        const syncedRevision = localRevisionRef.current;

        let activeToken = nextExplicitToken || accessToken;
        if (!activeToken) {
          activeToken = await getAccessToken();
          if (activeToken) {
            onAccessTokenUpdated?.(activeToken);
          }
        }

        if (!activeToken) {
          const unsyncedLatest: PermitNoteFile = {
            ...noteFileRef.current,
            hasUnsyncedChanges: true,
          };
          setNoteFile(unsyncedLatest);
          noteFileRef.current = unsyncedLatest;
          saveLocalPermitNote(unsyncedLatest);
          void enqueueOfflineSync(nextPermit.tcNumber, 'NOTE', { tcNumber: nextPermit.tcNumber });
          setDriveStatus('unsynced');
          setDriveError(null);
          onShowToast?.(
            nextLabel
              ? `${nextLabel} (Saved locally & queued for Drive sync)`
              : 'Saved locally & queued for Drive sync',
            'info'
          );
          break;
        }

        setDriveStatus('syncing');
        setDriveError(null);
        setDriveIframeBlocked(false);

        try {
          const validToken = await verifyAndRefreshDriveToken(activeToken);
          if (!validToken && !nextExplicitToken) {
            const unsyncedLatest: PermitNoteFile = {
              ...noteFileRef.current,
              hasUnsyncedChanges: true,
            };
            setNoteFile(unsyncedLatest);
            noteFileRef.current = unsyncedLatest;
            saveLocalPermitNote(unsyncedLatest);
            void enqueueOfflineSync(
              nextPermit.tcNumber,
              'NOTE',
              { tcNumber: nextPermit.tcNumber },
              'Google Drive session expired'
            );
            setDriveStatus('unsynced');
            setDriveError('Google Drive session expired. Click Connect Drive to sync.');
            onAccessTokenUpdated?.('');
            onShowToast?.(
              'Saved locally & queued — click "Connect Drive" to sync.',
              'warning'
            );
            break;
          }

          const tokenToUse = validToken || activeToken;
          if (validToken && validToken !== activeToken) {
            onAccessTokenUpdated?.(validToken);
          }

          const syncSummary = await syncPermitNoteStateToDrive(
            tokenToUse,
            nextPermit,
            snapshotToSync
          );

          // Merge ONLY Drive metadata onto the latest noteFileRef.current so any notes added
          // while the network request was in flight are never overwritten!
          const hasNewerLocalEdits = localRevisionRef.current !== syncedRevision;
          const reconciledNoteFile: PermitNoteFile = {
            ...(hasNewerLocalEdits ? noteFileRef.current : syncSummary.noteFile),
            driveFileId: syncSummary.fileId,
            driveFileName: syncSummary.fileName,
            driveWebViewLink: syncSummary.webViewLink,
            driveFolderId: syncSummary.folderId,
            driveFolderPath: syncSummary.folderPath,
            driveFolderWebViewLink: syncSummary.folderWebViewLink,
            lastSyncedAt: syncSummary.syncedAt,
            hasUnsyncedChanges: hasNewerLocalEdits,
          };

          setNoteFile(reconciledNoteFile);
          noteFileRef.current = reconciledNoteFile;
          saveLocalPermitNote(reconciledNoteFile);
          if (!hasNewerLocalEdits) {
            void clearOfflineSyncByTcNumber(nextPermit.tcNumber);
          }
          setDriveSyncInfo({
            ...syncSummary,
            noteFile: reconciledNoteFile,
          });
          setSealPreviewUrl(getCachedOfficialSealDataUrl());
          setDriveStatus(hasNewerLocalEdits ? 'syncing' : 'synced');

          if (!hasNewerLocalEdits && !queuedSyncRequestRef.current) {
            onShowToast?.(
              nextLabel
                ? `${nextLabel} — Synced to ${syncSummary.folderPath}`
                : `Synced "${syncSummary.fileName}" to ${syncSummary.folderPath}`,
              'success'
            );
          }
        } catch (err: any) {
          console.warn('Google Drive auto-sync error:', err);
          const unsyncedLatest: PermitNoteFile = {
            ...noteFileRef.current,
            hasUnsyncedChanges: true,
          };
          setNoteFile(unsyncedLatest);
          noteFileRef.current = unsyncedLatest;
          saveLocalPermitNote(unsyncedLatest);
          void enqueueOfflineSync(
            nextPermit.tcNumber,
            'NOTE',
            { tcNumber: nextPermit.tcNumber },
            err?.message || 'Drive sync failed'
          );

          setDriveStatus('error');
          setDriveError(err.message || 'Auto-sync to Google Drive failed');
          if (isDriveQuotaError(err)) {
            onShowToast?.(err.message, 'warning');
          } else if (isDriveScopeError(err)) {
            onAccessTokenUpdated?.('');
            onShowToast?.('Drive authorization needed — click Connect Drive', 'warning');
          } else {
            onShowToast?.(`Saved locally & queued for retry. Drive sync error: ${err.message || 'Error'}`, 'warning');
          }
          break;
        }

        const pendingNext = queuedSyncRequestRef.current as {
          actionLabel?: string;
          permitTarget: Permit;
          explicitToken?: string;
        } | null;

        if (pendingNext) {
          nextLabel = pendingNext.actionLabel;
          nextPermit = pendingNext.permitTarget;
          nextExplicitToken = pendingNext.explicitToken;
        } else if (noteFileRef.current.hasUnsyncedChanges) {
          nextLabel = undefined;
        } else {
          break;
        }
      }
    } finally {
      isSyncInFlightRef.current = false;
    }
  };

  /**
   * Auto-save locally and PATCH sync in-place to:
   * My Drive > Spark Notes > Permit Notes > [PermitNumber] Permit Notes.docx
   * Called on EVERY note addition, inline edit, or deletion.
   */
  const persistAndAutoSyncNoteFile = async (
    updatedFile: PermitNoteFile,
    localActionLabel?: string,
    permitOverride?: Permit,
    explicitToken?: string
  ) => {
    const targetPermit = permitOverride || permit;

    // 1. Increment local revision & save locally immediately
    localRevisionRef.current += 1;
    setNoteFile(updatedFile);
    noteFileRef.current = updatedFile;
    const localSaveResult = saveLocalPermitNote(updatedFile);
    if (!localSaveResult.ok) {
      onShowToast?.(
        localSaveResult.error || 'Storage full — export or sync logs now',
        'warning'
      );
    }
    onPermitUpdated({ ...targetPermit });

    // 2. Enqueue serialized Google Drive PATCH sync
    await flushDriveSyncQueue(localActionLabel, targetPermit, explicitToken);
  };

  /**
   * Synchronous user-gesture OAuth handler for BOTH "Connect Drive" and "Save & Sync to Spark Notes".
   * Checks VITE_GOOGLE_CLIENT_ID / process.env.GOOGLE_CLIENT_ID / localStorage first; if missing or invalid,
   * opens the inline GoogleClientIdModal instead of failing silently.
   * Otherwise invokes Google Identity Services (`google.accounts.oauth2.initTokenClient`) with `ux_mode: 'popup'`
   * and `https://www.googleapis.com/auth/drive.file`, locates/creates `My Drive > Spark Notes > Permit Notes`,
   * and syncs `[PermitNumber] Permit Notes.docx`.
   */
  const handleReauthorizeDrive = (explicitClientId?: string) => {
    const configuredClientId = (explicitClientId || getConfiguredGoogleClientId()).trim();
    if (!configuredClientId) {
      setIsDriveWarningDismissed(false);
      setIsClientIdModalOpen(true);
      onShowToast?.(
        'Paste your Google OAuth Client ID to connect Google Drive (saved locally).',
        'info'
      );
      return;
    }

    setIsReauthorizing(true);
    setDriveError(null);
    setDriveAuthErrorInfo(null);
    setDriveIframeBlocked(false);
    setDriveStatus('syncing');
    onShowToast?.('Opening Google Drive OAuth popup...', 'info');

    requestDriveReauthorization(
      async (newToken: string, user?: any) => {
        setIsReauthorizing(false);
        setDriveError(null);
        setDriveAuthErrorInfo(null);
        setDriveIframeBlocked(false);
        onAccessTokenUpdated?.(newToken, user);

        try {
          const folder = await discoverPermitNotesDriveFolder(newToken, { forceRefresh: true });
          setDriveSyncInfo((prev) => ({
            ...prev,
            folderId: folder.folderId,
            folderPath: folder.folderPath,
            folderWebViewLink: folder.folderWebViewLink,
          }));
        } catch {}

        await persistAndAutoSyncNoteFile(
          noteFileRef.current,
          'Synced to Spark Notes',
          permit,
          newToken
        );
      },
      (err: any) => {
        setIsReauthorizing(false);
        const classified =
          err && err.title && err.remediation ? (err as DriveAuthErrorInfo) : classifyDriveOAuthError(err);
        setDriveStatus(accessToken && hasValidCachedDriveToken(accessToken) ? 'error' : 'unsynced');
        setDriveIframeBlocked(classified.isIframeBlocked);
        setDriveAuthErrorInfo(classified);
        setIsDriveWarningDismissed(false);
        setDriveError(`${classified.message} ${classified.remediation}`.trim());

        if (err?.code === 'missing_client_id') {
          setIsClientIdModalOpen(true);
        }

        onShowToast?.(`${classified.title}: ${classified.remediation}`, 'warning');
      },
      configuredClientId
    );
  };

  const handleSyncToDrive = () => {
    if (
      !accessToken ||
      !hasValidCachedDriveToken(accessToken) ||
      (driveError && isDriveScopeError(driveError))
    ) {
      handleReauthorizeDrive();
      return;
    }

    const existingDriveId = noteFileRef.current.driveFileId || driveSyncInfo.fileId;
    if (existingDriveId && !showConfirmDriveOverwrite) {
      setShowConfirmDriveOverwrite(true);
      return;
    }

    setShowConfirmDriveOverwrite(false);
    void persistAndAutoSyncNoteFile(noteFileRef.current, 'Synced to Spark Notes');
  };

  /**
   * Appends a chronological note entry (`MM/DD/YYYY – [Note text] – MAC`) directly to Permit Notes
   * and triggers immediate local save + Google Drive sync.
   */
  const handleAppendLogEntry = async (
    rawEntryText: string,
    options?: { isVoiceOrFreeform?: boolean; exactStandard?: boolean }
  ) => {
    let cleanText = rawEntryText.trim();
    if (!cleanText) return;

    if (!options?.exactStandard && options?.isVoiceOrFreeform) {
      cleanText = formatMcdotFieldDictation(cleanText, permit);
    } else {
      cleanText = stripLogRowDecorations(cleanText);
      if (cleanText && !/[.!?]$/.test(cleanText)) {
        cleanText = `${cleanText}.`;
      }
    }

    if (!cleanText) return;

    // Guard against accidental truck mount double-tap (< 1.2s) on identical note text
    const nowMs = Date.now();
    if (
      lastQuickAppendRef.current &&
      lastQuickAppendRef.current.text.toLowerCase() === cleanText.toLowerCase() &&
      nowMs - lastQuickAppendRef.current.at < 1200
    ) {
      return;
    }
    lastQuickAppendRef.current = { text: cleanText, at: nowMs };

    const current = noteFileRef.current;
    const nowIso = new Date(nowMs).toISOString();
    const newUpdate: StatusUpdate = {
      id: `stat-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      inspector: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
      text: cleanText,
      voiceDictated: Boolean(options?.isVoiceOrFreeform),
    };

    const updatedNotes = [...(current.inspectorNotes || []), newUpdate].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const updatedFile: PermitNoteFile = {
      ...current,
      inspectorNotes: updatedNotes,
      hasUnsyncedChanges: true,
      auditTrail: [
        ...(current.auditTrail || []),
        {
          timestamp: nowIso,
          action: `Logged: ${cleanText.slice(0, 48)}`,
          user: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
        },
      ],
    };

    setNoteInputText('');
    const formattedDisplay = formatMcdotLogRow(newUpdate.timestamp, cleanText);

    // Scroll white paper sheet gently so new note is visible
    setTimeout(() => {
      notesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);

    await persistAndAutoSyncNoteFile(updatedFile, formattedDisplay, permit);
  };

  // Format raw voice transcript via server Gemini (with fast timeout) + deterministic MCDOT fallback
  const formatAndLogVoiceTranscript = async (rawSpeech: string) => {
    const trimmed = rawSpeech.trim();
    if (!trimmed) return;

    const localFormatted = formatMcdotFieldDictation(trimmed, permit);
    setIsFormattingVoice(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3800);

      const res = await fetch('/api/gemini/clean-voice-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawTranscript: trimmed,
          tcNumber: permit.tcNumber,
          location: permit.location,
          permitType: permit.permitType,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const serverClean = (data.plainCleanText || '').trim();
        if (serverClean) {
          await handleAppendLogEntry(serverClean, { exactStandard: true });
          return;
        }
      }
      await handleAppendLogEntry(localFormatted, { exactStandard: true });
    } catch {
      await handleAppendLogEntry(localFormatted, { exactStandard: true });
    } finally {
      setIsFormattingVoice(false);
    }
  };

  // --- Continuous Voice Dictation Toggle (No 3-second cutoff, deduplicated across pauses) ---
  const stopMainVoiceDictation = async (shouldCommit = true) => {
    isStoppingRef.current = true;
    isRecordingRef.current = false;

    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      recognitionRef.current = null;
    }

    setIsRecordingVoice(false);
    setInterimTranscript('');

    // Merge committed + finalized + trailing interim speech so NO spoken words are ever discarded
    let mergedSpeech = sessionCommittedRef.current;
    mergedSpeech = appendSpeechChunkCleanly(mergedSpeech, currentSegmentFinalRef.current);
    mergedSpeech = appendSpeechChunkCleanly(mergedSpeech, currentSegmentInterimRef.current);

    const combinedRaw = removeDuplicatePhrases(mergedSpeech) || noteInputText.trim();
    sessionCommittedRef.current = '';
    currentSegmentFinalRef.current = '';
    currentSegmentInterimRef.current = '';

    if (shouldCommit && combinedRaw) {
      setNoteInputText('');
      await formatAndLogVoiceTranscript(combinedRaw);
    } else if (!shouldCommit && combinedRaw) {
      setNoteInputText(combinedRaw);
    }
  };

  const toggleMainVoiceDictation = () => {
    if (isRecordingVoice) {
      void stopMainVoiceDictation(true);
      return;
    }

    // Stop Pre-Con mic if open
    if (isRecordingPreCon) {
      stopPreConDictation();
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      onShowToast?.(
        'Voice dictation is not supported in this browser. Type notes below.',
        'warning'
      );
      return;
    }

    try {
      isStoppingRef.current = false;
      isRecordingRef.current = true;
      sessionCommittedRef.current = noteInputText.trim();
      currentSegmentFinalRef.current = '';
      currentSegmentInterimRef.current = '';
      setInterimTranscript('');

      const startRecognitionSegment = () => {
        if (!isRecordingRef.current || isStoppingRef.current) return;

        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        const resetSafetyTimer = () => {
          if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
          // 90-second idle safety net so natural 5-20s pauses while inspecting never cut off dictation
          safetyTimerRef.current = setTimeout(() => {
            if (isRecordingRef.current && !isStoppingRef.current) {
              void stopMainVoiceDictation(true);
            }
          }, 90000);
        };

        rec.onstart = () => {
          resetSafetyTimer();
        };

        rec.onresult = (event: any) => {
          if (isStoppingRef.current || !isRecordingRef.current) return;
          resetSafetyTimer();

          let segFinal = '';
          let segInterim = '';

          for (let i = 0; i < event.results.length; i++) {
            const r = event.results[i];
            const chunk = (r[0]?.transcript || '').trim();
            if (!chunk) continue;
            if (r.isFinal) {
              segFinal = appendSpeechChunkCleanly(segFinal, chunk);
            } else {
              segInterim = appendSpeechChunkCleanly(segInterim, chunk);
            }
          }

          currentSegmentFinalRef.current = removeDuplicatePhrases(segFinal);
          currentSegmentInterimRef.current = removeDuplicatePhrases(segInterim);

          const fullFinal = removeDuplicatePhrases(
            appendSpeechChunkCleanly(sessionCommittedRef.current, currentSegmentFinalRef.current)
          );
          const livePreview = removeDuplicatePhrases(
            appendSpeechChunkCleanly(fullFinal, currentSegmentInterimRef.current)
          );

          setNoteInputText(livePreview);
          setInterimTranscript(currentSegmentInterimRef.current);
        };

        rec.onerror = (e: any) => {
          // Ignore 'no-speech' and 'aborted' so pauses while walking the site never kill continuous dictation
          if (e?.error === 'no-speech' || e?.error === 'aborted') {
            return;
          }
          console.warn('Voice dictation error:', e?.error || e);
          if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
            onShowToast?.('Microphone permission required for voice dictation.', 'warning');
            void stopMainVoiceDictation(false);
          } else if (e?.error === 'audio-capture') {
            onShowToast?.('No microphone detected on this device.', 'warning');
            void stopMainVoiceDictation(false);
          }
        };

        rec.onend = () => {
          // Seamlessly bridge browser silence disconnects while inspector still has Voice Dictate ON
          if (isRecordingRef.current && !isStoppingRef.current) {
            let carry = sessionCommittedRef.current;
            carry = appendSpeechChunkCleanly(carry, currentSegmentFinalRef.current);
            carry = appendSpeechChunkCleanly(carry, currentSegmentInterimRef.current);
            sessionCommittedRef.current = removeDuplicatePhrases(carry);
            currentSegmentFinalRef.current = '';
            currentSegmentInterimRef.current = '';
            try {
              startRecognitionSegment();
              return;
            } catch (restartErr) {
              console.warn('Voice dictation restart warning:', restartErr);
            }
          }
        };

        recognitionRef.current = rec;
        rec.start();
      };

      startRecognitionSegment();
      setIsRecordingVoice(true);
      setActiveView('notes');
    } catch (err) {
      console.error('Failed to start voice dictation:', err);
      isRecordingRef.current = false;
      setIsRecordingVoice(false);
      onShowToast?.('Unable to start microphone.', 'warning');
    }
  };

  // --- Pre-Con Builder Quick-Prompt Voice Dictation ---
  const stopPreConDictation = (): string => {
    isRecordingPreConRef.current = false;
    if (preConRecRef.current) {
      try {
        preConRecRef.current.onresult = null;
        preConRecRef.current.onend = null;
        preConRecRef.current.onerror = null;
        preConRecRef.current.stop();
      } catch {
        try {
          preConRecRef.current.abort();
        } catch {}
      }
      preConRecRef.current = null;
    }

    let merged = preConCommittedRef.current;
    merged = appendSpeechChunkCleanly(merged, preConSegmentFinalRef.current);
    merged = appendSpeechChunkCleanly(merged, preConSegmentInterimRef.current);
    const cleanedPrompt = removeDuplicatePhrases(merged) || preConPrompt.trim();

    preConCommittedRef.current = '';
    preConSegmentFinalRef.current = '';
    preConSegmentInterimRef.current = '';
    setIsRecordingPreCon(false);
    setPreConInterim('');
    if (cleanedPrompt) {
      setPreConPrompt(cleanedPrompt);
    }
    return cleanedPrompt;
  };

  const togglePreConDictation = () => {
    if (isRecordingPreCon) {
      stopPreConDictation();
      return;
    }
    if (isRecordingVoice) {
      void stopMainVoiceDictation(false);
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onShowToast?.('Speech recognition unavailable — type contact & scope.', 'warning');
      return;
    }

    try {
      isRecordingPreConRef.current = true;
      preConCommittedRef.current = preConPrompt.trim();
      preConSegmentFinalRef.current = '';
      preConSegmentInterimRef.current = '';
      setPreConCustomPreview(null);

      const startPreConSeg = () => {
        if (!isRecordingPreConRef.current) return;
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        rec.onresult = (event: any) => {
          if (!isRecordingPreConRef.current) return;
          let segFinal = '';
          let segInterim = '';
          for (let i = 0; i < event.results.length; i++) {
            const r = event.results[i];
            const chunk = (r[0]?.transcript || '').trim();
            if (!chunk) continue;
            if (r.isFinal) segFinal = appendSpeechChunkCleanly(segFinal, chunk);
            else segInterim = appendSpeechChunkCleanly(segInterim, chunk);
          }
          preConSegmentFinalRef.current = removeDuplicatePhrases(segFinal);
          preConSegmentInterimRef.current = removeDuplicatePhrases(segInterim);

          let live = preConCommittedRef.current;
          live = appendSpeechChunkCleanly(live, preConSegmentFinalRef.current);
          live = appendSpeechChunkCleanly(live, preConSegmentInterimRef.current);
          setPreConPrompt(removeDuplicatePhrases(live));
          setPreConInterim(preConSegmentInterimRef.current);
        };

        rec.onerror = (e: any) => {
          if (e?.error === 'no-speech' || e?.error === 'aborted') return;
          if (e?.error === 'not-allowed' || e?.error === 'audio-capture') {
            stopPreConDictation();
          }
        };

        rec.onend = () => {
          if (isRecordingPreConRef.current) {
            let carry = preConCommittedRef.current;
            carry = appendSpeechChunkCleanly(carry, preConSegmentFinalRef.current);
            carry = appendSpeechChunkCleanly(carry, preConSegmentInterimRef.current);
            preConCommittedRef.current = removeDuplicatePhrases(carry);
            preConSegmentFinalRef.current = '';
            preConSegmentInterimRef.current = '';
            try {
              startPreConSeg();
            } catch {}
          }
        };

        preConRecRef.current = rec;
        rec.start();
      };

      startPreConSeg();
      setIsRecordingPreCon(true);
    } catch {
      isRecordingPreConRef.current = false;
      setIsRecordingPreCon(false);
    }
  };

  const handleCommitPreConBuilder = async () => {
    let finalPrompt = preConPrompt;
    if (isRecordingPreCon) {
      finalPrompt = stopPreConDictation();
    }
    const textToLog = (
      preConCustomPreview !== null
        ? preConCustomPreview
        : buildMcdotPreConParagraph(finalPrompt, permit).paragraph
    ).trim();
    if (!textToLog) return;

    setIsPreConOpen(false);
    setPreConPrompt('');
    setPreConCustomPreview(null);

    await handleAppendLogEntry(textToLog, { exactStandard: true });
  };

  // Inline edit / delete handlers
  const handleStartEditEntry = (note: StatusUpdate) => {
    setConfirmDeleteEntryId(null);
    setEditingEntryId(note.id);
    setEditingEntryText(note.text);
  };

  const handleCancelEditEntry = () => {
    setEditingEntryId(null);
    setEditingEntryText('');
  };

  const handleSaveEditEntry = async (entryId: string) => {
    const trimmed = stripLogRowDecorations(editingEntryText);

    if (!trimmed) {
      onShowToast?.('Note text cannot be blank', 'warning');
      return;
    }

    const finalBody = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
    const current = noteFileRef.current;
    const updatedNotes = current.inspectorNotes.map((n) =>
      n.id === entryId ? { ...n, text: finalBody } : n
    );

    const updatedFile: PermitNoteFile = {
      ...current,
      inspectorNotes: updatedNotes,
      hasUnsyncedChanges: true,
      auditTrail: [
        ...(current.auditTrail || []),
        {
          timestamp: new Date().toISOString(),
          action: `Edited note entry: ${finalBody.slice(0, 38)}`,
          user: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
        },
      ],
    };

    setEditingEntryId(null);
    setEditingEntryText('');

    await persistAndAutoSyncNoteFile(updatedFile, 'Updated note entry');
  };

  const handleDeleteLogEntry = async (entryId: string) => {
    setConfirmDeleteEntryId(null);
    const current = noteFileRef.current;
    const updatedNotes = current.inspectorNotes.filter((n) => n.id !== entryId);
    const updatedFile: PermitNoteFile = {
      ...current,
      inspectorNotes: updatedNotes,
      hasUnsyncedChanges: true,
      auditTrail: [
        ...(current.auditTrail || []),
        {
          timestamp: new Date().toISOString(),
          action: 'Deleted note entry',
          user: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
        },
      ],
    };

    await persistAndAutoSyncNoteFile(updatedFile, 'Removed note entry');
  };

  // Import Official Template (.docx) seal
  const handleImportTemplateDocx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingTemplate(true);
    try {
      const { dataUrl } = await importOfficialTemplateDocxFile(file);
      setSealPreviewUrl(dataUrl);
      onShowToast?.(`Cached official Maricopa County Seal from "${file.name}"`, 'success');
      if (accessToken && noteFileRef.current.inspectorNotes.length > 0) {
        await persistAndAutoSyncNoteFile(noteFileRef.current, 'Updated template seal');
      }
    } catch (err: any) {
      onShowToast?.(err.message || 'Could not extract seal from .docx', 'warning');
    } finally {
      setIsImportingTemplate(false);
      if (templateFileInputRef.current) templateFileInputRef.current.value = '';
    }
  };

  // Download genuine .DOCX file
  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      const sealPayload = await resolveTemplateSealForDocx(accessToken);
      setSealPreviewUrl(getCachedOfficialSealDataUrl());
      await downloadMcdotDocx(permit, noteFileRef.current, sealPayload);
      onShowToast?.(`Downloaded "${permit.tcNumber.trim()} Permit Notes.docx"`, 'success');
    } catch (err: any) {
      onShowToast?.(`DOCX export error: ${err.message}`, 'warning');
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Copy rich HTML + plain text to clipboard
  const handleCopyDocument = async () => {
    const { plainText, html } = generateMcdotFormattedTableText(permit, noteFile);
    try {
      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }
      setCopiedDoc(true);
      setTimeout(() => setCopiedDoc(false), 2500);
      onShowToast?.('Copied official Permit Notes to clipboard', 'success');
    } catch {
      await navigator.clipboard?.writeText(plainText);
      setCopiedDoc(true);
      setTimeout(() => setCopiedDoc(false), 2500);
      onShowToast?.('Copied Permit Notes text to clipboard', 'success');
    }
  };

  // Site photo attachment (persisted as Blob in IndexedDB; lightweight metadata only in localStorage)
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingPhoto(true);
    try {
      const compressed = await compressImage(file, 1280, 0.82);
      const photoId = `photo-${Date.now()}`;

      // 1. Persist binary Blob in IndexedDB first
      const idbResult = await savePhotoBlob(photoId, compressed.blob);
      if (!idbResult.ok) {
        onShowToast?.(
          idbResult.error || 'Storage full — export or sync logs now',
          'warning'
        );
        return;
      }

      // 2. Store only lightweight photo metadata/ID reference in permit note state
      const newPhoto: PermitPhoto = {
        id: photoId,
        timestamp: new Date().toISOString(),
        category: 'general',
        caption: photoCaption.trim() || `Site Photo — ${formatMcdotDate(new Date())}`,
        storedInIdb: true,
        fileSizeKb: compressed.fileSizeKb,
      };
      const prevFile = noteFileRef.current;
      const updatedFile: PermitNoteFile = {
        ...prevFile,
        photos: [newPhoto, ...(prevFile.photos || [])],
      };

      const saveResult = saveLocalPermitNote(updatedFile);
      if (!saveResult.ok) {
        await deletePhotoBlob(photoId);
        onShowToast?.(
          saveResult.error || 'Storage full — export or sync logs now',
          'warning'
        );
        return;
      }

      setNoteFile(updatedFile);
      noteFileRef.current = updatedFile;
      setPhotoCaption('');
      onShowToast?.(`Site photo compressed (${compressed.fileSizeKb} KB) & saved`, 'success');
    } catch (err: any) {
      onShowToast?.(`Photo save failed: ${err?.message || 'Unknown error'}`, 'warning');
    } finally {
      setIsCompressingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleModalClose = () => {
    if (isRecordingVoice) {
      stopMainVoiceDictation(false);
    }
    if (isRecordingPreCon) {
      stopPreConDictation();
    }
    onClose();
  };

  return (
    <div
      className={
        embedded
          ? 'h-full w-full flex flex-col overflow-hidden bg-slate-900 text-slate-100'
          : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs'
      }
    >
      <div
        className={
          embedded
            ? 'bg-slate-900 w-full h-full flex flex-col overflow-hidden text-slate-100'
            : 'bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden text-slate-100'
        }
      >
        {/* 1. COMPACT PERMIT HEADER: Pinned TC#, Inferred Lifecycle Pill, Primary Save & Sync Action */}
        <div className="bg-slate-950 border-b border-slate-800 px-3.5 py-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              {embedded && (
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-[#09090B] font-black text-xs flex items-center gap-1 cursor-pointer shrink-0 transition"
                  title="Return to Corridor Cluster list"
                >
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                  <span>Corridors</span>
                </button>
              )}

              <span className="inline-flex items-center gap-1 font-mono tabular-nums text-sm sm:text-base font-black px-2.5 py-1 rounded-lg bg-amber-400 text-[#09090B] border-2 border-white shrink-0">
                <Pin className="w-3.5 h-3.5 fill-current rotate-45 text-[#09090B]" />
                <span>{permit.tcNumber}</span>
              </span>

              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border shrink-0 ${lifecyclePillStyle.bg} ${lifecyclePillStyle.text} ${lifecyclePillStyle.border}`}
                title="Lifecycle stage automatically inferred from Permit Notes text"
              >
                <span>{lifecycleStage}</span>
              </span>

              <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-md">
                {permit.location || permit.projectTitle}
              </span>
            </div>

            {/* Right Controls: Synced to Spark Notes Badge + Save & Sync + Export + Optional Views + Close */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {accessToken &&
                hasValidCachedDriveToken(accessToken) &&
                (driveStatus === 'synced' || driveStatus === 'found') &&
                !noteFile.hasUnsyncedChanges && (
                  <span
                    className="inline-flex min-h-[38px] items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white border border-emerald-400 text-xs font-extrabold shadow-xs select-none"
                    title={`Synced to ${driveSyncInfo.folderPath || 'My Drive > Spark Notes > Permit Notes'}`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                    <span>Synced to Spark Notes</span>
                  </span>
                )}

              <button
                type="button"
                onClick={handleSyncToDrive}
                disabled={driveStatus === 'syncing' || isReauthorizing}
                className={`min-h-[44px] min-w-[44px] h-11 flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer select-none ${
                  accessToken &&
                  hasValidCachedDriveToken(accessToken) &&
                  (driveStatus === 'synced' || driveStatus === 'found') &&
                  !noteFile.hasUnsyncedChanges
                    ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-emerald-500/50'
                    : driveStatus === 'error'
                    ? 'bg-rose-700 hover:bg-rose-600 text-white border-rose-400/70 shadow'
                    : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400/60 shadow'
                }`}
                title="Upload or update [PermitNumber] Permit Notes.docx inside My Drive > Spark Notes > Permit Notes"
              >
                {driveStatus === 'syncing' || driveStatus === 'searching' || isReauthorizing ? (
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                ) : accessToken &&
                  hasValidCachedDriveToken(accessToken) &&
                  (driveStatus === 'synced' || driveStatus === 'found') &&
                  !noteFile.hasUnsyncedChanges ? (
                  <CloudCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Cloud className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {driveStatus === 'syncing' || isReauthorizing
                    ? 'Syncing...'
                    : 'Save & Sync to Spark Notes'}
                </span>
              </button>

              {(driveSyncInfo.fileId || noteFile.driveFileId) && (
                <a
                  href={
                    driveSyncInfo.webViewLink ||
                    noteFile.driveWebViewLink ||
                    buildDriveFileWebLink((driveSyncInfo.fileId || noteFile.driveFileId)!)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex min-h-[44px] min-w-[44px] h-11 items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 text-xs font-bold transition"
                  title="Open [PermitNumber] Permit Notes.docx in Google Drive"
                >
                  <Folder className="w-4 h-4 shrink-0" />
                  <span>Drive ↗</span>
                </a>
              )}

              <button
                type="button"
                onClick={handleExportDocx}
                disabled={isExportingDocx}
                className="min-h-[44px] min-w-[44px] h-11 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                title="Download [PermitNumber] Permit Notes.docx"
              >
                {isExportingDocx ? (
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <Download className="w-4 h-4 text-blue-400 shrink-0" />
                )}
                <span className="hidden lg:inline">.DOCX</span>
              </button>

              <button
                type="button"
                onClick={handleCopyDocument}
                className="min-h-[44px] min-w-[44px] h-11 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                title="Copy formatted Permit Notes"
              >
                {copiedDoc ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span className="hidden lg:inline">{copiedDoc ? 'Copied' : 'Copy'}</span>
              </button>

              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveView('notes')}
                  className={`min-h-[44px] min-w-[44px] h-11 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeView === 'notes'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-200 hover:text-white'
                  }`}
                  title="Official Permit Notes Sheet"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Notes</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveView((v) => (v === 'specs' ? 'notes' : 'specs'))
                  }
                  className={`min-h-[44px] min-w-[44px] h-11 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeView === 'specs'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-200 hover:text-white'
                  }`}
                  title="MAG & MCDOT Specifications Reference"
                >
                  <BookOpen className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Specs</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveView((v) => (v === 'photos' ? 'notes' : 'photos'))
                  }
                  className={`min-h-[44px] min-w-[44px] h-11 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeView === 'photos'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-200 hover:text-white'
                  }`}
                  title="Site Photos"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  {noteFile.photos.length > 0 && (
                    <span className="text-xs font-mono">{noteFile.photos.length}</span>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={handleModalClose}
                className="min-w-[44px] min-h-[44px] p-3 rounded-xl text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center transition cursor-pointer"
                title="Close Permit Sheet (Permit stays pinned on map)"
                aria-label="Close Permit Sheet"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Inline Drive Overwrite Confirmation Bar (when manually updating an existing .DOCX in Google Drive) */}
          {showConfirmDriveOverwrite && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-400 text-gray-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="font-bold">
                Update existing <strong>{permit.tcNumber.trim()} Permit Notes.docx</strong> in{' '}
                <span className="font-mono">My Drive › Spark Notes › Permit Notes</span>?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmDriveOverwrite(false);
                    void persistAndAutoSyncNoteFile(
                      noteFileRef.current,
                      'Synced to Spark Notes'
                    );
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold cursor-pointer"
                >
                  Confirm &amp; Sync
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmDriveOverwrite(false)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-gray-900 font-bold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Corridor Sibling TC# 1-Tap Switcher (when inspecting a permit inside a Corridor Cluster) */}
          {corridorSiblings && corridorSiblings.length > 1 && onSelectSiblingPermit && (
            <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-bold text-slate-400 shrink-0 mr-1">
                {corridorName ? `${corridorName}:` : 'Corridor:'}
              </span>
              {corridorSiblings.map((sib) => {
                const isCurrent = sib.tcNumber.trim() === permit.tcNumber.trim();
                return (
                  <button
                    key={sib.id}
                    type="button"
                    onClick={() => {
                      if (!isCurrent) onSelectSiblingPermit(sib);
                    }}
                    className={`min-h-[36px] px-2.5 py-1 rounded-lg font-mono tabular-nums text-xs font-black border transition cursor-pointer shrink-0 ${
                      isCurrent
                        ? 'bg-amber-400 text-[#09090B] border-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                    }`}
                  >
                    {sib.tcNumber}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* HIGH-CONTRAST CONTRACTOR & AUTO-EXTRACTED CONTACTS STRIP (Direct Sunlight Legibility) */}
        <div className="bg-slate-100 border-b border-slate-300 px-3.5 py-2 shrink-0 text-gray-900">
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {extractedContacts.length > 0 ? (
                extractedContacts.map((contact) => {
                  const smsHref = buildContactSmsHref(
                    contact,
                    permit.tcNumber,
                    permit.location
                  );
                  return (
                    <div
                      key={contact.cleanPhone}
                      className="inline-flex items-center gap-2 bg-white border border-slate-300 rounded-xl px-3 py-1 shadow-xs"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-extrabold text-gray-900">{contact.name}</span>
                        {contact.company && (
                          <span className="text-slate-800 font-semibold"> · {contact.company}</span>
                        )}
                        <span className="text-slate-700 font-mono font-semibold ml-1.5 text-[11px]">
                          {contact.phone}
                        </span>
                      </div>
                      <a
                        href={`tel:${contact.cleanPhone}`}
                        className="min-h-[44px] min-w-[44px] h-11 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs transition select-none"
                        title={`Call ${contact.name} (${contact.phone})`}
                      >
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span>Call</span>
                      </a>
                      <a
                        href={smsHref}
                        className="min-h-[44px] min-w-[44px] h-11 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition select-none"
                        title={`Text ${contact.name} (${contact.phone})`}
                      >
                        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                        <span>Text</span>
                      </a>
                    </div>
                  );
                })
              ) : (
                <span className="text-xs text-slate-800 font-medium">
                  Contractor:{' '}
                  <strong className="text-gray-900 font-bold">
                    {permit.contractor || 'Not Listed in GIS'}
                  </strong>
                  <span className="text-slate-700 hidden sm:inline">
                    {' '}
                    — Any name &amp; phone in notes auto-enables 1-tap Call/Text
                  </span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-700 shrink-0">
              <span className="hidden md:inline font-mono text-[11px] text-slate-700 font-medium">
                {driveSyncInfo.folderPath || 'My Drive > Spark Notes > Permit Notes'}
              </span>

              <input
                ref={templateFileInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleImportTemplateDocx}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => templateFileInputRef.current?.click()}
                disabled={isImportingTemplate}
                className="min-h-[44px] px-2.5 rounded-lg text-xs font-semibold text-slate-800 hover:text-gray-900 hover:bg-slate-200/80 flex items-center gap-1.5 transition cursor-pointer"
                title="Import Official Template (.docx) to cache Maricopa County Seal"
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xl:inline">Template Seal</span>
              </button>

              {permit.ritArcgisUrl && (
                <a
                  href={permit.ritArcgisUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-2.5 rounded-lg text-xs text-blue-800 hover:text-blue-950 hover:bg-blue-100/70 flex items-center gap-1 font-bold transition"
                  title="Open in MCDOT Road Information Tool"
                >
                  <span>RIT</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* 2. SCROLLABLE WORKSPACE: Zero-Chrome Exact US Letter (8.5" x 11") Permit Notes Document Sheet */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-300/90 dark:bg-slate-900/95 p-2.5 sm:p-6 space-y-3">
          {activeView === 'notes' && (
            /* Standard US Letter (8.5" x 11" = 816px x 1056px @ 96 DPI), 1-inch (96px) margins, crisp #FFFFFF paper & #000000 black Calibri 11pt–12pt text */
            <div className="w-full max-w-[816px] min-h-[780px] sm:min-h-[1056px] mx-auto bg-[#FFFFFF] text-[#000000] px-7 py-9 sm:p-[96px] shadow-[0_12px_40px_rgba(0,0,0,0.38)] border border-slate-400 font-['Calibri','Times_New_Roman',sans-serif] text-[11.5pt] leading-[1.42] flex flex-col justify-between">
              {/* Top Document Region: 1.15" x 1.15" Seal + Bold Permit #: + 1 Blank Line + Plain Word Paragraphs */}
              <div>
                {/* Official Maricopa County Seal (1.15" x 1.15" = 110px x 110px at 96 DPI), left-aligned */}
                <div className="mb-1.5">
                  <img
                    src={sealPreviewUrl}
                    alt="Official Seal of Maricopa County, Arizona"
                    className="w-[110px] h-[110px] object-contain block select-none"
                  />
                </div>

                {/* Directly below seal: Left-aligned, bold Permit #: [PermitNumber] */}
                <p className="m-0 font-bold text-[#000000] text-[11.5pt] leading-[1.42] select-text">
                  Permit #: {permit.tcNumber.trim()}
                </p>

                {/* One clean blank line before chronological inspection log entries */}
                <div className="h-[1.42em]" aria-hidden="true" />

                {/* Chronological Inspection Log Entries: Plain Word-compatible paragraphs formatted as MM/DD/YYYY MAC, [Note text] */}
                <div className="space-y-[11pt]">
                  {sortedLogEntries.length === 0 ? (
                    <p className="m-0 text-[11.5pt] leading-[1.42] text-neutral-500 italic select-none">
                      {formatMcdotDate(new Date())} {MCDOT_INSPECTOR_CODE}, [Tap a quick-action chip, Voice Dictate, or type below to append an entry]
                    </p>
                  ) : (
                    sortedLogEntries.map((note) => {
                      const rowText = formatMcdotLogRow(note.timestamp, note.text);

                      if (editingEntryId === note.id) {
                        return (
                          <div
                            key={note.id}
                            className="py-2 border-y border-neutral-400 space-y-2"
                          >
                            <div className="text-[11pt] text-[#000000] font-semibold">
                              {formatMcdotDate(note.timestamp)} {MCDOT_INSPECTOR_CODE}, [Editing entry]
                            </div>
                            <textarea
                              value={editingEntryText}
                              onChange={(e) => setEditingEntryText(e.target.value)}
                              rows={3}
                              autoFocus
                              className="w-full bg-[#FFFFFF] border border-neutral-500 p-2 text-[11.5pt] font-['Calibri','Times_New_Roman',sans-serif] text-[#000000] focus:outline-none focus:border-black"
                            />
                            <div className="flex items-center justify-end gap-2 font-sans">
                              <button
                                type="button"
                                onClick={handleCancelEditEntry}
                                className="min-h-[38px] px-3.5 py-1.5 border border-neutral-400 bg-neutral-100 hover:bg-neutral-200 text-[#000000] text-xs font-bold cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditEntry(note.id)}
                                className="min-h-[38px] px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={note.id}
                          className="group relative flex items-start justify-between gap-2"
                        >
                          <p className="m-0 text-[11.5pt] leading-[1.42] text-[#000000] flex-1 select-text break-words">
                            {rowText}
                          </p>
                          <div
                            className={`flex items-center gap-0.5 shrink-0 font-sans transition print:hidden ${
                              confirmDeleteEntryId === note.id
                                ? 'opacity-100'
                                : 'opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100'
                            }`}
                          >
                            {confirmDeleteEntryId === note.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLogEntry(note.id)}
                                  className="min-h-[34px] px-2.5 border border-neutral-900 bg-neutral-900 text-white text-[11px] font-bold cursor-pointer"
                                  title="Confirm deleting this note and syncing .DOCX"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteEntryId(null)}
                                  className="min-h-[34px] px-2.5 border border-neutral-400 bg-white text-[#000000] text-[11px] font-bold cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditEntry(note)}
                                  className="p-1.5 text-neutral-500 hover:text-[#000000] transition cursor-pointer"
                                  title="Edit paragraph"
                                  aria-label="Edit note paragraph"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteEntryId(note.id)}
                                  className="p-1.5 text-neutral-500 hover:text-[#000000] transition cursor-pointer"
                                  title="Delete paragraph"
                                  aria-label="Delete note paragraph"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={notesEndRef} />
                </div>
              </div>

              {/* Bottom-Anchored Signature Block matching Permit Notes Template.docx */}
              <div className="pt-12 text-[11.5pt] leading-[1.42] text-[#000000] select-text overflow-x-auto">
                <p className="m-0 whitespace-pre [tab-size:8]">{MCDOT_FOOTER_LINE_1}</p>
                <p className="m-0 whitespace-pre [tab-size:8]">{MCDOT_FOOTER_LINE_2}</p>
              </div>
            </div>
          )}

          {/* OPTIONAL SPECS VIEW */}
          {activeView === 'specs' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  <span>MAG &amp; MCDOT Field Specifications Reference</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveView('notes')}
                  className="min-h-[44px] h-11 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-blue-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer select-none"
                >
                  <span>← Back to Permit Notes Sheet</span>
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={specAiQuestion}
                    onChange={(e) => setSpecAiQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && specAiQuestion.trim() && !isSpecAiLoading) {
                        e.preventDefault();
                        setIsSpecAiLoading(true);
                        setSpecAiError(null);
                        fetch('/api/gemini/mag-spec-search', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            question: specAiQuestion.trim(),
                            permitContext: {
                              tcNumber: permit.tcNumber,
                              permitType: permit.permitType,
                              location: permit.location,
                            },
                          }),
                        })
                          .then((r) => r.json())
                          .then((d) => {
                            setSpecAiResult(d);
                            setIsSpecAiLoading(false);
                          })
                          .catch((err) => {
                            setSpecAiError(err.message);
                            setIsSpecAiLoading(false);
                          });
                      }
                    }}
                    placeholder="Ask MAG / MCDOT spec question (e.g. driveway MAG 250 or CLSM trench depth)..."
                    className="flex-1 min-h-[44px] h-11 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    disabled={isSpecAiLoading || !specAiQuestion.trim()}
                    onClick={() => {
                      if (!specAiQuestion.trim()) return;
                      setIsSpecAiLoading(true);
                      setSpecAiError(null);
                      fetch('/api/gemini/mag-spec-search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          question: specAiQuestion.trim(),
                          permitContext: {
                            tcNumber: permit.tcNumber,
                            permitType: permit.permitType,
                            location: permit.location,
                          },
                        }),
                      })
                        .then((r) => r.json())
                        .then((d) => {
                          setSpecAiResult(d);
                          setIsSpecAiLoading(false);
                        })
                        .catch((err) => {
                          setSpecAiError(err.message);
                          setIsSpecAiLoading(false);
                        });
                    }}
                    className="min-h-[44px] min-w-[44px] h-11 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs sm:text-sm px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer select-none shrink-0"
                  >
                    {isSpecAiLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span>Lookup</span>
                  </button>
                </div>

                {specAiResult && (
                  <div className="bg-white border border-slate-300 rounded-xl p-3.5 space-y-2.5 text-gray-900">
                    <span className="text-xs font-mono font-extrabold text-slate-800 block">
                      {specAiResult.primaryCitation}
                    </span>
                    <p className="text-xs sm:text-sm text-gray-900 leading-relaxed font-medium">
                      {specAiResult.answer}
                    </p>
                    {specAiResult.suggestedNoteSnippet && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveView('notes');
                          handleAppendLogEntry(specAiResult.suggestedNoteSnippet, {
                            exactStandard: true,
                          });
                        }}
                        className="min-h-[44px] h-11 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer select-none"
                      >
                        <CornerDownLeft className="w-4 h-4" />
                        <span>Append Spec Note to Sheet</span>
                      </button>
                    )}
                  </div>
                )}
                {specAiError && (
                  <p className="text-xs text-rose-300 font-semibold">{specAiError}</p>
                )}
              </div>

              <div className="space-y-2.5">
                <input
                  type="text"
                  value={specSearchQuery}
                  onChange={(e) => setSpecSearchQuery(e.target.value)}
                  placeholder="Filter MAG / MCDOT specs..."
                  className="w-full min-h-[44px] h-11 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-400"
                />
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'driveways', label: 'Driveways (MAG 250)' },
                    { id: 'trenching', label: 'Trench & CLSM (MAG 200-1)' },
                    { id: 'telecom', label: 'Telecom (48" Cover)' },
                    { id: 'pavement', label: 'Pavement Cuts' },
                    { id: 'traffic_control', label: 'Traffic Control' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSpecCategory(cat.id)}
                      className={`min-h-[44px] h-11 text-xs font-bold px-3.5 py-2 rounded-xl border flex items-center cursor-pointer select-none transition ${
                        specCategory === cat.id
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow'
                          : 'bg-slate-950 text-slate-200 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {searchMagMcdotSpecs(specSearchQuery, specCategory).map((spec) => (
                  <div
                    key={spec.id}
                    className="bg-white border border-slate-300 rounded-xl p-3.5 space-y-2.5 text-gray-900 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-mono font-extrabold text-gray-900">
                        {spec.specCitation} — {spec.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(spec.standardNoteSnippet);
                          setCopiedSpecId(spec.id);
                          setTimeout(() => setCopiedSpecId(null), 2000);
                        }}
                        className="min-h-[44px] min-w-[44px] h-11 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer select-none shrink-0"
                      >
                        {copiedSpecId === spec.id ? (
                          <Check className="w-4 h-4 text-emerald-700" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-700" />
                        )}
                        <span>{copiedSpecId === spec.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                      {spec.quickSummary}
                    </p>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 border border-slate-300 rounded-xl p-3">
                      <span className="text-xs font-mono text-gray-900 font-semibold leading-relaxed">
                        {spec.standardNoteSnippet}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveView('notes');
                          handleAppendLogEntry(spec.standardNoteSnippet, {
                            exactStandard: true,
                          });
                        }}
                        className="min-h-[44px] h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm px-3.5 py-2 rounded-xl shrink-0 cursor-pointer select-none flex items-center justify-center"
                      >
                        + Log Note
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OPTIONAL PHOTOS VIEW */}
          {activeView === 'photos' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  <span>Compressed Field Photos ({noteFile.photos.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveView('notes')}
                  className="min-h-[44px] h-11 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-blue-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer select-none"
                >
                  <span>← Back to Permit Notes Sheet</span>
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  value={photoCaption}
                  onChange={(e) => setPhotoCaption(e.target.value)}
                  placeholder="Optional photo note (e.g. Pre-con sign-in sheet, MAG 250 forms)..."
                  className="flex-1 min-w-[200px] min-h-[44px] h-11 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-400"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressingPhoto}
                  className="min-h-[44px] h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer select-none"
                >
                  <Camera className="w-4 h-4" />
                  <span>{isCompressingPhoto ? 'Compressing...' : 'Capture / Add Photo'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {noteFile.photos.map((photo) => {
                  const previewSrc = photoObjectUrls[photo.id] || photo.dataUrl || '';
                  return (
                    <div
                      key={photo.id}
                      className="bg-white border border-slate-300 rounded-xl overflow-hidden flex flex-col shadow-sm"
                    >
                      {previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={photo.caption}
                          className="aspect-video object-cover w-full"
                        />
                      ) : (
                        <div className="aspect-video w-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-500">
                          Loading photo...
                        </div>
                      )}
                      <div className="p-2.5 flex items-center justify-between gap-2 text-xs">
                        <span className="text-gray-900 font-semibold truncate">{photo.caption}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = {
                              ...noteFileRef.current,
                              photos: noteFileRef.current.photos.filter((p) => p.id !== photo.id),
                            };
                            setNoteFile(updated);
                            noteFileRef.current = updated;
                            saveLocalPermitNote(updated);
                            void deletePhotoBlob(photo.id);
                          }}
                          className="min-w-[44px] min-h-[44px] p-3 rounded-xl text-rose-700 hover:text-rose-800 hover:bg-rose-50 flex items-center justify-center cursor-pointer shrink-0"
                          title="Remove photo"
                        aria-label="Remove photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3. ANCHORED HIGH-CONTRAST LIFECYCLE-AWARE 1-TAP & VOICE DICTATION BOTTOM BAR */}
        <div className="bg-slate-950 border-t-2 border-slate-700 px-3 py-2.5 shrink-0 space-y-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.65)]">
          {/* Expandable Smart [Pre-Con Builder] Quick-Prompt Drawer */}
          {isPreConOpen && (
            <div className="bg-slate-900 border-2 border-amber-500/70 rounded-xl p-3 space-y-2.5 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-300 uppercase tracking-wide">
                  <Wand2 className="w-4 h-4 text-amber-400" />
                  <span>MCDOT Pre-Con Builder</span>
                  <span className="text-[11px] font-medium normal-case text-slate-200 hidden sm:inline">
                    — Speak or type contact + phone &amp; road/scope
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    stopPreConDictation();
                    setIsPreConOpen(false);
                  }}
                  className="min-w-[44px] min-h-[44px] p-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl flex items-center justify-center cursor-pointer"
                  aria-label="Close Pre-Con Builder"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={togglePreConDictation}
                  className={`min-h-[44px] min-w-[44px] h-11 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 shrink-0 transition cursor-pointer select-none ${
                    isRecordingPreCon
                      ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  {isRecordingPreCon ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                  <span>{isRecordingPreCon ? 'Stop' : 'Speak'}</span>
                </button>

                <input
                  type="text"
                  value={preConPrompt}
                  onChange={(e) => {
                    setPreConPrompt(e.target.value);
                    setPreConCustomPreview(null);
                  }}
                  placeholder='e.g. "Rick with Courtland Homes (480-694-5434), driveway on Baker Dr" or "Abe Garcia 623-826-4367 underground fiber"'
                  className="flex-1 min-h-[44px] h-11 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none"
                />
              </div>

              {isRecordingPreCon && preConInterim && (
                <div className="text-xs text-emerald-300 font-medium italic px-1 truncate">
                  Listening: {preConInterim}
                </div>
              )}

              {/* Live Editable MCDOT Standard Pre-Con Paragraph Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-200">
                  <span className="font-semibold">
                    Standard MCDOT Pre-Con Paragraph (
                    {builtPreCon.scopeKind === 'driveway'
                      ? 'Driveway MAG Detail 250 / Pour vs Asphalt'
                      : 'Underground MAG Detail 200-1 / 48" Cover & 1/2-Sack CLSM'}
                    ):
                  </span>
                  {preConCustomPreview !== null && (
                    <button
                      type="button"
                      onClick={() => setPreConCustomPreview(null)}
                      className="min-h-[44px] px-3 rounded-lg text-amber-300 hover:text-amber-200 hover:bg-slate-800 font-bold text-xs flex items-center cursor-pointer"
                    >
                      Reset to auto
                    </button>
                  )}
                </div>
                <textarea
                  rows={3}
                  value={effectivePreConParagraph}
                  onChange={(e) => setPreConCustomPreview(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs sm:text-sm text-gray-900 font-medium leading-relaxed focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCommitPreConBuilder}
                  className="min-h-[44px] h-11 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition cursor-pointer select-none"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Log Pre-Con Paragraph to Notes</span>
                </button>
              </div>
            </div>
          )}

          {/* Row 1: Lifecycle-Aware 1-Tap Standard Entries + [Pre-Con Builder] (minimum 44px touch targets) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {/* Smart [Pre-Con Builder] Toggle Pill */}
            <button
              type="button"
              onClick={() => {
                setActiveView('notes');
                setIsPreConOpen((prev) => !prev);
              }}
              className={`min-h-[44px] min-w-[44px] h-11 px-3.5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shrink-0 border transition cursor-pointer select-none ${
                isPreConOpen
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                  : lifecycleBarState.recommendPreConBuilder
                  ? 'bg-amber-500/25 hover:bg-amber-500/35 text-amber-200 border-amber-400/80 ring-1 ring-amber-400/40'
                  : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-slate-700'
              }`}
              title="Open Smart Pre-Con Builder (generates full standard MCDOT pre-con paragraph with 2025 Pre-Construction Agenda packet)"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Pre-Con Builder</span>
              {lifecycleBarState.hasPreCon && (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
            </button>

            {/* Exact 5 MCDOT Standard 1-Tap Pills (ordered & highlighted by current lifecycle stage) */}
            {lifecycleBarState.pills.map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  setActiveView('notes');
                  handleAppendLogEntry(pill.text, { exactStandard: true });
                }}
                className={`min-h-[44px] min-w-[44px] h-11 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 border transition cursor-pointer select-none ${
                  pill.recommended
                    ? 'bg-blue-600/35 hover:bg-blue-600/50 text-white border-blue-400/90 shadow-xs'
                    : pill.alreadyInNotes
                    ? 'bg-slate-900/80 hover:bg-slate-800 text-slate-200 border-slate-700'
                    : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-600'
                }`}
                title={`1-Tap Log: "${pill.text}"`}
              >
                {pill.alreadyInNotes ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Plus className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span>{pill.label}</span>
              </button>
            ))}
          </div>

          {/* Live Continuous Voice Dictation Status Banner */}
          {(isRecordingVoice || isFormattingVoice) && (
            <div className="flex items-center justify-between gap-2 bg-rose-950/80 border border-rose-500/70 rounded-xl px-3.5 py-2 text-xs text-rose-100">
              <div className="flex items-center gap-2 min-w-0">
                {isFormattingVoice ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-300 shrink-0" />
                    <span className="font-bold text-amber-200">
                      Formatting MCDOT field narrative &amp; syncing .DOCX...
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
                    <span className="font-extrabold uppercase tracking-wide text-rose-200 shrink-0">
                      Continuous Mic ON:
                    </span>
                    <span className="truncate italic text-white">
                      {interimTranscript ||
                        noteInputText ||
                        'Speak naturally — pauses will not cut you off. Tap Stop & Log when done.'}
                    </span>
                  </>
                )}
              </div>
              {isRecordingVoice && (
                <button
                  type="button"
                  onClick={() => stopMainVoiceDictation(false)}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-rose-400/40 text-xs font-bold text-white shrink-0 cursor-pointer select-none"
                >
                  Keep in box
                </button>
              )}
            </div>
          )}

          {/* Row 2: Prominent Continuous [Voice Dictate] Toggle + Note Input + 1-Tap [Log] */}
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={toggleMainVoiceDictation}
              disabled={isFormattingVoice}
              className={`min-h-[48px] min-w-[48px] h-12 px-4 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0 shadow-lg transition active:scale-[0.98] cursor-pointer select-none ${
                isRecordingVoice
                  ? 'bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-300 animate-pulse'
                  : 'bg-blue-600 hover:bg-blue-500 text-white ring-1 ring-blue-400/50'
              }`}
              title="Continuous Voice Dictation — formats speech into MM/DD/YYYY MAC, Site visit performed. ... and syncs .DOCX"
            >
              {isRecordingVoice ? (
                <>
                  <MicOff className="w-5 h-5 shrink-0" />
                  <span>Stop &amp; Log</span>
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5 shrink-0" />
                  <span>Voice Dictate</span>
                </>
              )}
            </button>

            <input
              type="text"
              value={noteInputText}
              onChange={(e) => setNoteInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (isRecordingVoice) {
                    stopMainVoiceDictation(true);
                  } else if (noteInputText.trim()) {
                    handleAppendLogEntry(noteInputText, { isVoiceOrFreeform: true });
                  }
                }
              }}
              placeholder='Type field note or contact (e.g. "Abe Garcia (623) 826-4367 — inspected MAG 250 driveway forms")...'
              className="flex-1 min-w-0 min-h-[48px] h-12 bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-xl px-3.5 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none"
            />

            <button
              type="button"
              onClick={() => {
                if (isRecordingVoice) {
                  stopMainVoiceDictation(true);
                } else {
                  handleAppendLogEntry(noteInputText, { isVoiceOrFreeform: true });
                }
              }}
              disabled={isFormattingVoice || (!noteInputText.trim() && !isRecordingVoice)}
              className="min-h-[48px] min-w-[48px] h-12 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shrink-0 shadow-lg transition cursor-pointer select-none"
              title="Append formatted MM/DD/YYYY MAC, [Note text] paragraph and sync .DOCX to Google Drive"
            >
              <Send className="w-4 h-4 shrink-0" />
              <span className="hidden xs:inline">Log</span>
            </button>
          </div>
        </div>
      </div>

      {/* Inline Google OAuth 2.0 Client ID Configuration Modal */}
      <GoogleClientIdModal
        isOpen={isClientIdModalOpen}
        onClose={() => setIsClientIdModalOpen(false)}
        initialError={driveAuthErrorInfo?.isClientConfigError ? driveAuthErrorInfo.message : null}
        onSaveAndConnect={(savedClientId) => {
          setIsClientIdModalOpen(false);
          handleReauthorizeDrive(savedClientId);
        }}
      />
    </div>
  );
}

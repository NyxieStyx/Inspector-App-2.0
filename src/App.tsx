import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { Permit, GPSPosition, PermitNoteFile } from './types/permit';
import {
  INITIAL_MARICOPA_PERMITS,
  getNearestPermits,
  normalizePermitExpirationStatus,
  isActionableActivePermit,
  calculateDistanceMiles,
  calculateBearingDegrees,
  resolvePermitCardContact,
  formatPermitCrossStreetAndScope,
  getClarifiedPermitStatusInfo,
} from './utils/maricopaPermitsData';
import {
  GEOFENCE_RADIUS_METERS,
  calculateDistanceMeters,
  getScopeComplianceChecklist,
  classifyBeaconShape,
  classifyPermitSeverity,
  ParsedAiFieldLog,
} from './utils/geofenceUtils';
import {
  buildSmartCorridorFeed,
  CorridorClusterGroup,
} from './utils/corridorClusterUtils';
import {
  initAuth,
  logout,
  requestDriveReauthorization,
  verifyAndRefreshDriveToken,
  hasValidCachedDriveToken,
  setInMemoryDriveToken,
} from './services/firebaseAuth';
import {
  isRunningInIframe,
  getStandaloneAppUrl,
  classifyDriveOAuthError,
  requestDriveAccessTokenSync,
  fetchDriveUserProfile,
  setCachedDriveAccessToken,
  getConfiguredGoogleClientId,
  DriveAuthErrorInfo,
} from './services/googleDriveClient';
import PermitMap from './components/PermitMap';
import NavigationHUD from './components/NavigationHUD';
import PermitDetailModal from './components/PermitDetailModal';
import DriveSyncAuthBanner from './components/DriveSyncAuthBanner';
import GoogleClientIdModal from './components/GoogleClientIdModal';
import OnSiteHeroCard from './components/OnSiteHeroCard';
import SwipeablePermitCard from './components/SwipeablePermitCard';
import CorridorClusterCard from './components/CorridorClusterCard';
import DriveModeHUD from './components/DriveModeHUD';
import HoldToSpeakModal from './components/HoldToSpeakTrigger';
import {
  FileText,
  Mic,
  Shield,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  LogOut,
  User,
  Radio,
  Crosshair,
  WifiOff,
  X,
  BookOpen,
  Calendar,
  Check,
  FolderOpen,
  CloudUpload,
  Sun,
  Moon,
  Gauge,
  Layers,
} from 'lucide-react';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  cachePermitsLocally,
  getCachedPermitsLocally,
  STORAGE_ERROR_EVENT,
  SYNC_QUEUE_UPDATED_EVENT,
  enqueueOfflineSync,
  getOfflineSyncQueue,
  getOfflineSyncQueueAsync,
  clearOfflineSyncByTcNumber,
} from './services/offlineStorage';
import {
  getInspectorSession,
  clearInspectorSession,
  formatShiftRemaining,
  InspectorOktaSession,
} from './services/oktaAuthService';
import OktaSignInModal from './components/OktaSignInModal';
import MagSpecGuideModal from './components/MagSpecGuideModal';
import TodaysRouteLogModal from './components/TodaysRouteLogModal';
import { isPermitVisitedToday } from './utils/shiftLogUtils';
import {
  getLocalPermitNote,
  saveLocalPermitNote,
  createInitialLocalNotes,
  syncPermitNoteStateToDrive,
  discoverPermitNotesDriveFolder,
  DiscoveredDriveFolder,
} from './services/driveService';
import {
  MCDOT_INSPECTOR_NAME,
  MCDOT_INSPECTOR_CODE,
  formatMcdotLogRow,
  stripLogRowDecorations,
} from './utils/docxExport';
import {
  extractContactsFromPermitNotes,
  inferPermitLifecycleStage,
  MCDOT_STANDARD_NOTE_ENTRIES,
} from './utils/permitNotesIntelligence';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

export default function App() {
  const isOnline = useOnlineStatus();

  // "Arizona High-Noon" Sun-Shield Daylight Theme (default) vs Night/OLED Dark Mode
  const [themeMode, setThemeMode] = useState<'daylight' | 'oled'>(() => {
    if (typeof window === 'undefined') return 'daylight';
    try {
      return localStorage.getItem('mcdot_ui_theme') === 'oled' ? 'oled' : 'daylight';
    } catch {
      return 'daylight';
    }
  });

  useLayoutEffect(() => {
    const isOled = themeMode === 'oled';
    document.documentElement.classList.toggle('dark', isOled);
    try {
      localStorage.setItem('mcdot_ui_theme', themeMode);
    } catch {}
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isOled ? '#05080f' : '#f8fafc');
    }
  }, [themeMode]);

  // Google Maps demo quota & auth state
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [mapsAuthFailed, setMapsAuthFailed] = useState(false);
  const hasMapsApiKey = Boolean(MAPS_API_KEY) && !mapsAuthFailed;

  useEffect(() => {
    const prevFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      setMapsAuthFailed(true);
      if (typeof prevFailure === 'function') prevFailure();
    };
    return () => {
      (window as any).gm_authFailure = prevFailure;
    };
  }, []);

  // Authentication state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Permits state - starts with local cached or initial permits (with expiration status enforced)
  const [allPermits, setAllPermits] = useState<Permit[]>(() => {
    const cached = getCachedPermitsLocally();
    const source = cached.length > 0 ? cached : INITIAL_MARICOPA_PERMITS;
    return source.map((p) => normalizePermitExpirationStatus(p));
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter] = useState<string>('ALL');
  const [activeOnly, setActiveOnly] = useState<boolean>(true);

  // User location tracking: Live GPS vs. Manual Pin Placement Override
  const [isManualOverride, setIsManualOverride] = useState<boolean>(false);
  const [, setActiveWatchId] = useState<number | null>(null);
  const [followMode, setFollowMode] = useState<boolean>(true);
  const [recenterCount, setRecenterCount] = useState<number>(0);

  // Responsive Split-Cockpit detector (>= 768px: Unfolded Galaxy Z Fold, Pixel Fold, iPad, Truck Tablet)
  const [isSplitCockpit, setIsSplitCockpit] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsSplitCockpit(e.matches);
    setIsSplitCockpit(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Speed-Aware Drive Mode (>10 mph) vs Site Mode state & Smart Corridor Cluster expansion state
  const [cockpitModeOverride, setCockpitModeOverride] = useState<'site' | 'drive' | null>(null);
  const [simulatedDriveSpeedMph, setSimulatedDriveSpeedMph] = useState<number>(0);
  const [driveTargetIndex, setDriveTargetIndex] = useState<number>(0);
  const [expandedClusterIds, setExpandedClusterIds] = useState<Set<string>>(new Set());
  const [batchLoggingClusterId, setBatchLoggingClusterId] = useState<string | null>(null);

  // 150m Geofence Simulated Auto-Arrival & Quick Compliance State
  const [isSimulatedArrival, setIsSimulatedArrival] = useState<boolean>(false);
  const [simulatedSiteIndex, setSimulatedSiteIndex] = useState<number>(0);
  const preSimGpsRef = React.useRef<{ gps: GPSPosition; wasManual: boolean } | null>(null);
  const [complianceChecksByTc, setComplianceChecksByTc] = useState<Record<string, string[]>>({});
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());

  // Hold-to-Speak AI Field Log Modal State
  const [isHoldToSpeakOpen, setIsHoldToSpeakOpen] = useState<boolean>(false);
  const [holdToSpeakTargetPermit, setHoldToSpeakTargetPermit] = useState<Permit | null>(null);

  // Synchronous refs for event listeners and geolocation callbacks
  const watchIdRef = React.useRef<number | null>(null);
  const isManualOverrideRef = React.useRef<boolean>(false);
  isManualOverrideRef.current = isManualOverride || isSimulatedArrival;
  const lastDeviceGpsRef = React.useRef<{ lat: number; lng: number } | null>(null);

  // Workspace container ref for measuring available height for the mobile pull-up bottom sheet
  const workspaceRef = React.useRef<HTMLDivElement | null>(null);

  // MCDOT RIT (Road Information Tool) live cross-referencing state
  const [ritSyncStatus, setRitSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('synced');
  const [lastRitSyncTime, setLastRitSyncTime] = useState<Date | null>(null);

  // GPS position state (defaults to MCDOT RIT sector)
  const [currentGps, setCurrentGps] = useState<GPSPosition>({
    lat: 33.7315,
    lng: -112.535,
    accuracy: 10,
    heading: 45,
    speed: 0,
    isSimulated: true,
  });

  // Active interaction states
  const [selectedPermit, setSelectedPermit] = useState<Permit | null>(null);
  const [navigatingPermit, setNavigatingPermit] = useState<Permit | null>(null);
  const [inspectingPermit, setInspectingPermit] = useState<Permit | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);

  // Google Drive Sync & Connection Modal state (Zero-Chrome: strictly inside Drive Sync modal)
  const [driveModalError, setDriveModalError] = useState<DriveAuthErrorInfo | null>(null);
  const [driveModalStatusMsg, setDriveModalStatusMsg] = useState<string | null>(null);
  const [activeDriveFolder, setActiveDriveFolder] = useState<DiscoveredDriveFolder | null>(null);
  const [isDiscoveringFolder, setIsDiscoveringFolder] = useState(false);
  const [isSyncingAllNotes, setIsSyncingAllNotes] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState<{
    current: number;
    total: number;
    currentTc: string;
  } | null>(null);
  const [showSyncAllConfirm, setShowSyncAllConfirm] = useState(false);
  const [isClientIdModalOpen, setIsClientIdModalOpen] = useState(false);
  const inPreviewIframe = useMemo(() => isRunningInIframe(), []);
  const standaloneAppUrl = useMemo(() => getStandaloneAppUrl(), []);

  // MAG Specs and Today's Route Log Modals
  const [isMagSpecModalOpen, setIsMagSpecModalOpen] = useState(false);
  const [isRouteLogModalOpen, setIsRouteLogModalOpen] = useState(false);

  // Batch Multi-Permit Logger State
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedBatchPermitIds, setSelectedBatchPermitIds] = useState<Set<string>>(new Set());
  const [batchNoteInput, setBatchNoteInput] = useState('');

  // 'Visited Today' Tracker, Storage Quota Alert & Offline Sync Queue Re-render triggers
  const [visitedTick, setVisitedTick] = useState(0);
  const [storageErrorMsg, setStorageErrorMsg] = useState<string | null>(null);
  const [offlineQueueTick, setOfflineQueueTick] = useState(0);
  const [queuedSyncTcs, setQueuedSyncTcs] = useState<Set<string>>(
    () => new Set(getOfflineSyncQueue().map((item) => item.tcNumber.trim()))
  );

  // Listen for real localStorage / IndexedDB write failures and offline sync queue updates
  useEffect(() => {
    const handleStorageError = (evt: Event) => {
      const detail = (evt as CustomEvent<{ message?: string }>).detail;
      setStorageErrorMsg(detail?.message || 'Storage full — export or sync logs now');
    };
    const refreshQueue = () => {
      setOfflineQueueTick((t) => t + 1);
      void getOfflineSyncQueueAsync().then((items) => {
        setQueuedSyncTcs(new Set(items.map((item) => item.tcNumber.trim())));
      });
    };

    window.addEventListener(STORAGE_ERROR_EVENT, handleStorageError);
    window.addEventListener(SYNC_QUEUE_UPDATED_EVENT, refreshQueue);
    refreshQueue();
    return () => {
      window.removeEventListener(STORAGE_ERROR_EVENT, handleStorageError);
      window.removeEventListener(SYNC_QUEUE_UPDATED_EVENT, refreshQueue);
    };
  }, []);

  // Scan all locally stored PermitNoteFile records for Sync All Notes & Drive folder status
  const localPermitNoteFiles = useMemo(() => {
    const results: PermitNoteFile[] = [];
    if (typeof window === 'undefined') return results;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mcdot_permit_notes_')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as PermitNoteFile;
            if (parsed && parsed.tcNumber) {
              results.push(parsed);
            }
          }
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
    return results.sort((a, b) => a.tcNumber.localeCompare(b.tcNumber));
  }, [visitedTick, offlineQueueTick, showSignInModal, accessToken]);

  const [expandedVisitedIds, setExpandedVisitedIds] = useState<Set<string>>(new Set());
  const [collapseLoggedToday] = useState<boolean>(true);
  const [quickLoggingTc, setQuickLoggingTc] = useState<string | null>(null);

  const unsyncedNoteFiles = useMemo(
    () =>
      localPermitNoteFiles.filter(
        (nf) =>
          nf.hasUnsyncedChanges ||
          !nf.lastSyncedAt ||
          !nf.driveFileId ||
          queuedSyncTcs.has(nf.tcNumber.trim())
      ),
    [localPermitNoteFiles, queuedSyncTcs]
  );

  const unsyncedNoteCount = unsyncedNoteFiles.length;

  const visitedTcNumbers = useMemo(() => {
    const visited = new Set<string>();
    for (const p of allPermits) {
      if (isPermitVisitedToday(p.tcNumber)) {
        visited.add(p.tcNumber);
      }
    }
    return visited;
  }, [allPermits, visitedTick]);

  // Maricopa County Okta SSO Session State (Once per shift)
  const [inspectorSession, setInspectorSession] = useState<InspectorOktaSession | null>(() =>
    getInspectorSession()
  );
  const [isOktaModalOpen, setIsOktaModalOpen] = useState(false);
  const [shiftTimeRemaining, setShiftTimeRemaining] = useState<string>('');

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type?: 'info' | 'success' | 'warning';
  } | null>(null);

  const showToast = useCallback((text: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setToastMessage({ text, type });
  }, []);

  // Toggle individual compliance checkbox for a permit TC#
  const handleToggleComplianceCheck = useCallback((tcNumber: string, itemId: string) => {
    const cleanTc = tcNumber.trim();
    setComplianceChecksByTc((prev) => {
      const current = new Set(prev[cleanTc] || []);
      if (current.has(itemId)) {
        current.delete(itemId);
      } else {
        current.add(itemId);
      }
      return { ...prev, [cleanTc]: Array.from(current) };
    });
  }, []);

  // Log Scope-Specific Compliance Checks (GPS-stamped) from On-Site Hero Card or Quick-Inspection Card
  const handleLogComplianceChecks = useCallback(
    async (permit: Permit) => {
      const cleanTc = permit.tcNumber.trim();
      setQuickLoggingTc(cleanTc);

      const checklist = getScopeComplianceChecklist(permit);
      const checkedSet = new Set(complianceChecksByTc[cleanTc] || []);
      const verifiedItems = checklist.filter((item) => checkedSet.has(item.id));

      const now = new Date();
      const nowIso = now.toISOString();
      const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const gpsLat = currentGps.lat.toFixed(5);
      const gpsLng = currentGps.lng.toFixed(5);

      const noteBody =
        verifiedItems.length > 0
          ? `On-site field inspection performed (GPS ${gpsLat}, ${gpsLng} @ ${timeLabel}). Verified [${verifiedItems
              .map((v) => v.label)
              .join(', ')}]: ${verifiedItems.map((v) => v.logPhrase).join('; ')}.`
          : `On-site field inspection performed (GPS ${gpsLat}, ${gpsLng} @ ${timeLabel}). ${MCDOT_STANDARD_NOTE_ENTRIES.LOGGED}`;

      const existingFile = getLocalPermitNote(cleanTc) || createInitialLocalNotes(permit);
      const newEntry = {
        id: `onsite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        inspector: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
        text: noteBody,
        voiceDictated: false,
      };

      const updatedFile: PermitNoteFile = {
        ...existingFile,
        inspectorNotes: [...(existingFile.inspectorNotes || []), newEntry],
        hasUnsyncedChanges: true,
        auditTrail: [
          ...(existingFile.auditTrail || []),
          {
            timestamp: nowIso,
            action: `On-Site Compliance Check (${verifiedItems.length}/3 verified @ GPS ${gpsLat}, ${gpsLng})`,
            user: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
          },
        ],
      };

      const saveResult = saveLocalPermitNote(updatedFile);
      if (!saveResult.ok) {
        setQuickLoggingTc(null);
        setStorageErrorMsg(saveResult.error || 'Storage full — export or sync logs now');
        showToast(saveResult.error || 'Storage full — could not save on-site check', 'warning');
        return;
      }
      setVisitedTick((t) => t + 1);

      const hasValidToken = Boolean(accessToken && hasValidCachedDriveToken(accessToken));
      if (hasValidToken && accessToken && isOnline) {
        try {
          const refreshed = (await verifyAndRefreshDriveToken(accessToken)) || accessToken;
          if (refreshed !== accessToken) setAccessToken(refreshed);
          await syncPermitNoteStateToDrive(refreshed, permit, updatedFile);
          await clearOfflineSyncByTcNumber(cleanTc);
          setVisitedTick((t) => t + 1);
          showToast(
            `Logged ${verifiedItems.length || 'Pass'} on-site check & synced to Google Drive (${cleanTc})`,
            'success'
          );
        } catch (err: any) {
          await enqueueOfflineSync(cleanTc, 'NOTE', { tcNumber: cleanTc }, err?.message);
          showToast(
            `On-site check saved locally (${cleanTc}) — queued for retry in Drive Sync`,
            'warning'
          );
        } finally {
          setQuickLoggingTc(null);
        }
      } else {
        await enqueueOfflineSync(cleanTc, 'NOTE', { tcNumber: cleanTc }, 'Offline or Drive not connected');
        setQuickLoggingTc(null);
        showToast(
          `On-site check logged (${cleanTc}) — queued in Drive Sync`,
          'success'
        );
      }
    },
    [accessToken, complianceChecksByTc, currentGps.lat, currentGps.lng, isOnline, showToast]
  );

  // Save Gemini-Parsed Hold-to-Speak AI Field Log & Queue/Sync to Google Drive
  const handleSaveParsedAiLog = useCallback(
    async (permit: Permit, parsed: ParsedAiFieldLog) => {
      const cleanTc = permit.tcNumber.trim();
      const existingFile = getLocalPermitNote(cleanTc) || createInitialLocalNotes(permit);

      const cleanedNarrative = stripLogRowDecorations(parsed.cleanNarrative || '');
      const formattedText = /\bGPS\b/i.test(cleanedNarrative)
        ? cleanedNarrative
        : `${cleanedNarrative} (${parsed.gpsStamp}).`;
      const newEntry = {
        id: `ai-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: parsed.timestamp || new Date().toISOString(),
        inspector: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
        text: formattedText,
        voiceDictated: true,
      };

      const updatedFile: PermitNoteFile = {
        ...existingFile,
        inspectorNotes: [...(existingFile.inspectorNotes || []), newEntry],
        hasUnsyncedChanges: true,
        auditTrail: [
          ...(existingFile.auditTrail || []),
          {
            timestamp: new Date().toISOString(),
            action: `Hold-to-Speak AI Voice Log (${parsed.workStatus} · ${parsed.gpsStamp})`,
            user: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
          },
        ],
      };

      const saveResult = saveLocalPermitNote(updatedFile);
      if (!saveResult.ok) {
        setStorageErrorMsg(saveResult.error || 'Storage full — export or sync logs now');
        showToast(saveResult.error || 'Storage full — could not save voice log', 'warning');
        return;
      }
      setVisitedTick((t) => t + 1);

      const hasValidToken = Boolean(accessToken && hasValidCachedDriveToken(accessToken));
      if (hasValidToken && accessToken && isOnline) {
        try {
          const refreshed = (await verifyAndRefreshDriveToken(accessToken)) || accessToken;
          if (refreshed !== accessToken) setAccessToken(refreshed);
          await syncPermitNoteStateToDrive(refreshed, permit, updatedFile);
          await clearOfflineSyncByTcNumber(cleanTc);
          setVisitedTick((t) => t + 1);
          showToast(`AI Voice Log structured & synced to Google Drive (${cleanTc})`, 'success');
        } catch (err: any) {
          await enqueueOfflineSync(cleanTc, 'NOTE', { tcNumber: cleanTc }, err?.message);
          showToast(
            `AI Voice Log saved locally & queued for Drive retry (${cleanTc})`,
            'warning'
          );
        }
      } else {
        await enqueueOfflineSync(cleanTc, 'NOTE', { tcNumber: cleanTc }, 'Offline or Drive not connected');
        showToast(
          `AI Voice Log saved locally & queued in Drive Sync (${cleanTc})`,
          'success'
        );
      }
    },
    [accessToken, isOnline, showToast]
  );

  // Batch Apply Notes Handler
  const handleBatchApplyNotes = async (noteText: string) => {
    const trimmed = noteText.trim();
    if (!trimmed || selectedBatchPermitIds.size === 0) return;

    const count = selectedBatchPermitIds.size;
    const nowIso = new Date().toISOString();
    const activeToken = accessToken
      ? (await verifyAndRefreshDriveToken(accessToken)) || accessToken
      : null;
    if (activeToken && activeToken !== accessToken) {
      setAccessToken(activeToken);
    }

    let savedCount = 0;
    let storageFailed = false;
    for (const permitId of selectedBatchPermitIds) {
      const permit = allPermits.find((p) => p.id === permitId);
      if (!permit) continue;

      const file = getLocalPermitNote(permit.tcNumber) || createInitialLocalNotes(permit);
      const newUpdate = {
        id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: nowIso,
        inspector: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
        text: trimmed,
        voiceDictated: false,
      };

      const updatedFile = {
        ...file,
        inspectorNotes: [...file.inspectorNotes, newUpdate],
        hasUnsyncedChanges: true,
      };
      const saveResult = saveLocalPermitNote(updatedFile);
      if (!saveResult.ok) {
        storageFailed = true;
        setStorageErrorMsg(saveResult.error || 'Storage full — export or sync logs now');
        break;
      }
      savedCount++;

      const cleanTc = permit.tcNumber.trim();
      if (activeToken && isOnline) {
        syncPermitNoteStateToDrive(activeToken, permit, updatedFile)
          .then(() => clearOfflineSyncByTcNumber(cleanTc))
          .catch((err) => enqueueOfflineSync(cleanTc, 'NOTE', { tcNumber: cleanTc }, err?.message));
      } else {
        void enqueueOfflineSync(cleanTc, 'NOTE', { tcNumber: cleanTc }, 'Offline or Drive not connected');
      }
    }

    setBatchNoteInput('');
    setIsBatchMode(false);
    setSelectedBatchPermitIds(new Set());
    setVisitedTick((t) => t + 1);
    if (storageFailed) {
      showToast(
        `Storage full after saving ${savedCount}/${count} permits — export or sync logs now`,
        'warning'
      );
    } else {
      showToast(
        activeToken && isOnline
          ? `Logged & syncing notes across ${savedCount} permits to Google Drive!`
          : `Saved notes locally across ${savedCount} permits — queued in Drive Sync`,
        activeToken && isOnline ? 'success' : 'warning'
      );
    }
  };

  // Swipe-Right / 1-Tap "No Work / Pass (GPS Logged)" Quick-Log Action
  const handleQuickDriveByNoWork = useCallback(
    async (permit: Permit) => {
      const cleanTc = permit.tcNumber.trim();
      setQuickLoggingTc(cleanTc);

      const now = new Date();
      const nowIso = now.toISOString();
      const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const gpsLat = currentGps.lat.toFixed(5);
      const gpsLng = currentGps.lng.toFixed(5);

      const quickDriveByNoteText = `${MCDOT_STANDARD_NOTE_ENTRIES.NO_CREW} (GPS Logged: ${gpsLat}, ${gpsLng} @ ${timeLabel}).`;

      const existingFile = getLocalPermitNote(cleanTc) || createInitialLocalNotes(permit);

      const newEntry = {
        id: `driveby-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        inspector: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
        text: quickDriveByNoteText,
        voiceDictated: false,
      };

      const updatedFile: PermitNoteFile = {
        ...existingFile,
        inspectorNotes: [...(existingFile.inspectorNotes || []), newEntry],
        hasUnsyncedChanges: true,
        auditTrail: [
          ...(existingFile.auditTrail || []),
          {
            timestamp: nowIso,
            action: `No Work / Pass (GPS Logged ${gpsLat}, ${gpsLng})`,
            user: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
          },
        ],
      };

      const saveResult = saveLocalPermitNote(updatedFile);
      if (!saveResult.ok) {
        setQuickLoggingTc(null);
        setStorageErrorMsg(saveResult.error || 'Storage full — export or sync logs now');
        showToast(saveResult.error || 'Storage full — could not save drive-by log', 'warning');
        return;
      }
      setVisitedTick((t) => t + 1);

      const hasValidToken = Boolean(accessToken && hasValidCachedDriveToken(accessToken));
      if (hasValidToken && accessToken && isOnline) {
        try {
          const refreshed = (await verifyAndRefreshDriveToken(accessToken)) || accessToken;
          if (refreshed !== accessToken) {
            setAccessToken(refreshed);
          }
          await syncPermitNoteStateToDrive(refreshed, permit, updatedFile);
          await clearOfflineSyncByTcNumber(cleanTc);
          setVisitedTick((t) => t + 1);
          showToast(`No Work / Pass (GPS Logged) synced to Google Drive (${cleanTc})`, 'success');
        } catch (err: any) {
          await enqueueOfflineSync(cleanTc, 'NOTE', { tcNumber: cleanTc }, err?.message);
          showToast(
            `No Work / Pass saved locally (${cleanTc}) — queued for retry in Drive Sync`,
            'warning'
          );
        } finally {
          setQuickLoggingTc(null);
        }
      } else {
        await enqueueOfflineSync(cleanTc, 'NOTE', { tcNumber: cleanTc }, 'Offline or Drive not connected');
        setQuickLoggingTc(null);
        showToast(
          `No Work / Pass (GPS Logged: ${cleanTc}) — queued in Drive Sync`,
          'success'
        );
      }
    },
    [accessToken, currentGps.lat, currentGps.lng, isOnline, showToast]
  );

  // One-Tap Corridor Cluster 'Pass / No Work All' GPS Batch Logger
  const handlePassAllCorridorPermits = useCallback(
    async (cluster: CorridorClusterGroup) => {
      if (!cluster.permits.length) return;
      setBatchLoggingClusterId(cluster.clusterId);

      const now = new Date();
      const nowIso = now.toISOString();
      const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const gpsLat = currentGps.lat.toFixed(5);
      const gpsLng = currentGps.lng.toFixed(5);
      const corridorNoteText = `${MCDOT_STANDARD_NOTE_ENTRIES.NO_CREW} (Corridor Pass · GPS ${gpsLat}, ${gpsLng} @ ${timeLabel}).`;

      const hasValidToken = Boolean(accessToken && hasValidCachedDriveToken(accessToken));
      const refreshedToken =
        hasValidToken && accessToken
          ? (await verifyAndRefreshDriveToken(accessToken)) || accessToken
          : null;
      if (refreshedToken && refreshedToken !== accessToken) {
        setAccessToken(refreshedToken);
      }

      const updatedPairs: Array<{ permit: Permit; file: PermitNoteFile }> = [];
      for (const permit of cluster.permits) {
        const cleanTc = permit.tcNumber.trim();
        const existingFile = getLocalPermitNote(cleanTc) || createInitialLocalNotes(permit);
        const newEntry = {
          id: `corridor-pass-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: nowIso,
          inspector: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
          text: corridorNoteText,
          voiceDictated: false,
        };
        const updatedFile: PermitNoteFile = {
          ...existingFile,
          inspectorNotes: [...(existingFile.inspectorNotes || []), newEntry],
          hasUnsyncedChanges: true,
          auditTrail: [
            ...(existingFile.auditTrail || []),
            {
              timestamp: nowIso,
              action: `Corridor Pass / No Work All (${cluster.corridorName} @ GPS ${gpsLat}, ${gpsLng})`,
              user: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
            },
          ],
        };
        const saveResult = saveLocalPermitNote(updatedFile);
        if (!saveResult.ok) {
          setStorageErrorMsg(saveResult.error || 'Storage full — export or sync logs now');
          setBatchLoggingClusterId(null);
          showToast(
            saveResult.error || 'Storage full — corridor pass partially saved',
            'warning'
          );
          return;
        }
        updatedPairs.push({ permit, file: updatedFile });
      }

      setVisitedTick((t) => t + 1);

      if (refreshedToken && isOnline) {
        try {
          for (const pair of updatedPairs) {
            await syncPermitNoteStateToDrive(refreshedToken, pair.permit, pair.file);
            await clearOfflineSyncByTcNumber(pair.permit.tcNumber.trim());
          }
          setVisitedTick((t) => t + 1);
          showToast(
            `Logged Pass / No Work across all ${cluster.totalCount} permits on ${cluster.corridorName} & synced to Spark Notes`,
            'success'
          );
        } catch (err: any) {
          for (const pair of updatedPairs) {
            await enqueueOfflineSync(
              pair.permit.tcNumber.trim(),
              'NOTE',
              { tcNumber: pair.permit.tcNumber.trim() },
              err?.message
            );
          }
          showToast(
            `Logged Pass / No Work across ${cluster.totalCount} permits on ${cluster.corridorName} — queued in Drive Sync`,
            'warning'
          );
        } finally {
          setBatchLoggingClusterId(null);
        }
      } else {
        for (const pair of updatedPairs) {
          await enqueueOfflineSync(
            pair.permit.tcNumber.trim(),
            'NOTE',
            { tcNumber: pair.permit.tcNumber.trim() },
            'Offline or Drive not connected'
          );
        }
        setBatchLoggingClusterId(null);
        showToast(
          `Logged Pass / No Work across all ${cluster.totalCount} permits on ${cluster.corridorName} — queued in Drive Sync`,
          'success'
        );
      }
    },
    [accessToken, currentGps.lat, currentGps.lng, isOnline, showToast]
  );

  // Auto-dismiss toast after 4.5 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Update shift timer countdown & auto-expire
  useEffect(() => {
    if (!inspectorSession) {
      setShiftTimeRemaining('');
      return;
    }
    const updateTime = () => {
      const remaining = formatShiftRemaining(inspectorSession.shiftExpiresAt);
      if (remaining === 'Shift expired') {
        clearInspectorSession();
        setInspectorSession(null);
        showToast('Inspector shift session expired. Please re-authenticate.', 'warning');
      } else {
        setShiftTimeRemaining(remaining);
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, [inspectorSession, showToast]);

  // Interactive Draggable Mobile Bottom Sheet (< 768px) over Full-Screen Map
  // Proportional heights ensure map + drawer always stay readable on short/narrow viewports
  const [workspaceHeight, setWorkspaceHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.max(220, window.innerHeight - 128) : 640
  );
  const peekHeight = useMemo(
    () => Math.min(112, Math.max(68, Math.round(workspaceHeight * 0.22))),
    [workspaceHeight]
  );
  const halfHeight = useMemo(
    () =>
      Math.min(
        Math.round(workspaceHeight * 0.56),
        Math.max(peekHeight + 44, Math.round(workspaceHeight * 0.46))
      ),
    [workspaceHeight, peekHeight]
  );
  const fullHeight = useMemo(
    () => Math.max(halfHeight + 40, Math.round(workspaceHeight * 0.88)),
    [workspaceHeight, halfHeight]
  );

  const sheetPanelRef = React.useRef<HTMLElement | null>(null);
  const [sheetHeightPx, setSheetHeightPx] = useState<number>(() => {
    const initialWorkspace =
      typeof window !== 'undefined' ? Math.max(220, window.innerHeight - 128) : 640;
    return Math.round(initialWorkspace * 0.46);
  });
  const [isDraggingSheet, setIsDraggingSheet] = useState<boolean>(false);

  useLayoutEffect(() => {
    if (sheetPanelRef.current) {
      sheetPanelRef.current.style.height = `${sheetHeightPx}px`;
    }
  }, [sheetHeightPx]);

  const sheetDragStateRef = React.useRef<{
    pointerId: number | null;
    startY: number;
    startHeight: number;
    lastY: number;
    lastTime: number;
    velocityY: number;
    maxDeltaY: number;
  }>({
    pointerId: null,
    startY: 0,
    startHeight: 300,
    lastY: 0,
    lastTime: 0,
    velocityY: 0,
    maxDeltaY: 0,
  });

  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;

    const updateBounds = () => {
      const measured = el.getBoundingClientRect().height;
      if (measured > 80) {
        setWorkspaceHeight(measured);
        const minH = Math.min(112, Math.max(68, Math.round(measured * 0.22)));
        const maxH = Math.max(minH + 60, Math.round(measured * 0.88));
        setSheetHeightPx((prev) => Math.min(maxH, Math.max(minH, prev)));
      }
    };

    updateBounds();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => updateBounds());
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      window.addEventListener('resize', updateBounds);
      return () => window.removeEventListener('resize', updateBounds);
    }
  }, []);

  const snapSheetTo = useCallback(
    (target: 'peek' | 'half' | 'full') => {
      if (target === 'peek') setSheetHeightPx(peekHeight);
      else if (target === 'half') setSheetHeightPx(halfHeight);
      else setSheetHeightPx(fullHeight);
    },
    [peekHeight, halfHeight, fullHeight]
  );

  const handleSheetPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const targetEl = e.target as HTMLElement | null;
      if (targetEl && targetEl.closest('button, input, a, select, textarea')) {
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      e.currentTarget.setPointerCapture(e.pointerId);
      const now = performance.now();
      sheetDragStateRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: sheetHeightPx,
        lastY: e.clientY,
        lastTime: now,
        velocityY: 0,
        maxDeltaY: 0,
      };
      setIsDraggingSheet(true);
    },
    [sheetHeightPx]
  );

  const handleSheetPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = sheetDragStateRef.current;
      if (st.pointerId !== e.pointerId) return;

      const now = performance.now();
      const dt = Math.max(1, now - st.lastTime);
      const instantVy = (e.clientY - st.lastY) / dt;
      st.velocityY = st.velocityY * 0.35 + instantVy * 0.65;
      st.lastY = e.clientY;
      st.lastTime = now;

      const deltaUp = st.startY - e.clientY;
      st.maxDeltaY = Math.max(st.maxDeltaY, Math.abs(deltaUp));

      const nextHeight = Math.min(
        fullHeight,
        Math.max(peekHeight, Math.round(st.startHeight + deltaUp))
      );
      if (sheetPanelRef.current) {
        sheetPanelRef.current.style.height = `${nextHeight}px`;
      }
      setSheetHeightPx(nextHeight);
    },
    [peekHeight, fullHeight]
  );

  const finishSheetPointerDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, wasCancelled = false) => {
      const st = sheetDragStateRef.current;
      if (st.pointerId !== e.pointerId) return;

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}

      st.pointerId = null;
      setIsDraggingSheet(false);

      if (wasCancelled) return;

      if (st.maxDeltaY < 6) {
        if (Math.abs(sheetHeightPx - peekHeight) <= 28) {
          setSheetHeightPx(halfHeight);
        } else if (sheetHeightPx < fullHeight - 48) {
          setSheetHeightPx(fullHeight);
        } else {
          setSheetHeightPx(peekHeight);
        }
        return;
      }

      if (st.velocityY < -0.55) {
        setSheetHeightPx(sheetHeightPx < halfHeight - 24 ? halfHeight : fullHeight);
        return;
      }
      if (st.velocityY > 0.55) {
        setSheetHeightPx(sheetHeightPx > halfHeight + 24 ? halfHeight : peekHeight);
        return;
      }

      const SNAP_MAGNET_PX = 32;
      if (Math.abs(sheetHeightPx - peekHeight) <= SNAP_MAGNET_PX) {
        setSheetHeightPx(peekHeight);
      } else if (Math.abs(sheetHeightPx - halfHeight) <= SNAP_MAGNET_PX) {
        setSheetHeightPx(halfHeight);
      } else if (Math.abs(sheetHeightPx - fullHeight) <= SNAP_MAGNET_PX) {
        setSheetHeightPx(fullHeight);
      }
    },
    [sheetHeightPx, peekHeight, halfHeight, fullHeight]
  );

  const handleSheetHandleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSheetHeightPx((prev) =>
          prev < halfHeight - 10 ? halfHeight : Math.min(fullHeight, prev + 80)
        );
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSheetHeightPx((prev) =>
          prev > halfHeight + 10 ? halfHeight : Math.max(peekHeight, prev - 80)
        );
      } else if (e.key === 'Home') {
        e.preventDefault();
        setSheetHeightPx(fullHeight);
      } else if (e.key === 'End') {
        e.preventDefault();
        setSheetHeightPx(peekHeight);
      }
    },
    [peekHeight, halfHeight, fullHeight]
  );

  const isSheetPeeked = sheetHeightPx <= peekHeight + 24;

  const handleEndShift = () => {
    clearInspectorSession();
    setInspectorSession(null);
    showToast('Signed out of Maricopa Okta SSO. Shift ended.', 'info');
  };

  useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
        setCachedDriveAccessToken(token);
        setDriveModalError(null);
      },
      () => {
        setCurrentUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setActiveDriveFolder(null);
      return;
    }
    let cancelled = false;
    setIsDiscoveringFolder(true);
    discoverPermitNotesDriveFolder(accessToken)
      .then((folder) => {
        if (!cancelled) {
          setActiveDriveFolder(folder);
        }
      })
      .catch((err) => {
        console.warn('Drive folder discovery warning:', err);
      })
      .finally(() => {
        if (!cancelled) {
          setIsDiscoveringFolder(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const stopGpsWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator.geolocation &&
          typeof navigator.geolocation.clearWatch === 'function'
        ) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      } catch (err) {
        console.warn('Geolocation clearWatch warning:', err);
      } finally {
        watchIdRef.current = null;
        setActiveWatchId(null);
      }
    }
  }, []);

  const startGpsWatching = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !('geolocation' in navigator) ||
      !navigator.geolocation ||
      typeof navigator.geolocation.watchPosition !== 'function'
    ) {
      return;
    }

    if (watchIdRef.current !== null) {
      try {
        if (typeof navigator.geolocation.clearWatch === 'function') {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      } catch {
        // Ignore clearWatch errors in sandboxed iframes
      }
      watchIdRef.current = null;
      setActiveWatchId(null);
    }

    try {
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const newLat = pos.coords.latitude;
          const newLng = pos.coords.longitude;
          const prevDevice = lastDeviceGpsRef.current;

          lastDeviceGpsRef.current = {
            lat: newLat,
            lng: newLng,
          };

          if (isManualOverrideRef.current) return;

          setCurrentGps((prev) => {
            let nextHeading = prev.heading ?? 45;
            if (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading)) {
              nextHeading = pos.coords.heading;
            } else if (
              prevDevice &&
              Math.hypot(newLat - prevDevice.lat, newLng - prevDevice.lng) > 0.00004
            ) {
              nextHeading = calculateBearingDegrees(
                prevDevice.lat,
                prevDevice.lng,
                newLat,
                newLng
              );
            }
            return {
              lat: newLat,
              lng: newLng,
              accuracy: pos.coords.accuracy,
              heading: nextHeading,
              speed: pos.coords.speed ?? 0,
              isSimulated: false,
            };
          });
        },
        (err) => {
          console.warn('Geolocation fallback:', err?.message || err);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000,
        }
      );

      watchIdRef.current = id;
      setActiveWatchId(id);
    } catch (err: any) {
      console.warn('Failed to start watchPosition:', err);
    }
  }, []);

  useEffect(() => {
    startGpsWatching();
    return () => {
      stopGpsWatching();
    };
  }, [startGpsWatching, stopGpsWatching]);

  const activeOrigin = useMemo(() => {
    return { lat: currentGps.lat, lng: currentGps.lng };
  }, [currentGps.lat, currentGps.lng]);

  /**
   * Cross-reference MCDOT Road Information Tool (RIT) Layer 15
   */
  const syncWithMcdotRit = useCallback(
    async (
      lat: number,
      lng: number,
      bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }
    ) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setRitSyncStatus('offline');
        const cached = getCachedPermitsLocally();
        if (cached && cached.length > 0) {
          setAllPermits(cached.map((p) => normalizePermitExpirationStatus(p)));
        }
        return;
      }

      setRitSyncStatus('syncing');
      try {
        let url = `/api/mcdot/rit-permits?lat=${lat}&lng=${lng}`;
        if (bounds) {
          url += `&minLat=${bounds.minLat}&maxLat=${bounds.maxLat}&minLng=${bounds.minLng}&maxLng=${bounds.maxLng}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('MCDOT RIT stream unavailable');

        const data = await res.json();
        if (data.success && Array.isArray(data.permits)) {
          setLastRitSyncTime(new Date());
          setRitSyncStatus('synced');

          setAllPermits((prev) => {
            const initialByTc = new Map<string, Permit>();
            for (const initP of INITIAL_MARICOPA_PERMITS) {
              initialByTc.set(initP.tcNumber.trim(), initP);
            }

            const map = new Map<string, Permit>();
            data.permits.forEach((ritPermit: Permit) => {
              const cleanTc = ritPermit.tcNumber.trim();
              const knownInitial = initialByTc.get(cleanTc);
              if (knownInitial) {
                const ritHasGenericLoc =
                  !ritPermit.location ||
                  ritPermit.location.includes('•') ||
                  ritPermit.location.includes('Maricopa County ROW');

                map.set(cleanTc, {
                  ...knownInitial,
                  ...ritPermit,
                  location: ritHasGenericLoc ? knownInitial.location : ritPermit.location,
                  contractor: ritPermit.contractor || knownInitial.contractor,
                  projectTitle:
                    !ritPermit.projectTitle ||
                    ritPermit.projectTitle === 'Right-of-Way Permit Work' ||
                    ritPermit.projectTitle === 'Driveway'
                      ? knownInitial.projectTitle
                      : ritPermit.projectTitle,
                  issueDate: ritPermit.issueDate ?? knownInitial.issueDate,
                  expirationDate: ritPermit.expirationDate ?? knownInitial.expirationDate,
                });
              } else {
                map.set(cleanTc, ritPermit);
              }
            });

            prev.forEach((p) => {
              const cleanTc = p.tcNumber.trim();
              if (!map.has(cleanTc)) {
                map.set(cleanTc, p);
              }
            });

            INITIAL_MARICOPA_PERMITS.forEach((initP) => {
              const cleanTc = initP.tcNumber.trim();
              if (!map.has(cleanTc)) {
                map.set(cleanTc, initP);
              }
            });

            const mergedAll = Array.from(map.values()).map((p) =>
              normalizePermitExpirationStatus(p)
            );
            cachePermitsLocally(mergedAll);
            return mergedAll;
          });
        } else {
          setRitSyncStatus('offline');
        }
      } catch (err) {
        console.warn('MCDOT RIT stream unavailable, using offline cache:', err);
        setRitSyncStatus('offline');
        const cached = getCachedPermitsLocally();
        if (cached && cached.length > 0) {
          setAllPermits(cached.map((p) => normalizePermitExpirationStatus(p)));
        }
      }
    },
    []
  );

  const activeOriginRef = React.useRef<{ lat: number; lng: number }>({
    lat: activeOrigin.lat,
    lng: activeOrigin.lng,
  });
  activeOriginRef.current = activeOrigin;
  const lastRitSyncOriginRef = React.useRef<{ lat: number; lng: number } | null>(null);

  const handleBoundsChange = useCallback(
    (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
      syncWithMcdotRit(activeOriginRef.current.lat, activeOriginRef.current.lng, bounds);
    },
    [syncWithMcdotRit]
  );

  useEffect(() => {
    const prevSync = lastRitSyncOriginRef.current;
    const movedMiles = prevSync
      ? calculateDistanceMiles(prevSync.lat, prevSync.lng, activeOrigin.lat, activeOrigin.lng)
      : Infinity;

    if (movedMiles >= 0.25) {
      lastRitSyncOriginRef.current = { lat: activeOrigin.lat, lng: activeOrigin.lng };
      syncWithMcdotRit(activeOrigin.lat, activeOrigin.lng);
    }
  }, [activeOrigin.lat, activeOrigin.lng, syncWithMcdotRit]);

  useEffect(() => {
    const interval = setInterval(() => {
      const orig = activeOriginRef.current;
      lastRitSyncOriginRef.current = { lat: orig.lat, lng: orig.lng };
      syncWithMcdotRit(orig.lat, orig.lng);
    }, 60000);

    return () => clearInterval(interval);
  }, [syncWithMcdotRit]);

  const candidatePermits = useMemo(() => {
    if (!activeOnly) return allPermits;
    return allPermits.filter(isActionableActivePermit);
  }, [allPermits, activeOnly]);

  const closestPermits = useMemo(() => {
    return getNearestPermits(activeOrigin.lat, activeOrigin.lng, candidatePermits);
  }, [activeOrigin.lat, activeOrigin.lng, candidatePermits]);

  const displayedPermits = useMemo(() => {
    void visitedTick;
    let list = [...closestPermits];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = allPermits
        .filter(
          (p) =>
            p.tcNumber.toLowerCase().includes(q) ||
            (p.projectTitle || '').toLowerCase().includes(q) ||
            (p.contractor || '').toLowerCase().includes(q) ||
            (p.contractorContact || '').toLowerCase().includes(q) ||
            (p.location || '').toLowerCase().includes(q)
        )
        .map((p) => ({
          ...p,
          distanceMiles: calculateDistanceMiles(activeOrigin.lat, activeOrigin.lng, p.lat, p.lng),
        }))
        .sort((a, b) => {
          const aExactTc =
            a.tcNumber.toLowerCase() === q
              ? 0
              : a.tcNumber.toLowerCase().startsWith(q)
              ? 1
              : 2;
          const bExactTc =
            b.tcNumber.toLowerCase() === q
              ? 0
              : b.tcNumber.toLowerCase().startsWith(q)
              ? 1
              : 2;
          if (aExactTc !== bExactTc) return aExactTc - bExactTc;
          return (a.distanceMiles || 0) - (b.distanceMiles || 0);
        });
    } else {
      list.sort((a, b) => {
        const aVisited = visitedTcNumbers.has(a.tcNumber);
        const bVisited = visitedTcNumbers.has(b.tcNumber);
        const aStage = inferPermitLifecycleStage(
          getLocalPermitNote(a.tcNumber)?.inspectorNotes || []
        );
        const bStage = inferPermitLifecycleStage(
          getLocalPermitNote(b.tcNumber)?.inspectorNotes || []
        );
        const aDeprioritized = aVisited || aStage === 'Closed' ? 1 : 0;
        const bDeprioritized = bVisited || bStage === 'Closed' ? 1 : 0;
        if (aDeprioritized !== bDeprioritized) return aDeprioritized - bDeprioritized;
        return (a.distanceMiles || 0) - (b.distanceMiles || 0);
      });
    }

    if (statusFilter !== 'ALL') {
      list = list.filter((p) => p.status === statusFilter);
    }

    return list.slice(0, 16);
  }, [
    closestPermits,
    allPermits,
    searchQuery,
    statusFilter,
    activeOrigin.lat,
    activeOrigin.lng,
    visitedTcNumbers,
    visitedTick,
  ]);

  // Smart Corridor Clustering Feed (groups 2+ adjacent permits sharing Road Corridor + Contractor)
  const corridorFeed = useMemo(() => {
    void visitedTick;
    return buildSmartCorridorFeed(displayedPermits, visitedTcNumbers);
  }, [displayedPermits, visitedTcNumbers, visitedTick]);

  // Resolve parent Corridor Cluster if inspectingPermit belongs to one (enables 1-tap sibling TC# switching)
  const inspectingCorridorCluster = useMemo(() => {
    if (!inspectingPermit) return null;
    const cleanTc = inspectingPermit.tcNumber.trim();
    for (const entry of corridorFeed) {
      if (
        entry.kind === 'cluster' &&
        entry.cluster.permits.some((p) => p.tcNumber.trim() === cleanTc)
      ) {
        return entry.cluster;
      }
    }
    return null;
  }, [inspectingPermit, corridorFeed]);

  // Live 150-Meter Geofence Proximity Check around active Patrol GPS
  const onSiteArrival = useMemo(() => {
    let best: { permit: Permit; distanceMeters: number } | null = null;
    for (const p of candidatePermits) {
      const distM = calculateDistanceMeters(currentGps.lat, currentGps.lng, p.lat, p.lng);
      if (distM <= GEOFENCE_RADIUS_METERS) {
        if (!best || distM < best.distanceMeters) {
          best = {
            permit: {
              ...p,
              distanceMiles: calculateDistanceMiles(currentGps.lat, currentGps.lng, p.lat, p.lng),
            },
            distanceMeters: distM,
          };
        }
      }
    }
    return best;
  }, [candidatePermits, currentGps.lat, currentGps.lng]);

  // Speed-Aware Drive Mode (>10 mph) vs Site Mode computation
  const liveGpsSpeedMph = Math.max(0, (currentGps.speed || 0) * 2.23694);
  const effectiveSpeedMph = Math.max(liveGpsSpeedMph, simulatedDriveSpeedMph);
  const effectiveCockpitMode: 'site' | 'drive' = useMemo(() => {
    if (cockpitModeOverride) return cockpitModeOverride;
    if (onSiteArrival) return 'site';
    if (effectiveSpeedMph > 10) return 'drive';
    return 'site';
  }, [cockpitModeOverride, onSiteArrival, effectiveSpeedMph]);

  const handleSelectCockpitMode = useCallback(
    (mode: 'site' | 'drive') => {
      if (mode === 'drive') {
        setCockpitModeOverride('drive');
        if (liveGpsSpeedMph <= 10) {
          setSimulatedDriveSpeedMph(34);
        }
      } else {
        setCockpitModeOverride('site');
        setSimulatedDriveSpeedMph(0);
      }
    },
    [liveGpsSpeedMph]
  );

  // Simulated "Test Auto-Arrival (150m)" Toggle & Site Cycler
  const handleExitSimulatedArrival = useCallback(() => {
    setIsSimulatedArrival(false);
    const saved = preSimGpsRef.current;
    preSimGpsRef.current = null;
    if (saved) {
      setIsManualOverride(saved.wasManual);
      isManualOverrideRef.current = saved.wasManual;
      setCurrentGps(saved.gps);
      if (!saved.wasManual) {
        setFollowMode(true);
        startGpsWatching();
      }
    } else {
      setIsManualOverride(false);
      isManualOverrideRef.current = false;
      setFollowMode(true);
      startGpsWatching();
    }
    setRecenterCount((c) => c + 1);
    showToast('Exited simulated 150m auto-arrival. Resumed Patrol GPS.', 'info');
  }, [startGpsWatching, showToast]);

  const handleToggleSimulatedArrival = useCallback(() => {
    if (isSimulatedArrival) {
      handleExitSimulatedArrival();
      return;
    }

    const pool = displayedPermits.length > 0 ? displayedPermits : candidatePermits;
    if (pool.length === 0) return;

    const firstUnvisitedIdx = pool.findIndex((p) => !visitedTcNumbers.has(p.tcNumber));
    const idx = firstUnvisitedIdx >= 0 ? firstUnvisitedIdx : 0;
    const target = pool[idx];

    preSimGpsRef.current = {
      gps: currentGps,
      wasManual: isManualOverride,
    };

    stopGpsWatching();
    setCockpitModeOverride('site');
    setSimulatedDriveSpeedMph(0);
    setIsSimulatedArrival(true);
    setSimulatedSiteIndex(idx);
    isManualOverrideRef.current = true;
    setFollowMode(true);
    setSelectedPermit(null);

    // Position simulated Patrol GPS ~26m from the permitted site (well inside 150m geofence)
    setCurrentGps({
      lat: target.lat + 0.0002,
      lng: target.lng + 0.00011,
      accuracy: 4,
      heading: 180,
      speed: 0,
      isSimulated: true,
    });
    setRecenterCount((c) => c + 1);

    if (isSheetPeeked) {
      snapSheetTo('half');
    }

    showToast(
      `150m Geofence Auto-Arrival Active: On-Site at ${target.tcNumber}`,
      'success'
    );
  }, [
    isSimulatedArrival,
    handleExitSimulatedArrival,
    displayedPermits,
    candidatePermits,
    visitedTcNumbers,
    currentGps,
    isManualOverride,
    stopGpsWatching,
    isSheetPeeked,
    snapSheetTo,
    showToast,
  ]);

  const handleCycleSimulatedSite = useCallback(() => {
    const pool = INITIAL_MARICOPA_PERMITS.length > 0 ? INITIAL_MARICOPA_PERMITS : candidatePermits;
    if (pool.length === 0) return;
    const nextIdx = (simulatedSiteIndex + 1) % pool.length;
    const target = pool[nextIdx];
    setSimulatedSiteIndex(nextIdx);
    setSelectedPermit(null);
    setCurrentGps({
      lat: target.lat + 0.0002,
      lng: target.lng + 0.00011,
      accuracy: 4,
      heading: 180,
      speed: 0,
      isSimulated: true,
    });
    setRecenterCount((c) => c + 1);
    showToast(`Testing 150m Auto-Arrival at ${target.tcNumber} (${target.permitType})`, 'info');
  }, [candidatePermits, simulatedSiteIndex, showToast]);

  const pinnedPermitWithDistance = useMemo(() => {
    if (!selectedPermit) return null;
    const selTc = selectedPermit.tcNumber.trim();
    const latest =
      allPermits.find((p) => p.tcNumber.trim() === selTc || p.id === selectedPermit.id) ||
      selectedPermit;
    const liveDist = calculateDistanceMiles(
      activeOrigin.lat,
      activeOrigin.lng,
      latest.lat,
      latest.lng
    );
    return {
      ...latest,
      distanceMiles: liveDist,
    };
  }, [selectedPermit, allPermits, activeOrigin.lat, activeOrigin.lng]);

  // Synchronous Google Identity Services (google.accounts.oauth2.initTokenClient) popup OAuth handler
  const handleConnectDriveGis = (options?: {
    forceConsent?: boolean;
    explicitClientId?: string;
  }) => {
    const resolvedClientId = (options?.explicitClientId || getConfiguredGoogleClientId()).trim();
    if (!resolvedClientId) {
      setIsClientIdModalOpen(true);
      showToast(
        'Paste your Google OAuth Client ID to connect Google Drive (saved locally).',
        'info'
      );
      return;
    }

    setDriveModalError(null);
    setDriveModalStatusMsg(null);
    setIsSigningIn(true);

    const started = requestDriveAccessTokenSync({
      clientId: resolvedClientId,
      prompt: options?.forceConsent === false ? '' : 'consent',
      onSuccess: async (token) => {
        setInMemoryDriveToken(token, 3500);
        setAccessToken(token);
        setCachedDriveAccessToken(token);
        setDriveModalError(null);

        const profile = await fetchDriveUserProfile(token);
        if (profile) {
          setCurrentUser({
            email: profile.email,
            displayName: profile.displayName,
            photoURL: profile.photoURL,
          });
          setDriveModalStatusMsg(
            `Connected to Google Drive as ${profile.email} (My Drive › Spark Notes › Permit Notes).`
          );
        } else {
          setDriveModalStatusMsg(
            'Connected to Google Drive (My Drive › Spark Notes › Permit Notes).'
          );
        }

        try {
          const folder = await discoverPermitNotesDriveFolder(token, { forceRefresh: true });
          setActiveDriveFolder(folder);
          showToast(
            `Connected to Google Drive · ${folder.folderPath.replace(/\s*>\s*/g, ' › ')}`,
            'success'
          );
        } catch {
          showToast('Connected to Google Drive!', 'success');
        }

        if (unsyncedNoteCount > 0) {
          void handleSyncUnsyncedItems(token);
        }
        setIsSigningIn(false);
      },
      onError: (errInfo) => {
        setDriveModalError(errInfo);
        setIsSigningIn(false);
        if (errInfo.code === 'missing_client_id') {
          setIsClientIdModalOpen(true);
        }
        showToast(`${errInfo.title}: ${errInfo.remediation}`, 'warning');
      },
    });

    if (!started) {
      setIsSigningIn(false);
    }
  };

  const handleSyncAllNotes = async () => {
    if (!accessToken) {
      setDriveModalError({
        code: 'not_authenticated',
        title: 'Sign In Required Before Syncing',
        message:
          'Connect your Google Drive account above first so MCDOT ROW can save .DOCX files to My Drive › Spark Notes › Permit Notes.',
        remediation: inPreviewIframe
          ? 'Click "Connect Drive" above, or open the app in a standalone tab if Google blocks OAuth inside the preview iframe.'
          : 'Click "Connect Drive" above to authorize Google Drive file access.',
        isIframeBlocked: inPreviewIframe,
        isPopupBlocked: false,
        isCancelled: false,
      });
      return;
    }

    const activeToken = (await verifyAndRefreshDriveToken(accessToken)) || accessToken;
    if (activeToken !== accessToken) {
      setAccessToken(activeToken);
    }

    let filesToSync = [...localPermitNoteFiles];
    if (filesToSync.length === 0 && (inspectingPermit || selectedPermit)) {
      const targetPermit = inspectingPermit || selectedPermit!;
      filesToSync = [createInitialLocalNotes(targetPermit)];
    }

    if (filesToSync.length === 0) {
      setDriveModalStatusMsg(
        'Folder verified! No local permit note files have been created yet — open any permit and add or dictate a note to auto-sync.'
      );
      setShowSyncAllConfirm(false);
      try {
        const folder = await discoverPermitNotesDriveFolder(activeToken);
        setActiveDriveFolder(folder);
      } catch {}
      return;
    }

    setIsSyncingAllNotes(true);
    setShowSyncAllConfirm(false);
    setDriveModalError(null);
    setDriveModalStatusMsg(null);

    let syncedCount = 0;
    let lastFolder: DiscoveredDriveFolder | null = activeDriveFolder;

    try {
      for (let idx = 0; idx < filesToSync.length; idx++) {
        const noteFile = filesToSync[idx];
        const cleanTc = noteFile.tcNumber.trim();
        setSyncAllProgress({
          current: idx + 1,
          total: filesToSync.length,
          currentTc: cleanTc,
        });

        const extractedFromSync = extractContactsFromPermitNotes(noteFile.inspectorNotes || []);
        const matchedPermit: Permit =
          allPermits.find((p) => p.tcNumber.trim() === cleanTc) || {
            id: noteFile.permitId || cleanTc,
            tcNumber: cleanTc,
            projectTitle: cleanTc,
            contractor: extractedFromSync[0]?.company || null,
            contractorPhone: extractedFromSync[0]?.phone || null,
            location: '',
            permitType: 'Trench / Utility',
            status: 'Unknown',
            issueDate: null,
            expirationDate: null,
            lat: currentGps.lat,
            lng: currentGps.lng,
            workWindow: null,
            trafficControlPlan: '',
            specialConditions: [],
            preConCompleted: null,
            hasSignInSheet: false,
            hasBusinessCards: false,
          };

        const summary = await syncPermitNoteStateToDrive(activeToken, matchedPermit, noteFile);
        await clearOfflineSyncByTcNumber(cleanTc);
        syncedCount++;
        lastFolder = {
          folderId: summary.folderId,
          folderName: 'Permit Notes',
          rootFolderId: summary.folderId,
          rootFolderName: 'Spark Notes',
          folderPath: summary.folderPath,
          folderWebViewLink: summary.folderWebViewLink,
        };
      }

      if (lastFolder) {
        setActiveDriveFolder(lastFolder);
      }
      setVisitedTick((t) => t + 1);
      const formattedPath = (
        lastFolder?.folderPath || 'My Drive > Spark Notes > Permit Notes'
      ).replace(/\s*>\s*/g, ' › ');
      setDriveModalStatusMsg(
        `Synced ${syncedCount} Permit Notes .DOCX file${syncedCount === 1 ? '' : 's'} to ${formattedPath}.`
      );
      showToast(
        `Synced ${syncedCount} Permit Notes .DOCX file${syncedCount === 1 ? '' : 's'} to Google Drive!`,
        'success'
      );
    } catch (err: any) {
      setDriveModalError(classifyDriveOAuthError(err));
    } finally {
      setIsSyncingAllNotes(false);
      setSyncAllProgress(null);
    }
  };

  const handleSyncUnsyncedItems = async (overrideToken?: string) => {
    const candidateToken = overrideToken || accessToken;
    if (!candidateToken || !hasValidCachedDriveToken(candidateToken)) {
      showToast(
        'Authorize Google Drive in the sync popover to push unsynced .DOCX permit notes.',
        'warning'
      );
      return;
    }

    const activeToken = (await verifyAndRefreshDriveToken(candidateToken)) || candidateToken;
    if (activeToken !== accessToken) {
      setAccessToken(activeToken);
    }

    const queue =
      unsyncedNoteFiles.length > 0 ? [...unsyncedNoteFiles] : [...localPermitNoteFiles];
    if (queue.length === 0) {
      showToast('All local Permit Notes are already synced with Google Drive!', 'success');
      return;
    }

    setIsSyncingAllNotes(true);
    setDriveModalError(null);

    let pushed = 0;
    let lastFolder: DiscoveredDriveFolder | null = activeDriveFolder;

    try {
      for (let idx = 0; idx < queue.length; idx++) {
        const noteFile = queue[idx];
        const cleanTc = noteFile.tcNumber.trim();
        setSyncAllProgress({
          current: idx + 1,
          total: queue.length,
          currentTc: cleanTc,
        });

        const extracted = extractContactsFromPermitNotes(noteFile.inspectorNotes || []);
        const matchedPermit: Permit =
          allPermits.find((p) => p.tcNumber.trim() === cleanTc) || {
            id: noteFile.permitId || cleanTc,
            tcNumber: cleanTc,
            projectTitle: cleanTc,
            contractor: extracted[0]?.company || null,
            contractorPhone: extracted[0]?.phone || null,
            location: '',
            permitType: 'Trench / Utility',
            status: 'Unknown',
            issueDate: null,
            expirationDate: null,
            lat: currentGps.lat,
            lng: currentGps.lng,
            workWindow: null,
            trafficControlPlan: '',
            specialConditions: [],
            preConCompleted: null,
            hasSignInSheet: false,
            hasBusinessCards: false,
          };

        const summary = await syncPermitNoteStateToDrive(activeToken, matchedPermit, noteFile);
        await clearOfflineSyncByTcNumber(cleanTc);
        pushed++;
        lastFolder = {
          folderId: summary.folderId,
          folderName: 'Permit Notes',
          rootFolderId: summary.folderId,
          rootFolderName: 'Spark Notes',
          folderPath: summary.folderPath,
          folderWebViewLink: summary.folderWebViewLink,
        };
      }

      if (lastFolder) {
        setActiveDriveFolder(lastFolder);
      }
      setVisitedTick((t) => t + 1);
      showToast(
        `Synced ${pushed} Permit Notes .DOCX file${pushed === 1 ? '' : 's'} to Google Drive!`,
        'success'
      );
    } catch (err: any) {
      const classified = classifyDriveOAuthError(err);
      setDriveModalError(classified);
      showToast(classified.title || 'Google Drive sync error — tap Re-Authorize', 'warning');
    } finally {
      setIsSyncingAllNotes(false);
      setSyncAllProgress(null);
    }
  };

  // Auto-retry queued offline Drive uploads when connectivity + valid Drive token return
  const autoRetryTriggeredKeyRef = React.useRef<string>('');
  useEffect(() => {
    if (!isOnline || !accessToken || !hasValidCachedDriveToken(accessToken)) {
      autoRetryTriggeredKeyRef.current = '';
      return;
    }
    if (isSyncingAllNotes || queuedSyncTcs.size === 0) return;

    const retryKey = `${Array.from(queuedSyncTcs).sort().join(',')}`;
    if (autoRetryTriggeredKeyRef.current === retryKey) return;
    autoRetryTriggeredKeyRef.current = retryKey;

    const timer = setTimeout(() => {
      void handleSyncUnsyncedItems(accessToken);
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, accessToken, queuedSyncTcs, isSyncingAllNotes]);

  // Unified Zero-Chrome Drive Sync Modal Trigger
  const handleDriveBadgeClick = () => {
    setDriveModalError(null);
    setShowSyncAllConfirm(false);
    setShowSignInModal(true);
    if (
      unsyncedNoteCount > 0 &&
      accessToken &&
      hasValidCachedDriveToken(accessToken) &&
      !isSyncingAllNotes
    ) {
      void handleSyncUnsyncedItems(accessToken);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setCurrentUser(null);
    setAccessToken(null);
    setActiveDriveFolder(null);
    setDriveModalStatusMsg(
      'Disconnected from Google Drive. Local notes remain saved in this browser.'
    );
  };

  const handleOpenInspectPermit = useCallback((permit: Permit) => {
    setSelectedPermit(permit);
    setFollowMode(false);
    setCockpitModeOverride('site');
    setSimulatedDriveSpeedMph(0);
    setInspectingPermit(permit);
  }, []);

  const handleOpenHoldToSpeakFor = useCallback(
    (permit?: Permit | null) => {
      const chosen =
        permit ||
        onSiteArrival?.permit ||
        pinnedPermitWithDistance ||
        displayedPermits[0] ||
        closestPermits[0] ||
        null;
      setHoldToSpeakTargetPermit(chosen);
      setIsHoldToSpeakOpen(true);
    },
    [onSiteArrival, pinnedPermitWithDistance, displayedPermits, closestPermits]
  );

  const handlePermitUpdated = (updated: Permit) => {
    const cleanTc = updated.tcNumber.trim();
    setAllPermits((prev) =>
      prev.map((p) => (p.tcNumber.trim() === cleanTc || p.id === updated.id ? updated : p))
    );
    if (
      selectedPermit &&
      (selectedPermit.tcNumber.trim() === cleanTc || selectedPermit.id === updated.id)
    ) {
      setSelectedPermit(updated);
    }
    if (
      inspectingPermit &&
      (inspectingPermit.tcNumber.trim() === cleanTc || inspectingPermit.id === updated.id)
    ) {
      setInspectingPermit(updated);
    }
    setVisitedTick((t) => t + 1);
  };

  const handleManualPinPlacement = useCallback(
    (coords: { lat: number; lng: number }) => {
      stopGpsWatching();
      setIsSimulatedArrival(false);
      preSimGpsRef.current = null;
      setIsManualOverride(true);
      isManualOverrideRef.current = true;
      setFollowMode(false);

      setCurrentGps({
        lat: coords.lat,
        lng: coords.lng,
        accuracy: 5,
        heading: 0,
        speed: 0,
        isSimulated: true,
      });

      syncWithMcdotRit(coords.lat, coords.lng);

      showToast(
        `Manual Pin set at ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}. Distance rankings recalculated.`,
        'info'
      );
    },
    [stopGpsWatching, syncWithMcdotRit, showToast]
  );

  const handleResumeGps = useCallback(() => {
    setIsSimulatedArrival(false);
    preSimGpsRef.current = null;
    setIsManualOverride(false);
    isManualOverrideRef.current = false;
    setFollowMode(true);
    setRecenterCount((c) => c + 1);

    if (lastDeviceGpsRef.current) {
      setCurrentGps((prev) => ({
        ...prev,
        lat: lastDeviceGpsRef.current!.lat,
        lng: lastDeviceGpsRef.current!.lng,
        isSimulated: false,
      }));
      syncWithMcdotRit(lastDeviceGpsRef.current.lat, lastDeviceGpsRef.current.lng);
    }

    startGpsWatching();
    showToast('Re-centering on live GPS patrol tracking...', 'info');
  }, [startGpsWatching, syncWithMcdotRit, showToast]);

  const handleTogglePatrolMode = useCallback(() => {
    if (isManualOverride || isSimulatedArrival) {
      handleResumeGps();
    } else {
      handleManualPinPlacement({ lat: currentGps.lat, lng: currentGps.lng });
      showToast('Switched to Manual Pin mode. Tap anywhere on map to relocate pin.', 'info');
    }
  }, [
    isManualOverride,
    isSimulatedArrival,
    handleResumeGps,
    handleManualPinPlacement,
    currentGps.lat,
    currentGps.lng,
    showToast,
  ]);

  const handleStartNavigation = (permit: Permit) => {
    setNavigatingPermit(permit);
    setSelectedPermit(permit);
    setFollowMode(false);
  };

  const handleArrivedAtPermit = (permit: Permit) => {
    setCurrentGps({
      lat: permit.lat,
      lng: permit.lng,
      accuracy: 3,
      isSimulated: true,
    });
    setNavigatingPermit(null);
    handleOpenInspectPermit(permit);
    syncWithMcdotRit(permit.lat, permit.lng);
  };

  // Helper to render an individual Solar-Glare Permit Card (used standalone and inside expanded Corridor Clusters)
  const renderSinglePermitCard = (
    permit: Permit,
    rankIndex: number,
    insideCluster = false
  ) => {
    const cleanTc = permit.tcNumber.trim();
    const isSelected = Boolean(
      selectedPermit &&
        (selectedPermit.tcNumber.trim() === cleanTc || selectedPermit.id === permit.id)
    );
    const isActiveInspection = Boolean(
      inspectingPermit &&
        (inspectingPermit.tcNumber.trim() === cleanTc || inspectingPermit.id === permit.id)
    );
    const isNavigating = Boolean(
      navigatingPermit &&
        (navigatingPermit.tcNumber.trim() === cleanTc || navigatingPermit.id === permit.id)
    );
    const isVisitedToday = visitedTcNumbers.has(permit.tcNumber);
    const isBatchSelected = selectedBatchPermitIds.has(permit.id);

    const localNote = getLocalPermitNote(permit.tcNumber);
    const notes = localNote?.inspectorNotes || [];
    const extractedContacts = extractContactsFromPermitNotes(notes);
    const lifecycleStage = inferPermitLifecycleStage(notes);
    const statusInfo = getClarifiedPermitStatusInfo(permit, lifecycleStage, isVisitedToday);
    const resolvedContact = resolvePermitCardContact(
      permit,
      extractedContacts,
      localNote?.preConContact
    );
    const streetScope = formatPermitCrossStreetAndScope(permit);
    const beaconShape = classifyBeaconShape(permit, isVisitedToday, lifecycleStage);
    const severity = classifyPermitSeverity(permit, isVisitedToday, lifecycleStage);
    const checklist = getScopeComplianceChecklist(permit);
    const checkedSet = new Set(complianceChecksByTc[cleanTc] || []);

    const isAlreadyLoggedCard = isVisitedToday || lifecycleStage === 'Closed';
    const isExpanded = expandedCardIds.has(permit.id);
    const isCardCollapsed =
      !insideCluster &&
      isAlreadyLoggedCard &&
      collapseLoggedToday &&
      !expandedVisitedIds.has(permit.id) &&
      !isExpanded &&
      !isSelected &&
      !isActiveInspection &&
      !isNavigating &&
      !isBatchMode;

    return (
      <SwipeablePermitCard
        key={permit.id}
        permit={permit}
        rankIndex={rankIndex}
        beaconShape={beaconShape}
        severity={severity}
        crossStreet={streetScope.crossStreet}
        keyScope={streetScope.keyScope}
        resolvedContact={resolvedContact}
        statusInfo={statusInfo}
        isVisitedToday={isVisitedToday}
        isSelected={isSelected}
        isActiveInspection={isActiveInspection}
        isNavigating={isNavigating}
        isExpanded={isExpanded}
        isCollapsedLogged={isCardCollapsed}
        isBatchMode={isBatchMode}
        isBatchSelected={isBatchSelected}
        isQuickLogging={quickLoggingTc === cleanTc}
        checklistItems={checklist}
        checkedIds={checkedSet}
        onToggleExpand={() => {
          if (isCardCollapsed) {
            setExpandedVisitedIds((prev) => {
              const next = new Set(prev);
              next.add(permit.id);
              return next;
            });
          }
          setExpandedCardIds((prev) => {
            const next = new Set(prev);
            if (next.has(permit.id)) {
              next.delete(permit.id);
            } else {
              next.add(permit.id);
              setSelectedPermit(permit);
              setFollowMode(false);
            }
            return next;
          });
        }}
        onToggleBatchSelect={() => {
          setSelectedBatchPermitIds((prev) => {
            const next = new Set(prev);
            if (next.has(permit.id)) next.delete(permit.id);
            else next.add(permit.id);
            return next;
          });
        }}
        onSwipePass={() => handleQuickDriveByNoWork(permit)}
        onSwipeNavigate={() => handleStartNavigation(permit)}
        onOpenFullNotes={() => handleOpenInspectPermit(permit)}
        onOpenHoldToSpeak={() => handleOpenHoldToSpeakFor(permit)}
        onToggleComplianceCheck={(itemId) => handleToggleComplianceCheck(cleanTc, itemId)}
        onLogCheckedItems={() => handleLogComplianceChecks(permit)}
      />
    );
  };

  // Unvisited permits prioritized for Drive Mode (>10 mph) Single-Card HUD
  const driveModeCandidates = useMemo(() => {
    const unvisited = displayedPermits.filter((p) => !visitedTcNumbers.has(p.tcNumber));
    return unvisited.length > 0 ? unvisited : displayedPermits;
  }, [displayedPermits, visitedTcNumbers]);

  const clampedDriveIdx =
    driveModeCandidates.length > 0
      ? ((driveTargetIndex % driveModeCandidates.length) + driveModeCandidates.length) %
        driveModeCandidates.length
      : 0;

  const driveModeTargetPermit =
    navigatingPermit || driveModeCandidates[clampedDriveIdx] || displayedPermits[0] || null;

  // Shared Speed-Aware Mode Segmented Switcher ('Site Mode' vs 'Drive Mode (>10 mph)')
  const renderSpeedModeSwitch = (compact = false) => (
    <div className="inline-flex items-center p-0.5 rounded-xl bg-zinc-200 dark:bg-slate-900 border-2 border-[#09090B] dark:border-slate-700 shrink-0">
      <button
        type="button"
        onClick={() => handleSelectCockpitMode('site')}
        className={`min-h-[38px] ${
          compact ? 'px-2.5' : 'px-3'
        } py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
          effectiveCockpitMode === 'site'
            ? 'bg-[#FFFFFF] dark:bg-blue-600 text-[#09090B] dark:text-white shadow-xs'
            : 'text-zinc-700 dark:text-slate-300 hover:text-[#09090B] dark:hover:text-white'
        }`}
        title="Site Mode: Corridor Clusters, Compliance Checks & .DOCX Notes"
      >
        <Layers className="w-3.5 h-3.5 shrink-0" />
        <span>Site Mode</span>
      </button>
      <button
        type="button"
        onClick={() => handleSelectCockpitMode('drive')}
        className={`min-h-[38px] ${
          compact ? 'px-2.5' : 'px-3'
        } py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
          effectiveCockpitMode === 'drive'
            ? 'bg-[#09090B] dark:bg-amber-400 text-white dark:text-[#09090B] shadow-xs'
            : 'text-zinc-700 dark:text-slate-300 hover:text-[#09090B] dark:hover:text-white'
        }`}
        title="Drive Mode (>10 mph): Simplified Single-Card Next Target HUD + Hold-to-Talk Voice Log"
      >
        <Gauge className="w-3.5 h-3.5 shrink-0" />
        <span>Drive {compact ? '>10mph' : 'Mode (>10 mph)'}</span>
      </button>
    </div>
  );

  // Shared Permit & Corridor Cluster Feed Body
  const renderPermitFeedBody = (isMobileDrawer: boolean) => {
    const clusterCount = corridorFeed.filter((e) => e.kind === 'cluster').length;

    if (effectiveCockpitMode === 'drive') {
      return (
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-3 min-h-0 bg-zinc-100 dark:bg-[#090D16]">
          <DriveModeHUD
            targetPermit={driveModeTargetPermit}
            speedMph={effectiveSpeedMph}
            isSimulatedSpeed={simulatedDriveSpeedMph > 0 && liveGpsSpeedMph <= 10}
            isVisitedToday={
              driveModeTargetPermit
                ? visitedTcNumbers.has(driveModeTargetPermit.tcNumber)
                : false
            }
            isNavigating={Boolean(
              navigatingPermit &&
                driveModeTargetPermit &&
                navigatingPermit.tcNumber.trim() === driveModeTargetPermit.tcNumber.trim()
            )}
            gpsCoords={{ lat: currentGps.lat, lng: currentGps.lng }}
            inspectorInitials={MCDOT_INSPECTOR_CODE}
            canCyclePrev={driveModeCandidates.length > 1}
            canCycleNext={driveModeCandidates.length > 1}
            onCycleTarget={(delta) => setDriveTargetIndex((prev) => prev + delta)}
            onStartRoute={(permit) => handleStartNavigation(permit)}
            onOpenVoiceModalFallback={(permit) => handleOpenHoldToSpeakFor(permit)}
            onSaveDirectVoiceLog={handleSaveParsedAiLog}
            onSwitchToSiteMode={() => handleSelectCockpitMode('site')}
          />
        </div>
      );
    }

    return (
      <>
        {/* Search Input + 150m Geofence Test Trigger + Severity Legend */}
        <div className="px-3 py-2.5 border-b-2 border-zinc-400 dark:border-slate-800 bg-[#FFFFFF] dark:bg-slate-900 shrink-0 space-y-2">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-zinc-600 dark:text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => {
                if (isMobileDrawer && isSheetPeeked) {
                  snapSheetTo('half');
                }
              }}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (isMobileDrawer && isSheetPeeked && e.target.value.trim()) {
                  snapSheetTo('half');
                }
              }}
              placeholder="Search TC#, corridor, cross-street, contractor..."
              className="w-full min-h-[44px] h-11 bg-zinc-100 dark:bg-slate-950 border-2 border-zinc-400 dark:border-slate-700 rounded-xl pl-9 pr-10 py-2 text-xs sm:text-sm font-bold text-[#09090B] dark:text-white placeholder-zinc-500 dark:placeholder-slate-400 focus:outline-none focus:border-[#09090B] dark:focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-0.5 min-w-[44px] min-h-[44px] p-2.5 text-[#09090B] dark:text-slate-300 flex items-center justify-center cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleToggleSimulatedArrival}
              className={`flex-1 min-h-[44px] px-3 py-1.5 rounded-xl border-2 text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer select-none whitespace-nowrap ${
                isSimulatedArrival
                  ? 'bg-[#16A34A] text-white border-[#09090B] shadow-xs'
                  : 'bg-zinc-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#09090B] dark:text-slate-100 border-zinc-400 dark:border-slate-600'
              }`}
              title="Simulate entering 150-meter geofence around closest permit"
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isSimulatedArrival ? 'Exit 150m Arrival Test' : 'Test Auto-Arrival (150m)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsBatchMode((prev) => !prev);
                setSelectedBatchPermitIds(new Set());
                if (isMobileDrawer && isSheetPeeked) snapSheetTo('half');
              }}
              className={`min-h-[44px] px-3 py-1.5 rounded-xl border-2 text-xs font-black flex items-center justify-center transition cursor-pointer select-none whitespace-nowrap shrink-0 ${
                isBatchMode
                  ? 'bg-[#F59E0B] text-[#09090B] border-[#09090B]'
                  : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#09090B] dark:text-slate-200 border-zinc-400 dark:border-slate-600'
              }`}
            >
              {isBatchMode ? 'Exit Batch' : 'Batch Log'}
            </button>
          </div>

          {/* 2-Second Severity Edge Legend + Corridor Summary */}
          <div className="flex items-center justify-between gap-2 text-[11px] font-extrabold text-zinc-700 dark:text-slate-300 pt-0.5 flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B]" />
                <span>Pre-Con</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#EA580C]" />
                <span>Trench</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#0284C7]" />
                <span>Issued</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#16A34A]" />
                <span>Logged</span>
              </span>
            </div>
            {clusterCount > 0 && (
              <span className="font-mono tabular-nums text-[#09090B] dark:text-amber-300">
                {clusterCount} Corridor{clusterCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Corridor Cluster & Permit Feed */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-2.5 space-y-2.5 min-h-0 bg-zinc-100 dark:bg-[#090D16]">
          {/* 1. 150m Geofenced On-Site Auto-Arrival Hero Card */}
          {onSiteArrival &&
            (() => {
              const heroPermit = onSiteArrival.permit;
              const cleanTc = heroPermit.tcNumber.trim();
              const localNote = getLocalPermitNote(cleanTc);
              const notes = localNote?.inspectorNotes || [];
              const extracted = extractContactsFromPermitNotes(notes);
              const stage = inferPermitLifecycleStage(notes);
              const isVisitedToday = visitedTcNumbers.has(heroPermit.tcNumber);
              const statusInfo = getClarifiedPermitStatusInfo(heroPermit, stage, isVisitedToday);
              const resolvedContact = resolvePermitCardContact(
                heroPermit,
                extracted,
                localNote?.preConContact
              );
              const streetScope = formatPermitCrossStreetAndScope(heroPermit);
              const checklist = getScopeComplianceChecklist(heroPermit);
              const checkedSet = new Set(complianceChecksByTc[cleanTc] || []);

              return (
                <OnSiteHeroCard
                  permit={heroPermit}
                  distanceMeters={onSiteArrival.distanceMeters}
                  isSimulatedArrival={isSimulatedArrival}
                  crossStreet={streetScope.crossStreet}
                  keyScope={streetScope.keyScope}
                  resolvedContact={resolvedContact}
                  statusInfo={statusInfo}
                  isVisitedToday={isVisitedToday}
                  checklistItems={checklist}
                  checkedIds={checkedSet}
                  isLogging={quickLoggingTc === cleanTc}
                  onToggleCheck={(itemId) => handleToggleComplianceCheck(cleanTc, itemId)}
                  onLogComplianceCheck={() => handleLogComplianceChecks(heroPermit)}
                  onOpenHoldToSpeak={() => handleOpenHoldToSpeakFor(heroPermit)}
                  onOpenFullNotes={() => handleOpenInspectPermit(heroPermit)}
                  onCycleSimulatedSite={
                    isSimulatedArrival ? handleCycleSimulatedSite : undefined
                  }
                  onExitSimulatedArrival={
                    isSimulatedArrival ? handleExitSimulatedArrival : undefined
                  }
                />
              );
            })()}

          {corridorFeed.length === 0 && (
            <div className="p-6 text-center text-zinc-700 dark:text-slate-300 text-xs sm:text-sm font-bold">
              No matching MCDOT ROW permits found for &ldquo;{searchQuery}&rdquo;.
            </div>
          )}

          {/* 2. Smart Corridor Clusters & Standalone Solar-Glare Permit Cards */}
          {corridorFeed.map((entry) => {
            if (entry.kind === 'cluster') {
              const { cluster, firstRankIndex } = entry;
              const isClusterExpanded =
                expandedClusterIds.has(cluster.clusterId) || Boolean(searchQuery.trim());
              const hasActivePermitInside = Boolean(
                (selectedPermit &&
                  cluster.permits.some(
                    (p) =>
                      p.id === selectedPermit.id ||
                      p.tcNumber.trim() === selectedPermit.tcNumber.trim()
                  )) ||
                  (inspectingPermit &&
                    cluster.permits.some(
                      (p) =>
                        p.id === inspectingPermit.id ||
                        p.tcNumber.trim() === inspectingPermit.tcNumber.trim()
                    ))
              );

              const firstUnvisitedInCluster =
                cluster.permits.find((p) => !visitedTcNumbers.has(p.tcNumber)) ||
                cluster.permits[0];

              return (
                <CorridorClusterCard
                  key={cluster.clusterId}
                  cluster={cluster}
                  rankStart={firstRankIndex}
                  isExpanded={isClusterExpanded}
                  isBatchLogging={batchLoggingClusterId === cluster.clusterId}
                  hasActivePermitInside={hasActivePermitInside}
                  onToggleExpand={() => {
                    setExpandedClusterIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(cluster.clusterId)) {
                        next.delete(cluster.clusterId);
                      } else {
                        next.add(cluster.clusterId);
                      }
                      return next;
                    });
                  }}
                  onPassNoWorkAll={() => handlePassAllCorridorPermits(cluster)}
                  onNavigateCorridor={() => handleStartNavigation(firstUnvisitedInCluster)}
                >
                  {cluster.permits.map((p, idx) =>
                    renderSinglePermitCard(p, firstRankIndex + idx, true)
                  )}
                </CorridorClusterCard>
              );
            }

            // Avoid duplicating the active On-Site Hero Card right below itself unless searching
            if (
              !searchQuery.trim() &&
              onSiteArrival &&
              onSiteArrival.permit.tcNumber.trim() === entry.permit.tcNumber.trim()
            ) {
              return null;
            }

            return renderSinglePermitCard(entry.permit, entry.rankIndex, false);
          })}
        </div>

        {/* Batch Corridor Logger Bar */}
        {isBatchMode && (
          <div className="p-3 bg-[#FFFFFF] dark:bg-slate-950 border-t-2 border-[#F59E0B] space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-black text-[#09090B] dark:text-amber-300">
                Batch Log ({selectedBatchPermitIds.size} selected)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedBatchPermitIds(new Set(displayedPermits.map((p) => p.id)))
                  }
                  className="min-h-[38px] px-2.5 rounded-lg bg-zinc-100 dark:bg-slate-900 border-2 border-zinc-400 dark:border-slate-700 text-xs font-black text-[#09090B] dark:text-blue-300 cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBatchPermitIds(new Set())}
                  className="min-h-[38px] px-2.5 rounded-lg bg-zinc-100 dark:bg-slate-900 border-2 border-zinc-400 dark:border-slate-700 text-xs font-black text-[#09090B] dark:text-slate-200 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Permit logged.', text: MCDOT_STANDARD_NOTE_ENTRIES.LOGGED },
                { label: 'TCP approved.', text: MCDOT_STANDARD_NOTE_ENTRIES.TCP_APPROVED },
                { label: 'No crew on site.', text: MCDOT_STANDARD_NOTE_ENTRIES.NO_CREW },
              ].map((pill) => (
                <button
                  key={pill.label}
                  type="button"
                  onClick={() => handleBatchApplyNotes(pill.text)}
                  disabled={selectedBatchPermitIds.size === 0}
                  className="min-h-[42px] text-xs font-black bg-zinc-100 hover:bg-zinc-200 dark:bg-slate-900 dark:hover:bg-slate-800 disabled:opacity-40 text-[#09090B] dark:text-white border-2 border-zinc-400 dark:border-slate-700 rounded-lg px-2.5 py-1.5 cursor-pointer"
                >
                  + {pill.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={batchNoteInput}
                onChange={(e) => setBatchNoteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBatchApplyNotes(batchNoteInput);
                  }
                }}
                placeholder="Custom batch note..."
                className="flex-1 min-h-[44px] bg-zinc-100 dark:bg-slate-900 border-2 border-zinc-400 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-[#09090B] dark:text-white placeholder-zinc-500"
              />
              <button
                type="button"
                disabled={!batchNoteInput.trim() || selectedBatchPermitIds.size === 0}
                onClick={() => handleBatchApplyNotes(batchNoteInput)}
                className="min-h-[44px] bg-[#F59E0B] hover:bg-amber-400 disabled:opacity-40 text-[#09090B] font-black text-xs px-3.5 rounded-xl border-2 border-[#09090B] cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {!isOnline && (
          <div className="p-2 bg-amber-100 dark:bg-amber-950/90 border-t-2 border-[#F59E0B] dark:border-amber-800 text-[#09090B] dark:text-amber-200 text-xs flex items-center gap-1.5 font-black shrink-0">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Offline: Cached permits &amp; local notes active</span>
          </div>
        )}
      </>
    );
  };

  // Shared Docked Tactical Controls (Patrol, Specs, Drive Sync, Hold-to-Speak)
  const renderDockedThumbControls = () => (
    <div className="grid grid-cols-4 gap-1.5 items-center">
      {/* 1. Patrol / Manual Pin */}
      <button
        type="button"
        onClick={handleTogglePatrolMode}
        className={`min-h-[48px] px-2 py-1.5 rounded-xl border-2 text-xs font-black flex flex-col items-center justify-center gap-0.5 transition cursor-pointer select-none ${
          !isManualOverride && !isSimulatedArrival
            ? 'bg-[#0284C7] text-white border-[#09090B] dark:border-sky-400'
            : 'bg-zinc-100 dark:bg-slate-800 text-[#09090B] dark:text-slate-100 border-zinc-400 dark:border-slate-700'
        }`}
        title="Toggle Live Patrol GPS vs Manual Pin"
      >
        {!isManualOverride && !isSimulatedArrival ? (
          <Radio className="w-4 h-4 shrink-0" />
        ) : (
          <Crosshair className="w-4 h-4 text-purple-700 dark:text-amber-300 shrink-0" />
        )}
        <span className="text-[11px] leading-none truncate">
          {!isManualOverride && !isSimulatedArrival ? 'Patrol' : 'Pin Mode'}
        </span>
      </button>

      {/* 2. MAG / MCDOT Specs */}
      <button
        type="button"
        onClick={() => setIsMagSpecModalOpen(true)}
        className="min-h-[48px] px-2 py-1.5 rounded-xl border-2 border-zinc-400 dark:border-slate-700 bg-[#FFFFFF] hover:bg-zinc-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-[#09090B] dark:text-slate-100 text-xs font-black flex flex-col items-center justify-center gap-0.5 transition cursor-pointer select-none"
        title="Open MAG & MCDOT Specifications Guide"
      >
        <BookOpen className="w-4 h-4 text-[#F59E0B] shrink-0" />
        <span className="text-[11px] leading-none truncate">Specs</span>
      </button>

      {/* 3. Google Drive Sync Modal */}
      <button
        type="button"
        onClick={handleDriveBadgeClick}
        className={`min-h-[48px] px-2 py-1.5 rounded-xl border-2 text-xs font-black flex flex-col items-center justify-center gap-0.5 transition cursor-pointer select-none ${
          unsyncedNoteCount > 0
            ? 'bg-amber-50 dark:bg-amber-950/70 border-[#F59E0B] text-[#09090B] dark:text-amber-200'
            : 'bg-[#FFFFFF] hover:bg-zinc-100 dark:bg-slate-900 dark:hover:bg-slate-800 border-zinc-400 dark:border-slate-700 text-[#09090B] dark:text-slate-100'
        }`}
        title="Open Google Drive Sync & Connection Modal"
      >
        <div className="flex items-center gap-1">
          <CloudUpload className="w-4 h-4 text-[#0284C7] dark:text-sky-400 shrink-0" />
          {unsyncedNoteCount > 0 && (
            <span className="text-[10px] font-mono tabular-nums font-black px-1 rounded bg-[#F59E0B] text-[#09090B]">
              {unsyncedNoteCount}
            </span>
          )}
        </div>
        <span className="text-[11px] leading-none truncate">Drive Sync</span>
      </button>

      {/* 4. Prominent Hold-to-Speak AI Field Log */}
      <button
        type="button"
        onClick={() => handleOpenHoldToSpeakFor()}
        className="min-h-[48px] px-2 py-1.5 rounded-xl border-2 border-[#09090B] dark:border-emerald-400 bg-[#16A34A] hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-black flex flex-col items-center justify-center gap-0.5 shadow transition cursor-pointer select-none"
        title="Hold-to-Speak AI Field Log (Voice Dictation -> Gemini -> Drive Queue)"
      >
        <Mic className="w-4 h-4 shrink-0" />
        <span className="text-[11px] leading-none truncate">AI Speak</span>
      </button>
    </div>
  );

  // Active target permit for Hold-to-Speak Modal
  const activeVoicePermit =
    holdToSpeakTargetPermit ||
    inspectingPermit ||
    onSiteArrival?.permit ||
    pinnedPermitWithDistance ||
    displayedPermits[0] ||
    closestPermits[0] ||
    null;

  const activeVoiceCheckedLabels = useMemo(() => {
    if (!activeVoicePermit) return [];
    const cleanTc = activeVoicePermit.tcNumber.trim();
    const ids = new Set(complianceChecksByTc[cleanTc] || []);
    return getScopeComplianceChecklist(activeVoicePermit)
      .filter((i) => ids.has(i.id))
      .map((i) => i.label);
  }, [activeVoicePermit, complianceChecksByTc]);

  const mapNode = (
    <PermitMap
      permits={candidatePermits}
      closestPermits={closestPermits}
      selectedPermit={pinnedPermitWithDistance}
      navigatingPermit={navigatingPermit}
      currentGps={currentGps}
      isManualOverride={isManualOverride}
      followMode={followMode}
      isOnline={isOnline}
      hasMapsApiKey={hasMapsApiKey}
      isDaylightMode={themeMode === 'daylight'}
      onSitePermitId={onSiteArrival?.permit.id || null}
      isSimulatedArrival={isSimulatedArrival}
      visitedTcNumbers={visitedTcNumbers}
      notesRevision={visitedTick}
      recenterTrigger={recenterCount}
      onSelectPermit={(permit) => {
        setSelectedPermit(permit);
        setFollowMode(false);
        if (isSplitCockpit && inspectingPermit) {
          setInspectingPermit(permit);
        }
        if (isSheetPeeked) {
          snapSheetTo('half');
        }
        showToast(`Locked & Pinned Permit ${permit.tcNumber}`, 'info');
      }}
      onStartNavigation={handleStartNavigation}
      onOpenPermitNotes={(permit) => handleOpenInspectPermit(permit)}
      onQuickNoWork={handleQuickDriveByNoWork}
      onArrivedAtPermit={handleArrivedAtPermit}
      onManualPinPlacement={handleManualPinPlacement}
      onResumeGps={handleResumeGps}
      onToggleSimulatedArrival={handleToggleSimulatedArrival}
      onUserPan={() => setFollowMode(false)}
      onBoundsChange={handleBoundsChange}
    />
  );

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-zinc-100 dark:bg-[#05080F] text-[#09090B] dark:text-slate-100 font-sans safe-top safe-bottom safe-left safe-right">
      {/* 1. Google Maps Demo Quota Reached Warning Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-300 text-amber-950 px-4 py-2 text-xs md:text-sm text-center shrink-0 z-50 shadow-sm flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* 1b. Storage Quota / Write Failure Red Alert Banner */}
      {storageErrorMsg && (
        <div
          role="alert"
          className="bg-rose-600 text-white border-b-2 border-rose-900 px-3 py-2 text-xs font-black shrink-0 z-50 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="truncate">{storageErrorMsg}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleDriveBadgeClick}
              className="px-2.5 py-1 rounded-lg bg-white text-rose-700 hover:bg-rose-50 font-black text-[11px] cursor-pointer"
            >
              Sync / Export
            </button>
            <button
              type="button"
              onClick={() => setStorageErrorMsg(null)}
              className="p-1 rounded hover:bg-rose-700 cursor-pointer"
              aria-label="Dismiss storage alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Top Navigation Bar — Solar-Glare Tactical Contrast (#FFFFFF / #09090B / 2px Borders) + Zero-Chrome Drive Setup */}
      <header className="relative bg-[#FFFFFF] dark:bg-slate-900 border-b-2 border-zinc-400 dark:border-slate-800 px-2.5 sm:px-3.5 py-1.5 flex items-center justify-between shrink-0 z-30 gap-2 min-h-[56px]">
        {/* Left: Brand + Live RIT Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#F59E0B] border-2 border-[#09090B] flex items-center justify-center shadow-xs">
              <Shield className="w-4.5 h-4.5 text-[#09090B]" />
            </div>
            <div className="leading-tight">
              <span className="font-black text-xs sm:text-sm text-[#09090B] dark:text-white tracking-tight block">
                MCDOT ROW
              </span>
              <span className="hidden sm:block text-[10px] font-mono font-bold text-zinc-600 dark:text-slate-400">
                {themeMode === 'daylight' ? 'Sun-Shield Daylight' : 'Night OLED'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => syncWithMcdotRit(activeOrigin.lat, activeOrigin.lng)}
            disabled={ritSyncStatus === 'syncing'}
            className="min-h-[44px] px-2.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-slate-950 dark:hover:bg-slate-800 border-2 border-zinc-400 dark:border-slate-700 flex items-center gap-1.5 text-xs font-black text-[#09090B] dark:text-slate-200 transition cursor-pointer select-none"
            title={
              lastRitSyncTime
                ? `MCDOT RIT Live Feed (Synced ${lastRitSyncTime.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}) — Tap to refresh`
                : 'Refresh MCDOT RIT Feed'
            }
          >
            <RefreshCw
              className={`w-3.5 h-3.5 shrink-0 ${
                ritSyncStatus === 'syncing'
                  ? 'text-[#F59E0B] animate-spin'
                  : isOnline
                  ? 'text-[#16A34A] dark:text-emerald-400'
                  : 'text-rose-600'
              }`}
            />
            <span className="hidden lg:inline font-mono text-[11px]">
              {ritSyncStatus === 'syncing' ? 'Syncing' : isOnline ? 'RIT Live' : 'Offline'}
            </span>
          </button>
        </div>

        {/* Right: Active Filter, Route Log, Sun-Shield Daylight / Night OLED Toggle, Drive Sync Modal Button, & SSO */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Active Permits Filter */}
          <button
            type="button"
            onClick={() => setActiveOnly((prev) => !prev)}
            className={`min-h-[44px] h-11 flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-black rounded-xl border-2 transition cursor-pointer select-none shrink-0 ${
              activeOnly
                ? 'bg-emerald-50 dark:bg-emerald-950/90 text-[#09090B] dark:text-emerald-200 border-[#16A34A]'
                : 'bg-zinc-100 dark:bg-slate-800 text-[#09090B] dark:text-slate-200 border-zinc-400 dark:border-slate-700'
            }`}
            title="Toggle Active Permits Only vs All Permits"
          >
            <Filter className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">{activeOnly ? 'Active' : 'All'}</span>
            <span className="text-[11px] font-mono tabular-nums font-black">
              {displayedPermits.length}
            </span>
          </button>

          {/* Today's Shift Route Log */}
          <button
            type="button"
            onClick={() => setIsRouteLogModalOpen(true)}
            className="min-h-[44px] h-11 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-black rounded-xl border-2 border-zinc-400 dark:border-emerald-500/60 bg-[#FFFFFF] hover:bg-zinc-100 dark:bg-slate-950/90 dark:hover:bg-emerald-950/40 text-[#09090B] dark:text-emerald-300 transition cursor-pointer select-none shrink-0"
            title="Today's Shift Route Log"
          >
            <Calendar className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
            <span className="hidden xl:inline">Log</span>
            <span className="text-[11px] font-mono font-black tabular-nums">
              {visitedTcNumbers.size}
            </span>
          </button>

          {/* Sun-Shield Daylight / Night OLED Theme Quick Toggle */}
          <button
            type="button"
            onClick={() =>
              setThemeMode((prev) => (prev === 'daylight' ? 'oled' : 'daylight'))
            }
            className={`min-h-[44px] h-11 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-black rounded-xl border-2 transition cursor-pointer select-none shrink-0 ${
              themeMode === 'daylight'
                ? 'bg-amber-100 hover:bg-amber-200 text-[#09090B] border-[#09090B]'
                : 'bg-slate-950 hover:bg-slate-800 text-amber-300 border-slate-700'
            }`}
            title={
              themeMode === 'daylight'
                ? 'Sun-Shield Daylight Mode Active — Tap to switch to Night/OLED Dark Mode'
                : 'Night/OLED Dark Mode Active — Tap to switch to Sun-Shield Daylight Mode'
            }
          >
            {themeMode === 'daylight' ? (
              <>
                <Sun className="w-4 h-4 text-[#09090B] shrink-0" />
                <span className="hidden sm:inline">Daylight</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="hidden sm:inline">OLED</span>
              </>
            )}
          </button>

          {/* Drive Sync button is docked once in the ergonomic control bar (no duplicate header badge) */}

          {/* Inspector Shift SSO Badge */}
          {inspectorSession ? (
            <button
              type="button"
              onClick={handleEndShift}
              className="min-h-[44px] h-11 px-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-slate-950 dark:hover:bg-slate-800 border-2 border-[#16A34A] rounded-xl text-xs font-mono font-black text-[#09090B] dark:text-white flex items-center justify-center gap-1.5 shrink-0 transition cursor-pointer"
              title={`Shift Active: ${inspectorSession.displayName} (${inspectorSession.badgeNumber}) ${
                shiftTimeRemaining ? `· ${shiftTimeRemaining}` : ''
              }`}
            >
              <span className="hidden sm:inline">{inspectorSession.badgeNumber}</span>
              <LogOut className="w-3.5 h-3.5 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsOktaModalOpen(true)}
              className="min-h-[44px] h-11 flex items-center justify-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-2 border-zinc-400 dark:border-slate-700 text-[#09090B] dark:text-white font-black text-xs px-2.5 py-2 rounded-xl transition shrink-0 cursor-pointer select-none"
              title="Authenticate with Maricopa County Okta SSO"
            >
              <User className="w-4 h-4 text-[#F59E0B] shrink-0" />
              <span className="hidden xl:inline">SSO</span>
            </button>
          )}
        </div>
      </header>

      {/* 3. Responsive Foldable & Tablet Split-Cockpit Workspace (100% Viewport — Zero Warning Banners):
          - >= 768px (Unfolded Galaxy Z Fold / iPad / Truck Tablet):
              LEFT PANE: Permanently Locked Interactive Hybrid Map + NavigationHUD
              RIGHT PANE: Simultaneous Corridor Clusters / Inline Permit Inspection & .DOCX Notes / Drive Mode HUD
          - < 768px (Mobile):
              Full-Bleed Hybrid Map + Draggable Pull-Up Drawer + Ergonomic Bottom Thumb Bar */}
      <div
        ref={workspaceRef}
        className="flex-1 flex flex-col md:flex-row relative overflow-hidden min-h-0"
      >
        {/* LEFT PANE on >= 768px (Permanently Locked Interactive Hybrid Map) / Full-Bleed Map on < 768px */}
        <main className="flex-1 min-h-0 md:flex-none md:w-[46%] lg:w-[48%] xl:w-[50%] relative min-w-0 z-0 md:border-r-2 md:border-zinc-400 dark:md:border-slate-800">
          {hasMapsApiKey ? (
            <APIProvider apiKey={MAPS_API_KEY}>{mapNode}</APIProvider>
          ) : (
            mapNode
          )}

          {navigatingPermit && (
            <NavigationHUD
              permit={navigatingPermit}
              currentGps={currentGps}
              onArrived={() => handleArrivedAtPermit(navigatingPermit)}
              onCancel={() => setNavigatingPermit(null)}
            />
          )}

          {/* Floating Thumb-Zone Hold-to-Speak Pill on Mobile when Sheet is Peeked */}
          {isSheetPeeked && (
            <button
              type="button"
              onClick={() => handleOpenHoldToSpeakFor()}
              className="md:hidden absolute right-3 bottom-[124px] z-20 min-h-[52px] px-4 py-2.5 rounded-full bg-[#16A34A] hover:bg-emerald-700 text-white border-2 border-[#09090B] shadow-xl font-black text-xs flex items-center gap-2 cursor-pointer select-none"
            >
              <Mic className="w-4 h-4 shrink-0" />
              <span>Hold-to-Speak AI Log</span>
            </button>
          )}
        </main>

        {/* RIGHT PANE on >= 768px (Simultaneous Corridor Clusters / Inline Permit Notes / Drive Mode HUD) */}
        <aside
          aria-label="Split-Cockpit Corridor & Permit Inspection Workspace"
          className="hidden md:flex md:flex-1 h-full min-w-0 flex-col z-20 bg-zinc-100 dark:bg-[#090D16]"
        >
          {/* Right-Pane Tactical Mode Header */}
          <div className="px-3.5 py-2 bg-[#FFFFFF] dark:bg-slate-950 border-b-2 border-zinc-400 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 flex-wrap">
            <div className="min-w-0">
              <div className="font-black text-sm text-[#09090B] dark:text-white tracking-tight">
                {effectiveCockpitMode === 'drive'
                  ? 'Speed-Aware Drive HUD'
                  : inspectingPermit
                  ? `Active Inspection · ${inspectingPermit.tcNumber}`
                  : `Corridor & Site Workspace (${displayedPermits.length})`}
              </div>
              <p className="text-[11px] font-mono font-bold text-zinc-600 dark:text-slate-400 truncate">
                {activeOrigin.lat.toFixed(4)}, {activeOrigin.lng.toFixed(4)} ·{' '}
                {visitedTcNumbers.size} Logged Today
              </p>
            </div>

            {renderSpeedModeSwitch(false)}
          </div>

          {/* Right-Pane Body: Drive HUD vs Inline Permit Notes Workspace vs Corridor Cluster Feed */}
          {effectiveCockpitMode === 'site' && isSplitCockpit && inspectingPermit ? (
            <div className="flex-1 min-h-0 overflow-hidden">
              <PermitDetailModal
                embedded={true}
                permit={inspectingPermit}
                corridorName={inspectingCorridorCluster?.corridorName}
                corridorSiblings={inspectingCorridorCluster?.permits}
                onSelectSiblingPermit={(sib) => handleOpenInspectPermit(sib)}
                accessToken={accessToken}
                userEmail={currentUser?.email || inspectorSession?.email}
                onClose={() => setInspectingPermit(null)}
                onSignInRequired={(options) => handleConnectDriveGis(options)}
                onAccessTokenUpdated={(token, user) => {
                  setInMemoryDriveToken(token || null);
                  setAccessToken(token || null);
                  if (user) {
                    setCurrentUser(user);
                  }
                }}
                onPermitUpdated={handlePermitUpdated}
                onShowToast={showToast}
                externalNotesRevision={visitedTick}
              />
            </div>
          ) : (
            renderPermitFeedBody(false)
          )}

          {/* Docked Glove-Friendly Controls at Bottom of Right Split-Cockpit Pane */}
          <div className="p-2.5 bg-[#FFFFFF] dark:bg-slate-950 border-t-2 border-zinc-400 dark:border-slate-800 shrink-0">
            {renderDockedThumbControls()}
          </div>
        </aside>

        {/* Mobile (< 768px) Draggable Pull-Up Drawer (Corridor Clusters in Site Mode / Single-Card HUD in Drive Mode) */}
        <section
          ref={sheetPanelRef}
          aria-label="Closest ROW Permits Pull-Up Drawer"
          className={`md:hidden absolute bottom-0 inset-x-0 z-20 flex flex-col bg-[#FFFFFF]/98 dark:bg-slate-900/98 backdrop-blur-xl border-t-2 border-zinc-400 dark:border-slate-700 rounded-t-3xl shadow-[0_-10px_35px_rgba(0,0,0,0.35)] overflow-hidden ${
            isDraggingSheet
              ? 'transition-none'
              : 'transition-[height] duration-200 ease-out'
          }`}
        >
          <div
            role="slider"
            tabIndex={0}
            aria-label="Drag permit drawer up or down, or tap to cycle height"
            aria-valuemin={peekHeight}
            aria-valuemax={fullHeight}
            aria-valuenow={sheetHeightPx}
            onKeyDown={handleSheetHandleKeyDown}
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={(e) => finishSheetPointerDrag(e, false)}
            onPointerCancel={(e) => finishSheetPointerDrag(e, true)}
            className="bg-[#FFFFFF] dark:bg-slate-950 border-b-2 border-zinc-300 dark:border-slate-800 px-3 pt-2 pb-2 shrink-0 touch-none select-none cursor-grab active:cursor-grabbing"
          >
            <div className="w-full flex flex-col items-center justify-center py-1">
              <div
                className={`w-12 h-1.5 rounded-full transition-colors ${
                  isDraggingSheet
                    ? 'bg-[#0284C7] scale-x-110'
                    : 'bg-zinc-400 dark:bg-slate-500'
                }`}
              />
            </div>

            <div className="flex items-center justify-between gap-2 mt-0.5">
              <div className="min-w-0">
                <span className="font-black text-xs sm:text-sm text-[#09090B] dark:text-white truncate block">
                  {onSiteArrival
                    ? `On-Site: ${onSiteArrival.permit.tcNumber} (${onSiteArrival.distanceMeters}m)`
                    : `Corridors & Sites (${displayedPermits.length})`}
                </span>
              </div>
              {renderSpeedModeSwitch(true)}
            </div>
          </div>

          {renderPermitFeedBody(true)}
        </section>
      </div>

      {/* Mobile (< 768px) Ergonomic Bottom Thumb-Accessible Control Bar */}
      <nav
        aria-label="Primary Mobile Thumb Controls"
        className="md:hidden shrink-0 z-30 bg-[#FFFFFF] dark:bg-slate-950 border-t-2 border-zinc-400 dark:border-slate-800 px-2.5 py-1.5"
      >
        {renderDockedThumbControls()}
      </nav>

      {/* 4. Hold-to-Speak AI Field Log Modal */}
      <HoldToSpeakModal
        isOpen={isHoldToSpeakOpen}
        targetPermit={activeVoicePermit}
        allCandidatePermits={displayedPermits.length > 0 ? displayedPermits : candidatePermits}
        currentGps={currentGps}
        checkedItemLabels={activeVoiceCheckedLabels}
        onSelectTargetPermit={(permit) => setHoldToSpeakTargetPermit(permit)}
        onClose={() => setIsHoldToSpeakOpen(false)}
        onSaveParsedLog={handleSaveParsedAiLog}
      />

      {/* 5. Mobile (< 768px) Permit Inspection Sheet Modal (on >= 768px it renders inline inside the Right Split-Cockpit Pane!) */}
      {!isSplitCockpit && inspectingPermit && (
        <PermitDetailModal
          embedded={false}
          permit={inspectingPermit}
          corridorName={inspectingCorridorCluster?.corridorName}
          corridorSiblings={inspectingCorridorCluster?.permits}
          onSelectSiblingPermit={(sib) => handleOpenInspectPermit(sib)}
          accessToken={accessToken}
          userEmail={currentUser?.email || inspectorSession?.email}
          onClose={() => setInspectingPermit(null)}
          onSignInRequired={(options) => handleConnectDriveGis(options)}
          onAccessTokenUpdated={(token, user) => {
            setInMemoryDriveToken(token || null);
            setAccessToken(token || null);
            if (user) {
              setCurrentUser(user);
            }
          }}
          onPermitUpdated={handlePermitUpdated}
          onShowToast={showToast}
          externalNotesRevision={visitedTick}
        />
      )}

      {/* 6. MAG & MCDOT Specifications Guide Modal */}
      <MagSpecGuideModal
        isOpen={isMagSpecModalOpen}
        onClose={() => setIsMagSpecModalOpen(false)}
        onInsertNote={async (snippet: string) => {
          const targetPermit = inspectingPermit || onSiteArrival?.permit || selectedPermit;
          let cleanSnippet = stripLogRowDecorations(snippet || '');
          if (cleanSnippet && !/[.!?]$/.test(cleanSnippet)) {
            cleanSnippet = `${cleanSnippet}.`;
          }
          if (!cleanSnippet) return;

          if (targetPermit) {
            const existingFile =
              getLocalPermitNote(targetPermit.tcNumber) || createInitialLocalNotes(targetPermit);
            const nowIso = new Date().toISOString();
            const newEntry = {
              id: `spec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp: nowIso,
              inspector: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
              text: cleanSnippet,
              voiceDictated: false,
            };
            const updatedFile: PermitNoteFile = {
              ...existingFile,
              inspectorNotes: [...(existingFile.inspectorNotes || []), newEntry],
              hasUnsyncedChanges: true,
              auditTrail: [
                ...(existingFile.auditTrail || []),
                {
                  timestamp: nowIso,
                  action: `Inserted MAG Spec Note: ${cleanSnippet.slice(0, 40)}`,
                  user: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
                },
              ],
            };
            saveLocalPermitNote(updatedFile);
            setVisitedTick((t) => t + 1);

            if (accessToken && hasValidCachedDriveToken(accessToken)) {
              syncPermitNoteStateToDrive(accessToken, targetPermit, updatedFile).catch(() => {});
            }

            setIsMagSpecModalOpen(false);
            handleOpenInspectPermit(targetPermit);
            showToast(`Logged MAG spec note to ${targetPermit.tcNumber}`, 'success');
          } else {
            try {
              await navigator.clipboard?.writeText(cleanSnippet);
            } catch {}
            setIsMagSpecModalOpen(false);
            showToast(
              'Copied MAG spec snippet — select a permit to log directly into Permit Notes',
              'info'
            );
          }
        }}
        permitContext={
          inspectingPermit || onSiteArrival?.permit || selectedPermit
            ? {
                tcNumber: (inspectingPermit || onSiteArrival?.permit || selectedPermit)!.tcNumber,
                permitType: (inspectingPermit || onSiteArrival?.permit || selectedPermit)!
                  .permitType,
                location: (inspectingPermit || onSiteArrival?.permit || selectedPermit)!.location,
              }
            : undefined
        }
      />

      {/* 7. Today's Route Log Summary Modal */}
      <TodaysRouteLogModal
        isOpen={isRouteLogModalOpen}
        onClose={() => setIsRouteLogModalOpen(false)}
        allPermits={allPermits}
        onOpenPermitNotes={(permit) => {
          handleOpenInspectPermit(permit);
        }}
      />

      {/* 8. Maricopa County Okta SSO Sign In Modal */}
      <OktaSignInModal
        isOpen={isOktaModalOpen}
        onClose={() => setIsOktaModalOpen(false)}
        onSessionCreated={(session) => {
          setInspectorSession(session);
          showToast(
            `Shift authorized for ${session.displayName} (${session.badgeNumber})`,
            'success'
          );
        }}
      />

      {/* 9. Unified 'Drive Sync' Modal (All OAuth Setup, Unsynced Queue & Spark Notes Folder Manager Live Strictly Here) */}
      {showSignInModal && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
          onClick={() => setShowSignInModal(false)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] flex flex-col bg-[#FFFFFF] dark:bg-slate-900 border-2 border-[#09090B] dark:border-slate-700 rounded-2xl shadow-2xl text-[#09090B] dark:text-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 sm:px-5 py-3.5 bg-zinc-100 dark:bg-slate-950 border-b-2 border-zinc-300 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-black tracking-tight">
                  Drive Sync &amp; Google OAuth Setup
                </h2>
                <p className="text-xs font-bold text-zinc-600 dark:text-slate-300 truncate">
                  My Drive › Spark Notes › Permit Notes (.DOCX Cloud Sync)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSignInModal(false)}
                className="min-w-[44px] min-h-[44px] p-3 rounded-xl text-[#09090B] dark:text-slate-300 hover:bg-zinc-200 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer shrink-0"
                aria-label="Close Google Drive Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
              {isSyncingAllNotes && syncAllProgress && (
                <div className="px-3.5 py-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/80 border-2 border-[#0284C7] flex items-center justify-between text-xs text-[#09090B] dark:text-sky-100 font-black">
                  <span className="flex items-center gap-2 truncate">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-[#0284C7]" />
                    <span className="truncate">
                      Syncing {syncAllProgress.currentTc} Permit Notes.docx...
                    </span>
                  </span>
                  <span className="font-mono tabular-nums shrink-0 ml-2">
                    {syncAllProgress.current}/{syncAllProgress.total}
                  </span>
                </div>
              )}

              {/* Unsynced .DOCX Queue Section inside Drive Sync Modal */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-slate-950 border-2 border-zinc-300 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs font-black">
                  <span>Unsynced Permit Notes Queue ({unsyncedNoteCount})</span>
                  {accessToken &&
                    hasValidCachedDriveToken(accessToken) &&
                    unsyncedNoteCount > 0 && (
                      <button
                        type="button"
                        disabled={isSyncingAllNotes}
                        onClick={() => handleSyncUnsyncedItems(accessToken)}
                        className="min-h-[36px] px-3 py-1 rounded-lg bg-[#16A34A] hover:bg-emerald-700 text-white font-black text-xs cursor-pointer"
                      >
                        Sync {unsyncedNoteCount} Now
                      </button>
                    )}
                </div>

                {unsyncedNoteFiles.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {unsyncedNoteFiles.map((nf) => {
                      const notesArr = nf.inspectorNotes || [];
                      const latestEntry = notesArr[notesArr.length - 1];
                      const matchedPermit = allPermits.find(
                        (p) => p.tcNumber.trim() === nf.tcNumber.trim()
                      );
                      return (
                        <div
                          key={nf.tcNumber}
                          onClick={() => {
                            if (matchedPermit) {
                              setShowSignInModal(false);
                              handleOpenInspectPermit(matchedPermit);
                            }
                          }}
                          className="p-2.5 rounded-xl bg-[#FFFFFF] dark:bg-slate-900 border-2 border-[#F59E0B] hover:border-[#09090B] transition cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-xs font-black font-mono tabular-nums text-[#09090B] dark:text-amber-300">
                              {nf.tcNumber} Permit Notes.docx
                            </span>
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-[#09090B]">
                              Queued
                            </span>
                          </div>
                          {latestEntry && (
                            <p className="text-xs font-medium text-zinc-700 dark:text-slate-300 line-clamp-1 font-mono">
                              {formatMcdotLogRow(latestEntry.timestamp, latestEntry.text)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-[#16A34A] text-xs font-bold text-[#09090B] dark:text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                    <span>All local Permit Notes are synced or up to date.</span>
                  </div>
                )}
              </div>
              {!accessToken || !hasValidCachedDriveToken(accessToken) || Boolean(driveModalError) ? (
                <DriveSyncAuthBanner
                  errorInfo={driveModalError}
                  unsyncedCount={unsyncedNoteCount}
                  isSyncingOrAuthenticating={isSigningIn}
                  inPreviewIframe={inPreviewIframe}
                  standaloneAppUrl={standaloneAppUrl}
                  onAuthorize={() => handleConnectDriveGis({ forceConsent: true })}
                  onConfigureClientId={() => setIsClientIdModalOpen(true)}
                  onDismiss={driveModalError ? () => setDriveModalError(null) : undefined}
                />
              ) : (
                <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-slate-950 border border-emerald-500/60 flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    Google Drive Write Scope (drive.file) Active
                  </span>
                </div>
              )}

              {driveModalStatusMsg && !driveModalError && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-600 text-emerald-950 dark:text-emerald-100 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{driveModalStatusMsg}</span>
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 space-y-3">
                {accessToken ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold truncate">
                        {currentUser?.displayName || 'Authorized MCDOT Inspector'}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-mono truncate">
                        {currentUser?.email || 'Google Drive OAuth Token Active'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setDriveModalError(null);
                          requestDriveReauthorization(
                            async (newToken, user) => {
                              setInMemoryDriveToken(newToken);
                              setAccessToken(newToken);
                              if (user) setCurrentUser(user);
                              setCachedDriveAccessToken(newToken);
                              setDriveModalStatusMsg(
                                'Google Drive write permissions (drive.file) refreshed.'
                              );
                              showToast('Google Drive connected!', 'success');
                              try {
                                const folder = await discoverPermitNotesDriveFolder(newToken, {
                                  forceRefresh: true,
                                });
                                setActiveDriveFolder(folder);
                              } catch {}
                            },
                            (err) => {
                              const classified =
                                err && err.title && err.remediation
                                  ? (err as DriveAuthErrorInfo)
                                  : classifyDriveOAuthError(err);
                              setDriveModalError(classified);
                              if (err?.code === 'missing_client_id') {
                                setIsClientIdModalOpen(true);
                              }
                            }
                          );
                        }}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Re-Auth</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => handleConnectDriveGis({ forceConsent: true })}
                      disabled={isSigningIn}
                      className="w-full min-h-[44px] h-11 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white font-bold text-sm shadow flex items-center justify-center gap-3 transition cursor-pointer select-none"
                    >
                      <span>
                        {isSigningIn ? 'Opening Google OAuth Popup...' : 'Connect Drive (Popup OAuth)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsClientIdModalOpen(true)}
                      className="w-full min-h-[44px] h-11 py-2.5 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center justify-center cursor-pointer"
                    >
                      Configure / Change Google OAuth Client ID
                    </button>
                  </div>
                )}
              </div>

              {(() => {
                const cachedFolderNote = localPermitNoteFiles.find(
                  (nf) => nf.driveFolderWebViewLink || nf.driveFolderPath
                );
                const displayFolderPath = (
                  activeDriveFolder?.folderPath ||
                  cachedFolderNote?.driveFolderPath ||
                  'My Drive › Spark Notes › Permit Notes'
                ).replace(/\s*>\s*/g, ' › ');
                const targetFolderUrl =
                  activeDriveFolder?.folderWebViewLink ||
                  cachedFolderNote?.driveFolderWebViewLink ||
                  'https://drive.google.com/drive/my-drive';

                return (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <FolderOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        Active Target Folder
                      </span>
                      {isDiscoveringFolder && (
                        <span className="text-amber-700 dark:text-amber-300 flex items-center gap-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Locating...
                        </span>
                      )}
                    </div>

                    <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 font-mono text-xs sm:text-sm font-bold break-words">
                      {displayFolderPath}
                    </div>

                    {showSyncAllConfirm && accessToken && !isSyncingAllNotes && (
                      <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/70 border border-amber-500 space-y-3">
                        <p className="text-xs font-medium">
                          Confirm syncing {localPermitNoteFiles.length} Permit Notes .DOCX file(s) to{' '}
                          <strong>{displayFolderPath}</strong>?
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSyncAllNotes}
                            className="flex-1 min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs cursor-pointer"
                          >
                            Confirm Sync All
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSyncAllConfirm(false)}
                            className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <a
                        href={targetFolderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[44px] h-11 px-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>Open Folder in Drive ↗</span>
                      </a>

                      <button
                        type="button"
                        disabled={isSyncingAllNotes}
                        onClick={() => {
                          if (!accessToken) {
                            handleSyncAllNotes();
                          } else if (
                            localPermitNoteFiles.length > 0 ||
                            inspectingPermit ||
                            selectedPermit
                          ) {
                            setShowSyncAllConfirm(true);
                          } else {
                            handleSyncAllNotes();
                          }
                        }}
                        className="min-h-[44px] h-11 px-3.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CloudUpload className="w-4 h-4 shrink-0" />
                        <span>{isSyncingAllNotes ? 'Syncing Notes...' : 'Sync All Notes'}</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 10. High-Priority Field Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-6 right-3 md:right-6 z-50 bg-white dark:bg-slate-900 border-2 border-slate-800 dark:border-amber-400 text-[#090D16] dark:text-white pl-3.5 pr-2 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 max-w-sm sm:max-w-md">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400'
                : toastMessage.type === 'warning'
                ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400'
                : 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-400'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : toastMessage.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 text-xs sm:text-sm font-bold leading-snug">
            {toastMessage.text}
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="min-w-[40px] min-h-[40px] p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 11. Inline Google OAuth 2.0 Client ID Configuration Modal */}
      <GoogleClientIdModal
        isOpen={isClientIdModalOpen}
        onClose={() => setIsClientIdModalOpen(false)}
        initialError={driveModalError?.isClientConfigError ? driveModalError.message : null}
        onSaveAndConnect={(savedClientId) => {
          setIsClientIdModalOpen(false);
          handleConnectDriveGis({ forceConsent: true, explicitClientId: savedClientId });
        }}
      />
    </div>
  );
}

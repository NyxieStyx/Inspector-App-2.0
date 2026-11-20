import { Permit } from '../types/permit';

const PERMITS_CACHE_KEY = 'mcdot_offline_permits_v2';
const NOTES_CACHE_KEY_PREFIX = 'mcdot_offline_note_';
const OFFLINE_SYNC_QUEUE_KEY = 'mcdot_offline_sync_queue';

const IDB_NAME = 'mcdot_row_field_db';
const IDB_VERSION = 1;
const STORE_PHOTOS = 'photos';
const STORE_SYNC_QUEUE = 'sync_queue';

export const STORAGE_ERROR_EVENT = 'mcdot-storage-error';
export const SYNC_QUEUE_UPDATED_EVENT = 'mcdot-sync-queue-updated';

export interface StorageWriteResult {
  ok: boolean;
  error?: string;
  isQuotaError?: boolean;
}

export interface OfflinePendingSync {
  id: string;
  tcNumber: string;
  timestamp: string;
  type: 'NOTE' | 'STATUS_UPDATE' | 'PHOTO';
  payload?: any;
  retryCount?: number;
  lastError?: string;
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    (typeof e.message === 'string' && /quota/i.test(e.message))
  );
}

export function notifyStorageError(message: string, isQuotaError = false): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(STORAGE_ERROR_EVENT, {
      detail: { message, isQuotaError, timestamp: Date.now() },
    })
  );
}

function notifySyncQueueUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_QUEUE_UPDATED_EVENT));
}

// ---------------------------------------------------------------------------
// Native IndexedDB wrapper (zero external dependencies)
// ---------------------------------------------------------------------------
let dbPromise: Promise<IDBDatabase> | null = null;

function openFieldDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported in this browser'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
          db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
          db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * Save a compressed site photo Blob into IndexedDB keyed by photoId.
 */
export async function savePhotoBlob(photoId: string, blob: Blob): Promise<StorageWriteResult> {
  try {
    const db = await openFieldDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTOS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTOS);
      store.put({
        id: photoId,
        blob,
        savedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to store photo in IndexedDB'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB photo transaction aborted'));
    });
    return { ok: true };
  } catch (err: any) {
    const isQuota = isQuotaExceededError(err);
    const msg = isQuota
      ? 'Storage full — export or sync logs now'
      : `Failed to save site photo: ${err?.message || 'Storage error'}`;
    notifyStorageError(msg, isQuota);
    return { ok: false, error: msg, isQuotaError: isQuota };
  }
}

/**
 * Load a site photo Blob from IndexedDB by photoId.
 */
export async function getPhotoBlob(photoId: string): Promise<Blob | null> {
  try {
    const db = await openFieldDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTOS, 'readonly');
      const store = tx.objectStore(STORE_PHOTOS);
      const req = store.get(photoId);
      req.onsuccess = () => {
        const record = req.result as { id: string; blob?: Blob } | undefined;
        resolve(record?.blob ?? null);
      };
      req.onerror = () => reject(req.error || new Error('Failed to read photo from IndexedDB'));
    });
  } catch {
    return null;
  }
}

/**
 * Delete a site photo Blob from IndexedDB by photoId.
 */
export async function deletePhotoBlob(photoId: string): Promise<void> {
  try {
    const db = await openFieldDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTOS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTOS);
      store.delete(photoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to delete photo from IndexedDB'));
    });
  } catch (err) {
    console.warn('Could not delete photo blob from IndexedDB:', err);
  }
}

/**
 * Convert a legacy base64 dataUrl into a Blob and persist it to IndexedDB.
 */
export async function migrateDataUrlToPhotoBlob(photoId: string, dataUrl: string): Promise<StorageWriteResult> {
  try {
    const existing = await getPhotoBlob(photoId);
    if (existing) return { ok: true };

    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header?.match(/data:([^;]+);base64/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binary = atob(base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return await savePhotoBlob(photoId, blob);
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Migration error' };
  }
}

/**
 * Helper to convert a Blob to a base64 dataUrl (used when uploading to Google Drive or generating exports).
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to convert photo Blob to data URL'));
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Offline Permit Cache
// ---------------------------------------------------------------------------

/**
 * Cache permits locally so field inspectors can operate even in desert wash dead-zones
 */
export function cachePermitsLocally(permits: Permit[]): StorageWriteResult {
  try {
    if (!permits || permits.length === 0) return { ok: true };
    const trimmed = permits.slice(0, 600);
    localStorage.setItem(PERMITS_CACHE_KEY, JSON.stringify(trimmed));
    return { ok: true };
  } catch (e: any) {
    const isQuota = isQuotaExceededError(e);
    const msg = isQuota
      ? 'Storage full — export or sync logs now'
      : 'Could not cache permits locally.';
    console.warn('Could not cache permits to localStorage:', e);
    if (isQuota) notifyStorageError(msg, true);
    return { ok: false, error: msg, isQuotaError: isQuota };
  }
}

/**
 * Retrieve cached permits when offline
 */
export function getCachedPermitsLocally(): Permit[] {
  try {
    const raw = localStorage.getItem(PERMITS_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Permit[];
  } catch (e) {
    console.warn('Could not read cached permits:', e);
    return [];
  }
}

/**
 * Save permit note draft locally
 */
export function saveOfflinePermitNote(tcNumber: string, noteContent: any): StorageWriteResult {
  try {
    localStorage.setItem(
      `${NOTES_CACHE_KEY_PREFIX}${tcNumber}`,
      JSON.stringify({
        tcNumber,
        updatedAt: new Date().toISOString(),
        data: noteContent,
      })
    );
    return { ok: true };
  } catch (e: any) {
    const isQuota = isQuotaExceededError(e);
    const msg = isQuota
      ? 'Storage full — export or sync logs now'
      : `Failed to save offline note: ${e?.message || 'Storage error'}`;
    notifyStorageError(msg, isQuota);
    return { ok: false, error: msg, isQuotaError: isQuota };
  }
}

/**
 * Load offline permit note
 */
export function getOfflinePermitNote(tcNumber: string): any | null {
  try {
    const raw = localStorage.getItem(`${NOTES_CACHE_KEY_PREFIX}${tcNumber}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.data || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Offline Sync Queue (IndexedDB-backed with lightweight metadata mirror)
// ---------------------------------------------------------------------------

function readMirrorQueue(): OfflinePendingSync[] {
  try {
    const raw = localStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflinePendingSync[]) : [];
  } catch {
    return [];
  }
}

function writeMirrorQueue(queue: OfflinePendingSync[]): void {
  try {
    // Store only lightweight references in localStorage mirror (no blobs/large payloads)
    const lightweight = queue.map((q) => ({
      id: q.id,
      tcNumber: q.tcNumber,
      timestamp: q.timestamp,
      type: q.type,
      retryCount: q.retryCount ?? 0,
      lastError: q.lastError,
    }));
    localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(lightweight));
  } catch {
    // IndexedDB holds the authoritative queue
  }
}

/**
 * Queue an offline inspection update to sync when internet/Drive returns.
 * Deduplicates by tcNumber + type so repeated offline edits coalesce cleanly.
 */
export async function enqueueOfflineSync(
  tcNumber: string,
  type: 'NOTE' | 'STATUS_UPDATE' | 'PHOTO',
  payload?: any,
  lastError?: string
): Promise<OfflinePendingSync | null> {
  const existing = await getOfflineSyncQueueAsync();
  const normalizedTc = tcNumber.trim().toUpperCase();
  const duplicate = existing.find(
    (item) => item.tcNumber.trim().toUpperCase() === normalizedTc && item.type === type
  );

  const item: OfflinePendingSync = {
    id: duplicate?.id || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tcNumber: normalizedTc,
    timestamp: new Date().toISOString(),
    type,
    payload: payload ?? duplicate?.payload,
    retryCount: (duplicate?.retryCount ?? 0) + (lastError ? 1 : 0),
    lastError,
  };

  try {
    const db = await openFieldDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      tx.objectStore(STORE_SYNC_QUEUE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to write sync queue item'));
    });

    const nextMirror = [...existing.filter((x) => x.id !== item.id), item];
    writeMirrorQueue(nextMirror);
    notifySyncQueueUpdated();
    return item;
  } catch (e: any) {
    const isQuota = isQuotaExceededError(e);
    if (isQuota) {
      notifyStorageError('Storage full — export or sync logs now', true);
    }
    // Fallback to lightweight mirror if IndexedDB is unavailable
    try {
      const nextMirror = [...readMirrorQueue().filter((x) => x.id !== item.id), item];
      writeMirrorQueue(nextMirror);
      notifySyncQueueUpdated();
      return item;
    } catch {
      return null;
    }
  }
}

/**
 * Synchronous read of lightweight queued sync metadata (for badges/counters).
 */
export function getOfflineSyncQueue(): OfflinePendingSync[] {
  return readMirrorQueue();
}

/**
 * Authoritative async read of all queued offline items from IndexedDB.
 */
export async function getOfflineSyncQueueAsync(): Promise<OfflinePendingSync[]> {
  try {
    const db = await openFieldDb();
    const items = await new Promise<OfflinePendingSync[]>((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readonly');
      const req = tx.objectStore(STORE_SYNC_QUEUE).getAll();
      req.onsuccess = () => resolve((req.result as OfflinePendingSync[]) || []);
      req.onerror = () => reject(req.error || new Error('Failed to read sync queue'));
    });
    writeMirrorQueue(items);
    return items;
  } catch {
    return readMirrorQueue();
  }
}

/**
 * Clear a queued item after successful Google Drive sync.
 */
export async function clearOfflineSyncItem(id: string): Promise<void> {
  try {
    const db = await openFieldDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      tx.objectStore(STORE_SYNC_QUEUE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to clear sync item'));
    });
  } catch {
    // Fallback to mirror removal below
  }
  const remaining = readMirrorQueue().filter((item) => item.id !== id);
  writeMirrorQueue(remaining);
  notifySyncQueueUpdated();
}

/**
 * Clear all queued sync items for a given TC number (called after successful Drive sync).
 */
export async function clearOfflineSyncByTcNumber(tcNumber: string): Promise<void> {
  const target = tcNumber.trim().toUpperCase();
  const items = await getOfflineSyncQueueAsync();
  const matching = items.filter((i) => i.tcNumber.trim().toUpperCase() === target);
  for (const m of matching) {
    await clearOfflineSyncItem(m.id);
  }
}

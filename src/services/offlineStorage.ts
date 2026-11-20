import { Permit } from '../types/permit';

const PERMITS_CACHE_KEY = 'mcdot_offline_permits_v2';
const NOTES_CACHE_KEY_PREFIX = 'mcdot_offline_note_';
const OFFLINE_SYNC_QUEUE_KEY = 'mcdot_offline_sync_queue';

export interface OfflinePendingSync {
  id: string;
  tcNumber: string;
  timestamp: string;
  type: 'NOTE' | 'STATUS_UPDATE' | 'PHOTO';
  payload: any;
}

/**
 * Cache permits locally so field inspectors can operate even in desert wash dead-zones
 */
export function cachePermitsLocally(permits: Permit[]) {
  try {
    if (!permits || permits.length === 0) return;
    // Keep up to 600 most recent permits locally
    const trimmed = permits.slice(0, 600);
    localStorage.setItem(PERMITS_CACHE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Could not cache permits to localStorage:', e);
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
export function saveOfflinePermitNote(tcNumber: string, noteContent: any) {
  try {
    localStorage.setItem(
      `${NOTES_CACHE_KEY_PREFIX}${tcNumber}`,
      JSON.stringify({
        tcNumber,
        updatedAt: new Date().toISOString(),
        data: noteContent,
      })
    );
  } catch (e) {
    console.warn('Failed to save offline note:', e);
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

/**
 * Queue an offline inspection update to sync when internet returns
 */
export function enqueueOfflineSync(tcNumber: string, type: 'NOTE' | 'STATUS_UPDATE' | 'PHOTO', payload: any) {
  try {
    const queue = getOfflineSyncQueue();
    const item: OfflinePendingSync = {
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tcNumber,
      timestamp: new Date().toISOString(),
      type,
      payload,
    };
    queue.push(item);
    localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(queue));
    return item;
  } catch (e) {
    console.warn('Failed to enqueue offline item:', e);
    return null;
  }
}

/**
 * Get all queued offline items
 */
export function getOfflineSyncQueue(): OfflinePendingSync[] {
  try {
    const raw = localStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflinePendingSync[];
  } catch {
    return [];
  }
}

/**
 * Clear queued items after successful Google Drive sync
 */
export function clearOfflineSyncItem(id: string) {
  try {
    const queue = getOfflineSyncQueue().filter((item) => item.id !== id);
    localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('Failed to clear sync item:', e);
  }
}

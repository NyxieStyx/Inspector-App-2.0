import { Permit, PermitNoteFile, StatusUpdate, PreConContact } from '../types/permit';
import {
  generateMcdotDocxBlob,
  extractDocxSealImage,
  extractDocxPlainText,
  parseMcdotNotesPlainText,
  saveOfficialSealToCache,
  getCachedOfficialSealPayload,
  SealImagePayload,
  MCDOT_INSPECTOR_NAME,
  MCDOT_INSPECTOR_CODE,
  MCDOT_FOOTER_LINE_1,
  MCDOT_FOOTER_LINE_2,
  formatMcdotDate,
  formatMcdotLogRow,
  stripLogRowDecorations,
} from '../utils/docxExport';
import { getMaricopaSealPngBytes } from '../assets/maricopaSeal';
import { clearCachedToken } from './firebaseAuth';
import {
  StorageWriteResult,
  isQuotaExceededError,
  notifyStorageError,
  migrateDataUrlToPhotoBlob,
} from './offlineStorage';

const LOCAL_STORAGE_PREFIX = 'mcdot_permit_notes_';
const PRECON_STORAGE_PREFIX = 'mcdot_precon_contact_';
export const TARGET_FOLDER_NAME = 'Spark Notes';
export const PERMIT_NOTES_SUBFOLDER_NAME = 'Permit Notes';
export const TEMPLATE_FILE_NAMES = [
  'Permit Notes Template.docx',
  'Permit Notes Template_2.docx',
];
export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface DiscoveredDriveFolder {
  folderId: string;
  folderName: string;
  rootFolderId: string;
  rootFolderName: string;
  folderPath: string;
  folderWebViewLink: string;
}

export interface DriveSyncSummary {
  fileId: string;
  fileName: string;
  webViewLink: string;
  folderId: string;
  folderPath: string;
  folderWebViewLink: string;
  syncedAt: string;
  noteFile: PermitNoteFile;
}

// In-memory session cache for the extracted official template seal & discovered Drive folder
let cachedTemplateSeal: SealImagePayload | null = null;
let hasCheckedDriveTemplateSeal = false;
let cachedDriveFolder: {
  token: string;
  folder: DiscoveredDriveFolder;
  cachedAt: number;
} | null = null;

export function invalidateDriveFolderCache(): void {
  cachedDriveFolder = null;
}

/**
 * Helper to construct Google Drive web URLs for files and folders
 */
export function buildDriveFileWebLink(fileId: string, apiWebViewLink?: string): string {
  if (apiWebViewLink && apiWebViewLink.startsWith('http')) return apiWebViewLink;
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function buildDriveFolderWebLink(folderId: string): string {
  if (!folderId) return 'https://drive.google.com/drive/my-drive';
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/**
 * Checks whether an error is caused by Google Drive storage quota or rate-limit limits
 */
export function isDriveQuotaError(err: any): boolean {
  if (!err) return false;
  if (err.isQuotaError === true || err.status === 429) return true;
  const reason = (
    err?.error?.errors?.[0]?.reason ||
    err?.errors?.[0]?.reason ||
    ''
  ).toLowerCase();
  const msg = (
    typeof err === 'string' ? err : err.message || err.error?.message || ''
  ).toLowerCase();

  return (
    reason.includes('quota') ||
    reason.includes('ratelimit') ||
    reason.includes('dailylimit') ||
    msg.includes('storage quota') ||
    msg.includes('storagequotaexceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  );
}

/**
 * Checks whether an error is a per-file ownership mismatch under 'drive.file'
 * (e.g. a stale localStorage fileId created outside this app or under another account),
 * rather than an expired/missing OAuth scope on the token itself.
 */
export function isDriveFileAccessMismatchError(err: any): boolean {
  if (!err) return false;
  if (err.isFileAccessMismatch === true || err.status === 404) return true;
  const reason = (
    err?.error?.errors?.[0]?.reason ||
    err?.errors?.[0]?.reason ||
    err?.reason ||
    ''
  ).toLowerCase();
  const msg = (
    typeof err === 'string' ? err : err.message || err.error?.message || ''
  ).toLowerCase();

  return (
    reason === 'appnotauthorizedtofile' ||
    reason === 'insufficientfilepermissions' ||
    reason === 'notfound' ||
    msg.includes('app is not authorized to access this file') ||
    msg.includes('has not granted the app') ||
    msg.includes('insufficient permissions for the specified file') ||
    msg.includes('file not found')
  );
}

/**
 * Checks whether an error is caused by missing or expired Google Drive OAuth scopes
 */
export function isDriveScopeError(err: any): boolean {
  if (!err) return false;
  if (isDriveQuotaError(err) || isDriveFileAccessMismatchError(err)) return false;
  if (err.isScopeError === true) return true;

  const reason = (
    err?.error?.errors?.[0]?.reason ||
    err?.errors?.[0]?.reason ||
    ''
  ).toLowerCase();
  const msg = (
    typeof err === 'string' ? err : err.message || err.error?.message || ''
  ).toLowerCase();

  if (err.status === 401) return true;

  return (
    reason === 'insufficientpermissions' ||
    reason === 'insufficientauthenticationscopes' ||
    reason === 'autherror' ||
    msg.includes('insufficient authentication scopes') ||
    msg.includes('insufficient_scope') ||
    msg.includes('access_denied') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid credentials') ||
    msg.includes('re-authorize')
  );
}

export function handleDriveResponseError(res: Response, errJson: any, defaultMsg: string): never {
  const rawMessage = errJson?.error?.message || `${defaultMsg} (HTTP ${res.status})`;
  const reason = (errJson?.error?.errors?.[0]?.reason || '').toLowerCase();
  const lowerMsg = rawMessage.toLowerCase();

  if (
    res.status === 429 ||
    reason.includes('quota') ||
    reason.includes('ratelimit') ||
    reason.includes('dailylimit') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('rate limit')
  ) {
    const quotaError: any = new Error(
      reason.includes('storagequota') || lowerMsg.includes('storage quota')
        ? 'Google Drive storage quota is full. Your notes are safely saved locally and can be downloaded as .DOCX.'
        : 'Google Drive sync rate limit reached. Notes are saved locally — please try syncing again shortly.'
    );
    quotaError.status = res.status;
    quotaError.isQuotaError = true;
    quotaError.isScopeError = false;
    throw quotaError;
  }

  // Per-file 403/404 under 'drive.file' (stale fileId or file created manually outside app):
  // Do NOT clear the valid OAuth token — allow caller to create an app-owned file in Spark Notes > Permit Notes.
  if (
    res.status === 404 ||
    (res.status === 403 &&
      (reason === 'appnotauthorizedtofile' ||
        reason === 'insufficientfilepermissions' ||
        lowerMsg.includes('has not granted the app') ||
        lowerMsg.includes('not authorized to access this file') ||
        lowerMsg.includes('file not found')))
  ) {
    const fileAccessErr: any = new Error(rawMessage);
    fileAccessErr.status = res.status;
    fileAccessErr.reason = reason;
    fileAccessErr.isFileAccessMismatch = true;
    fileAccessErr.isScopeError = false;
    throw fileAccessErr;
  }

  if (
    res.status === 401 ||
    reason === 'insufficientpermissions' ||
    reason === 'insufficientauthenticationscopes' ||
    reason === 'autherror' ||
    lowerMsg.includes('insufficient authentication scopes') ||
    lowerMsg.includes('insufficient_scope') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('invalid credentials')
  ) {
    clearCachedToken();
    const scopeError: any = new Error(
      res.status === 401
        ? 'Google Drive authorization expired. Please re-authorize.'
        : 'Request had insufficient authentication scopes. Please re-authorize Google Drive.'
    );
    scopeError.status = res.status;
    scopeError.isScopeError = true;
    throw scopeError;
  }

  const genericError: any = new Error(rawMessage);
  genericError.status = res.status;
  genericError.reason = reason;
  throw genericError;
}

/**
 * 1-Tap Auto-fill Presets for Frequent Right-of-Way Pre-Con Contacts
 */
export const PRECON_CONTACT_PRESETS: PreConContact[] = [
  {
    name: 'Jeremy Rockwell',
    company: 'Down 2 Earth Communications/COX',
    phone: '602-418-9271',
  },
  {
    name: 'Mike Hansen',
    company: 'Arizona Pipeline / SWG',
    phone: '602-819-3304',
  },
  {
    name: 'Carlos Mendez',
    company: 'SRP Electric Dispatch',
    phone: '602-236-8888',
  },
  {
    name: 'David Vance',
    company: 'CenturyLink / Lumen Field Ops',
    phone: '602-550-1922',
  },
];

export function getPreConContact(tcNumber?: string): PreConContact | null {
  if (!tcNumber) return null;
  try {
    const cleanTc = tcNumber.trim();
    const raw = localStorage.getItem(PRECON_STORAGE_PREFIX + cleanTc);
    if (raw) return JSON.parse(raw);
    const localNote = getLocalPermitNote(cleanTc);
    if (localNote?.preConContact) return localNote.preConContact;
    return null;
  } catch {
    return null;
  }
}

export function savePreConContact(tcNumber: string, contact: PreConContact): void {
  if (!tcNumber) return;
  try {
    const cleanTc = tcNumber.trim();
    const toSave: PreConContact = {
      ...contact,
      savedAt: contact.savedAt || new Date().toISOString(),
    };
    localStorage.setItem(PRECON_STORAGE_PREFIX + cleanTc, JSON.stringify(toSave));
    const localNote = getLocalPermitNote(cleanTc);
    if (localNote) {
      localNote.preConContact = toSave;
      saveLocalPermitNote(localNote);
    }
  } catch (e) {
    console.warn('Failed to persist PreConContact:', e);
  }
}

/**
 * Formats the official MCDOT Permit Notes document body text matching Permit Notes Template.docx:
 * Permit #: ${permitNumber}
 *
 * MM/DD/YYYY MAC, Note text
 * ...
 * Final Acceptance:  __________________________________\tDate: 
 * \t\t      Inspector Signature
 */
export function generateMcdotOfficialDocText(permit: Permit, noteFile: PermitNoteFile): string {
  const tcNumber = permit.tcNumber.trim();
  const header = `Permit #: ${tcNumber}\n\n`;

  const sorted = [...(noteFile.inspectorNotes || [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const logs = sorted.map((n) => formatMcdotLogRow(n.timestamp, n.text)).join('\n\n');
  const blankLines = '\n'.repeat(Math.max(4, 24 - sorted.length * 2));
  const footer = `${blankLines}${MCDOT_FOOTER_LINE_1}\n${MCDOT_FOOTER_LINE_2}\n`;

  return (
    header +
    (logs || `${formatMcdotDate(new Date())} ${MCDOT_INSPECTOR_CODE}, Permit logged.`) +
    footer
  );
}

/**
 * Searches Google Drive across 'Spark Notes' and My Drive for
 * 'Permit Notes Template.docx' or 'Permit Notes Template_2.docx' (trashed = false),
 * extracts the PNG/JPEG seal (supporting ZIP Stored 0 and Deflate 8), caches it in
 * localStorage ('mcdot_cached_official_seal_png'), and falls back to getMaricopaSealPngBytes().
 */
export async function resolveTemplateSealForDocx(
  accessToken?: string | null,
  preferredParentIds?: string | string[]
): Promise<SealImagePayload> {
  if (cachedTemplateSeal) {
    return cachedTemplateSeal;
  }

  const localCached = getCachedOfficialSealPayload();
  if (localCached) {
    cachedTemplateSeal = localCached;
    return localCached;
  }

  if (accessToken && !hasCheckedDriveTemplateSeal) {
    hasCheckedDriveTemplateSeal = true;
    try {
      const q = encodeURIComponent(
        `(name = 'Permit Notes Template.docx' or name = 'Permit Notes Template_2.docx' or name contains 'Permit Notes Template') and mimeType != 'application/vnd.google-apps.folder' and trashed = false`
      );
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,parents)&pageSize=15&spaces=drive`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (searchRes.ok) {
        const data = await searchRes.json();
        const files: any[] = data.files || [];

        const parentList = Array.isArray(preferredParentIds)
          ? preferredParentIds.filter(Boolean)
          : preferredParentIds
          ? [preferredParentIds]
          : [];

        // Prioritize exact template names in Spark Work / Spark Notes first, then My Drive
        const rankedFiles = [...files].sort((a, b) => {
          const aInPreferred =
            parentList.length > 0 && a.parents?.some((p: string) => parentList.includes(p)) ? 1 : 0;
          const bInPreferred =
            parentList.length > 0 && b.parents?.some((p: string) => parentList.includes(p)) ? 1 : 0;
          if (aInPreferred !== bInPreferred) return bInPreferred - aInPreferred;

          const aExact = TEMPLATE_FILE_NAMES.includes(a.name) ? 1 : 0;
          const bExact = TEMPLATE_FILE_NAMES.includes(b.name) ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;

          const aDocx = a.mimeType === DOCX_MIME_TYPE ? 1 : 0;
          const bDocx = b.mimeType === DOCX_MIME_TYPE ? 1 : 0;
          return bDocx - aDocx;
        });

        for (const templateFile of rankedFiles) {
          if (!templateFile?.id) continue;
          const downloadUrl =
            templateFile.mimeType === 'application/vnd.google-apps.document'
              ? `https://www.googleapis.com/drive/v3/files/${templateFile.id}/export?mimeType=${encodeURIComponent(DOCX_MIME_TYPE)}`
              : `https://www.googleapis.com/drive/v3/files/${templateFile.id}?alt=media`;

          const mediaRes = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (mediaRes.ok) {
            const arrayBuffer = await mediaRes.arrayBuffer();
            const extractedSeal = await extractDocxSealImage(arrayBuffer);
            if (extractedSeal && extractedSeal.bytes.length > 32) {
              cachedTemplateSeal = extractedSeal;
              saveOfficialSealToCache(extractedSeal);
              return extractedSeal;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Template seal lookup fell back to built-in Maricopa County Seal:', err);
    }
  }

  const fallbackBytes = await getMaricopaSealPngBytes(300);
  return { bytes: fallbackBytes, type: 'png' };
}

/**
 * Discovers or creates the canonical Permit Notes folder hierarchy in Google Drive:
 * 'My Drive > Spark Notes > Permit Notes'
 * Works seamlessly with 'https://www.googleapis.com/auth/drive.file' write permissions.
 */
export async function discoverPermitNotesDriveFolder(
  accessToken: string,
  options?: { forceRefresh?: boolean }
): Promise<DiscoveredDriveFolder> {
  if (
    !options?.forceRefresh &&
    cachedDriveFolder &&
    cachedDriveFolder.token === accessToken &&
    cachedDriveFolder.folder.folderId &&
    Date.now() - cachedDriveFolder.cachedAt < 120000
  ) {
    return cachedDriveFolder.folder;
  }

  let rootFolderId = '';
  let rootFolderName = TARGET_FOLDER_NAME; // 'Spark Notes'

  try {
    const q = encodeURIComponent(
      `mimeType = 'application/vnd.google-apps.folder' and name = '${TARGET_FOLDER_NAME}' and trashed = false`
    );
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (res.ok) {
      const data = await res.json();
      const folders: any[] = data.files || [];
      const sparkNotes = folders.find((f) => f.name === TARGET_FOLDER_NAME);
      if (sparkNotes?.id) {
        rootFolderId = sparkNotes.id;
        rootFolderName = TARGET_FOLDER_NAME;
      }
    } else {
      const err = await res.json().catch(() => ({}));
      handleDriveResponseError(res, err, 'Failed to discover Spark Notes folder in Google Drive');
    }

    // Create 'Spark Notes' in My Drive if it doesn't exist yet
    if (!rootFolderId) {
      const createRootRes = await fetch(
        'https://www.googleapis.com/drive/v3/files?fields=id,name',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: TARGET_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['root'],
            description: 'MCDOT Right-of-Way Inspection Spark Notes',
          }),
        }
      );

      if (createRootRes.ok) {
        const createdRoot = await createRootRes.json();
        rootFolderId = createdRoot.id || '';
        rootFolderName = TARGET_FOLDER_NAME;
      } else {
        const err = await createRootRes.json().catch(() => ({}));
        handleDriveResponseError(createRootRes, err, 'Failed to create Spark Notes folder');
      }
    }

    // Proactively kick off official template seal lookup
    resolveTemplateSealForDocx(accessToken, rootFolderId).catch(() => {});

    // Find or create 'Permit Notes' subfolder inside 'Spark Notes'
    if (rootFolderId) {
      const subQ = encodeURIComponent(
        `mimeType = 'application/vnd.google-apps.folder' and name = '${PERMIT_NOTES_SUBFOLDER_NAME}' and '${rootFolderId}' in parents and trashed = false`
      );
      const subRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${subQ}&fields=files(id,name,parents,webViewLink)&spaces=drive`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (subRes.ok) {
        const subData = await subRes.json();
        const subFiles: any[] = subData.files || [];
        if (subFiles.length > 0 && subFiles[0]?.id) {
          const folderId = subFiles[0].id;
          const discovered: DiscoveredDriveFolder = {
            folderId,
            folderName: PERMIT_NOTES_SUBFOLDER_NAME,
            rootFolderId,
            rootFolderName,
            folderPath: `My Drive > ${rootFolderName} > ${PERMIT_NOTES_SUBFOLDER_NAME}`,
            folderWebViewLink: buildDriveFolderWebLink(folderId),
          };
          cachedDriveFolder = { token: accessToken, folder: discovered, cachedAt: Date.now() };
          return discovered;
        }
      } else {
        const err = await subRes.json().catch(() => ({}));
        handleDriveResponseError(subRes, err, 'Failed to access Permit Notes subfolder');
      }

      // Create 'Permit Notes' inside 'Spark Notes'
      const createSubRes = await fetch(
        'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: PERMIT_NOTES_SUBFOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [rootFolderId],
            description: `MCDOT Permit Notes .DOCX documents under ${rootFolderName}`,
          }),
        }
      );

      if (createSubRes.ok) {
        const createdSub = await createSubRes.json();
        if (createdSub?.id) {
          const discovered: DiscoveredDriveFolder = {
            folderId: createdSub.id,
            folderName: PERMIT_NOTES_SUBFOLDER_NAME,
            rootFolderId,
            rootFolderName,
            folderPath: `My Drive > ${rootFolderName} > ${PERMIT_NOTES_SUBFOLDER_NAME}`,
            folderWebViewLink: buildDriveFolderWebLink(createdSub.id),
          };
          cachedDriveFolder = { token: accessToken, folder: discovered, cachedAt: Date.now() };
          return discovered;
        }
      } else {
        const err = await createSubRes.json().catch(() => ({}));
        handleDriveResponseError(createSubRes, err, 'Failed to create Permit Notes subfolder');
      }
    }
  } catch (err: any) {
    invalidateDriveFolderCache();
    if (isDriveScopeError(err) || isDriveQuotaError(err)) {
      throw err;
    }
    console.warn('Folder discovery warning:', err);
  }

  return {
    folderId: rootFolderId,
    folderName: rootFolderId ? rootFolderName : PERMIT_NOTES_SUBFOLDER_NAME,
    rootFolderId,
    rootFolderName,
    folderPath: `My Drive > ${rootFolderName} > ${PERMIT_NOTES_SUBFOLDER_NAME}`,
    folderWebViewLink: buildDriveFolderWebLink(rootFolderId),
  };
}

export async function getOrCreateSparkNotesFolder(
  accessToken: string
): Promise<{ id: string; name: string }> {
  const discovered = await discoverPermitNotesDriveFolder(accessToken);
  return { id: discovered.rootFolderId, name: discovered.rootFolderName };
}

export async function getOrCreatePermitNotesSubfolder(accessToken: string): Promise<{
  id: string;
  name: string;
  parentId: string;
  folderPath: string;
  folderWebViewLink: string;
}> {
  const discovered = await discoverPermitNotesDriveFolder(accessToken);
  return {
    id: discovered.folderId,
    name: discovered.folderName,
    parentId: discovered.rootFolderId,
    folderPath: discovered.folderPath,
    folderWebViewLink: discovered.folderWebViewLink,
  };
}

/**
 * Uploads or updates a binary .docx file in place via Google Drive multipart/related API
 */
async function uploadDocxMultipartToDrive(options: {
  accessToken: string;
  docxBlob: Blob;
  metadata: Record<string, any>;
  existingFileId?: string;
}): Promise<{ id: string; name: string; mimeType?: string; webViewLink?: string }> {
  const { accessToken, docxBlob, metadata, existingFileId } = options;
  const boundary = `mcdot_docx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const metaHeader =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${DOCX_MIME_TYPE}\r\n\r\n`;
  const closingFooter = `\r\n--${boundary}--`;

  const multipartBody = new Blob([metaHeader, docxBlob, closingFooter], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,mimeType,parents,webViewLink`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,parents,webViewLink`;

  const res = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    handleDriveResponseError(
      res,
      errJson,
      existingFileId
        ? 'Failed to update .docx permit notes in Google Drive'
        : 'Failed to create .docx permit notes in Google Drive'
    );
  }

  return await res.json();
}

/**
 * Searches Google Drive for existing permit notes matching the unique TC Number
 * inside 'My Drive > Spark Work > Permit Notes' or 'My Drive > Spark Notes > Permit Notes'.
 */
export async function searchDriveForPermitNotes(
  accessToken: string,
  tcNumber: string
): Promise<{
  found: boolean;
  fileId?: string;
  fileName?: string;
  webViewLink?: string;
  folderId?: string;
  folderName?: string;
  folderPath?: string;
  folderWebViewLink?: string;
  syncedAt?: string;
  content?: PermitNoteFile;
}> {
  try {
    const discovered = await discoverPermitNotesDriveFolder(accessToken);
    const cleanTc = tcNumber.trim();

    const parentFilters: string[] = [];
    if (discovered.folderId) {
      parentFilters.push(`'${discovered.folderId}' in parents`);
    }
    if (discovered.rootFolderId && discovered.rootFolderId !== discovered.folderId) {
      parentFilters.push(`'${discovered.rootFolderId}' in parents`);
    }

    const parentPart = parentFilters.length > 0 ? `(${parentFilters.join(' or ')}) and ` : '';
    const q = encodeURIComponent(
      `${parentPart}(name = '${cleanTc} Permit Notes.docx' or name contains '${cleanTc} Permit Notes' or name contains '${cleanTc}_Permit_Notes' or name contains '${cleanTc}') and mimeType != 'application/vnd.google-apps.folder' and trashed = false`
    );

    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,createdTime,parents,appProperties,description,webViewLink)&spaces=drive`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let files: any[] = [];
    if (res.ok) {
      const data = await res.json();
      files = (data.files || []).filter((f: any) => !TEMPLATE_FILE_NAMES.includes(f.name));
    } else {
      const err = await res.json().catch(() => ({}));
      handleDriveResponseError(res, err, `Drive search failed with status ${res.status}`);
    }

    if (files.length === 0) {
      const broadQ = encodeURIComponent(
        `(name = '${cleanTc} Permit Notes.docx' or name contains '${cleanTc} Permit Notes') and mimeType != 'application/vnd.google-apps.folder' and trashed = false`
      );
      const broadRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${broadQ}&fields=files(id,name,mimeType,modifiedTime,createdTime,parents,appProperties,description,webViewLink)&spaces=drive`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (broadRes.ok) {
        const broadData = await broadRes.json();
        files = (broadData.files || []).filter((f: any) => !TEMPLATE_FILE_NAMES.includes(f.name));
      }
    }

    if (files.length === 0) {
      return {
        found: false,
        folderId: discovered.folderId,
        folderName: discovered.folderName,
        folderPath: discovered.folderPath,
        folderWebViewLink: discovered.folderWebViewLink,
      };
    }

    const targetFile =
      files.find(
        (f: any) =>
          f.mimeType === DOCX_MIME_TYPE &&
          f.parents &&
          discovered.folderId &&
          f.parents.includes(discovered.folderId)
      ) ||
      files.find((f: any) => f.mimeType === DOCX_MIME_TYPE) ||
      files.find(
        (f: any) => f.parents && discovered.folderId && f.parents.includes(discovered.folderId)
      ) ||
      files[0];

    const local = getLocalPermitNote(cleanTc);
    let parsedNotesFromDoc: StatusUpdate[] = [];

    if (
      targetFile.mimeType === DOCX_MIME_TYPE ||
      targetFile.name?.toLowerCase().endsWith('.docx')
    ) {
      try {
        const mediaUrl =
          targetFile.mimeType === 'application/vnd.google-apps.document'
            ? `https://www.googleapis.com/drive/v3/files/${targetFile.id}/export?mimeType=text/plain`
            : `https://www.googleapis.com/drive/v3/files/${targetFile.id}?alt=media`;

        const contentRes = await fetch(mediaUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (contentRes.ok) {
          if (targetFile.mimeType === 'application/vnd.google-apps.document') {
            const plainText = await contentRes.text();
            parsedNotesFromDoc = parseMcdotNotesPlainText(plainText, targetFile.createdTime);
          } else {
            const ab = await contentRes.arrayBuffer();
            const docPlainText = await extractDocxPlainText(ab);
            parsedNotesFromDoc = parseMcdotNotesPlainText(docPlainText, targetFile.createdTime);

            if (!cachedTemplateSeal && !getCachedOfficialSealPayload()) {
              const maybeSeal = await extractDocxSealImage(ab);
              if (maybeSeal) {
                cachedTemplateSeal = maybeSeal;
                saveOfficialSealToCache(maybeSeal);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Reading .docx content from Drive non-fatal warning:', e);
      }
    } else if (targetFile.mimeType === 'application/vnd.google-apps.document') {
      try {
        const expRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${targetFile.id}/export?mimeType=text/plain`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (expRes.ok) {
          const txt = await expRes.text();
          parsedNotesFromDoc = parseMcdotNotesPlainText(txt, targetFile.createdTime);
        }
      } catch (e) {
        console.warn('Google Doc plain-text export skipped:', e);
      }
    }

    let legacyParsedContent: PermitNoteFile | undefined;
    if (targetFile.appProperties?.mcdotNotesJson) {
      try {
        legacyParsedContent = JSON.parse(targetFile.appProperties.mcdotNotesJson);
      } catch {}
    }

    const baseNoteFile: PermitNoteFile = local?.hasUnsyncedChanges
      ? local
      : legacyParsedContent ||
        local || {
          tcNumber: cleanTc,
          permitId: cleanTc,
          lastSyncedAt: targetFile.modifiedTime || new Date().toISOString(),
          inspectorNotes: [],
          photos: [],
          auditTrail: [],
        };

    let finalNotes = baseNoteFile.inspectorNotes || [];
    // Only merge parsed notes from Drive .docx when local does NOT have unsynced edits/deletions;
    // otherwise offline deletions or inline edits would get resurrected by stale Drive .docx content.
    if (!local?.hasUnsyncedChanges && parsedNotesFromDoc.length > 0) {
      if (finalNotes.length === 0) {
        finalNotes = parsedNotesFromDoc;
      } else {
        const byFormattedRow = new Map<string, StatusUpdate>();
        for (const n of parsedNotesFromDoc) {
          byFormattedRow.set(formatMcdotLogRow(n.timestamp, n.text).toLowerCase(), n);
        }
        for (const n of finalNotes) {
          const key = formatMcdotLogRow(n.timestamp, n.text).toLowerCase();
          byFormattedRow.set(key, n);
        }
        finalNotes = Array.from(byFormattedRow.values()).sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      }
    }

    const webViewLink = buildDriveFileWebLink(targetFile.id, targetFile.webViewLink);
    const syncedAt = targetFile.modifiedTime || new Date().toISOString();

    const mergedContent: PermitNoteFile = {
      ...baseNoteFile,
      tcNumber: cleanTc,
      lastSyncedAt: syncedAt,
      hasUnsyncedChanges: Boolean(local?.hasUnsyncedChanges),
      driveFileId: targetFile.id,
      driveFileName: targetFile.name,
      driveWebViewLink: webViewLink,
      driveFolderId: discovered.folderId,
      driveFolderName: discovered.folderName,
      driveFolderPath: discovered.folderPath,
      driveFolderWebViewLink: discovered.folderWebViewLink,
      inspectorNotes: finalNotes,
      preConContact: baseNoteFile.preConContact || getPreConContact(cleanTc) || undefined,
    };

    saveLocalPermitNote(mergedContent);

    return {
      found: true,
      fileId: targetFile.id,
      fileName: targetFile.name,
      webViewLink,
      folderId: discovered.folderId,
      folderName: discovered.folderName,
      folderPath: discovered.folderPath,
      folderWebViewLink: discovered.folderWebViewLink,
      syncedAt,
      content: mergedContent,
    };
  } catch (error) {
    console.warn(`Drive search notification for permit ${tcNumber}:`, error);
    throw error;
  }
}

/**
 * Creates a valid Microsoft Word .docx file ('[PermitNumber] Permit Notes.docx')
 * inside the discovered Permit Notes folder in Google Drive.
 */
export async function createPermitNoteInDrive(
  accessToken: string,
  permit: Permit,
  initialNotes: Partial<PermitNoteFile> = {},
  customFolderId?: string
): Promise<{
  fileId: string;
  fileName: string;
  webViewLink: string;
  folderId: string;
  folderName: string;
  folderPath: string;
  folderWebViewLink: string;
  syncedAt: string;
  noteFile: PermitNoteFile;
}> {
  const discovered = await discoverPermitNotesDriveFolder(accessToken);
  const folderId =
    customFolderId && customFolderId.trim().length > 0
      ? customFolderId.trim()
      : discovered.folderId;
  const folderName = discovered.folderName;
  const folderPath = discovered.folderPath;
  const folderWebViewLink = buildDriveFolderWebLink(folderId);

  const cleanTc = permit.tcNumber.trim();
  const fileName = `${cleanTc} Permit Notes.docx`;
  const syncedAt = new Date().toISOString();

  const wasExplicitlyCleared = (initialNotes.auditTrail || []).some((a) =>
    a.action.startsWith('Deleted')
  );

  const newNoteData: PermitNoteFile = {
    tcNumber: cleanTc,
    permitId: permit.id,
    lastSyncedAt: syncedAt,
    hasUnsyncedChanges: false,
    driveFileName: fileName,
    driveFolderId: folderId,
    driveFolderName: folderName,
    driveFolderPath: folderPath,
    driveFolderWebViewLink: folderWebViewLink,
    inspectorNotes:
      initialNotes.inspectorNotes && initialNotes.inspectorNotes.length > 0
        ? initialNotes.inspectorNotes
        : wasExplicitlyCleared
        ? []
        : [
            {
              id: `init-${Date.now()}`,
              timestamp: syncedAt,
              inspector: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
              text: 'Permit logged.',
              voiceDictated: false,
            },
          ],
    preConMeeting: initialNotes.preConMeeting,
    preConContact: initialNotes.preConContact || getPreConContact(cleanTc) || undefined,
    photos: initialNotes.photos || [],
    auditTrail: [
      ...(initialNotes.auditTrail || []),
      {
        timestamp: syncedAt,
        action: `Created ${fileName} in ${folderPath}`,
        user: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
      },
    ],
  };

  const sealPayload = await resolveTemplateSealForDocx(accessToken, [
    discovered.rootFolderId,
    folderId,
  ]);
  const docxBlob = await generateMcdotDocxBlob(permit, newNoteData, sealPayload);

  const metadata: Record<string, any> = {
    name: fileName,
    mimeType: DOCX_MIME_TYPE,
    description: `MCDOT Permit Notes for ${cleanTc} - Inspector: ${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
    appProperties: {
      tcNumber: cleanTc.slice(0, 30),
      inspectorCode: MCDOT_INSPECTOR_CODE,
      app: 'mcdot-spark',
    },
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const createdFile = await uploadDocxMultipartToDrive({
    accessToken,
    docxBlob,
    metadata,
  });

  const webViewLink = buildDriveFileWebLink(createdFile.id, createdFile.webViewLink);
  newNoteData.driveFileId = createdFile.id;
  newNoteData.driveFileName = createdFile.name || fileName;
  newNoteData.driveWebViewLink = webViewLink;

  saveLocalPermitNote(newNoteData);

  return {
    fileId: createdFile.id,
    fileName: createdFile.name || fileName,
    webViewLink,
    folderId,
    folderName,
    folderPath,
    folderWebViewLink,
    syncedAt,
    noteFile: newNoteData,
  };
}

/**
 * Updates existing '[PermitNumber] Permit Notes.docx' in place via PATCH in Google Drive
 * so duplicate files are never created.
 */
export async function updatePermitNoteInDrive(
  accessToken: string,
  fileId: string,
  noteData: PermitNoteFile,
  permit?: Permit
): Promise<PermitNoteFile> {
  const cleanTc = (permit?.tcNumber || noteData.tcNumber || '').trim();
  const fileName = `${cleanTc} Permit Notes.docx`;
  const syncedAt = new Date().toISOString();

  const effectivePermit: Permit = permit || {
    id: noteData.permitId || cleanTc,
    tcNumber: cleanTc,
    projectTitle: cleanTc,
    contractor: null,
    contractorPhone: null,
    location: '',
    permitType: 'Trench / Utility',
    status: 'Unknown',
    issueDate: null,
    expirationDate: null,
    lat: 33.4484,
    lng: -112.074,
    workWindow: null,
    trafficControlPlan: '',
    specialConditions: [],
    preConCompleted: null,
    hasSignInSheet: false,
    hasBusinessCards: false,
  };

  const discovered = await discoverPermitNotesDriveFolder(accessToken);

  const updatedData: PermitNoteFile = {
    ...noteData,
    tcNumber: cleanTc,
    driveFileName: fileName,
    driveFolderId: noteData.driveFolderId || discovered.folderId,
    driveFolderName: noteData.driveFolderName || discovered.folderName,
    driveFolderPath: discovered.folderPath,
    driveFolderWebViewLink: discovered.folderWebViewLink,
    lastSyncedAt: syncedAt,
    hasUnsyncedChanges: false,
    auditTrail: [
      ...(noteData.auditTrail || []),
      {
        timestamp: syncedAt,
        action: `Updated ${fileName} in ${discovered.folderPath}`,
        user: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
      },
    ],
  };

  let existingMimeType = DOCX_MIME_TYPE;
  let fileMissing = false;
  try {
    const checkRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,trashed,webViewLink`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (checkRes.ok) {
      const info = await checkRes.json();
      if (info.trashed) {
        fileMissing = true;
      } else if (info.mimeType) {
        existingMimeType = info.mimeType;
      }
    } else if (checkRes.status === 404 || checkRes.status === 403) {
      // Under drive.file, 404 or 403 on a stale/foreign fileId means we should create a fresh app-owned .docx
      fileMissing = true;
    }
  } catch {
    // Proceed with in-place PATCH
  }

  if (fileMissing || existingMimeType === 'application/vnd.google-apps.document') {
    const refreshedFolder = await discoverPermitNotesDriveFolder(accessToken, {
      forceRefresh: true,
    });
    const created = await createPermitNoteInDrive(
      accessToken,
      effectivePermit,
      updatedData,
      refreshedFolder.folderId
    );
    return created.noteFile;
  }

  const sealPayload = await resolveTemplateSealForDocx(accessToken, [
    discovered.rootFolderId,
    discovered.folderId,
  ]);
  const docxBlob = await generateMcdotDocxBlob(effectivePermit, updatedData, sealPayload);

  const metadata: Record<string, any> = {
    name: fileName,
    mimeType: DOCX_MIME_TYPE,
    description: `MCDOT Permit Notes for ${cleanTc} - Updated ${new Date().toLocaleString()}`,
    appProperties: {
      tcNumber: cleanTc.slice(0, 30),
      inspectorCode: MCDOT_INSPECTOR_CODE,
      app: 'mcdot-spark',
    },
  };

  let saved: { id: string; name: string; mimeType?: string; webViewLink?: string };
  try {
    saved = await uploadDocxMultipartToDrive({
      accessToken,
      docxBlob,
      metadata,
      existingFileId: fileId,
    });
  } catch (patchErr: any) {
    if (isDriveFileAccessMismatchError(patchErr) || patchErr?.status === 404) {
      const refreshedFolder = await discoverPermitNotesDriveFolder(accessToken, {
        forceRefresh: true,
      });
      const created = await createPermitNoteInDrive(
        accessToken,
        effectivePermit,
        updatedData,
        refreshedFolder.folderId
      );
      return created.noteFile;
    }
    throw patchErr;
  }

  const finalId = saved.id || fileId;
  updatedData.driveFileId = finalId;
  updatedData.driveFileName = saved.name || fileName;
  updatedData.driveWebViewLink = buildDriveFileWebLink(finalId, saved.webViewLink);
  saveLocalPermitNote(updatedData);
  return updatedData;
}

/**
 * Unified auto-sync entrypoint used on ALL note actions (voice dictation, text add,
 * quick-log pill tap, pre-con log click, inline edit, inline delete, manual sync):
 * - Discovers 'My Drive > Spark Work > Permit Notes' first, else 'My Drive > Spark Notes > Permit Notes'
 * - Finds any existing file for the permit so we PATCH in place and never create duplicates
 * - Rebuilds the .docx with the official template seal and returns { fileId, webViewLink, folderId, folderPath, syncedAt }
 */
export async function syncPermitNoteStateToDrive(
  accessToken: string,
  permit: Permit,
  noteFileState: PermitNoteFile
): Promise<DriveSyncSummary> {
  const cleanTc = permit.tcNumber.trim();
  const discovered = await discoverPermitNotesDriveFolder(accessToken);

  let targetFileId = noteFileState.driveFileId || '';

  // If we don't have a driveFileId yet, search Drive first to avoid creating duplicates
  if (!targetFileId) {
    const existingSearch = await searchDriveForPermitNotes(accessToken, cleanTc);
    if (existingSearch.found && existingSearch.fileId) {
      targetFileId = existingSearch.fileId;
    }
  }

  if (targetFileId) {
    const updatedNoteFile = await updatePermitNoteInDrive(
      accessToken,
      targetFileId,
      {
        ...noteFileState,
        driveFileId: targetFileId,
        driveFolderId: discovered.folderId,
        driveFolderName: discovered.folderName,
        driveFolderPath: discovered.folderPath,
        driveFolderWebViewLink: discovered.folderWebViewLink,
      },
      permit
    );

    const finalId = updatedNoteFile.driveFileId || targetFileId;
    const webViewLink =
      updatedNoteFile.driveWebViewLink || buildDriveFileWebLink(finalId);
    const syncedAt = updatedNoteFile.lastSyncedAt || new Date().toISOString();

    return {
      fileId: finalId,
      fileName: updatedNoteFile.driveFileName || `${cleanTc} Permit Notes.docx`,
      webViewLink,
      folderId: discovered.folderId,
      folderPath: discovered.folderPath,
      folderWebViewLink: discovered.folderWebViewLink,
      syncedAt,
      noteFile: updatedNoteFile,
    };
  } else {
    const created = await createPermitNoteInDrive(
      accessToken,
      permit,
      noteFileState,
      discovered.folderId
    );
    return {
      fileId: created.fileId,
      fileName: created.fileName,
      webViewLink: created.webViewLink,
      folderId: created.folderId,
      folderPath: created.folderPath,
      folderWebViewLink: created.folderWebViewLink,
      syncedAt: created.syncedAt,
      noteFile: created.noteFile,
    };
  }
}

/**
 * Local offline cache methods for reliable field operation
 */
export function getLocalPermitNote(tcNumber: string): PermitNoteFile | null {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_PREFIX + tcNumber.trim());
    if (!data) return null;
    const parsed = JSON.parse(data) as PermitNoteFile;
    if (parsed && Array.isArray(parsed.inspectorNotes)) {
      parsed.inspectorNotes = parsed.inspectorNotes.map((n) => ({
        ...n,
        text: stripLogRowDecorations(n.text || ''),
      }));
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalPermitNote(noteFile: PermitNoteFile): StorageWriteResult {
  try {
    // Strip heavy base64 dataUrl payloads from localStorage JSON; photos live as Blobs in IndexedDB
    const lightweightPhotos = Array.isArray(noteFile.photos)
      ? noteFile.photos.map((photo) => {
          if (photo.dataUrl) {
            void migrateDataUrlToPhotoBlob(photo.id, photo.dataUrl);
          }
          const { dataUrl: _omitted, ...metaOnly } = photo;
          return {
            ...metaOnly,
            storedInIdb: true,
          };
        })
      : [];

    const sanitized: PermitNoteFile = {
      ...noteFile,
      inspectorNotes: Array.isArray(noteFile.inspectorNotes)
        ? noteFile.inspectorNotes.map((n) => ({
            ...n,
            text: stripLogRowDecorations(n.text || ''),
          }))
        : [],
      photos: lightweightPhotos,
    };
    localStorage.setItem(
      LOCAL_STORAGE_PREFIX + noteFile.tcNumber.trim(),
      JSON.stringify(sanitized)
    );
    return { ok: true };
  } catch (e: any) {
    const isQuota = isQuotaExceededError(e);
    const errorMsg = isQuota
      ? 'Storage full — export or sync logs now'
      : `Could not save permit log locally: ${e?.message || 'Storage write failed'}`;
    console.warn('LocalStorage save failed:', e);
    notifyStorageError(errorMsg, isQuota);
    return { ok: false, error: errorMsg, isQuotaError: isQuota };
  }
}

/**
 * Returns existing local notes if present, or a clean empty PermitNoteFile in memory
 * so opening a permit never fabricates notes before the inspector logs an entry.
 */
export function createInitialLocalNotes(permit: Permit): PermitNoteFile {
  const existing = getLocalPermitNote(permit.tcNumber);
  if (existing) {
    return existing;
  }

  return {
    tcNumber: permit.tcNumber.trim(),
    permitId: permit.id,
    lastSyncedAt: '',
    hasUnsyncedChanges: false,
    driveFileName: `${permit.tcNumber.trim()} Permit Notes.docx`,
    driveFolderName: PERMIT_NOTES_SUBFOLDER_NAME,
    driveFolderPath: `My Drive > ${TARGET_FOLDER_NAME} > ${PERMIT_NOTES_SUBFOLDER_NAME}`,
    inspectorNotes: [],
    photos: [],
    auditTrail: [],
  };
}

/**
 * Backwards-compatible dictated note workflow delegating to syncPermitNoteStateToDrive
 */
export async function syncDictatedNoteWorkflow(
  accessToken: string,
  permit: Permit,
  currentNoteFile: PermitNoteFile,
  cleanedDictatedText: string
): Promise<PermitNoteFile> {
  const newLogEntry: StatusUpdate = {
    id: `stat-${Date.now()}`,
    timestamp: new Date().toISOString(),
    inspector: `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`,
    text: cleanedDictatedText,
    voiceDictated: true,
  };

  const notesByRow = new Map<string, StatusUpdate>();
  for (const note of currentNoteFile.inspectorNotes || []) {
    notesByRow.set(formatMcdotLogRow(note.timestamp, note.text).toLowerCase(), note);
  }
  const newRowKey = formatMcdotLogRow(newLogEntry.timestamp, newLogEntry.text).toLowerCase();
  if (!notesByRow.has(newRowKey)) {
    notesByRow.set(newRowKey, newLogEntry);
  }

  const mergedState: PermitNoteFile = {
    ...currentNoteFile,
    inspectorNotes: Array.from(notesByRow.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    ),
  };

  const summary = await syncPermitNoteStateToDrive(accessToken, permit, mergedState);
  return summary.noteFile;
}

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  Tab,
  TabStopType,
} from 'docx';
import { Permit, PermitNoteFile, StatusUpdate } from '../types/permit';
import { getMaricopaSealPngBytes, MARICOPA_SEAL_DATA_URL } from '../assets/maricopaSeal';

/**
 * Standard MCDOT Inspector identifier
 */
export const MCDOT_INSPECTOR_NAME = 'Marco Canzano';
export const MCDOT_INSPECTOR_CODE = 'MAC';

/**
 * LocalStorage cache key for the extracted official PNG/JPEG seal from Permit Notes Template.docx
 */
export const OFFICIAL_SEAL_STORAGE_KEY = 'mcdot_cached_official_seal_png';

/**
 * Exact MCDOT Permit Notes Template 2-line footer anchored at the bottom of the US Letter page
 */
export const MCDOT_FOOTER_LINE_1 =
  'Final Acceptance:  __________________________________\tDate: _______________';
export const MCDOT_FOOTER_LINE_2 = '\t\t      Inspector Signature';

export interface SealImagePayload {
  bytes: Uint8Array;
  type: 'png' | 'jpg';
}

/**
 * Chunked Uint8Array -> base64 encoder (safe for large high-DPI PNG images without stack overflow)
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const sub = bytes.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode.apply(null, Array.from(sub)));
  }
  return btoa(chunks.join(''));
}

/**
 * Base64 (or data URL) -> Uint8Array decoder
 */
export function base64ToUint8Array(input: string): Uint8Array {
  const cleanBase64 = input.includes(',') ? input.split(',')[1].trim() : input.trim();
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Saves an extracted official seal image into localStorage ('mcdot_cached_official_seal_png')
 * and returns its ready-to-render data URL.
 */
export function saveOfficialSealToCache(payload: SealImagePayload): string {
  const mime = payload.type === 'jpg' ? 'image/jpeg' : 'image/png';
  const b64 = uint8ArrayToBase64(payload.bytes);
  const dataUrl = `data:${mime};base64,${b64}`;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OFFICIAL_SEAL_STORAGE_KEY, dataUrl);
    }
  } catch (e) {
    console.warn('Unable to cache official seal in localStorage:', e);
  }
  return dataUrl;
}

/**
 * Returns the cached official seal data URL from localStorage if available,
 * falling back to MARICOPA_SEAL_DATA_URL.
 */
export function getCachedOfficialSealDataUrl(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(OFFICIAL_SEAL_STORAGE_KEY);
      if (raw && raw.trim().length > 32) {
        const trimmed = raw.trim();
        return trimmed.startsWith('data:image/')
          ? trimmed
          : `data:image/png;base64,${trimmed}`;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return MARICOPA_SEAL_DATA_URL;
}

/**
 * Decodes the cached official seal from localStorage ('mcdot_cached_official_seal_png')
 * into raw bytes for .docx embedding, or returns null if none is cached yet.
 */
export function getCachedOfficialSealPayload(): SealImagePayload | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(OFFICIAL_SEAL_STORAGE_KEY);
    if (!raw || raw.trim().length < 32) return null;

    const bytes = base64ToUint8Array(raw);
    if (bytes.length < 32) return null;

    const isPng =
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!isPng && !isJpg) return null;

    return {
      bytes,
      type: isPng ? 'png' : 'jpg',
    };
  } catch {
    return null;
  }
}

/**
 * Formats dates into standard MM/DD/YYYY format for MCDOT permit notes
 */
export function formatMcdotDate(dateInput?: string | Date): string {
  if (!dateInput) {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  }
  if (typeof dateInput === 'string') {
    const clean = dateInput.replace(/^\[|\]$/g, '').trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return clean;
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const parts = clean.split('-');
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return String(dateInput).replace(/^\[|\]$/g, '').trim();
  }
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Collapses repeating sub-sequences of words/tokens (from 1 word up to 15 words)
 * to eliminate microphone feedback, audio echo loops, and speech recognition re-emissions.
 */
export function collapseRepeatingTokenSequences(str: string): string {
  if (!str || typeof str !== 'string') return '';
  const rawWords = str.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length < 2) return str.trim();

  const words = [...rawWords];
  let changed = true;
  let safety = 0;

  while (changed && safety < 10) {
    changed = false;
    safety++;
    const n = words.length;

    for (let k = Math.min(15, Math.floor(n / 2)); k >= 1; k--) {
      for (let i = 0; i <= n - 2 * k; i++) {
        let isMatch = true;
        for (let j = 0; j < k; j++) {
          const w1 = words[i + j].toLowerCase().replace(/[^a-z0-9]/g, '');
          const w2 = words[i + k + j].toLowerCase().replace(/[^a-z0-9]/g, '');
          if (w1 !== w2) {
            isMatch = false;
            break;
          }
        }
        if (isMatch) {
          words.splice(i + k, k);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return words.join(' ');
}

/**
 * Removes immediate repeating words, phrases, and sentence duplicates caused by
 * Web Speech API cumulative result events, audio looping, or microphone feedback echoes.
 */
export function removeDuplicatePhrases(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let result = text.trim();

  // Pass 1: Multi-word phrase regex
  for (let pass = 0; pass < 3; pass++) {
    result = result.replace(/\b((?:[\w'-]+\s+){1,10}[\w'-]+)[,.]?\s+\1\b/gi, '$1');
    result = result.replace(/\b([\w'-]+)(?:\s+\1\b)+/gi, '$1');
  }

  // Pass 2: Token-level repeating sequence collapse
  result = collapseRepeatingTokenSequences(result);

  // Pass 3: Sentence-level duplicate filtering
  const sentenceParts = result.split(/(?<=[.!?])\s+/);
  if (sentenceParts.length > 1) {
    const deduped: string[] = [];
    for (const part of sentenceParts) {
      const normalized = part.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const lastNormalized =
        deduped.length > 0
          ? deduped[deduped.length - 1].trim().toLowerCase().replace(/[^a-z0-9]/g, '')
          : '';
      if (!lastNormalized || normalized !== lastNormalized) {
        deduped.push(part.trim());
      }
    }
    result = deduped.join(' ');
  }

  return result.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Strips any existing leading date/MAC prefix or trailing "– MAC" suffix from a note string
 * so re-saving, migrating, or editing never creates duplicate dates or trailing inspector codes.
 */
export function stripLogRowDecorations(raw: string): string {
  let cleaned = (raw || '').trim();
  for (let pass = 0; pass < 3; pass++) {
    const prev = cleaned;
    cleaned = cleaned
      .replace(
        /^\[?\d{1,2}\/\d{1,2}\/\d{2,4}\]?\s*(?:[–—-]\s*)?(?:MAC\b\s*(?:,\s*|[–—-]\s*)?)?/i,
        ''
      )
      .replace(/^MAC\b\s*(?:,|[–—-])\s*/i, '')
      .replace(/\s*[–—-]\s*MAC\.?\s*$/i, '')
      .trim();
    if (cleaned === prev) break;
  }
  return cleaned;
}

/**
 * Formats a single chronological entry in the exact 'MM/DD/YYYY MAC, [Note text]' format
 * (e.g., '11/12/2026 MAC, Permit logged.').
 */
export function formatMcdotLogRow(timestamp: string, noteText: string): string {
  const dateStr = formatMcdotDate(timestamp);
  let trimmed = stripLogRowDecorations(removeDuplicatePhrases(noteText || ''));

  if (!trimmed) {
    trimmed = 'Permit logged.';
  }

  // Ensure trailing punctuation on the note sentence
  if (!/[.!?]$/.test(trimmed)) {
    trimmed = `${trimmed}.`;
  }

  return `${dateStr} ${MCDOT_INSPECTOR_CODE}, ${trimmed}`;
}

/**
 * Helper to obtain Section / Township / Range string
 */
export function getPermitStr(permit: Permit): string {
  if (permit.sec && permit.township && permit.range) {
    return `Sec ${permit.sec} / T${permit.township} / R${permit.range}`;
  }
  if (permit.milepost && permit.milepost.toLowerCase().includes('sec')) {
    return permit.milepost;
  }
  if (permit.lat && permit.lng) {
    if (permit.lat > 33.7) return 'Sec 18 / T4N / R3W';
    if (permit.lat > 33.6) return 'Sec 14 / T3N / R1E';
    if (permit.lat > 33.5) return 'Sec 22 / T2N / R1E';
    return 'Sec 08 / T1N / R2E';
  }
  return 'Sec 18 / T4N / R3W';
}

/**
 * Builds normalized chronological log lines ('MM/DD/YYYY MAC, [Note text]') for export/display
 */
export function buildChronologicalLogLines(permit: Permit, noteFile: PermitNoteFile): string[] {
  void permit;
  const sortedNotes = [...(noteFile.inspectorNotes || [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  if (sortedNotes.length === 0) {
    const wasExplicitlyCleared = (noteFile.auditTrail || []).some((a) =>
      a.action.startsWith('Deleted')
    );
    if (wasExplicitlyCleared) {
      return [];
    }
    return [`${formatMcdotDate(new Date())} ${MCDOT_INSPECTOR_CODE}, Permit logged.`];
  }

  return sortedNotes.map((note) => formatMcdotLogRow(note.timestamp, note.text));
}

/**
 * Browser-native ZIP Central Directory reader supporting BOTH:
 * - Compression method 0 (Stored / uncompressed)
 * - Compression method 8 (Deflate via new DecompressionStream('deflate-raw'))
 */
interface ZipEntryInfo {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function readZipDirectory(buffer: ArrayBuffer): { bytes: Uint8Array; entries: ZipEntryInfo[] } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries: ZipEntryInfo[] = [];

  if (bytes.length < 22) {
    return { bytes, entries };
  }

  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  const minSearch = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    return { bytes, entries };
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');

  let pos = cdOffset;
  for (let idx = 0; idx < totalEntries && pos + 46 <= bytes.length; idx++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;

    const compressionMethod = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const uncompressedSize = view.getUint32(pos + 24, true);
    const fileNameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);

    const fileName = decoder.decode(bytes.subarray(pos + 46, pos + 46 + fileNameLen));
    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    pos += 46 + fileNameLen + extraLen + commentLen;
  }

  return { bytes, entries };
}

async function extractZipEntryBytes(bytes: Uint8Array, entry: ZipEntryInfo): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const loc = entry.localHeaderOffset;
  if (loc + 30 > bytes.length || view.getUint32(loc, true) !== 0x04034b50) {
    return null;
  }

  const localCompression = view.getUint16(loc + 8, true);
  const localCompressedSize = view.getUint32(loc + 18, true);
  const localNameLen = view.getUint16(loc + 26, true);
  const localExtraLen = view.getUint16(loc + 28, true);

  const method = entry.compressionMethod ?? localCompression;
  const compSize = entry.compressedSize > 0 ? entry.compressedSize : localCompressedSize;

  const dataStart = loc + 30 + localNameLen + localExtraLen;
  const dataEnd = dataStart + compSize;
  if (dataEnd > bytes.length) return null;

  const rawSlice = bytes.subarray(dataStart, dataEnd);

  // Method 0: Stored (uncompressed)
  if (method === 0) {
    return new Uint8Array(rawSlice);
  }

  // Method 8: Deflate (raw deflate stream)
  if (method === 8 && typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('deflate-raw');
      const copy = new Uint8Array(rawSlice);
      const stream = new Blob([copy]).stream().pipeThrough(ds);
      const decompressedBuffer = await new Response(stream).arrayBuffer();
      return new Uint8Array(decompressedBuffer);
    } catch (e) {
      console.warn('ZIP deflate-raw decompression failed:', e);
      return null;
    }
  }

  return null;
}

/**
 * Extracts the embedded Maricopa County Seal image (e.g. 'word/media/image1.png')
 * from a .docx ArrayBuffer, supporting BOTH ZIP method 0 (Stored) and method 8 (Deflate).
 */
export async function extractDocxSealImage(
  docxArrayBuffer: ArrayBuffer
): Promise<SealImagePayload | null> {
  try {
    const { bytes, entries } = readZipDirectory(docxArrayBuffer);
    const mediaCandidates = [
      ...entries.filter((e) => /^word\/media\/image1\.png$/i.test(e.fileName)),
      ...entries.filter(
        (e) =>
          /^word\/media\/.+\.png$/i.test(e.fileName) &&
          !/^word\/media\/image1\.png$/i.test(e.fileName)
      ),
      ...entries.filter((e) => /^word\/media\/.+\.(jpg|jpeg)$/i.test(e.fileName)),
    ];

    for (const mediaEntry of mediaCandidates) {
      const extracted = await extractZipEntryBytes(bytes, mediaEntry);
      if (!extracted || extracted.length < 32) continue;

      const isPng =
        extracted[0] === 0x89 &&
        extracted[1] === 0x50 &&
        extracted[2] === 0x4e &&
        extracted[3] === 0x47;
      const isJpg = extracted[0] === 0xff && extracted[1] === 0xd8;

      if (isPng || isJpg) {
        return {
          bytes: extracted,
          type: isPng ? 'png' : 'jpg',
        };
      }
    }

    return null;
  } catch (err) {
    console.warn('extractDocxSealImage non-fatal warning:', err);
    return null;
  }
}

/**
 * Imports a user-selected official template .docx file, extracts its embedded PNG/JPEG seal,
 * caches it in localStorage ('mcdot_cached_official_seal_png'), and returns the dataUrl + payload.
 */
export async function importOfficialTemplateDocxFile(
  fileOrBuffer: File | ArrayBuffer
): Promise<{ dataUrl: string; payload: SealImagePayload }> {
  const arrayBuffer =
    fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer();

  const extracted = await extractDocxSealImage(arrayBuffer);
  if (!extracted) {
    throw new Error(
      'Could not find an embedded PNG/JPG seal inside the selected .docx template (expected word/media/image1.png).'
    );
  }

  const dataUrl = saveOfficialSealToCache(extracted);
  return { dataUrl, payload: extracted };
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Extracts plain text paragraph lines from a .docx ArrayBuffer ('word/document.xml').
 */
export async function extractDocxPlainText(docxArrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const { bytes, entries } = readZipDirectory(docxArrayBuffer);
    const docXmlEntry = entries.find((e) => e.fileName === 'word/document.xml');
    if (!docXmlEntry) return '';

    const xmlBytes = await extractZipEntryBytes(bytes, docXmlEntry);
    if (!xmlBytes) return '';

    const xml = new TextDecoder('utf-8').decode(xmlBytes);
    const paragraphs: string[] = [];
    const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
    let pMatch: RegExpExecArray | null;

    while ((pMatch = pRegex.exec(xml)) !== null) {
      const pInner = pMatch[1];
      const tokenRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
      let line = '';
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tokenRegex.exec(pInner)) !== null) {
        if (tMatch[0].startsWith('<w:tab')) {
          line += '\t';
        } else if (tMatch[0].startsWith('<w:br')) {
          line += '\n';
        } else if (tMatch[1] !== undefined) {
          line += decodeXmlEntities(tMatch[1]);
        }
      }
      paragraphs.push(line);
    }

    return paragraphs.join('\n');
  } catch (err) {
    console.warn('extractDocxPlainText non-fatal warning:', err);
    return '';
  }
}

/**
 * Cleanly parses chronological 'MM/DD/YYYY – [Note text] – MAC' (as well as legacy 'MM/DD/YYYY MAC, ...')
 * lines from an existing .docx or plain-text document, ignoring header, blank lines, and signature footer.
 */
export function parseMcdotNotesPlainText(rawText: string, fallbackDateIso?: string): StatusUpdate[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/);
  const parsed: StatusUpdate[] = [];
  let seqOffsetMs = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Ignore template header & footer lines
    if (/^Permit\s*#\s*:/i.test(trimmed)) continue;
    if (/^Final\s+Acceptance\s*:/i.test(trimmed)) continue;
    if (/^Inspector\s+Signature\b/i.test(trimmed)) continue;
    if (/^MARICOPA\s+COUNTY/i.test(trimmed)) continue;
    if (/^RIGHT-OF-WAY\s+PERMIT/i.test(trimmed)) continue;
    if (/^Page\s+\d+\s+of\s+\d+/i.test(trimmed)) continue;

    // Pattern A: Standard MCDOT format 'MM/DD/YYYY MAC, [Note text]'
    const primaryMatch = trimmed.match(
      /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]?\s+([A-Z]{2,5})\s*,\s*(.+)$/i
    );

    // Pattern B: Legacy dash format 'MM/DD/YYYY – [Note text] – MAC'
    const dashMatch = !primaryMatch
      ? trimmed.match(
          /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]?\s*[–—-]\s*(.+?)(?:\s*[–—-]\s*([A-Z]{2,5})\.?)?$/i
        )
      : null;

    // Pattern C: Date-only fallback 'MM/DD/YYYY [Note text]'
    const fallbackMatch =
      !primaryMatch && !dashMatch
        ? trimmed.match(/^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]?\s+(.+)$/i)
        : null;

    const activeMatch = primaryMatch || dashMatch || fallbackMatch;
    if (activeMatch) {
      const month = Number(activeMatch[1]);
      const day = Number(activeMatch[2]);
      let year = Number(activeMatch[3]);
      if (year < 100) year += 2000;

      const inspectorCode = primaryMatch
        ? (primaryMatch[4] || MCDOT_INSPECTOR_CODE).toUpperCase()
        : dashMatch
        ? (dashMatch[5] || MCDOT_INSPECTOR_CODE).toUpperCase()
        : MCDOT_INSPECTOR_CODE;
      const rawBody = primaryMatch
        ? primaryMatch[5]
        : dashMatch
        ? dashMatch[4]
        : fallbackMatch![4];
      const bodyText = stripLogRowDecorations(rawBody);
      if (!bodyText) continue;

      const parsedDate = new Date(year, month - 1, day, 8, 0, 0, 0);
      const isoTimestamp = !isNaN(parsedDate.getTime())
        ? new Date(parsedDate.getTime() + seqOffsetMs).toISOString()
        : fallbackDateIso || new Date(Date.now() + seqOffsetMs).toISOString();
      seqOffsetMs += 1000;

      parsed.push({
        id: `parsed-${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}-${seqOffsetMs}`,
        timestamp: isoTimestamp,
        inspector:
          inspectorCode === MCDOT_INSPECTOR_CODE
            ? `${MCDOT_INSPECTOR_NAME} (${MCDOT_INSPECTOR_CODE})`
            : inspectorCode,
        text: bodyText,
        voiceDictated: false,
      });
    }
  }

  return parsed;
}

/**
 * Generates an authentic Microsoft Word .DOCX document strictly matching 'Permit Notes Template.docx':
 * - Standard US Letter (8.5" x 11" = 12240 x 15840 twips), 1 inch (1440 twips) margins on all 4 sides
 * - Calibri 11pt (#000000 black text on #FFFFFF white page)
 * - Top-left Official Maricopa County Seal (1.15" x 1.15" = 110 x 110 px at 96 DPI)
 * - Bold left-aligned 'Permit #: [PermitNumber]', followed by one clean blank line
 * - Chronological notes formatted as 'MM/DD/YYYY – [Note text] – MAC'
 * - Bottom-anchored Final Acceptance / Date: _______________ / Inspector Signature footer block
 */
export async function generateMcdotDocxBlob(
  permit: Permit,
  noteFile: PermitNoteFile,
  customSeal?: SealImagePayload | Uint8Array | null
): Promise<Blob> {
  let sealBytes: Uint8Array;
  let sealType: 'png' | 'jpg' = 'png';

  const cachedLocalSeal = getCachedOfficialSealPayload();

  if (customSeal instanceof Uint8Array && customSeal.length > 32) {
    sealBytes = customSeal;
    sealType = customSeal[0] === 0xff && customSeal[1] === 0xd8 ? 'jpg' : 'png';
  } else if (customSeal && 'bytes' in customSeal && customSeal.bytes.length > 32) {
    sealBytes = customSeal.bytes;
    sealType = customSeal.type;
  } else if (cachedLocalSeal) {
    sealBytes = cachedLocalSeal.bytes;
    sealType = cachedLocalSeal.type;
  } else {
    sealBytes = await getMaricopaSealPngBytes(300);
    sealType = 'png';
  }

  const logEntries = buildChronologicalLogLines(permit, noteFile);

  // Estimate wrapped lines across a 6.5" printable line width (~84 chars in Calibri 11pt)
  // so the Final Acceptance signature block stays anchored near the bottom of Page 1.
  const estimatedNoteLines = logEntries.reduce((acc, entry, idx) => {
    const wrapped = Math.max(1, Math.ceil(entry.length / 84));
    const separatorBlank = idx < logEntries.length - 1 ? 1 : 0;
    return acc + wrapped + separatorBlank;
  }, 0);

  const emptyLineCount = Math.max(3, 33 - estimatedNoteLines);

  const makeBlankParagraph = () =>
    new Paragraph({
      spacing: { before: 0, after: 0, line: 240 },
      children: [
        new TextRun({
          text: '',
          font: 'Calibri',
          size: 22,
          color: '000000',
        }),
      ],
    });

  const blankSpacerParagraphs: Paragraph[] = Array.from({ length: emptyLineCount }, () =>
    makeBlankParagraph()
  );

  // Chronological entries in Calibri 11pt (size 22 half-points) formatted as MM/DD/YYYY – [Note text] – MAC
  const noteParagraphs: Paragraph[] = [];
  logEntries.forEach((entry, index) => {
    noteParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 240 },
        children: [
          new TextRun({
            text: entry,
            font: 'Calibri',
            size: 22,
            color: '000000',
          }),
        ],
      })
    );
    if (index < logEntries.length - 1) {
      noteParagraphs.push(makeBlankParagraph());
    }
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 22,
            color: '000000',
          },
          paragraph: {
            spacing: {
              line: 240,
              before: 0,
              after: 0,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240, // 8.5 inches (US Letter)
              height: 15840, // 11.0 inches (US Letter)
            },
            margin: {
              top: 1440, // 1.0 in
              right: 1440, // 1.0 in
              bottom: 1440, // 1.0 in
              left: 1440, // 1.0 in
            },
          },
        },
        children: [
          // 1. Top-left Official Maricopa County Seal (1.15" x 1.15" = 110px x 110px at 96 DPI)
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 80 },
            children: [
              new ImageRun({
                type: sealType,
                data: sealBytes,
                transformation: {
                  width: 110,
                  height: 110,
                },
                altText: {
                  title: 'Seal of Maricopa County, Arizona',
                  description: 'Official Seal of Maricopa County, Arizona',
                  name: 'MaricopaCountySeal',
                },
              }),
            ],
          }),

          // 2. Directly below seal (left-aligned, bold): Permit #: [PermitNumber]
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 0, line: 240 },
            children: [
              new TextRun({
                text: `Permit #: ${permit.tcNumber.trim()}`,
                font: 'Calibri',
                size: 22,
                bold: true,
                color: '000000',
              }),
            ],
          }),

          // 3. One clean blank line before chronological inspection log entries
          makeBlankParagraph(),

          // 4. Chronological Notes Area: MM/DD/YYYY – [Note text] – MAC
          ...noteParagraphs,

          // 5. Dynamic vertical spacer paragraphs keeping signature block anchored near bottom of US Letter page
          ...blankSpacerParagraphs,

          // 6. Exact 2-line Footer Signature Block with aligned OOXML tab stops:
          //    Final Acceptance:  __________________________________\tDate: _______________
          //    \t\t      Inspector Signature
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 0, line: 240 },
            tabStops: [
              {
                type: TabStopType.LEFT,
                position: 6624, // 4.60 in from left margin (aligns Date: _______________ cleanly inside 6.5" body)
              },
            ],
            children: [
              new TextRun({
                children: [
                  'Final Acceptance:  __________________________________',
                  new Tab(),
                  'Date: _______________',
                ],
                font: 'Calibri',
                size: 22,
                color: '000000',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 0, line: 240 },
            tabStops: [
              {
                type: TabStopType.LEFT,
                position: 1080,
              },
              {
                type: TabStopType.LEFT,
                position: 2160,
              },
            ],
            children: [
              new TextRun({
                children: [new Tab(), new Tab(), '      Inspector Signature'],
                font: 'Calibri',
                size: 22,
                color: '000000',
              }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

/**
 * Triggers a download of the .docx file in the inspector's browser
 */
export async function downloadMcdotDocx(
  permit: Permit,
  noteFile: PermitNoteFile,
  customSeal?: SealImagePayload | Uint8Array | null
) {
  const blob = await generateMcdotDocxBlob(permit, noteFile, customSeal);
  const fileName = `${permit.tcNumber.trim()} Permit Notes.docx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates formatted HTML & Plain Text matching the exact Permit Notes Template.docx layout
 */
export function generateMcdotFormattedTableText(permit: Permit, noteFile: PermitNoteFile): {
  plainText: string;
  html: string;
} {
  const logEntries = buildChronologicalLogLines(permit, noteFile);
  const sealDataUrl = getCachedOfficialSealDataUrl();

  const plainText = [
    `Permit #: ${permit.tcNumber.trim()}`,
    '',
    logEntries.join('\n\n'),
    '',
    '',
    MCDOT_FOOTER_LINE_1,
    MCDOT_FOOTER_LINE_2,
  ].join('\n');

  const notesHtml = logEntries
    .map(
      (entry, idx) =>
        `<p style="margin:0 0 ${idx < logEntries.length - 1 ? '11pt' : '0'} 0; font-family:Calibri, 'Times New Roman', sans-serif; font-size:11pt; line-height:1.35; color:#000000;">${entry}</p>`
    )
    .join('');

  const html = `
    <div style="font-family:Calibri, 'Times New Roman', sans-serif; font-size:11pt; width:8.5in; min-height:11in; box-sizing:border-box; color:#000000; background:#ffffff; padding:1in; display:flex; flex-direction:column; justify-content:space-between;">
      <div>
        <div style="margin-bottom:6pt;">
          <img src="${sealDataUrl}" alt="Seal of Maricopa County" width="110" height="110" style="width:1.15in; height:1.15in; display:block;" />
        </div>
        <p style="margin:0 0 11pt 0; font-family:Calibri, 'Times New Roman', sans-serif; font-size:11pt; font-weight:bold; color:#000000;">Permit #: ${permit.tcNumber.trim()}</p>
        <div>
          ${notesHtml}
        </div>
      </div>
      <div style="padding-top:24pt;">
        <p style="margin:0; white-space:pre; font-family:Calibri, 'Times New Roman', sans-serif; font-size:11pt; color:#000000;">${MCDOT_FOOTER_LINE_1}</p>
        <p style="margin:0; white-space:pre; font-family:Calibri, 'Times New Roman', sans-serif; font-size:11pt; color:#000000;">${MCDOT_FOOTER_LINE_2}</p>
      </div>
    </div>
  `;

  return { plainText, html };
}

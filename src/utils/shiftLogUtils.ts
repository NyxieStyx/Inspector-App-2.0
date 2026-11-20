import { Permit, PermitNoteFile, StatusUpdate } from '../types/permit';
import { getLocalPermitNote } from '../services/driveService';
import { formatMcdotDate, formatMcdotLogRow } from './docxExport';
import { inferPermitLifecycleStage } from './permitNotesIntelligence';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  AlignmentType,
} from 'docx';

export interface VisitedPermitRecord {
  permit: Permit;
  noteFile: PermitNoteFile;
  todaysNotes: StatusUpdate[];
  latestTimestamp: string;
}

/**
 * Returns true if the permit has at least one inspector note recorded on today's calendar date.
 */
export function isPermitVisitedToday(tcNumber: string): boolean {
  try {
    const noteFile = getLocalPermitNote(tcNumber);
    if (!noteFile || !noteFile.inspectorNotes || noteFile.inspectorNotes.length === 0) {
      return false;
    }
    const todayStr = formatMcdotDate(new Date());
    return noteFile.inspectorNotes.some(
      (note) => formatMcdotDate(note.timestamp) === todayStr
    );
  } catch {
    return false;
  }
}

/**
 * Collects all permits visited today and their respective today's notes.
 */
export function getTodaysVisitedPermits(allPermits: Permit[]): VisitedPermitRecord[] {
  const todayStr = formatMcdotDate(new Date());
  const records: VisitedPermitRecord[] = [];

  for (const permit of allPermits) {
    const noteFile = getLocalPermitNote(permit.tcNumber);
    if (!noteFile || !noteFile.inspectorNotes) continue;

    const todaysNotes = noteFile.inspectorNotes.filter(
      (n) => formatMcdotDate(n.timestamp) === todayStr
    );

    if (todaysNotes.length > 0) {
      records.push({
        permit,
        noteFile,
        todaysNotes,
        latestTimestamp: todaysNotes[todaysNotes.length - 1].timestamp,
      });
    }
  }

  // Sort by latest note timestamp descending (most recent first)
  records.sort(
    (a, b) =>
      new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime()
  );

  return records;
}

/**
 * Formats a clean shift summary string for copying into email or dispatch reports.
 */
export function formatShiftSummaryText(records: VisitedPermitRecord[]): string {
  const todayStr = formatMcdotDate(new Date());
  let output = `========================================================\n`;
  output += `MCDOT RIGHT-OF-WAY INSPECTION SHIFT SUMMARY\n`;
  output += `Inspector: Marco Canzano (MAC)\n`;
  output += `Date: ${todayStr}\n`;
  output += `Total Permits Inspected: ${records.length}\n`;
  output += `========================================================\n\n`;

  if (records.length === 0) {
    output += `No permits logged yet today.\n`;
    return output;
  }

  records.forEach((rec, idx) => {
    const stage = inferPermitLifecycleStage(rec.noteFile.inspectorNotes);
    output += `[STOP #${idx + 1}] PERMIT: ${rec.permit.tcNumber} (${stage})\n`;
    output += `  Location: ${rec.permit.location}\n`;
    output += `  Contractor: ${rec.permit.contractor || 'Not Listed in GIS'}\n`;
    output += `  Scope / Type: ${rec.permit.permitType} (${rec.permit.projectTitle})\n`;
    output += `  Chronological Notes Logged Today:\n`;

    rec.todaysNotes.forEach((note) => {
      const timeStr = new Date(note.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      output += `    • [${timeStr}] ${formatMcdotLogRow(note.timestamp, note.text)}\n`;
    });

    output += `\n`;
  });

  output += `--- End of MCDOT Field Shift Report ---`;
  return output;
}

/**
 * Generates and triggers download of a standardized DOCX Shift Report.
 */
export async function downloadShiftLogDocx(records: VisitedPermitRecord[]) {
  const todayStr = formatMcdotDate(new Date());
  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const tableRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'MCDOT RIGHT-OF-WAY PATROL - DAILY SHIFT LOG',
                  bold: true,
                  size: 24,
                  font: 'Arial',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Inspector: Marco Canzano (MAC) | Shift Date: ${todayStr} | Generated: ${nowTime}`,
                  size: 19,
                  font: 'Arial',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Total ROW Permits Inspected Today: ${records.length}`,
                  bold: true,
                  size: 20,
                  font: 'Arial',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
          shading: { fill: 'F1F5F9' },
          margins: { top: 120, bottom: 120, left: 160, right: 160 },
        }),
      ],
    }),
  ];

  records.forEach((rec, idx) => {
    const stage = inferPermitLifecycleStage(rec.noteFile.inspectorNotes);
    const permitRowsParagraphs: Paragraph[] = [
      new Paragraph({
        children: [
          new TextRun({
            text: `Stop #${idx + 1}: Permit ${rec.permit.tcNumber}`,
            bold: true,
            size: 21,
            font: 'Calibri',
          }),
          new TextRun({
            text: `   |   Stage: ${stage}`,
            italics: true,
            size: 19,
            font: 'Calibri',
          }),
        ],
        spacing: { before: 80, after: 40 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Location: `,
            bold: true,
            size: 18,
            font: 'Calibri',
          }),
          new TextRun({
            text: `${rec.permit.location}   `,
            size: 18,
            font: 'Calibri',
          }),
          new TextRun({
            text: `Contractor: `,
            bold: true,
            size: 18,
            font: 'Calibri',
          }),
          new TextRun({
            text: `${rec.permit.contractor || 'Not Listed in GIS'}`,
            size: 18,
            font: 'Calibri',
          }),
        ],
        spacing: { after: 60 },
      }),
    ];

    rec.todaysNotes.forEach((note) => {
      const timeStr = new Date(note.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      permitRowsParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[${timeStr}] `,
              bold: true,
              size: 18,
              font: 'Courier New',
              color: '475569',
            }),
            new TextRun({
              text: formatMcdotLogRow(note.timestamp, note.text),
              size: 20,
              font: 'Calibri',
            }),
          ],
          indent: { left: 240 },
          spacing: { after: 40 },
        })
      );
    });

    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: permitRowsParagraphs,
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
          }),
        ],
      })
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `MCDOT Shift Log - MAC - ${todayStr.replace(/\//g, '-')}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

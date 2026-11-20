import React, { useState, useMemo } from 'react';
import { Permit } from '../types/permit';
import {
  getTodaysVisitedPermits,
  formatShiftSummaryText,
  downloadShiftLogDocx,
  VisitedPermitRecord,
} from '../utils/shiftLogUtils';
import { formatMcdotDate, formatMcdotLogRow } from '../utils/docxExport';
import {
  inferPermitLifecycleStage,
  getLifecyclePillStyle,
} from '../utils/permitNotesIntelligence';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Download,
  FileText,
  X,
  ExternalLink,
  Car,
  Shield,
  AlertTriangle,
} from 'lucide-react';

interface TodaysRouteLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  allPermits: Permit[];
  onOpenPermitNotes: (permit: Permit) => void;
}

export default function TodaysRouteLogModal({
  isOpen,
  onClose,
  allPermits,
  onOpenPermitNotes,
}: TodaysRouteLogModalProps) {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const todayStr = useMemo(() => formatMcdotDate(new Date()), []);
  const records = useMemo(() => getTodaysVisitedPermits(allPermits), [allPermits, isOpen]);

  if (!isOpen) return null;

  const handleCopySummary = () => {
    const text = formatShiftSummaryText(records);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
      await downloadShiftLogDocx(records);
    } catch (err) {
      console.error('Failed to export DOCX shift log:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                  Today's Route Log Summary
                </h3>
                <span className="text-[11px] font-mono text-emerald-300 font-bold">
                  · {records.length} {records.length === 1 ? 'Permit' : 'Permits'} Logged Today
                </span>
              </div>
              <p className="text-xs text-slate-200">
                Shift: {todayStr} · Inspector Marco Canzano (MAC)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
            title="Close Route Log"
            aria-label="Close Route Log"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="bg-slate-950/90 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-200 font-semibold">
            <Car className="w-4 h-4 text-blue-400 shrink-0" />
            <span>MCDOT Right-of-Way Field Patrol Daily Record</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCopySummary}
              disabled={records.length === 0}
              className="min-h-[44px] min-w-[44px] h-11 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer select-none"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-300">Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-200 shrink-0" />
                  <span>Copy Shift Summary</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportDocx}
              disabled={records.length === 0 || isExporting}
              className="min-h-[44px] min-w-[44px] h-11 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow select-none"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>{isExporting ? 'Generating...' : 'Export Shift Log (.DOCX)'}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 bg-slate-900">
          {records.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-300 p-6 space-y-2 shadow-sm">
              <Calendar className="w-10 h-10 text-slate-700 mx-auto" />
              <p className="font-bold text-gray-900 text-sm">No inspections logged today yet.</p>
              <p className="text-xs text-slate-700 font-medium max-w-md mx-auto">
                As you visit permits and add notes or quick-log entries, they will automatically appear here in your daily shift log.
              </p>
            </div>
          ) : (
            records.map((rec, index) => (
              <div
                key={rec.permit.id}
                className="bg-white border border-slate-300 rounded-xl p-3.5 sm:p-4 space-y-2.5 shadow-sm text-gray-900"
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-xs font-mono font-extrabold text-blue-900 bg-blue-100 border border-blue-300 px-2 py-0.5 rounded">
                      Stop #{index + 1}
                    </span>
                    <span className="text-xs font-mono font-extrabold text-gray-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                      {rec.permit.tcNumber}
                    </span>
                    {(() => {
                      const stage = inferPermitLifecycleStage(rec.noteFile.inspectorNotes);
                      const st = getLifecyclePillStyle(stage);
                      return (
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded border ${st.bg} ${st.text} ${st.border}`}
                        >
                          <span>{stage}</span>
                        </span>
                      );
                    })()}
                    <span className="text-xs font-bold text-gray-900 truncate max-w-[200px] sm:max-w-[320px]">
                      {rec.permit.location}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPermitNotes(rec.permit);
                    }}
                    className="min-h-[44px] min-w-[44px] h-11 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition cursor-pointer select-none"
                  >
                    <span>View Record</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>

                {/* High-Contrast Contractor & Scope Details */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-800 font-medium">
                  <span>
                    <strong className="text-gray-900 font-bold">Contractor:</strong>{' '}
                    {rec.permit.contractor}
                  </span>
                  <span>
                    <strong className="text-gray-900 font-bold">Scope:</strong>{' '}
                    {rec.permit.projectTitle}
                  </span>
                </div>

                {/* Secondary Notes Logged Today — High-Contrast Sunlight Legibility */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    Notes Logged Today ({rec.todaysNotes.length}):
                  </span>
                  {rec.todaysNotes.map((note) => {
                    const timeStr = new Date(note.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    return (
                      <div
                        key={note.id}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs flex items-start gap-2.5"
                      >
                        <span className="font-mono text-[11px] font-semibold text-slate-700 shrink-0 mt-0.5 tabular-nums">
                          {timeStr}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-gray-900 font-medium text-xs break-words">
                            {formatMcdotLogRow(note.timestamp, note.text)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-4 py-2.5 border-t border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-200 shrink-0">
          <span className="text-[11px] font-mono">
            Inspector Marco Canzano (MAC) · Maricopa County DOT
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] h-11 bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2.5 rounded-xl transition cursor-pointer select-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

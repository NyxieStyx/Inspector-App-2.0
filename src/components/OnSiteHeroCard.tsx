import React from 'react';
import { Permit } from '../types/permit';
import {
  ScopeComplianceItem,
  classifyPermitSeverity,
  getSeverityEdgeClass,
  getSeverityMeta,
} from '../utils/geofenceUtils';
import {
  ResolvedPermitCardContact,
  ClarifiedPermitStatusInfo,
} from '../utils/maricopaPermitsData';
import {
  Phone,
  Check,
  CheckCircle2,
  FileText,
  Mic,
  MapPin,
  X,
  ChevronRight,
} from 'lucide-react';

interface OnSiteHeroCardProps {
  permit: Permit;
  distanceMeters: number;
  isSimulatedArrival: boolean;
  crossStreet: string;
  keyScope: string;
  resolvedContact: ResolvedPermitCardContact;
  statusInfo: ClarifiedPermitStatusInfo;
  isVisitedToday: boolean;
  checklistItems: ScopeComplianceItem[];
  checkedIds: Set<string>;
  isLogging: boolean;
  onToggleCheck: (itemId: string) => void;
  onLogComplianceCheck: () => void;
  onOpenHoldToSpeak: () => void;
  onOpenFullNotes: () => void;
  onCycleSimulatedSite?: () => void;
  onExitSimulatedArrival?: () => void;
}

export default function OnSiteHeroCard({
  permit,
  distanceMeters,
  isSimulatedArrival,
  crossStreet,
  keyScope,
  resolvedContact,
  statusInfo,
  isVisitedToday,
  checklistItems,
  checkedIds,
  isLogging,
  onToggleCheck,
  onLogComplianceCheck,
  onOpenHoldToSpeak,
  onOpenFullNotes,
  onCycleSimulatedSite,
  onExitSimulatedArrival,
}: OnSiteHeroCardProps) {
  const severity = classifyPermitSeverity(permit, isVisitedToday);
  const leftEdgeClass = getSeverityEdgeClass(severity);
  const severityMeta = getSeverityMeta(
    severity,
    statusInfo.fieldBadgeLabel === 'Permit Closed'
  );
  const checkedCount = checkedIds.size;

  return (
    <div
      className={`w-full bg-[#FFFFFF] dark:bg-[#0F172A] text-[#09090B] dark:text-slate-50 border-2 border-[#09090B] dark:border-emerald-500 ${leftEdgeClass} rounded-2xl shadow-lg p-3.5 space-y-3`}
    >
      {/* Geofence Arrival Header Strip */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-zinc-200 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#16A34A] dark:text-emerald-300 tracking-tight">
            <MapPin className="w-4 h-4 shrink-0 text-[#16A34A] dark:text-emerald-400" />
            <span>On-Site Auto-Arrival ({distanceMeters}m)</span>
          </span>
          <span aria-hidden="true" className="text-zinc-400">
            ·
          </span>
          <span className="text-xs font-bold text-zinc-700 dark:text-slate-300">
            {isSimulatedArrival ? '150m Test Active' : 'Inside 150m Geofence'}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isSimulatedArrival && onCycleSimulatedSite && (
            <button
              type="button"
              onClick={onCycleSimulatedSite}
              className="min-h-[44px] px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-black text-[#09090B] dark:text-slate-100 border-2 border-zinc-400 dark:border-slate-600 flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
              title="Test auto-arrival on next closest permit"
            >
              <span>Next Site</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
          {isSimulatedArrival && onExitSimulatedArrival && (
            <button
              type="button"
              onClick={onExitSimulatedArrival}
              className="min-h-[44px] min-w-[44px] p-2 rounded-lg bg-zinc-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/60 text-[#09090B] hover:text-rose-800 dark:text-slate-300 dark:hover:text-rose-200 border-2 border-zinc-400 dark:border-slate-600 flex items-center justify-center transition cursor-pointer shrink-0"
              title="Exit simulated 150m auto-arrival"
              aria-label="Exit simulated auto-arrival"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 18px Heavy Ink Cross-Street & Crisp Tabular Monospace TC# Badge */}
      <div>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <h3 className="text-[19px] font-black leading-snug text-[#09090B] dark:text-white tracking-tight">
            {crossStreet}
          </h3>
          <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-slate-800 border-2 border-[#09090B] dark:border-amber-400 text-sm font-black font-mono tabular-nums text-[#09090B] dark:text-amber-300 shrink-0">
            {permit.tcNumber}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-800 dark:text-slate-300 mt-1 flex-wrap">
          <span>{keyScope}</span>
          <span aria-hidden="true">·</span>
          <span className={severityMeta.textClass}>{severityMeta.label}</span>
        </div>
      </div>

      {/* Contractor / Superintendent Row + 48x48px Direct Green Call Button */}
      <div className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-slate-900 border-2 border-zinc-300 dark:border-slate-700">
        <div className="min-w-0 flex-1 text-xs sm:text-sm font-bold text-[#09090B] dark:text-slate-100 truncate">
          <span className="font-black">{resolvedContact.companyName}</span>
          {resolvedContact.contactName && (
            <>
              <span className="text-zinc-400 mx-1.5">·</span>
              <span className="text-zinc-700 dark:text-slate-300">
                {resolvedContact.contactName}
              </span>
            </>
          )}
        </div>

        {resolvedContact.cleanPhone && (
          <a
            href={`tel:${resolvedContact.cleanPhone}`}
            onClick={(e) => e.stopPropagation()}
            className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-[#16A34A] hover:bg-emerald-700 active:bg-emerald-800 text-white border-2 border-[#09090B]/20 shadow-xs flex items-center justify-center transition cursor-pointer shrink-0"
            title={`Call ${resolvedContact.contactName || resolvedContact.companyName}: ${resolvedContact.displayPhone}`}
            aria-label={`Call ${resolvedContact.contactName || resolvedContact.companyName}`}
          >
            <Phone className="w-5 h-5 shrink-0" />
          </a>
        )}
      </div>

      {/* 3 Oversized 56px+ Scope-Specific Quick Compliance Checkboxes */}
      <div className="space-y-2" role="group" aria-label="On-site quick compliance checks">
        {checklistItems.map((item) => {
          const isChecked = checkedIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggleCheck(item.id)}
              className={`w-full min-h-[56px] px-3.5 py-2.5 rounded-xl border-2 flex items-center justify-between gap-3 text-left transition cursor-pointer select-none active:scale-[0.99] ${
                isChecked
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-[#16A34A] dark:border-emerald-400 text-[#09090B] dark:text-white'
                  : 'bg-[#FFFFFF] dark:bg-slate-900 border-zinc-400 dark:border-slate-700 hover:border-[#09090B] dark:hover:border-slate-500 text-[#09090B] dark:text-slate-100'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${
                    isChecked
                      ? 'bg-[#16A34A] border-[#16A34A] text-white'
                      : 'bg-zinc-100 dark:bg-slate-800 border-zinc-500 dark:border-slate-500 text-transparent'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black leading-tight truncate">{item.label}</div>
                  <div className="text-xs text-zinc-700 dark:text-slate-400 font-semibold truncate">
                    {item.specRef}
                  </div>
                </div>
              </div>
              <span className="text-xs font-black font-mono shrink-0 text-[#16A34A] dark:text-emerald-300">
                {isChecked ? 'Verified' : 'Tap'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Oversized 56px+ Primary Action Targets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
        <button
          type="button"
          disabled={isLogging}
          onClick={onLogComplianceCheck}
          className="min-h-[56px] px-4 py-3 rounded-xl bg-[#16A34A] hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 text-white font-black text-sm shadow flex items-center justify-center gap-2 transition cursor-pointer select-none whitespace-nowrap"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>
            {isLogging
              ? 'Logging GPS Check...'
              : checkedCount > 0
              ? `Log ${checkedCount}/3 Checks (GPS)`
              : 'Log On-Site Pass (GPS)'}
          </span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenHoldToSpeak}
            className="min-h-[56px] px-3 py-3 rounded-xl bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 text-white font-black text-xs sm:text-sm shadow flex items-center justify-center gap-1.5 transition cursor-pointer select-none whitespace-nowrap"
            title="Dictate or simulate spoken AI inspection log for this on-site permit"
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span>AI Voice</span>
          </button>

          <button
            type="button"
            onClick={onOpenFullNotes}
            className="min-h-[56px] px-3 py-3 rounded-xl bg-[#09090B] hover:bg-zinc-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-black text-xs sm:text-sm border-2 border-[#09090B] dark:border-slate-600 shadow flex items-center justify-center gap-1.5 transition cursor-pointer select-none whitespace-nowrap"
            title="Open full chronological .DOCX Permit Notes sheet"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Notes</span>
          </button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { Permit } from '../types/permit';
import {
  BeaconShape,
  PermitSeverityTier,
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
  Navigation,
  CheckCircle2,
  FileText,
  Check,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Pin,
  Mic,
} from 'lucide-react';

interface SwipeablePermitCardProps {
  permit: Permit;
  rankIndex: number;
  beaconShape?: BeaconShape;
  severity?: PermitSeverityTier;
  crossStreet: string;
  keyScope: string;
  resolvedContact: ResolvedPermitCardContact;
  statusInfo: ClarifiedPermitStatusInfo;
  isVisitedToday: boolean;
  isSelected: boolean;
  isActiveInspection?: boolean;
  isNavigating: boolean;
  isExpanded: boolean;
  isCollapsedLogged: boolean;
  isBatchMode: boolean;
  isBatchSelected: boolean;
  isQuickLogging: boolean;
  checklistItems: ScopeComplianceItem[];
  checkedIds: Set<string>;
  onToggleExpand: () => void;
  onToggleBatchSelect: () => void;
  onSwipePass: () => void;
  onSwipeNavigate: () => void;
  onOpenFullNotes: () => void;
  onOpenHoldToSpeak: () => void;
  onToggleComplianceCheck: (itemId: string) => void;
  onLogCheckedItems: () => void;
}

export default function SwipeablePermitCard({
  permit,
  rankIndex,
  severity,
  crossStreet,
  keyScope,
  resolvedContact,
  statusInfo,
  isVisitedToday,
  isSelected,
  isActiveInspection = false,
  isNavigating,
  isExpanded,
  isCollapsedLogged,
  isBatchMode,
  isBatchSelected,
  isQuickLogging,
  checklistItems,
  checkedIds,
  onToggleExpand,
  onToggleBatchSelect,
  onSwipePass,
  onSwipeNavigate,
  onOpenFullNotes,
  onOpenHoldToSpeak,
  onToggleComplianceCheck,
  onLogCheckedItems,
}: SwipeablePermitCardProps) {
  const resolvedSeverity =
    severity ?? classifyPermitSeverity(permit, isVisitedToday);
  const leftEdgeClass = getSeverityEdgeClass(resolvedSeverity);
  const severityMeta = getSeverityMeta(
    resolvedSeverity,
    statusInfo.fieldBadgeLabel === 'Permit Closed'
  );

  const handleCardClick = () => {
    if (isBatchMode) {
      onToggleBatchSelect();
    } else {
      onToggleExpand();
    }
  };

  // Compact single-row representation for Already Logged Today permits (8px Emerald #16A34A left bar)
  if (isCollapsedLogged) {
    return (
      <div
        onClick={onToggleExpand}
        className={`bg-[#FFFFFF] dark:bg-slate-900/90 border-2 border-zinc-400 dark:border-slate-700 ${leftEdgeClass} rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer select-none hover:border-[#09090B] dark:hover:border-slate-500 transition`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xs font-extrabold font-mono tabular-nums text-zinc-600 dark:text-slate-400 shrink-0">
            #{rankIndex + 1}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-slate-800 border border-[#09090B] dark:border-slate-600 text-xs font-black font-mono tabular-nums text-[#09090B] dark:text-slate-100 shrink-0">
            {permit.tcNumber}
          </span>
          <span className="text-xs font-bold text-[#09090B] dark:text-slate-200 truncate">
            {crossStreet}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[#16A34A] dark:text-emerald-400">
            <Check className="w-4 h-4 stroke-[2.75] shrink-0" />
            <span>Logged</span>
          </span>
          <ChevronDown className="w-4 h-4 text-[#09090B] dark:text-slate-400 shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleCardClick}
      className={`relative bg-[#FFFFFF] dark:bg-[#0F172A] text-[#09090B] dark:text-slate-50 border-2 ${leftEdgeClass} rounded-2xl p-3.5 cursor-pointer select-none transition ${
        isActiveInspection
          ? 'border-[#09090B] dark:border-amber-400 ring-2 ring-[#09090B]/20 dark:ring-amber-400/30 shadow-md'
          : isSelected || isNavigating
          ? 'border-[#0284C7] dark:border-sky-400 ring-2 ring-[#0284C7]/20 shadow-sm'
          : isBatchSelected
          ? 'border-[#F59E0B] dark:border-amber-400'
          : 'border-zinc-400 dark:border-slate-700 hover:border-[#09090B] dark:hover:border-slate-500 shadow-xs'
      }`}
    >
      {/* Top Tactical Metadata Strip: Rank · Distance · Severity Status (zero pill soup) */}
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-zinc-700 dark:text-slate-300 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {isBatchMode && (
            <span className="inline-flex items-center mr-0.5 text-[#09090B] dark:text-amber-300">
              {isBatchSelected ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4 text-zinc-500" />
              )}
            </span>
          )}
          <span className="font-mono font-black tabular-nums text-[#09090B] dark:text-white">
            #{rankIndex + 1}
          </span>
          {permit.distanceMiles !== undefined && (
            <>
              <span aria-hidden="true" className="text-zinc-400">
                ·
              </span>
              <span className="font-mono font-black tabular-nums text-[#09090B] dark:text-emerald-300">
                {permit.distanceMiles.toFixed(1)} mi
              </span>
            </>
          )}
          <span aria-hidden="true" className="text-zinc-400">
            ·
          </span>
          <span className={`inline-flex items-center gap-1.5 font-extrabold ${severityMeta.textClass}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${severityMeta.dotClass}`} />
            <span>{severityMeta.label}</span>
          </span>
          {(statusInfo.ritBadgeLabel === 'Expired' || statusInfo.ritBadgeLabel === 'Unknown') && (
            <span
              className={`px-1.5 py-0.5 rounded border text-[11px] font-black leading-none ${statusInfo.ritBadgeClass}`}
              title={statusInfo.ritTooltip}
            >
              {statusInfo.ritBadgeLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {(isSelected || isActiveInspection) && (
            <Pin className="w-3.5 h-3.5 text-[#0284C7] dark:text-sky-400 fill-current rotate-45" />
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[#09090B] dark:text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#09090B] dark:text-slate-400" />
          )}
        </div>
      </div>

      {/* Primary Cross-Street & Crisp Tabular Monospace TC# Badge */}
      <div className="flex items-start justify-between gap-2.5 mb-1">
        <h3
          className="text-[18px] font-black leading-snug text-[#09090B] dark:text-white tracking-tight truncate"
          title={crossStreet}
        >
          {crossStreet}
        </h3>
        <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-slate-800 border-2 border-[#09090B] dark:border-amber-400 text-sm font-black font-mono tabular-nums text-[#09090B] dark:text-amber-300 shrink-0">
          {permit.tcNumber}
        </span>
      </div>

      {/* Clean Stripped Scope Line (no redundant 'Trench / Utility:' prefix) */}
      <p className="text-xs font-bold text-zinc-800 dark:text-slate-300 truncate mb-2.5">
        {keyScope}
      </p>

      {/* Contractor / Superintendent Bar + 48x48px Glove-Friendly Direct Call Target */}
      <div className="flex items-center justify-between gap-2.5 pl-3 pr-1.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-slate-900 border-2 border-zinc-300 dark:border-slate-700">
        <div className="min-w-0 flex-1 truncate text-xs sm:text-sm text-[#09090B] dark:text-slate-100">
          <span className="font-black">{resolvedContact.companyName}</span>
          {resolvedContact.contactName && (
            <>
              <span className="text-zinc-400 mx-1.5">·</span>
              <span className="font-bold text-zinc-700 dark:text-slate-300">
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

      {/* Glove-Friendly Bottom-Aligned Tap Targets (Zero Horizontal Swipe Conflict) */}
      {!isExpanded && (
        <div className="mt-2.5 pt-2.5 border-t-2 border-zinc-200 dark:border-slate-800 grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={isQuickLogging}
            onClick={(e) => {
              e.stopPropagation();
              onSwipePass();
            }}
            className="min-h-[48px] px-2 py-2 rounded-xl bg-zinc-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/60 border-2 border-zinc-400 hover:border-[#16A34A] dark:border-slate-600 text-xs font-black text-[#09090B] dark:text-slate-100 flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            title="One-tap GPS log: Site visit performed. No crew observed on site working."
          >
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] dark:text-emerald-400 shrink-0" />
            <span>{isQuickLogging ? 'Logging...' : 'Pass / No Work'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSwipeNavigate();
            }}
            className="min-h-[48px] px-2 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 border-2 border-[#0284C7] dark:border-sky-500 text-xs font-black text-[#09090B] dark:text-sky-100 flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            title="Start turn-by-turn route to site"
          >
            <Navigation className="w-4 h-4 text-[#0284C7] dark:text-sky-400 shrink-0" />
            <span>Start Route</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFullNotes();
            }}
            className="min-h-[48px] px-2 py-2 rounded-xl bg-[#09090B] hover:bg-zinc-800 dark:bg-blue-600 dark:hover:bg-blue-500 border-2 border-[#09090B] dark:border-blue-400 text-xs font-black text-white flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            title="Open Permit Inspection & .DOCX Notes workspace"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Inspect &amp; Notes</span>
          </button>
        </div>
      )}

      {/* Expanded Inline Quick-Inspection View */}
      {isExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-3 pt-3 border-t-2 border-zinc-300 dark:border-slate-800 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2 text-xs text-zinc-700 dark:text-slate-300">
            <span className="font-black text-[#09090B] dark:text-white">
              Quick Field Verification
            </span>
            <span className="font-mono font-bold truncate">
              {permit.workWindow || 'Not Listed in GIS'}
            </span>
          </div>

          <div className="space-y-1.5">
            {checklistItems.map((item) => {
              const checked = checkedIds.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggleComplianceCheck(item.id)}
                  className={`w-full min-h-[48px] px-3 py-2 rounded-xl border-2 flex items-center justify-between gap-2 text-left transition cursor-pointer ${
                    checked
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-[#16A34A] dark:border-emerald-500 text-[#09090B] dark:text-white'
                      : 'bg-[#FFFFFF] dark:bg-slate-900 border-zinc-400 dark:border-slate-700 text-[#09090B] dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                        checked
                          ? 'bg-[#16A34A] border-[#16A34A] text-white'
                          : 'bg-white dark:bg-slate-800 border-zinc-500 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black truncate">{item.label}</div>
                      <div className="text-[11px] font-semibold text-zinc-600 dark:text-slate-400 truncate">
                        {item.specRef}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Glove-Friendly Bottom Tap Grid */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              disabled={isQuickLogging}
              onClick={() => {
                if (checkedIds.size > 0) {
                  onLogCheckedItems();
                } else {
                  onSwipePass();
                }
              }}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {checkedIds.size > 0
                  ? `Log ${checkedIds.size}/3 Verified`
                  : 'Pass / No Work'}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenHoldToSpeak}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-[#0284C7] hover:bg-sky-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <Mic className="w-4 h-4 shrink-0" />
              <span>AI Voice Log</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onSwipeNavigate}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-2 border-zinc-400 dark:border-slate-600 text-[#09090B] dark:text-white font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            >
              <Navigation className="w-4 h-4 text-[#0284C7] dark:text-sky-400 shrink-0" />
              <span>Start Route</span>
            </button>

            <button
              type="button"
              onClick={onOpenFullNotes}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-[#09090B] hover:bg-zinc-800 dark:bg-blue-600 dark:hover:bg-blue-500 border-2 border-[#09090B] dark:border-blue-400 text-white font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Inspect &amp; Notes</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

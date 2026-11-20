import React from 'react';
import { CorridorClusterGroup } from '../utils/corridorClusterUtils';
import {
  getSeverityEdgeClass,
  getSeverityMeta,
} from '../utils/geofenceUtils';
import {
  Layers,
  CheckCircle2,
  Navigation,
  ChevronDown,
  ChevronUp,
  Phone,
  Check,
} from 'lucide-react';

interface CorridorClusterCardProps {
  cluster: CorridorClusterGroup;
  rankStart: number;
  isExpanded: boolean;
  isBatchLogging: boolean;
  hasActivePermitInside: boolean;
  onToggleExpand: () => void;
  onPassNoWorkAll: () => void;
  onNavigateCorridor: () => void;
  children?: React.ReactNode;
}

export default function CorridorClusterCard({
  cluster,
  rankStart,
  isExpanded,
  isBatchLogging,
  hasActivePermitInside,
  onToggleExpand,
  onPassNoWorkAll,
  onNavigateCorridor,
  children,
}: CorridorClusterCardProps) {
  const leftEdgeClass = getSeverityEdgeClass(cluster.dominantSeverity);
  const severityMeta = getSeverityMeta(cluster.dominantSeverity);
  const allLogged = cluster.unvisitedCount === 0;

  return (
    <div className="space-y-2">
      <div
        onClick={onToggleExpand}
        className={`relative bg-[#FFFFFF] dark:bg-[#0F172A] text-[#09090B] dark:text-slate-50 border-2 ${leftEdgeClass} rounded-2xl p-3.5 cursor-pointer select-none transition ${
          hasActivePermitInside
            ? 'border-[#09090B] dark:border-amber-400 ring-2 ring-[#09090B]/20 dark:ring-amber-400/30 shadow-md'
            : 'border-zinc-500 dark:border-slate-600 hover:border-[#09090B] dark:hover:border-slate-400 shadow-sm'
        }`}
      >
        {/* Corridor Cluster Kicker Row */}
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-zinc-700 dark:text-slate-300 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="inline-flex items-center gap-1 font-mono font-black tabular-nums text-[#09090B] dark:text-white">
              <Layers className="w-3.5 h-3.5 text-[#0284C7] dark:text-sky-400 shrink-0" />
              <span>#{rankStart + 1}</span>
            </span>
            <span aria-hidden="true" className="text-zinc-400">
              ·
            </span>
            <span className="font-mono font-black tabular-nums text-[#09090B] dark:text-emerald-300">
              {cluster.minDistanceMiles.toFixed(1)} mi
            </span>
            <span aria-hidden="true" className="text-zinc-400">
              ·
            </span>
            <span className={`inline-flex items-center gap-1 font-extrabold ${severityMeta.textClass}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${severityMeta.dotClass}`} />
              <span>
                {allLogged
                  ? `All ${cluster.totalCount} Logged`
                  : `${cluster.unvisitedCount} of ${cluster.totalCount} Need Check`}
              </span>
            </span>
          </div>

          <span className="px-2 py-0.5 rounded-md bg-[#09090B] dark:bg-amber-400 text-white dark:text-[#09090B] font-mono tabular-nums font-black text-xs shrink-0">
            {cluster.totalCount} PERMITS
          </span>
        </div>

        {/* Corridor Road Name + Tabular Monospace TC# Range */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-[19px] font-black leading-snug text-[#09090B] dark:text-white tracking-tight">
            {cluster.corridorName} Corridor
          </h3>
          <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-slate-800 border-2 border-[#09090B] dark:border-slate-500 text-xs font-black font-mono tabular-nums text-[#09090B] dark:text-amber-300 shrink-0">
            {cluster.tcRangeSummary}
          </span>
        </div>

        {/* Corridor Span Label */}
        <p className="text-xs font-bold text-zinc-700 dark:text-slate-300 truncate mb-2.5">
          {cluster.corridorSpanLabel}
        </p>

        {/* Contractor & Superintendent Bar + 48x48px Direct Call */}
        <div className="flex items-center justify-between gap-2.5 pl-3 pr-1.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-slate-900 border-2 border-zinc-300 dark:border-slate-700">
          <div className="min-w-0 flex-1 truncate text-xs sm:text-sm text-[#09090B] dark:text-slate-100">
            <span className="font-black">{cluster.contractorDisplay}</span>
            <span className="text-zinc-400 mx-1.5">·</span>
            <span className="font-bold text-zinc-700 dark:text-slate-300">
              {cluster.resolvedContact.contactName || 'Corridor Supt.'}
            </span>
          </div>

          {cluster.resolvedContact.cleanPhone && (
            <a
              href={`tel:${cluster.resolvedContact.cleanPhone}`}
              onClick={(e) => e.stopPropagation()}
              className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-[#16A34A] hover:bg-emerald-700 active:bg-emerald-800 text-white border-2 border-[#09090B]/20 shadow-xs flex items-center justify-center transition cursor-pointer shrink-0"
              title={`Call ${cluster.resolvedContact.contactName || cluster.contractorDisplay}: ${cluster.resolvedContact.displayPhone}`}
              aria-label={`Call ${cluster.resolvedContact.contactName || cluster.contractorDisplay}`}
            >
              <Phone className="w-5 h-5 shrink-0" />
            </a>
          )}
        </div>

        {/* Glove-Friendly Corridor Action Bar: One-Tap 'Pass / No Work All' + Route + Expand */}
        <div className="mt-2.5 pt-2.5 border-t-2 border-zinc-200 dark:border-slate-800 grid grid-cols-12 gap-2">
          <button
            type="button"
            disabled={isBatchLogging}
            onClick={(e) => {
              e.stopPropagation();
              onPassNoWorkAll();
            }}
            className={`col-span-6 min-h-[48px] px-2.5 py-2 rounded-xl border-2 text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              allLogged
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-[#16A34A] text-[#09090B] dark:text-emerald-200'
                : 'bg-[#16A34A] hover:bg-emerald-700 active:bg-emerald-800 border-[#09090B]/20 text-white shadow-xs'
            }`}
            title={`Log GPS 'No Work / Pass' across all ${cluster.totalCount} permits on ${cluster.corridorName}`}
          >
            {allLogged ? (
              <Check className="w-4 h-4 stroke-[3] text-[#16A34A] dark:text-emerald-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>
              {isBatchLogging
                ? 'Logging All...'
                : `Pass / No Work All (${cluster.totalCount})`}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateCorridor();
            }}
            className="col-span-3 min-h-[48px] px-2 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 border-2 border-[#0284C7] dark:border-sky-500 text-xs font-black text-[#09090B] dark:text-sky-100 flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
            title={`Route to closest site on ${cluster.corridorName}`}
          >
            <Navigation className="w-4 h-4 text-[#0284C7] dark:text-sky-400 shrink-0" />
            <span>Route</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="col-span-3 min-h-[48px] px-2 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-2 border-[#09090B] dark:border-slate-500 text-xs font-black text-[#09090B] dark:text-white flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
            title={isExpanded ? 'Collapse individual permits' : 'Expand individual corridor permits'}
          >
            <span>{isExpanded ? 'Hide' : `Sites (${cluster.totalCount})`}</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Individual Corridor Permits */}
      {isExpanded && children && (
        <div className="pl-3 ml-1.5 border-l-4 border-zinc-300 dark:border-slate-700 space-y-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

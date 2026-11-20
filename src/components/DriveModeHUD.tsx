import React, { useEffect, useRef, useState } from 'react';
import { Permit } from '../types/permit';
import {
  ParsedAiFieldLog,
  classifyPermitSeverity,
  getSeverityEdgeClass,
  getSeverityMeta,
} from '../utils/geofenceUtils';
import { formatPermitCrossStreetAndScope } from '../utils/maricopaPermitsData';
import {
  Navigation,
  Mic,
  Gauge,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  LayoutList,
} from 'lucide-react';

interface DriveModeHUDProps {
  targetPermit: Permit | null;
  speedMph: number;
  isSimulatedSpeed: boolean;
  isVisitedToday: boolean;
  isNavigating: boolean;
  gpsCoords: { lat: number; lng: number } | null;
  inspectorInitials: string;
  canCyclePrev: boolean;
  canCycleNext: boolean;
  onCycleTarget: (delta: -1 | 1) => void;
  onStartRoute: (permit: Permit) => void;
  onOpenVoiceModalFallback: (permit: Permit) => void;
  onSaveDirectVoiceLog: (permit: Permit, parsed: ParsedAiFieldLog) => Promise<void>;
  onSwitchToSiteMode: () => void;
}

export default function DriveModeHUD({
  targetPermit,
  speedMph,
  isSimulatedSpeed,
  isVisitedToday,
  isNavigating,
  gpsCoords,
  inspectorInitials,
  canCyclePrev,
  canCycleNext,
  onCycleTarget,
  onStartRoute,
  onOpenVoiceModalFallback,
  onSaveDirectVoiceLog,
  onSwitchToSiteMode,
}: DriveModeHUDProps) {
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isParsingAi, setIsParsingAi] = useState(false);
  const [justLoggedBanner, setJustLoggedBanner] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const holdStartMsRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  if (!targetPermit) {
    return (
      <div className="p-5 bg-[#FFFFFF] dark:bg-[#0F172A] border-2 border-zinc-400 dark:border-slate-700 rounded-2xl text-center space-y-3">
        <p className="text-sm font-black text-[#09090B] dark:text-white">
          No Active Target Permit in Range
        </p>
        <button
          type="button"
          onClick={onSwitchToSiteMode}
          className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#09090B] text-white font-black text-xs cursor-pointer"
        >
          Switch to Site Mode
        </button>
      </div>
    );
  }

  const { crossStreet, keyScope } = formatPermitCrossStreetAndScope(targetPermit);
  const severity = classifyPermitSeverity(targetPermit, isVisitedToday);
  const leftEdgeClass = getSeverityEdgeClass(severity);
  const severityMeta = getSeverityMeta(severity);

  const startHoldToTalk = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    holdStartMsRef.current = Date.now();
    transcriptRef.current = '';
    setLiveTranscript('');
    setJustLoggedBanner(null);

    if (!SpeechRecognition) {
      // Browser lacks Web Speech API: open interactive AI Voice modal directly
      onOpenVoiceModalFallback(targetPermit);
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        let combined = '';
        for (let i = 0; i < event.results.length; i++) {
          combined += event.results[i][0].transcript + ' ';
        }
        const trimmed = combined.trim();
        transcriptRef.current = trimmed;
        setLiveTranscript(trimmed);
      };

      rec.onerror = () => {
        setIsHoldingMic(false);
      };

      recognitionRef.current = rec;
      rec.start();
      setIsHoldingMic(true);
    } catch {
      onOpenVoiceModalFallback(targetPermit);
    }
  };

  const finishHoldToTalk = async () => {
    if (!isHoldingMic) return;
    setIsHoldingMic(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    const spoken = transcriptRef.current.trim();
    const heldMs = Date.now() - holdStartMsRef.current;

    if (!spoken) {
      // Quick tap (< 650ms) or silent mic -> open full Hold-to-Speak modal with presets
      if (heldMs < 1200) {
        onOpenVoiceModalFallback(targetPermit);
      }
      return;
    }

    setIsParsingAi(true);
    try {
      const gpsLat = gpsCoords?.lat ?? targetPermit.lat;
      const gpsLng = gpsCoords?.lng ?? targetPermit.lng;

      const resp = await fetch('/api/gemini/parse-field-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawTranscript: spoken,
          tcNumber: targetPermit.tcNumber,
          permitType: targetPermit.permitType,
          location: targetPermit.location,
          contractor: targetPermit.contractor,
          lat: gpsLat,
          lng: gpsLng,
          checkedItems: [],
        }),
      });

      if (!resp.ok) throw new Error('Voice log parse failed');
      const parsed: ParsedAiFieldLog = await resp.json();
      await onSaveDirectVoiceLog(targetPermit, parsed);
      setJustLoggedBanner(parsed.fullLogRow);
      setLiveTranscript('');
    } catch {
      onOpenVoiceModalFallback(targetPermit);
    } finally {
      setIsParsingAi(false);
    }
  };

  return (
    <div className="space-y-3 select-none">
      {/* Speed-Aware Drive Mode Status Bar */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#09090B] dark:bg-slate-900 text-white border-2 border-[#09090B] dark:border-slate-700">
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className="w-5 h-5 text-[#F59E0B] shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-black tracking-wide uppercase flex items-center gap-1.5">
              <span>Drive Mode HUD</span>
              <span className="px-1.5 py-0.5 rounded bg-[#F59E0B] text-[#09090B] font-mono tabular-nums text-[11px]">
                {Math.max(11, Math.round(speedMph || 32))} MPH{isSimulatedSpeed ? ' SIM' : ''}
              </span>
            </div>
            <p className="text-[11px] text-zinc-300 truncate">
              Single-target simplified cockpit (&gt;10 mph)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSwitchToSiteMode}
          className="min-h-[44px] px-3 py-1.5 rounded-lg bg-white text-[#09090B] font-black text-xs flex items-center gap-1.5 cursor-pointer shrink-0 hover:bg-zinc-100 transition"
        >
          <LayoutList className="w-4 h-4 shrink-0" />
          <span>Site Mode</span>
        </button>
      </div>

      {/* High-Visibility Single-Card Next Target HUD */}
      <div
        className={`bg-[#FFFFFF] dark:bg-[#0F172A] text-[#09090B] dark:text-slate-50 border-2 border-[#09090B] dark:border-slate-600 ${leftEdgeClass} rounded-2xl p-4 sm:p-5 shadow-lg space-y-4`}
      >
        {/* Next Target Kicker + Target Cycler */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full shrink-0 ${severityMeta.dotClass}`} />
            <span className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-slate-300">
              Next Target · {severityMeta.label}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canCyclePrev}
              onClick={() => onCycleTarget(-1)}
              className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-slate-800 border-2 border-zinc-400 dark:border-slate-600 disabled:opacity-35 flex items-center justify-center text-[#09090B] dark:text-white cursor-pointer"
              title="Previous target permit"
              aria-label="Previous target permit"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={!canCycleNext}
              onClick={() => onCycleTarget(1)}
              className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-slate-800 border-2 border-zinc-400 dark:border-slate-600 disabled:opacity-35 flex items-center justify-center text-[#09090B] dark:text-white cursor-pointer"
              title="Next target permit"
              aria-label="Next target permit"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Giant Distance + Tabular Monospace TC# */}
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="font-mono tabular-nums font-black text-4xl sm:text-5xl text-[#09090B] dark:text-white tracking-tight">
            {targetPermit.distanceMiles !== undefined
              ? `${targetPermit.distanceMiles.toFixed(1)} mi`
              : 'On Route'}
          </div>
          <span className="px-3 py-1 rounded-lg bg-zinc-100 dark:bg-slate-800 border-2 border-[#09090B] dark:border-amber-400 font-mono tabular-nums font-black text-lg text-[#09090B] dark:text-amber-300">
            {targetPermit.tcNumber}
          </span>
        </div>

        {/* High-Contrast Cross-Street & Clean Scope */}
        <div className="space-y-1">
          <h2 className="text-2xl font-black leading-tight text-[#09090B] dark:text-white tracking-tight">
            {crossStreet}
          </h2>
          <p className="text-sm font-bold text-zinc-700 dark:text-slate-300">
            {keyScope}
          </p>
        </div>

        {/* Primary Action 1: Giant Glove-Friendly 'Start Route' */}
        <button
          type="button"
          onClick={() => onStartRoute(targetPermit)}
          className={`w-full min-h-[64px] px-5 py-4 rounded-2xl border-2 font-black text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-md transition cursor-pointer ${
            isNavigating
              ? 'bg-[#16A34A] hover:bg-emerald-700 border-[#09090B] text-white'
              : 'bg-[#0284C7] hover:bg-sky-700 active:bg-sky-800 border-[#09090B] dark:border-sky-300 text-white'
          }`}
        >
          <Navigation className="w-6 h-6 shrink-0" />
          <span>{isNavigating ? 'Turn-by-Turn Route Active' : 'Start Route'}</span>
        </button>

        {/* Primary Action 2: Giant Hold-to-Talk 'AI Voice Log' */}
        <button
          type="button"
          disabled={isParsingAi}
          onPointerDown={startHoldToTalk}
          onPointerUp={finishHoldToTalk}
          onPointerCancel={finishHoldToTalk}
          className={`w-full min-h-[92px] px-5 py-5 rounded-2xl border-2 font-black text-lg sm:text-xl flex flex-col items-center justify-center gap-1.5 shadow-lg transition cursor-pointer touch-none ${
            isHoldingMic
              ? 'bg-rose-600 border-[#09090B] text-white ring-4 ring-rose-500/40 scale-[0.99]'
              : isParsingAi
              ? 'bg-zinc-800 border-[#09090B] text-white'
              : 'bg-[#09090B] hover:bg-zinc-800 dark:bg-amber-400 dark:hover:bg-amber-300 border-[#09090B] text-white dark:text-[#09090B]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isParsingAi ? (
              <Loader2 className="w-6 h-6 animate-spin shrink-0" />
            ) : (
              <Mic className={`w-6 h-6 shrink-0 ${isHoldingMic ? 'animate-pulse' : ''}`} />
            )}
            <span>
              {isHoldingMic
                ? 'Listening... Release to Log'
                : isParsingAi
                ? 'Formatting MAC Field Log...'
                : 'Hold-to-Talk · AI Voice Log'}
            </span>
          </div>
          <span className="text-xs font-bold opacity-80">
            {liveTranscript
              ? `"${liveTranscript}"`
              : 'Press & hold to dictate hands-free (or tap for voice console)'}
          </span>
        </button>

        {justLoggedBanner && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border-2 border-[#16A34A] text-xs font-bold text-[#09090B] dark:text-emerald-100 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
            <span className="font-mono">{justLoggedBanner}</span>
          </div>
        )}
      </div>
    </div>
  );
}

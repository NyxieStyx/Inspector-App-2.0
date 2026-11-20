import React, { useState, useRef, useEffect } from 'react';
import { Permit, GPSPosition } from '../types/permit';
import { ParsedAiFieldLog } from '../utils/geofenceUtils';
import {
  Mic,
  X,
  CheckCircle2,
  Loader2,
  Send,
  MapPin,
  Volume2,
} from 'lucide-react';

interface HoldToSpeakModalProps {
  isOpen: boolean;
  targetPermit: Permit | null;
  allCandidatePermits: Permit[];
  currentGps: GPSPosition;
  checkedItemLabels: string[];
  onSelectTargetPermit: (permit: Permit) => void;
  onClose: () => void;
  onSaveParsedLog: (permit: Permit, parsed: ParsedAiFieldLog) => Promise<void>;
}

function getSimulatedVoiceSamples(permit: Permit | null): Array<{ label: string; speech: string }> {
  const supt = permit?.contractorContact || 'the site superintendent';
  if (permit?.permitType === 'Driveway Access') {
    return [
      {
        label: 'MAG 250 Forms Ready',
        speech: `Spoke with ${supt} on site. Approved TCP shoulder cones set up, neat straight saw-cut along asphalt edge per MAG Detail 250 with no expansion joint, positive drainage sloping away from roadway ready for concrete pour.`,
      },
      {
        label: 'Drive-By / No Crew',
        speech: 'Drove by permit site, no crew or equipment on site working today, travel lane clear.',
      },
      {
        label: 'Correction Needed',
        speech: `Met crew on site, expansion board placed against asphalt edge—instructed ${supt} to remove board and pour concrete directly against clean saw-cut per MAG Detail 250 before pour.`,
      },
    ];
  }
  return [
    {
      label: 'Active Trench & Plates OK',
      speech: `Crew on site trenching with ${supt}. MUTCD Type II barricades and advance signs compliant, 48 inch conduit cover verified, 1-inch steel plates pinned and cold-mix ramped for overnight traffic.`,
    },
    {
      label: 'CLSM Slurry Backfill',
      speech: `Inspected open trench within 8 feet of pavement edge. Half-sack CLSM slurry backfill being placed per MAG Detail 200-1 and Rule 310 water truck operating.`,
    },
    {
      label: 'No Crew / Pass',
      speech: 'Site visit performed, no crew on site working today, barricades upright on shoulder.',
    },
  ];
}

export default function HoldToSpeakModal({
  isOpen,
  targetPermit,
  allCandidatePermits,
  currentGps,
  checkedItemLabels,
  onSelectTargetPermit,
  onClose,
  onSaveParsedLog,
}: HoldToSpeakModalProps) {
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedAiFieldLog | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isHoldingRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRec =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      setSpeechSupported(Boolean(SpeechRec));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopListening();
      setInterimText('');
      setErrorMsg(null);
      setParsedResult(null);
    }
  }, [isOpen]);

  const startListening = () => {
    setErrorMsg(null);
    setParsedResult(null);
    const SpeechRec =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRec) {
      setSpeechSupported(false);
      setErrorMsg(
        'Browser voice recognition is unavailable in this view — tap a Simulated Field Voice preset below or type your observation.'
      );
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalChunk += res[0].transcript + ' ';
          } else {
            interimChunk += res[0].transcript;
          }
        }
        if (finalChunk.trim()) {
          setTranscript((prev) => `${prev} ${finalChunk}`.trim());
        }
        setInterimText(interimChunk);
      };

      rec.onerror = (ev: any) => {
        if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
          setErrorMsg(
            'Microphone access blocked by browser/iframe — tap a Simulated Voice preset below or type directly.'
          );
        }
        setIsHoldingMic(false);
        isHoldingRef.current = false;
      };

      rec.onend = () => {
        setInterimText('');
        if (!isHoldingRef.current) {
          setIsHoldingMic(false);
        }
      };

      recognitionRef.current = rec;
      isHoldingRef.current = true;
      setIsHoldingMic(true);
      rec.start();
    } catch {
      setIsHoldingMic(false);
      isHoldingRef.current = false;
      setErrorMsg('Use a Simulated Field Voice preset below or enter text directly.');
    }
  };

  const stopListening = () => {
    isHoldingRef.current = false;
    setIsHoldingMic(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  };

  const handleParseAndQueue = async (overrideSpeech?: string) => {
    const activePermit = targetPermit || allCandidatePermits[0];
    if (!activePermit) return;

    const rawText = (overrideSpeech ?? `${transcript} ${interimText}`).trim();
    if (!rawText) {
      setErrorMsg('Hold the microphone to speak, tap a simulated voice preset, or type a note first.');
      return;
    }

    stopListening();
    setIsParsing(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/gemini/parse-field-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawTranscript: rawText,
          tcNumber: activePermit.tcNumber,
          permitType: activePermit.permitType,
          location: activePermit.location,
          contractor: activePermit.contractor || 'Not Listed in GIS',
          lat: currentGps.lat,
          lng: currentGps.lng,
          checkedItems: checkedItemLabels,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse field log');
      }

      const structured: ParsedAiFieldLog = {
        workStatus: data.workStatus,
        trafficControl: data.trafficControl,
        workSafety: data.workSafety,
        restorationPlates: data.restorationPlates,
        crewSummary: data.crewSummary,
        deficiencies: data.deficiencies || [],
        cleanNarrative: data.cleanNarrative,
        fullLogRow: data.fullLogRow,
        gpsStamp: data.gpsStamp,
        timestamp: data.timestamp,
      };

      setParsedResult(structured);
      await onSaveParsedLog(activePermit, structured);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to parse spoken log right now.');
    } finally {
      setIsParsing(false);
    }
  };

  if (!isOpen) return null;

  const activePermit = targetPermit || allCandidatePermits[0] || null;
  const samples = getSimulatedVoiceSamples(activePermit);

  return (
    <div
      className="fixed inset-0 z-[65] bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-white dark:bg-[#0F172A] text-[#090D16] dark:text-slate-100 border-t-2 sm:border-2 border-slate-300 dark:border-slate-700 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-[#090D16] dark:text-white tracking-tight">
              Hold-to-Speak AI Field Log
            </h2>
            <p className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">
              GPS {currentGps.lat.toFixed(5)}, {currentGps.lng.toFixed(5)} · Gemini Structured Parser
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[#090D16] dark:text-slate-200 flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Close AI Voice Field Log"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Target Permit Selector */}
          {activePermit && (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                  Target Permit:
                </span>
              </div>
              <select
                value={activePermit.tcNumber}
                onChange={(e) => {
                  const found = allCandidatePermits.find(
                    (p) => p.tcNumber === e.target.value
                  );
                  if (found) onSelectTargetPermit(found);
                }}
                className="min-h-[40px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-[#090D16] dark:text-white max-w-[240px] truncate"
              >
                {allCandidatePermits.slice(0, 10).map((p) => (
                  <option key={p.id} value={p.tcNumber}>
                    {p.tcNumber} — {p.location.split(',')[0]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Giant Thumb-Friendly Press & Hold Microphone Button */}
          <div className="flex flex-col items-center justify-center py-2">
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                startListening();
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                if (isHoldingMic) {
                  stopListening();
                }
              }}
              onPointerLeave={() => {
                if (isHoldingMic) {
                  stopListening();
                }
              }}
              className={`w-full min-h-[68px] rounded-2xl border-2 font-extrabold text-base flex items-center justify-center gap-3 shadow-lg transition select-none cursor-pointer ${
                isHoldingMic
                  ? 'bg-rose-600 border-rose-800 text-white scale-[0.99]'
                  : 'bg-blue-700 hover:bg-blue-600 border-blue-900 text-white'
              }`}
            >
              <Mic className="w-6 h-6 shrink-0" />
              <span>
                {isHoldingMic
                  ? 'Listening Live... Release to Finish'
                  : speechSupported
                  ? 'Hold to Speak Field Observation'
                  : 'Voice Simulated / Text Mode Active'}
              </span>
            </button>
          </div>

          {/* 1-Tap Simulated Field Dictation Presets (Instant Testing Anytime) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                <span>Quick Simulate Field Dictation:</span>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {samples.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={isParsing}
                  onClick={() => {
                    setTranscript(s.speech);
                    handleParseAndQueue(s.speech);
                  }}
                  className="min-h-[44px] px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-xs font-bold text-[#090D16] dark:text-slate-100 transition cursor-pointer truncate"
                  title={s.speech}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editable Spoken / Typed Field Notes Input */}
          <div className="space-y-2">
            <textarea
              rows={3}
              value={interimText ? `${transcript} ${interimText}`.trim() : transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Spoken dictation appears here (or type field observations directly)..."
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border-2 border-slate-300 dark:border-slate-700 p-3 text-sm font-medium text-[#090D16] dark:text-white placeholder-slate-500 focus:outline-none focus:border-blue-600"
            />

            <button
              type="button"
              disabled={isParsing || (!transcript.trim() && !interimText.trim())}
              onClick={() => handleParseAndQueue()}
              className="w-full min-h-[52px] px-4 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-extrabold text-sm shadow flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  <span>Gemini Structuring &amp; Queuing for Drive...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 shrink-0" />
                  <span>Parse with Gemini &amp; Queue Drive Sync</span>
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-400 text-xs font-semibold text-amber-950 dark:text-amber-200">
              {errorMsg}
            </div>
          )}

          {/* Structured Gemini Output Confirmation */}
          {parsedResult && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border-2 border-emerald-600 dark:border-emerald-500 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>Logged &amp; Queued for Google Drive Sync</span>
                </span>
                <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
                  {parsedResult.gpsStamp}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Work Status</div>
                  <div className="font-bold text-[#090D16] dark:text-white">
                    {parsedResult.workStatus}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Traffic Control
                  </div>
                  <div className="font-bold text-[#090D16] dark:text-white">
                    {parsedResult.trafficControl}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Work Safety</div>
                  <div className="font-bold text-[#090D16] dark:text-white">
                    {parsedResult.workSafety}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Restoration / Plates
                  </div>
                  <div className="font-bold text-[#090D16] dark:text-white">
                    {parsedResult.restorationPlates}
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-[#090D16] dark:text-slate-100 leading-relaxed">
                {parsedResult.fullLogRow}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import {
  MAG_MCDOT_SPECS,
  searchMagMcdotSpecs,
  MagSpecItem,
} from '../data/magMcdotSpecsData';
import {
  BookOpen,
  Search,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  X,
  FileText,
  CornerDownLeft,
  ShieldCheck,
  Send,
  Loader2,
  Mic,
  MicOff,
} from 'lucide-react';

interface MagSpecGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertNote?: (snippet: string) => void;
  permitContext?: {
    tcNumber?: string;
    permitType?: string;
    location?: string;
  };
}

const CATEGORIES = [
  { id: 'all', label: 'All Specs' },
  { id: 'driveways', label: 'Driveways (MAG 250)' },
  { id: 'trenching', label: 'Trench & Slurry (MAG 200-1)' },
  { id: 'telecom', label: 'Telecom / Depth (MAG 360)' },
  { id: 'pavement', label: 'Pavement Cuts (Note #18)' },
  { id: 'traffic_control', label: 'Traffic Control (TCP)' },
  { id: 'eor_submittals', label: 'EOR & Test Books' },
];

export default function MagSpecGuideModal({
  isOpen,
  onClose,
  onInsertNote,
  permitContext,
}: MagSpecGuideModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // AI Assistant state
  const [aiQuestion, setAiQuestion] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<{
    answer: string;
    primaryCitation: string;
    secondaryCitations?: string[];
    inspectorActionItems?: string[];
    suggestedNoteSnippet?: string;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Filtered specs
  const filteredSpecs = useMemo(() => {
    return searchMagMcdotSpecs(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  if (!isOpen) return null;

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleAskAi = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiQuestion.trim()) return;

    setIsAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch('/api/gemini/mag-spec-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: aiQuestion.trim(),
          permitContext,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to query MAG specifications AI');
      }

      const data = await response.json();
      setAiResult(data);
    } catch (err: any) {
      console.error('Spec AI error:', err);
      setAiError(err.message || 'Unable to connect to AI Spec assistant');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleQuickQuestion = (q: string) => {
    setAiQuestion(q);
    // trigger query immediately
    setIsAiLoading(true);
    setAiError(null);
    fetch('/api/gemini/mag-spec-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q,
        permitContext,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        setAiResult(data);
        setIsAiLoading(false);
      })
      .catch((err) => {
        setAiError(err.message);
        setIsAiLoading(false);
      });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                  MAG & MCDOT Specifications Guide
                </h3>
                <span className="text-xs font-mono text-amber-300 font-bold">
                  · Field Reference
                </span>
              </div>
              <p className="text-xs text-slate-200 truncate">
                MAG Uniform Standard Details · MCDOT Supplement · Roadway Design Manual (RDM)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer"
            title="Close Spec Guide"
            aria-label="Close Spec Guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* AI Search Assistant Banner */}
          <div className="bg-slate-950 border border-indigo-700/50 rounded-xl p-3.5 sm:p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-2.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <h4 className="text-xs sm:text-sm font-bold text-white">
                Ask MAG / MCDOT Spec Assistant
              </h4>
            </div>

            <form onSubmit={handleAskAi} className="flex gap-2 mb-2.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder="e.g. Can driveway concrete touch asphalt? What is slurry spec in trench within 8 ft?"
                  className="w-full min-h-[44px] h-11 bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-xl pl-3.5 pr-11 py-2.5 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none transition"
                />
                {aiQuestion && (
                  <button
                    type="button"
                    onClick={() => setAiQuestion('')}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
                    aria-label="Clear question"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={isAiLoading || !aiQuestion.trim()}
                className="min-h-[44px] min-w-[44px] h-11 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer shadow-md select-none"
              >
                {isAiLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span className="hidden sm:inline">Searching...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Ask Spec AI</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Prompt Pills (44px touch targets) */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-slate-200 font-semibold">Quick Lookups:</span>
              {[
                'Driveway saw-cut & expansion joint rules',
                'Trench backfill within 8 ft of edge of pavement',
                'Telecom conduit depth on arterial vs local',
                'When is slurry seal required for pavement cuts (>300 ft)?',
                'Traffic control devices within 20 ft of pavement',
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleQuickQuestion(q)}
                  className="min-h-[44px] text-xs bg-slate-900 hover:bg-indigo-900/60 hover:text-indigo-100 text-slate-100 border border-slate-700 hover:border-indigo-500/60 rounded-xl px-3 py-2 transition cursor-pointer select-none"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* AI Result Card */}
            {aiResult && (
              <div className="mt-3 bg-slate-950/95 border border-indigo-500/50 rounded-xl p-3 sm:p-3.5 space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded">
                      {aiResult.primaryCitation}
                    </span>
                    {aiResult.secondaryCitations?.map((c) => (
                      <span
                        key={c}
                        className="text-[10px] font-mono text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded hidden md:inline"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText('ai-answer', aiResult.answer)}
                    className="min-h-[44px] px-3 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer"
                  >
                    {copiedId === 'ai-answer' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Answer</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line font-normal">
                  {aiResult.answer}
                </div>

                {/* Inspector Action Items */}
                {aiResult.inspectorActionItems && aiResult.inspectorActionItems.length > 0 && (
                  <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block mb-1.5">
                      Field Inspector Checkpoints
                    </span>
                    <ul className="space-y-1">
                      {aiResult.inspectorActionItems.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggested Note Snippet */}
                {aiResult.suggestedNoteSnippet && (
                  <div className="bg-slate-900 border border-amber-500/30 rounded-lg p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex-1">
                      <span className="text-[10px] font-mono text-amber-400 block font-bold">
                        Suggested Permit Note Entry (Marco Canzano - MAC):
                      </span>
                      <p className="text-xs font-mono text-slate-300 mt-0.5">
                        {aiResult.suggestedNoteSnippet}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText('ai-snippet', aiResult.suggestedNoteSnippet!)
                        }
                        className="flex-1 sm:flex-initial min-h-[44px] h-11 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold py-2.5 px-3.5 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {copiedId === 'ai-snippet' ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        <span>Copy</span>
                      </button>
                      {onInsertNote && (
                        <button
                          type="button"
                          onClick={() => {
                            onInsertNote(aiResult.suggestedNoteSnippet!);
                            onClose();
                          }}
                          className="flex-1 sm:flex-initial min-h-[44px] h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 transition shadow cursor-pointer"
                        >
                          <CornerDownLeft className="w-4 h-4" />
                          <span>Insert into Note</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {aiError && (
              <div className="mt-2 text-xs text-rose-200 bg-rose-950/70 border border-rose-700 rounded-lg p-2.5 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{aiError}</span>
              </div>
            )}
          </div>

          {/* Search & Category Filter Bar */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter specifications (e.g. MAG 250, slurry, saw-cut, trench, depth, TCP)..."
                  className="w-full min-h-[44px] h-11 bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-11 py-2.5 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500/80 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
                    aria-label="Clear filter"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Buttons (44px touch targets) */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`min-h-[44px] h-11 text-xs font-semibold px-3.5 py-2.5 rounded-xl border transition cursor-pointer select-none flex items-center justify-center ${
                    selectedCategory === cat.id
                      ? 'bg-amber-500/20 text-amber-200 border-amber-400/70 shadow-sm'
                      : 'bg-slate-950 text-slate-200 border-slate-800 hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Specs List */}
          <div className="space-y-3">
            {filteredSpecs.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs sm:text-sm bg-slate-950/60 rounded-xl border border-slate-800 p-6">
                No specifications matched your filter. Try searching for "MAG 250", "slurry", "trench", or ask the AI Assistant above.
              </div>
            ) : (
              filteredSpecs.map((spec) => (
                <div
                  key={spec.id}
                  className="bg-slate-950/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-3 sm:p-4 space-y-3 transition shadow"
                >
                  {/* Title & Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-850 pb-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                        {spec.specCitation}
                      </span>
                      <h4 className="text-sm sm:text-base font-bold text-white mt-1">
                        {spec.title}
                      </h4>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded self-start sm:self-auto">
                      {spec.categoryLabel}
                    </span>
                  </div>

                  {/* Quick Summary */}
                  <div className="text-xs sm:text-sm text-slate-200 font-medium bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-amber-400 font-bold">Summary: </span>
                    {spec.quickSummary}
                  </div>

                  {/* Key Rules */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                      Key Technical Requirements:
                    </span>
                    <ul className="space-y-1">
                      {spec.keyRules.map((rule, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Inspector Checklist */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Inspector Field Verification Checklist
                    </span>
                    <ul className="space-y-1">
                      {spec.inspectorChecklist.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Standard Chronological Note Snippet */}
                  <div className="bg-slate-900 border border-amber-500/20 rounded-lg p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex-1">
                      <span className="text-[10px] font-mono text-amber-400 font-bold block">
                        Standard MCDOT Permit Note Snippet:
                      </span>
                      <p className="text-xs font-mono text-slate-300 mt-0.5">
                        {spec.standardNoteSnippet}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleCopyText(spec.id, spec.standardNoteSnippet)}
                        className="flex-1 sm:flex-initial min-h-[44px] h-11 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold py-2.5 px-3.5 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {copiedId === spec.id ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-300">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      {onInsertNote && (
                        <button
                          type="button"
                          onClick={() => {
                            onInsertNote(spec.standardNoteSnippet);
                            onClose();
                          }}
                          className="flex-1 sm:flex-initial min-h-[44px] h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 transition shadow cursor-pointer"
                        >
                          <CornerDownLeft className="w-4 h-4" />
                          <span>Insert Note</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-4 py-2.5 border-t border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-200 shrink-0">
          <span className="text-[11px] font-mono">
            Inspector Marco Canzano (MAC) · Maricopa County DOT
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] h-11 bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2.5 rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import {
  Shield,
  Lock,
  ExternalLink,
  CheckCircle2,
  Clock,
  User,
  Building,
  KeyRound,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  InspectorOktaSession,
  DEFAULT_INSPECTOR_PRESETS,
  createInspectorSession,
  MARICOPA_OKTA_URL,
} from '../services/oktaAuthService';

interface OktaSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: (session: InspectorOktaSession) => void;
}

export default function OktaSignInModal({
  isOpen,
  onClose,
  onSessionCreated,
}: OktaSignInModalProps) {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [customBadge, setCustomBadge] = useState('');
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [shiftHours, setShiftHours] = useState<number>(10);
  const [isUsingCustom, setIsUsingCustom] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCompleteSignIn = () => {
    setIsAuthenticating(true);

    setTimeout(() => {
      let session: InspectorOktaSession;

      if (isUsingCustom && customBadge.trim() && customName.trim()) {
        session = createInspectorSession(
          {
            badgeNumber: customBadge.trim().toUpperCase(),
            displayName: customName.trim(),
            email: customEmail.trim() || `${customName.toLowerCase().replace(/\s+/g, '.')}@maricopa.gov`,
            department: 'MCDOT Right-of-Way Inspections',
            title: 'ROW Field Inspector',
          },
          shiftHours
        );
      } else {
        const preset = DEFAULT_INSPECTOR_PRESETS[selectedPresetIndex];
        session = createInspectorSession(
          {
            ...preset,
          },
          shiftHours
        );
      }

      setIsAuthenticating(false);
      onSessionCreated(session);
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950/40 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Maricopa County Okta SSO</h3>
                <span className="text-[10px] font-mono bg-blue-900/60 text-blue-300 border border-blue-600/30 px-1.5 py-0.5 rounded">
                  SSO v2
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono flex items-center gap-1">
                <span>Endpoint:</span>
                <a
                  href={MARICOPA_OKTA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline flex items-center gap-0.5"
                >
                  maricopa.okta.com
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] p-3 rounded-xl text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-center transition cursor-pointer shrink-0"
            title="Close Okta Modal"
            aria-label="Close Okta Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Shift Notice Banner */}
          <div className="bg-blue-950/40 border border-blue-800/40 rounded-xl p-3 text-xs text-blue-200 flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">Single Sign-On Shift Session</p>
              <p className="text-slate-200 text-xs mt-0.5">
                Inspectors only authenticate once per shift. Your badge credentials and digital sign-off will automatically attach to all right-of-way inspection notes, contractor check-ins, and Permit Center syncs.
              </p>
            </div>
          </div>

          {/* Quick SSO Direct Gateway Launch */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-200 shrink-0">
                <Lock className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">Official County Identity Provider</p>
                <p className="text-xs text-slate-300 truncate">Launch Okta portal in authenticated tab</p>
              </div>
            </div>
            <a
              href={MARICOPA_OKTA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] min-w-[44px] h-11 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-blue-200 border border-slate-700 px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition shrink-0"
            >
              <span>Open Okta</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Inspector Profile Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-200">
                Select Inspector Identity
              </label>
              <button
                type="button"
                onClick={() => setIsUsingCustom(!isUsingCustom)}
                className="min-h-[44px] px-3 text-xs text-amber-300 hover:underline font-semibold flex items-center cursor-pointer"
              >
                {isUsingCustom ? 'Use Presets' : 'Custom Badge #'}
              </button>
            </div>

            {!isUsingCustom ? (
              <div className="space-y-2">
                {DEFAULT_INSPECTOR_PRESETS.map((preset, index) => {
                  const isSelected = selectedPresetIndex === index;
                  return (
                    <div
                      key={preset.badgeNumber}
                      onClick={() => setSelectedPresetIndex(index)}
                      className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-blue-950/40 border-blue-500 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {preset.badgeNumber.split('-')[1]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-white">
                              {preset.displayName}
                            </span>
                            <span className="text-[10px] font-mono bg-slate-800 text-amber-400 px-1.5 py-0.5 rounded border border-slate-700">
                              {preset.badgeNumber}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">{preset.title}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{preset.email}</p>
                        </div>
                      </div>

                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    County Badge Number
                  </label>
                  <input
                    type="text"
                    value={customBadge}
                    onChange={(e) => setCustomBadge(e.target.value)}
                    placeholder="e.g. MCDOT-4819"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Inspector Full Name
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Marco Canzano"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Maricopa County Email
                  </label>
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="e.g. marco.canzano@maricopa.gov"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Shift Duration */}
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-300" />
              <span className="text-xs text-slate-200">Shift Authorization Duration</span>
            </div>
            <div className="flex items-center gap-1.5">
              {[8, 10, 12].map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => setShiftHours(hours)}
                  className={`min-w-[44px] min-h-[44px] h-11 px-3 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                    shiftHours === hours
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-200 hover:text-white'
                  }`}
                >
                  {hours}h
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-slate-300 font-mono">
            MCDOT Transportation Authority
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] h-11 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCompleteSignIn}
              disabled={isAuthenticating}
              className="min-h-[44px] h-11 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>
                {isAuthenticating
                  ? 'Authenticating Shift...'
                  : 'Start Shift (Okta SSO)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

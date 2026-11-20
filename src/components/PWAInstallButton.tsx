import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share2, X, Smartphone } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  // If already installed, hide the button
  if (isInstalled) return null;

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="min-h-[44px] min-w-[44px] h-11 flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 shadow transition active:scale-95 cursor-pointer"
        title="Install MCDOT ROW Inspector for offline field use"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSModal(true)}
          className="min-h-[44px] min-w-[44px] h-11 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition cursor-pointer"
          title="Install on iPhone / iPad"
        >
          <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="hidden sm:inline">Install</span>
        </button>

        {showIOSModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl text-slate-200 overflow-hidden">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800 mb-3 shrink-0">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Install for Offline Use on iOS</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSModal(false)}
                  className="min-w-[44px] min-h-[44px] p-3 rounded-xl text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                  aria-label="Close install instructions"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="text-xs space-y-2.5 text-slate-200 flex-1 overflow-y-auto">
                <li className="flex items-start gap-2">
                  <span className="font-mono bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded text-[11px] font-bold">1</span>
                  <span>Tap the <Share2 className="w-3.5 h-3.5 inline text-blue-400" /> <strong>Share</strong> button in Safari's bottom toolbar.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded text-[11px] font-bold">2</span>
                  <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded text-[11px] font-bold">3</span>
                  <span>Tap <strong>Add</strong>. Launch from your home screen for full offline inspector capabilities.</span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="mt-4 w-full min-h-[44px] h-11 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shrink-0"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

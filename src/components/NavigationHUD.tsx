import React from 'react';
import { Permit, GPSPosition } from '../types/permit';
import { Navigation, Compass, ExternalLink, CheckCircle, X, ShieldAlert, ArrowUpRight } from 'lucide-react';

interface NavigationHUDProps {
  permit: Permit;
  currentGps: GPSPosition;
  onArrived: () => void;
  onCancel: () => void;
}

export default function NavigationHUD({
  permit,
  currentGps,
  onArrived,
  onCancel,
}: NavigationHUDProps) {
  // Approximate driving time at 35 mph in urban/suburban Maricopa corridors
  const distanceMiles = permit.distanceMiles || 1.2;
  const etaMinutes = Math.max(2, Math.round((distanceMiles / 35) * 60));

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${currentGps.lat},${currentGps.lng}&destination=${permit.lat},${permit.lng}&travelmode=driving`;

  return (
    <div className="absolute top-16 left-3 right-3 md:left-auto md:right-3 md:w-96 max-h-[calc(100%-5.5rem)] overflow-y-auto z-20 pointer-events-auto">
      <div className="bg-slate-900/95 backdrop-blur-md border-2 border-blue-500 rounded-2xl shadow-2xl p-4 text-white">
        {/* Navigation Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-700/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400 flex items-center justify-center text-blue-300 shrink-0">
              <Navigation className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-mono tracking-wide text-blue-300 font-semibold">
                Navigating to ROW Permit
              </div>
              <div className="text-sm sm:text-base font-bold text-white truncate">
                {permit.tcNumber}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[44px] min-h-[44px] p-3 rounded-xl text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center transition shrink-0 cursor-pointer"
            title="Cancel Navigation"
            aria-label="Cancel Navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ETA & Distance Metrics */}
        <div className="grid grid-cols-2 gap-3 py-3 border-b border-slate-700/80">
          <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700">
            <span className="text-[11px] text-slate-200 font-semibold">Est. Drive Time</span>
            <div className="text-xl font-bold text-white tabular-nums flex items-baseline gap-1">
              <span>{etaMinutes}</span>
              <span className="text-xs font-medium text-slate-200">min</span>
            </div>
          </div>
          <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700">
            <span className="text-[11px] text-slate-200 font-semibold">Remaining Dist</span>
            <div className="text-xl font-bold text-blue-300 tabular-nums flex items-baseline gap-1">
              <span>{distanceMiles}</span>
              <span className="text-xs font-medium text-slate-200">mi</span>
            </div>
          </div>
        </div>

        {/* High-Contrast Target & Contractor Details for Direct Sunlight Legibility */}
        <div className="my-3 bg-slate-100 border border-slate-300 rounded-xl p-3 text-xs space-y-1">
          <div className="text-gray-900 font-bold truncate">
            {permit.projectTitle}
          </div>
          <div className="text-slate-800 font-medium truncate">
            {permit.location}
          </div>
          <div className="text-slate-800 font-medium truncate">
            <span className="text-gray-900 font-bold">Contractor:</span> {permit.contractor}
          </div>
        </div>

        {/* Action Controls (min 44px touch targets) */}
        <div className="pt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={onArrived}
            className="w-full min-h-[44px] h-11 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition cursor-pointer select-none"
          >
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>I Have Arrived at Permit Site</span>
          </button>

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[44px] h-11 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition text-center select-none"
          >
            <ExternalLink className="w-4 h-4 text-blue-300 shrink-0" />
            <span>Launch in Google Maps App</span>
          </a>
        </div>
      </div>
    </div>
  );
}

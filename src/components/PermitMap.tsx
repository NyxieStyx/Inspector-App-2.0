import React, { useEffect, useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import {
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useMapsLibrary,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { Permit, GPSPosition } from '../types/permit';
import {
  Navigation,
  FileText,
  Layers,
  Crosshair,
  LocateFixed,
  Globe,
  Phone,
  MessageSquare,
  CheckCircle2,
  Check,
  Plus,
  Minus,
  X,
  MapPin,
} from 'lucide-react';
import { getLocalPermitNote } from '../services/driveService';
import {
  extractContactsFromPermitNotes,
  buildContactSmsHref,
  inferPermitLifecycleStage,
} from '../utils/permitNotesIntelligence';
import {
  resolvePermitCardContact,
  formatPermitCrossStreetAndScope,
  getClarifiedPermitStatusInfo,
  calculateBearingDegrees,
} from '../utils/maricopaPermitsData';
import {
  GEOFENCE_RADIUS_METERS,
  classifyBeaconShape,
  BeaconShape,
} from '../utils/geofenceUtils';

interface PermitMapProps {
  permits: Permit[];
  closestPermits: Permit[];
  selectedPermit: Permit | null;
  navigatingPermit: Permit | null;
  currentGps: GPSPosition;
  isManualOverride: boolean;
  followMode?: boolean;
  isOnline?: boolean;
  hasMapsApiKey?: boolean;
  isDaylightMode?: boolean;
  onSitePermitId?: string | null;
  isSimulatedArrival?: boolean;
  visitedTcNumbers?: Set<string>;
  notesRevision?: number;
  recenterTrigger?: number;
  onSelectPermit: (permit: Permit) => void;
  onStartNavigation: (permit: Permit) => void;
  onOpenPermitNotes: (permit: Permit) => void;
  onQuickNoWork?: (permit: Permit) => void;
  onArrivedAtPermit: (permit: Permit) => void;
  onManualPinPlacement: (location: { lat: number; lng: number }) => void;
  onResumeGps: () => void;
  onToggleSimulatedArrival?: () => void;
  onUserPan?: () => void;
  onBoundsChange?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
}

interface SpiderLeg {
  id: string;
  origin: { lat: number; lng: number };
  offset: { lat: number; lng: number };
}

function getCardinalLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((deg % 360) + 360) % 360;
  return dirs[Math.round(normalized / 45) % 8];
}

/**
 * Draws crisp leader lines from spiderfied overlapping pins back to their true intersection point.
 */
function SpiderfyLegsLayer({ legs }: { legs: SpiderLeg[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || legs.length === 0) return;

    const polylines = legs.map(
      (leg) =>
        new google.maps.Polyline({
          path: [leg.origin, leg.offset],
          geodesic: false,
          strokeColor: '#0F172A',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          zIndex: 45,
          map,
        })
    );

    return () => {
      polylines.forEach((p) => p.setMap(null));
    };
  }, [map, legs]);

  return null;
}

/**
 * Renders the live 150-meter geofence proximity ring around the Patrol GPS vehicle on Google Maps.
 */
function GeofenceCircleLayer({
  center,
  isTriggered,
}: {
  center: { lat: number; lng: number };
  isTriggered: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const circle = new google.maps.Circle({
      center,
      radius: GEOFENCE_RADIUS_METERS,
      strokeColor: isTriggered ? '#059669' : '#2563EB',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: isTriggered ? '#10B981' : '#3B82F6',
      fillOpacity: isTriggered ? 0.16 : 0.08,
      clickable: false,
      zIndex: 25,
      map,
    });

    return () => {
      circle.setMap(null);
    };
  }, [map, center.lat, center.lng, isTriggered]);

  return null;
}

// Inner component to handle Google Maps camera updates, bounds fitting, zoom tracking, and route polylines
function MapController({
  currentGps,
  selectedPermit,
  navigatingPermit,
  isManualOverride,
  followMode = true,
  recenterTrigger,
  onUserPan,
  onBoundsChange,
  onZoomChange,
}: {
  currentGps: GPSPosition;
  selectedPermit: Permit | null;
  navigatingPermit: Permit | null;
  isManualOverride: boolean;
  followMode?: boolean;
  recenterTrigger: number;
  onUserPan?: () => void;
  onBoundsChange?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  onZoomChange?: (zoom: number) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const [routePolyline, setRoutePolyline] = useState<google.maps.Polyline | null>(null);

  useEffect(() => {
    return () => {
      if (routePolyline) {
        routePolyline.setMap(null);
      }
    };
  }, [routePolyline]);

  useEffect(() => {
    if (!map || !onZoomChange) return;
    const syncZoom = () => {
      const z = map.getZoom();
      if (typeof z === 'number') {
        onZoomChange(z);
      }
    };
    syncZoom();
    const listener = map.addListener('zoom_changed', syncZoom);
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, onZoomChange]);

  useEffect(() => {
    if (!map || !onBoundsChange) return;

    let timeoutId: NodeJS.Timeout;
    const listener = map.addListener('idle', () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const bounds = map.getBounds();
        if (bounds) {
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          onBoundsChange({
            minLat: sw.lat(),
            maxLat: ne.lat(),
            minLng: sw.lng(),
            maxLng: ne.lng(),
          });
        }
      }, 700);
    });

    return () => {
      google.maps.event.removeListener(listener);
      clearTimeout(timeoutId);
    };
  }, [map, onBoundsChange]);

  useEffect(() => {
    if (!map || !navigatingPermit) {
      if (routePolyline) {
        routePolyline.setMap(null);
        setRoutePolyline(null);
      }
      return;
    }

    const origin = { lat: currentGps.lat, lng: currentGps.lng };
    const destination = { lat: navigatingPermit.lat, lng: navigatingPermit.lng };

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(origin);
    bounds.extend(destination);
    map.fitBounds(bounds, { top: 150, bottom: 120, left: 60, right: 60 });

    try {
      if (routesLib && (google.maps as any).routes?.Route) {
        (google.maps as any).routes.Route.computeRoutes({
          origin: { location: { latLng: origin } },
          destination: { location: { latLng: destination } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        })
          .then((res: any) => {
            const path = res.routes?.[0]?.polyline?.encodedPolyline;
            if (path && (google.maps as any).geometry?.encoding) {
              const decodedPath = (google.maps as any).geometry.encoding.decodePath(path);
              if (routePolyline) routePolyline.setMap(null);
              const poly = new google.maps.Polyline({
                path: decodedPath,
                geodesic: true,
                strokeColor: '#2563EB',
                strokeOpacity: 0.9,
                strokeWeight: 6,
                map,
              });
              setRoutePolyline(poly);
              return;
            }
          })
          .catch(() => {
            drawDirectRoute(origin, destination);
          });
      } else {
        drawDirectRoute(origin, destination);
      }
    } catch {
      drawDirectRoute(origin, destination);
    }

    function drawDirectRoute(orig: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
      if (routePolyline) routePolyline.setMap(null);
      const midLat = (orig.lat + dest.lat) / 2;
      const poly = new google.maps.Polyline({
        path: [
          orig,
          { lat: midLat, lng: orig.lng },
          { lat: midLat, lng: dest.lng },
          dest,
        ],
        geodesic: true,
        strokeColor: '#2563EB',
        strokeOpacity: 0.85,
        strokeWeight: 5,
        map,
      });
      setRoutePolyline(poly);
    }
  }, [map, navigatingPermit, currentGps.lat, currentGps.lng, routesLib]);

  useEffect(() => {
    if (!map || !onUserPan) return;
    const listener = map.addListener('dragstart', () => {
      onUserPan();
    });
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, onUserPan]);

  useEffect(() => {
    if (!map || navigatingPermit || isManualOverride || !followMode || selectedPermit) return;
    map.panTo({ lat: currentGps.lat, lng: currentGps.lng });
  }, [map, currentGps.lat, currentGps.lng, isManualOverride, followMode, navigatingPermit, selectedPermit]);

  useEffect(() => {
    if (!map || recenterTrigger === 0) return;
    map.panTo({ lat: currentGps.lat, lng: currentGps.lng });
    map.setZoom(15);
  }, [map, recenterTrigger, currentGps.lat, currentGps.lng]);

  const selectedTc = selectedPermit?.tcNumber?.trim() || null;
  useEffect(() => {
    if (!map || navigatingPermit || !selectedPermit) return;
    map.panTo({ lat: selectedPermit.lat, lng: selectedPermit.lng });
  }, [map, selectedTc, Boolean(navigatingPermit)]);

  return null;
}

/**
 * Shared Shape-Coded Beacon Visual Component:
 * - 'diamond': Amber Diamond Beacon for Cust. Attention / Pre-Con
 * - 'circle': Cobalt Blue Circle Beacon for Issued (Needs Visit)
 * - 'pill': Muted Sage Gray Checkmark Pill for Logged Today
 */
function ShapeCodedBeacon({
  permit,
  shape,
  rankIndex,
  isSelected,
  isNavigating,
  isOnSite,
}: {
  permit: Permit;
  shape: BeaconShape;
  rankIndex?: number; // 0..9 for Top 10, undefined for surrounding sector
  isSelected: boolean;
  isNavigating: boolean;
  isOnSite: boolean;
}) {
  const isTopTen = typeof rankIndex === 'number';
  const rankNumber = isTopTen ? rankIndex + 1 : null;

  return (
    <div
      className={`relative group cursor-pointer flex flex-col items-center justify-center p-1 select-none ${
        isSelected ? 'scale-115 z-50' : 'hover:scale-110 transition-transform'
      }`}
    >
      {/* Active Pulse Ring for On-Site 150m, Selected, Navigating, or #1 Unvisited */}
      {(isOnSite || isSelected || isNavigating || (rankIndex === 0 && shape !== 'pill')) && (
        <span
          className={`absolute rounded-full pointer-events-none animate-ping ${
            isOnSite
              ? 'w-11 h-11 bg-emerald-500/55'
              : isSelected
              ? 'w-11 h-11 bg-blue-500/55'
              : 'w-9 h-9 bg-amber-400/50'
          }`}
        />
      )}

      {/* Pinned / On-Site Callout Tag */}
      {(isOnSite || isSelected) && (
        <div
          className={`mb-1 px-1.5 py-0.5 rounded font-mono font-black text-[9px] border shadow-md whitespace-nowrap ${
            isOnSite
              ? 'bg-emerald-600 text-white border-white'
              : 'bg-amber-400 text-[#090D16] border-[#090D16]'
          }`}
        >
          {isOnSite ? 'ON-SITE 150m' : isTopTen ? `#${rankNumber} PINNED` : 'PINNED'}
        </div>
      )}

      {/* Shape 1: Amber Diamond Beacon -> Cust. Attention / Pre-Con */}
      {shape === 'diamond' && (
        <div
          className={`rotate-45 bg-amber-400 text-[#090D16] border-2 border-[#090D16] ring-2 ${
            isSelected
              ? 'ring-blue-600 w-8 h-8'
              : isTopTen
              ? 'ring-white w-7 h-7'
              : 'ring-white w-4.5 h-4.5'
          } shadow-[0_3px_10px_rgba(0,0,0,0.55)] flex items-center justify-center rounded-[4px]`}
        >
          <span className="-rotate-45 font-mono font-black leading-none text-[10px] tracking-tighter">
            {isTopTen ? `${rankNumber}!` : '!'}
          </span>
        </div>
      )}

      {/* Shape 2: Cobalt Blue Circle Beacon -> Issued (Needs Visit) */}
      {shape === 'circle' && (
        <div
          className={`rounded-full bg-[#1D4ED8] text-white border-2 border-white ring-2 ${
            isSelected
              ? 'ring-amber-400 w-8 h-8'
              : isNavigating
              ? 'ring-sky-300 w-7.5 h-7.5'
              : isTopTen
              ? 'ring-[#090D16] w-7 h-7'
              : 'ring-[#090D16] w-4 h-4'
          } shadow-[0_3px_10px_rgba(0,0,0,0.55)] flex items-center justify-center`}
        >
          {isTopTen ? (
            <span className="font-mono font-black leading-none text-[11px]">{rankNumber}</span>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
          )}
        </div>
      )}

      {/* Shape 3: Muted Sage Gray Checkmark Pill -> Logged Today */}
      {shape === 'pill' && (
        <div
          className={`rounded-full bg-[#64748B] text-white border-2 border-white ring-1 ring-slate-800 shadow-md flex items-center justify-center gap-0.5 ${
            isTopTen ? 'px-2 py-0.5 min-h-[24px]' : 'px-1.5 py-0.5 min-h-[20px]'
          } ${!isSelected ? 'opacity-85 group-hover:opacity-100' : 'ring-2 ring-amber-400'}`}
        >
          <Check className="w-3 h-3 stroke-[3] text-emerald-200 shrink-0" />
          {isTopTen && (
            <span className="font-mono font-bold text-[10px] leading-none">{rankNumber}</span>
          )}
        </div>
      )}

      {/* Hover Tooltip */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded text-[9px] font-bold font-mono shadow-md border pointer-events-none transition-opacity opacity-0 group-hover:opacity-100 bg-slate-900/95 text-white border-slate-700 z-50">
        {permit.tcNumber}
      </div>
    </div>
  );
}

/**
 * Shared GPS Vehicle / Manual Pin Marker Visual (SVG native rotate transform — zero inline style)
 */
function PatrolGpsMarkerVisual({
  currentGps,
  isManualOverride,
  effectiveHeading,
}: {
  currentGps: GPSPosition;
  isManualOverride: boolean;
  effectiveHeading: number;
}) {
  if (isManualOverride) {
    return (
      <div className="relative flex flex-col items-center justify-center">
        <span className="absolute -inset-3 rounded-full bg-purple-500/30 animate-ping pointer-events-none" />
        <div className="relative w-10 h-10 rounded-full border-2 border-white shadow-2xl flex items-center justify-center text-white bg-purple-700 ring-4 ring-purple-400/50 cursor-grab active:cursor-grabbing">
          <Crosshair className="w-5 h-5 text-amber-300" />
        </div>
        <div className="mt-1 px-1.5 py-0.5 bg-purple-950 text-purple-100 border border-purple-400 rounded shadow text-[9px] font-bold font-mono whitespace-nowrap">
          Manual Pin
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-20 h-20 flex items-center justify-center pointer-events-none">
      <svg
        viewBox="0 0 96 96"
        className="absolute inset-0 w-20 h-20 overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="mcdotGpsHeadingCone" cx="50%" cy="50%" r="50%">
            <stop offset="10%" stopColor="#2563EB" stopOpacity="0.58" />
            <stop offset="72%" stopColor="#3B82F6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`rotate(${Math.round(effectiveHeading)} 48 48)`}>
          <path d="M 48 48 L 20 6 A 48 48 0 0 1 76 6 Z" fill="url(#mcdotGpsHeadingCone)" />
          <polygon
            points="48,7 42,18 48,15 54,18"
            fill="#1D4ED8"
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        </g>
      </svg>

      <span className="absolute w-11 h-11 rounded-full bg-blue-500/25 animate-ping" />

      <div className="relative w-9 h-9 rounded-full border-2 border-white shadow-[0_3px_12px_rgba(15,23,42,0.75)] flex items-center justify-center text-white bg-blue-600 ring-2 ring-blue-900/50 pointer-events-auto">
        <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
          <g transform={`rotate(${Math.round(effectiveHeading)} 12 12)`}>
            <path
              d="M12 2.5L19 20L12 16.2L5 20L12 2.5Z"
              fill="#FFFFFF"
              stroke="#1E3A8A"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>

      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/95 text-white font-mono font-bold text-[9px] px-1.5 py-0.5 rounded shadow-md border border-blue-400/60">
        {currentGps.isSimulated ? 'Patrol GPS' : 'Live GPS'} · {getCardinalLabel(effectiveHeading)}
      </div>
    </div>
  );
}

/**
 * Shared Permit Info Card content rendered inside Google Maps InfoWindow or GIS Canvas Floating Card.
 */
function PermitInfoCardContent({
  permit,
  isVisitedToday,
  notesRevision,
  onStartNavigation,
  onOpenPermitNotes,
  onQuickNoWork,
}: {
  permit: Permit;
  isVisitedToday: boolean;
  notesRevision: number;
  onStartNavigation: (permit: Permit) => void;
  onOpenPermitNotes: (permit: Permit) => void;
  onQuickNoWork?: (permit: Permit) => void;
}) {
  void notesRevision;
  const localNote = getLocalPermitNote(permit.tcNumber);
  const notes = localNote?.inspectorNotes || [];
  const lifecycleStage = inferPermitLifecycleStage(notes);
  const statusInfo = getClarifiedPermitStatusInfo(permit, lifecycleStage, isVisitedToday);
  const extractedContacts = extractContactsFromPermitNotes(notes);
  const resolvedContact = resolvePermitCardContact(
    permit,
    extractedContacts,
    localNote?.preConContact
  );
  const streetScope = formatPermitCrossStreetAndScope(permit);

  return (
    <div className="p-1.5 max-w-[310px] text-[#090D16]">
      <div className="flex items-center justify-between gap-1.5 border-b border-slate-200 pb-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono font-extrabold bg-amber-100 text-[#090D16] px-1.5 py-0.5 rounded border border-amber-400">
            {permit.tcNumber}
          </span>
          <span className="text-[11px] font-bold text-slate-700">
            {statusInfo.fieldBadgeLabel}
          </span>
        </div>
        <span className="text-xs font-bold font-mono text-slate-800 shrink-0 tabular-nums">
          {permit.distanceMiles !== undefined ? `${permit.distanceMiles} mi` : ''}
        </span>
      </div>

      <div className="text-sm font-extrabold text-[#090D16] leading-snug mb-0.5">
        {streetScope.crossStreet}
      </div>
      <div className="text-xs font-semibold text-slate-700 leading-snug mb-2">
        {streetScope.keyScope}
      </div>

      <div className="pt-2 border-t border-slate-200 mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-extrabold text-[#090D16] truncate">
            {resolvedContact.companyName}
          </div>
          <div className="text-[11px] font-bold text-slate-700 truncate">
            {resolvedContact.contactName} · {resolvedContact.displayPhone}
          </div>
        </div>
        {resolvedContact.cleanPhone && (
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={`tel:${resolvedContact.cleanPhone}`}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow flex items-center justify-center transition cursor-pointer select-none"
              title={`Call ${resolvedContact.contactName}: ${resolvedContact.displayPhone}`}
              aria-label={`Call ${resolvedContact.contactName}`}
            >
              <Phone className="w-4 h-4 shrink-0" />
            </a>
            <a
              href={buildContactSmsHref(
                {
                  name: resolvedContact.contactName,
                  company: resolvedContact.companyName,
                  phone: resolvedContact.displayPhone,
                  cleanPhone: resolvedContact.cleanPhone,
                },
                permit.tcNumber,
                permit.location
              )}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow flex items-center justify-center transition cursor-pointer select-none"
              title={`Text ${resolvedContact.contactName}: ${resolvedContact.displayPhone}`}
              aria-label={`Text ${resolvedContact.contactName}`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
            </a>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-200 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onStartNavigation(permit)}
            className="min-h-[44px] h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-2.5 rounded-lg shadow transition cursor-pointer select-none"
          >
            <Navigation className="w-4 h-4 shrink-0" />
            <span>Navigate</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenPermitNotes(permit)}
            className="min-h-[44px] h-11 flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold py-2 px-2.5 rounded-lg shadow transition cursor-pointer select-none"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Inspect</span>
          </button>
        </div>
        {onQuickNoWork && (
          <button
            type="button"
            onClick={() => onQuickNoWork(permit)}
            className="w-full min-h-[44px] h-11 flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 text-xs font-bold py-2 px-3 rounded-lg shadow transition cursor-pointer select-none"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-400" />
            <span>No Work / Pass (GPS Quick-Log)</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Known Maricopa County E-W & N-S Road Corridors for the Interactive Tactical GIS Canvas
const MARICOPA_EW_ROADS = [
  { lat: 33.7705, name: 'W Dove Valley Rd' },
  { lat: 33.7532, name: 'W Baker Dr' },
  { lat: 33.7420, name: 'W Bradley Rd' },
  { lat: 33.7315, name: 'W Patton Rd' },
  { lat: 33.7150, name: 'W Jomax Rd' },
  { lat: 33.6995, name: 'W Happy Valley Rd' },
  { lat: 33.6394, name: 'W Bell Rd' },
  { lat: 33.4242, name: 'W Durango St' },
];

const MARICOPA_NS_ROADS = [
  { lng: -112.5858, name: 'N 243rd Ave' },
  { lng: -112.5560, name: 'N 235th Ave' },
  { lng: -112.5350, name: 'N Sierra Ridge Wy' },
  { lng: -112.5150, name: 'N 219th Ave' },
  { lng: -112.4950, name: 'N 203rd Ave' },
  { lng: -112.4650, name: 'N 187th Ave' },
  { lng: -112.2384, name: 'N 83rd Ave' },
];

/**
 * Positioned DOM wrapper for Tactical GIS markers using ref + useLayoutEffect (zero inline JSX style).
 */
function PositionedMapElement({
  x,
  y,
  zIndex,
  children,
}: {
  x: number;
  y: number;
  zIndex: number;
  children: React.ReactNode;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (elRef.current) {
      elRef.current.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
      elRef.current.style.zIndex = String(zIndex);
    }
  }, [x, y, zIndex]);

  return (
    <div ref={elRef} className="absolute top-0 left-0 will-change-transform">
      {children}
    </div>
  );
}

/**
 * Interactive Maricopa County Tactical GIS Vector Map Canvas (used seamlessly when Google Maps API key is disabled).
 */
function TacticalGisCanvas({
  currentGps,
  isManualOverride,
  effectiveHeading,
  followMode,
  isDaylightMode,
  mapType,
  recenterTrigger,
  selectedPermit,
  navigatingPermit,
  onSitePermitId,
  closestPermits,
  surroundingPermits,
  showAllSectorPermits,
  spiderfiedPosById,
  spiderLegs,
  spiderHubCenters,
  visitedTcNumbers,
  notesRevision,
  activeInfoWindowPermit,
  onCloseInfoWindow,
  onZoomChange,
  onSelectPermit,
  onStartNavigation,
  onOpenPermitNotes,
  onQuickNoWork,
  onManualPinPlacement,
  onUserPan,
  onBoundsChange,
}: {
  currentGps: GPSPosition;
  isManualOverride: boolean;
  effectiveHeading: number;
  followMode: boolean;
  isDaylightMode: boolean;
  mapType: 'roadmap' | 'satellite' | 'hybrid';
  recenterTrigger: number;
  selectedPermit: Permit | null;
  navigatingPermit: Permit | null;
  onSitePermitId?: string | null;
  closestPermits: Permit[];
  surroundingPermits: Permit[];
  showAllSectorPermits: boolean;
  spiderfiedPosById: globalThis.Map<string, { lat: number; lng: number; isSpiderfied: boolean }>;
  spiderLegs: SpiderLeg[];
  spiderHubCenters: Array<{ id: string; lat: number; lng: number; count: number }>;
  visitedTcNumbers?: Set<string>;
  notesRevision: number;
  activeInfoWindowPermit: Permit | null;
  onCloseInfoWindow: () => void;
  onZoomChange: (zoom: number) => void;
  onSelectPermit: (permit: Permit) => void;
  onStartNavigation: (permit: Permit) => void;
  onOpenPermitNotes: (permit: Permit) => void;
  onQuickNoWork?: (permit: Permit) => void;
  onManualPinPlacement: (location: { lat: number; lng: number }) => void;
  onUserPan?: () => void;
  onBoundsChange?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 960, h: 640 });
  const [center, setCenter] = useState<{ lat: number; lng: number }>({
    lat: currentGps.lat,
    lng: currentGps.lng,
  });
  const [zoom, setZoom] = useState<number>(14.5);

  const panDragRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    startCenter: { lat: number; lng: number };
    movedPx: number;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    startCenter: { lat: currentGps.lat, lng: currentGps.lng },
    movedPx: 0,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) {
        setSize({ w: rect.width, h: rect.height });
      }
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Scale in pixels per degree latitude at current zoom
  const pxPerDegLat = useMemo(() => 256 * Math.pow(2, zoom) / 360 * 1.25, [zoom]);
  const cosLat = useMemo(
    () => Math.max(0.45, Math.cos((center.lat * Math.PI) / 180)),
    [center.lat]
  );
  const pxPerDegLng = pxPerDegLat * cosLat;

  const project = useCallback(
    (lat: number, lng: number) => ({
      x: size.w / 2 + (lng - center.lng) * pxPerDegLng,
      y: size.h / 2 - (lat - center.lat) * pxPerDegLat,
    }),
    [size.w, size.h, center.lat, center.lng, pxPerDegLat, pxPerDegLng]
  );

  const unproject = useCallback(
    (x: number, y: number) => ({
      lat: center.lat - (y - size.h / 2) / pxPerDegLat,
      lng: center.lng + (x - size.w / 2) / pxPerDegLng,
    }),
    [size.w, size.h, center.lat, center.lng, pxPerDegLat, pxPerDegLng]
  );

  // Sync zoom upward for spiderfy calculation
  useEffect(() => {
    onZoomChange(zoom);
  }, [zoom, onZoomChange]);

  // Report viewport bounds for live MCDOT RIT ArcGIS cross-referencing
  useEffect(() => {
    if (!onBoundsChange) return;
    const timer = setTimeout(() => {
      const sw = unproject(0, size.h);
      const ne = unproject(size.w, 0);
      onBoundsChange({
        minLat: sw.lat,
        maxLat: ne.lat,
        minLng: sw.lng,
        maxLng: ne.lng,
      });
    }, 650);
    return () => clearTimeout(timer);
  }, [center.lat, center.lng, zoom, size.w, size.h, unproject, onBoundsChange]);

  // Auto-follow Patrol GPS when active
  useEffect(() => {
    if (navigatingPermit || isManualOverride || !followMode || selectedPermit) return;
    setCenter({ lat: currentGps.lat, lng: currentGps.lng });
  }, [currentGps.lat, currentGps.lng, navigatingPermit, isManualOverride, followMode, selectedPermit]);

  // Explicit Re-center trigger
  useEffect(() => {
    if (recenterTrigger === 0) return;
    setCenter({ lat: currentGps.lat, lng: currentGps.lng });
    setZoom(15);
  }, [recenterTrigger, currentGps.lat, currentGps.lng]);

  // Pan to newly selected permit
  const selectedTc = selectedPermit?.tcNumber?.trim() || null;
  useEffect(() => {
    if (!selectedPermit || navigatingPermit) return;
    setCenter({ lat: selectedPermit.lat, lng: selectedPermit.lng });
  }, [selectedTc, Boolean(navigatingPermit)]);

  // Fit route when navigating
  useEffect(() => {
    if (!navigatingPermit) return;
    setCenter({
      lat: (currentGps.lat + navigatingPermit.lat) / 2,
      lng: (currentGps.lng + navigatingPermit.lng) / 2,
    });
  }, [navigatingPermit, currentGps.lat, currentGps.lng]);

  // 150m Geofence radius in screen pixels (1 deg lat ≈ 111,132 meters)
  const geofenceRadiusPx = Math.max(18, (GEOFENCE_RADIUS_METERS / 111132) * pxPerDegLat);
  const gpsPt = project(currentGps.lat, currentGps.lng);

  // Minor section mile grid lines (~0.0145 deg ≈ 1 mile)
  const gridLines = useMemo(() => {
    const sw = unproject(0, size.h);
    const ne = unproject(size.w, 0);
    const step = 0.00725; // half-mile grid
    const latLines: number[] = [];
    const lngLines: number[] = [];

    const startLat = Math.floor(sw.lat / step) * step;
    for (let lat = startLat; lat <= ne.lat + step; lat += step) {
      if (latLines.length < 40) latLines.push(lat);
    }
    const startLng = Math.floor(sw.lng / step) * step;
    for (let lng = startLng; lng <= ne.lng + step; lng += step) {
      if (lngLines.length < 40) lngLines.push(lng);
    }
    return { latLines, lngLines };
  }, [unproject, size.w, size.h]);

  const isHybridDark = mapType !== 'roadmap' || !isDaylightMode;

  return (
    <div
      ref={containerRef}
      onWheel={(e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.45 : -0.45;
        setZoom((z) => Math.min(18, Math.max(11, Number((z + delta).toFixed(2)))));
      }}
      onPointerDown={(e) => {
        const target = e.target as HTMLElement | null;
        if (target && target.closest('button, a, [data-map-interactive="true"]')) {
          return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        panDragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startCenter: { ...center },
          movedPx: 0,
        };
      }}
      onPointerMove={(e) => {
        const st = panDragRef.current;
        if (st.pointerId !== e.pointerId) return;
        const dx = e.clientX - st.startX;
        const dy = e.clientY - st.startY;
        st.movedPx = Math.max(st.movedPx, Math.hypot(dx, dy));
        if (st.movedPx > 6) {
          onUserPan?.();
          setCenter({
            lat: st.startCenter.lat + dy / pxPerDegLat,
            lng: st.startCenter.lng - dx / pxPerDegLng,
          });
        }
      }}
      onPointerUp={(e) => {
        const st = panDragRef.current;
        if (st.pointerId !== e.pointerId) return;
        try {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        } catch {}
        st.pointerId = null;

        // Treat clean tap (< 6px movement) on canvas background as Manual Pin placement
        if (st.movedPx < 6 && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const coords = unproject(e.clientX - rect.left, e.clientY - rect.top);
          onManualPinPlacement(coords);
        }
      }}
      className={`relative w-full h-full touch-none select-none overflow-hidden cursor-grab active:cursor-grabbing ${
        isHybridDark ? 'bg-[#0B1220]' : 'bg-[#EEF2F6]'
      }`}
    >
      {/* Vector GIS Grid, Maricopa Roadways, Spiderfy Legs, Route Polyline & 150m Geofence Ring */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        {/* Half-Mile Section Grid */}
        {gridLines.latLines.map((lat) => {
          const y = project(lat, center.lng).y;
          return (
            <line
              key={`glat-${lat.toFixed(4)}`}
              x1={0}
              y1={y}
              x2={size.w}
              y2={y}
              stroke={isHybridDark ? '#1E293B' : '#CBD5E1'}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          );
        })}
        {gridLines.lngLines.map((lng) => {
          const x = project(center.lat, lng).x;
          return (
            <line
              key={`glng-${lng.toFixed(4)}`}
              x1={x}
              y1={0}
              x2={x}
              y2={size.h}
              stroke={isHybridDark ? '#1E293B' : '#CBD5E1'}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Named Maricopa E-W Arterials */}
        {MARICOPA_EW_ROADS.map((rd) => {
          const y = project(rd.lat, center.lng).y;
          if (y < -40 || y > size.h + 40) return null;
          return (
            <g key={rd.name}>
              <line
                x1={0}
                y1={y}
                x2={size.w}
                y2={y}
                stroke={isHybridDark ? '#334155' : '#94A3B8'}
                strokeWidth={3.5}
              />
              <text
                x={18}
                y={y - 6}
                fill={isHybridDark ? '#94A3B8' : '#334155'}
                fontSize="11"
                fontWeight="700"
                fontFamily="Public Sans, sans-serif"
              >
                {rd.name}
              </text>
            </g>
          );
        })}

        {/* Named Maricopa N-S Arterials */}
        {MARICOPA_NS_ROADS.map((rd) => {
          const x = project(center.lat, rd.lng).x;
          if (x < -40 || x > size.w + 40) return null;
          return (
            <g key={rd.name}>
              <line
                x1={x}
                y1={0}
                x2={x}
                y2={size.h}
                stroke={isHybridDark ? '#334155' : '#94A3B8'}
                strokeWidth={3.5}
              />
              <text
                x={x + 6}
                y={size.h - 22}
                fill={isHybridDark ? '#94A3B8' : '#334155'}
                fontSize="11"
                fontWeight="700"
                fontFamily="Public Sans, sans-serif"
              >
                {rd.name}
              </text>
            </g>
          );
        })}

        {/* Active Turn-by-Turn Navigation Polyline */}
        {navigatingPermit && (() => {
          const origPt = project(currentGps.lat, currentGps.lng);
          const midLat = (currentGps.lat + navigatingPermit.lat) / 2;
          const m1 = project(midLat, currentGps.lng);
          const m2 = project(midLat, navigatingPermit.lng);
          const destPt = project(navigatingPermit.lat, navigatingPermit.lng);
          return (
            <polyline
              points={`${origPt.x},${origPt.y} ${m1.x},${m1.y} ${m2.x},${m2.y} ${destPt.x},${destPt.y}`}
              fill="none"
              stroke="#2563EB"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })()}

        {/* Spiderfy Leader Lines & Intersection Anchor Hubs */}
        {spiderLegs.map((leg) => {
          const p1 = project(leg.origin.lat, leg.origin.lng);
          const p2 = project(leg.offset.lat, leg.offset.lng);
          return (
            <line
              key={leg.id}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={isHybridDark ? '#E2E8F0' : '#0F172A'}
              strokeWidth={2}
              strokeOpacity={0.75}
            />
          );
        })}
        {spiderHubCenters.map((hub) => {
          const p = project(hub.lat, hub.lng);
          return (
            <circle
              key={hub.id}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="#0F172A"
              stroke="#FFFFFF"
              strokeWidth={2}
            />
          );
        })}

        {/* 150m Geofence Proximity Ring around Patrol GPS */}
        <circle
          cx={gpsPt.x}
          cy={gpsPt.y}
          r={geofenceRadiusPx}
          fill={onSitePermitId ? '#10B981' : '#3B82F6'}
          fillOpacity={onSitePermitId ? 0.18 : 0.09}
          stroke={onSitePermitId ? '#059669' : '#2563EB'}
          strokeWidth={2}
          strokeDasharray={onSitePermitId ? undefined : '6 4'}
        />
      </svg>

      {/* Surrounding Sector Permits (Shape-Coded Beacons) */}
      {showAllSectorPermits &&
        surroundingPermits.map((permit) => {
          const displayPos = spiderfiedPosById.get(permit.id) || {
            lat: permit.lat,
            lng: permit.lng,
          };
          const pt = project(displayPos.lat, displayPos.lng);
          if (pt.x < -60 || pt.x > size.w + 60 || pt.y < -60 || pt.y > size.h + 60) {
            return null;
          }
          const isSelected = Boolean(
            selectedPermit &&
              (selectedPermit.tcNumber.trim() === permit.tcNumber.trim() ||
                selectedPermit.id === permit.id)
          );
          const isVisited = Boolean(visitedTcNumbers?.has(permit.tcNumber));
          const lifecycle = inferPermitLifecycleStage(
            getLocalPermitNote(permit.tcNumber)?.inspectorNotes || []
          );
          const shape = classifyBeaconShape(permit, isVisited, lifecycle);

          return (
            <PositionedMapElement
              key={permit.id}
              x={pt.x}
              y={pt.y}
              zIndex={isSelected ? 999 : isVisited ? 40 : 80}
            >
              <div
                data-map-interactive="true"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPermit(permit);
                }}
              >
                <ShapeCodedBeacon
                  permit={permit}
                  shape={shape}
                  isSelected={isSelected}
                  isNavigating={false}
                  isOnSite={onSitePermitId === permit.id}
                />
              </div>
            </PositionedMapElement>
          );
        })}

      {/* Top 10 Closest Permits (Ranked Shape-Coded Beacons) */}
      {closestPermits.map((permit, index) => {
        const displayPos = spiderfiedPosById.get(permit.id) || {
          lat: permit.lat,
          lng: permit.lng,
        };
        const pt = project(displayPos.lat, displayPos.lng);
        const isSelected = Boolean(
          selectedPermit &&
            (selectedPermit.tcNumber.trim() === permit.tcNumber.trim() ||
              selectedPermit.id === permit.id)
        );
        const isNavigating = Boolean(
          navigatingPermit &&
            (navigatingPermit.tcNumber.trim() === permit.tcNumber.trim() ||
              navigatingPermit.id === permit.id)
        );
        const isVisited = Boolean(visitedTcNumbers?.has(permit.tcNumber));
        const lifecycle = inferPermitLifecycleStage(
          getLocalPermitNote(permit.tcNumber)?.inspectorNotes || []
        );
        const shape = classifyBeaconShape(permit, isVisited, lifecycle);

        return (
          <PositionedMapElement
            key={permit.id}
            x={pt.x}
            y={pt.y}
            zIndex={isSelected ? 999 : isNavigating ? 850 : isVisited ? 150 - index : 300 - index}
          >
            <div
              data-map-interactive="true"
              onClick={(e) => {
                e.stopPropagation();
                onSelectPermit(permit);
              }}
            >
              <ShapeCodedBeacon
                permit={permit}
                shape={shape}
                rankIndex={index}
                isSelected={isSelected}
                isNavigating={isNavigating}
                isOnSite={onSitePermitId === permit.id}
              />
            </div>
          </PositionedMapElement>
        );
      })}

      {/* Patrol GPS / Manual Pin Marker */}
      <PositionedMapElement x={gpsPt.x} y={gpsPt.y} zIndex={950}>
        <PatrolGpsMarkerVisual
          currentGps={currentGps}
          isManualOverride={isManualOverride}
          effectiveHeading={effectiveHeading}
        />
      </PositionedMapElement>

      {/* Floating Info Card when a Permit Beacon is Selected */}
      {activeInfoWindowPermit && (
        <div
          data-map-interactive="true"
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-4 left-3 right-3 sm:left-auto sm:right-3 sm:w-[328px] z-[1050] bg-white rounded-2xl border-2 border-slate-300 shadow-2xl p-2"
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCloseInfoWindow}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-950 hover:bg-slate-100 cursor-pointer"
              aria-label="Close permit popup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <PermitInfoCardContent
            permit={
              selectedPermit &&
              selectedPermit.tcNumber.trim() === activeInfoWindowPermit.tcNumber.trim()
                ? selectedPermit
                : activeInfoWindowPermit
            }
            isVisitedToday={Boolean(visitedTcNumbers?.has(activeInfoWindowPermit.tcNumber))}
            notesRevision={notesRevision}
            onStartNavigation={onStartNavigation}
            onOpenPermitNotes={onOpenPermitNotes}
            onQuickNoWork={onQuickNoWork}
          />
        </div>
      )}

      {/* Zoom +/- Controls & GIS Attribution Badge */}
      <div
        data-map-interactive="true"
        className="hidden md:flex flex-col gap-1.5 absolute bottom-4 left-3 z-20"
      >
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(18, Number((z + 0.6).toFixed(2))))}
          className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 text-[#090D16] dark:text-white shadow flex items-center justify-center cursor-pointer"
          aria-label="Zoom in"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(11, Number((z - 0.6).toFixed(2))))}
          className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 text-[#090D16] dark:text-white shadow flex items-center justify-center cursor-pointer"
          aria-label="Zoom out"
        >
          <Minus className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export default function PermitMap({
  permits,
  closestPermits,
  selectedPermit,
  navigatingPermit,
  currentGps,
  isManualOverride,
  followMode = true,
  isOnline = true,
  hasMapsApiKey = false,
  isDaylightMode = true,
  onSitePermitId = null,
  isSimulatedArrival = false,
  visitedTcNumbers,
  notesRevision = 0,
  recenterTrigger: externalRecenterTrigger = 0,
  onSelectPermit,
  onStartNavigation,
  onOpenPermitNotes,
  onQuickNoWork,
  onManualPinPlacement,
  onResumeGps,
  onToggleSimulatedArrival,
  onUserPan,
  onBoundsChange,
}: PermitMapProps) {
  const [activeInfoWindowPermit, setActiveInfoWindowPermit] = useState<Permit | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid'>('hybrid');
  const [showAllSectorPermits, setShowAllSectorPermits] = useState(true);
  const [internalRecenterTrigger, setInternalRecenterTrigger] = useState(0);
  const [currentZoom, setCurrentZoom] = useState<number>(14);

  const selectedTc = selectedPermit?.tcNumber?.trim() || null;
  useEffect(() => {
    if (selectedPermit) {
      setActiveInfoWindowPermit(selectedPermit);
    } else {
      setActiveInfoWindowPermit(null);
    }
  }, [selectedTc]);

  const defaultCenter = useMemo(() => ({ lat: 33.7315, lng: -112.535 }), []);

  const closestIdSet = useMemo(() => new Set(closestPermits.map((p) => p.id)), [closestPermits]);

  const surroundingPermits = useMemo(() => {
    return permits.filter((p) => !closestIdSet.has(p.id));
  }, [permits, closestIdSet]);

  // Compute zoom-aware spiderfy radial offsets for overlapping or co-located pins at intersections
  const { spiderfiedPosById, spiderLegs, spiderHubCenters } = useMemo(() => {
    const visibleList: Array<{ permit: Permit; isClosest: boolean; rank: number }> = [
      ...closestPermits.map((permit, idx) => ({ permit, isClosest: true, rank: idx })),
      ...(showAllSectorPermits
        ? surroundingPermits.map((permit, idx) => ({ permit, isClosest: false, rank: 100 + idx }))
        : []),
    ];

    const clampedZoom = Math.min(20, Math.max(10, currentZoom));
    const zoomScale = Math.pow(2, 14 - clampedZoom);
    const groupThresholdLat = Math.max(0.00009, 0.00052 * zoomScale);
    const baseRadiusLat = Math.max(0.00008, 0.00046 * zoomScale);

    interface ClusterGroup {
      centerLat: number;
      centerLng: number;
      members: Array<{ permit: Permit; isClosest: boolean; rank: number }>;
    }

    const clusters: ClusterGroup[] = [];

    for (const item of visibleList) {
      const cosLat = Math.max(0.4, Math.cos((item.permit.lat * Math.PI) / 180));
      let matchedCluster: ClusterGroup | null = null;
      for (const c of clusters) {
        const dLat = Math.abs(item.permit.lat - c.centerLat);
        const dLngScaled = Math.abs(item.permit.lng - c.centerLng) * cosLat;
        if (Math.hypot(dLat, dLngScaled) <= groupThresholdLat) {
          matchedCluster = c;
          break;
        }
      }
      if (matchedCluster) {
        const n = matchedCluster.members.length;
        matchedCluster.centerLat = (matchedCluster.centerLat * n + item.permit.lat) / (n + 1);
        matchedCluster.centerLng = (matchedCluster.centerLng * n + item.permit.lng) / (n + 1);
        matchedCluster.members.push(item);
      } else {
        clusters.push({
          centerLat: item.permit.lat,
          centerLng: item.permit.lng,
          members: [item],
        });
      }
    }

    const posMap = new globalThis.Map<string, { lat: number; lng: number; isSpiderfied: boolean }>();
    const legs: SpiderLeg[] = [];
    const hubs: Array<{ id: string; lat: number; lng: number; count: number }> = [];

    for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
      const cluster = clusters[cIdx];
      if (cluster.members.length === 1) {
        const only = cluster.members[0].permit;
        posMap.set(only.id, { lat: only.lat, lng: only.lng, isSpiderfied: false });
      } else {
        const sortedMembers = [...cluster.members].sort((a, b) => {
          if (a.rank !== b.rank) return a.rank - b.rank;
          return a.permit.tcNumber.localeCompare(b.permit.tcNumber);
        });
        const count = sortedMembers.length;
        const ringRadius = baseRadiusLat * (1 + Math.min(count - 2, 6) * 0.14);
        const cosLat = Math.max(0.4, Math.cos((cluster.centerLat * Math.PI) / 180));
        const startAngle = -Math.PI / 2;

        hubs.push({
          id: `hub-${cIdx}-${sortedMembers[0].permit.id}`,
          lat: cluster.centerLat,
          lng: cluster.centerLng,
          count,
        });

        sortedMembers.forEach((m, idx) => {
          const angle = startAngle + (2 * Math.PI * idx) / count;
          const offsetLat = cluster.centerLat + ringRadius * Math.sin(angle);
          const offsetLng = cluster.centerLng + (ringRadius * Math.cos(angle)) / cosLat;
          posMap.set(m.permit.id, { lat: offsetLat, lng: offsetLng, isSpiderfied: true });
          legs.push({
            id: `leg-${m.permit.id}`,
            origin: { lat: m.permit.lat, lng: m.permit.lng },
            offset: { lat: offsetLat, lng: offsetLng },
          });
        });
      }
    }

    return {
      spiderfiedPosById: posMap,
      spiderLegs: legs,
      spiderHubCenters: hubs,
    };
  }, [closestPermits, surroundingPermits, showAllSectorPermits, currentZoom]);

  const effectiveHeading = useMemo(() => {
    if (navigatingPermit) {
      return calculateBearingDegrees(
        currentGps.lat,
        currentGps.lng,
        navigatingPermit.lat,
        navigatingPermit.lng
      );
    }
    if (typeof currentGps.heading === 'number' && !isNaN(currentGps.heading)) {
      return ((currentGps.heading % 360) + 360) % 360;
    }
    return 45;
  }, [currentGps.lat, currentGps.lng, currentGps.heading, navigatingPermit]);

  const handleMapClick = (e: MapMouseEvent) => {
    if (e.detail?.latLng) {
      const rawLat = (e.detail.latLng as any).lat;
      const rawLng = (e.detail.latLng as any).lng;
      const lat = typeof rawLat === 'function' ? rawLat() : Number(rawLat);
      const lng = typeof rawLng === 'function' ? rawLng() : Number(rawLng);
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        onManualPinPlacement({ lat, lng });
      }
    }
  };

  return (
    <div className="relative w-full h-full min-h-[320px] bg-slate-200 dark:bg-slate-950 overflow-hidden">
      {hasMapsApiKey ? (
        <Map
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          defaultCenter={defaultCenter}
          defaultZoom={14}
          mapTypeId={mapType}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          onClick={handleMapClick}
          className="w-full h-full"
        >
          <MapController
            currentGps={currentGps}
            selectedPermit={selectedPermit}
            navigatingPermit={navigatingPermit}
            isManualOverride={isManualOverride}
            followMode={followMode}
            recenterTrigger={internalRecenterTrigger + externalRecenterTrigger}
            onUserPan={onUserPan}
            onBoundsChange={onBoundsChange}
            onZoomChange={setCurrentZoom}
          />

          <GeofenceCircleLayer
            center={{ lat: currentGps.lat, lng: currentGps.lng }}
            isTriggered={Boolean(onSitePermitId)}
          />

          <SpiderfyLegsLayer legs={spiderLegs} />
          {spiderHubCenters.map((hub) => (
            <AdvancedMarker
              key={hub.id}
              position={{ lat: hub.lat, lng: hub.lng }}
              zIndex={30}
              title={`${hub.count} co-located permits fanned out from this intersection`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-slate-900/90 border-2 border-white shadow pointer-events-none" />
            </AdvancedMarker>
          ))}

          {/* Patrol GPS Vehicle Marker */}
          <AdvancedMarker
            position={{ lat: currentGps.lat, lng: currentGps.lng }}
            title={
              isManualOverride
                ? `Manual Pin: ${currentGps.lat.toFixed(5)}, ${currentGps.lng.toFixed(5)}`
                : `MCDOT Patrol Vehicle GPS — Heading ${Math.round(effectiveHeading)}° (${getCardinalLabel(effectiveHeading)})`
            }
            zIndex={950}
            draggable={isManualOverride}
            onDragEnd={(e: any) => {
              if (e.latLng) {
                const lat = typeof e.latLng.lat === 'function' ? e.latLng.lat() : e.latLng.lat;
                const lng = typeof e.latLng.lng === 'function' ? e.latLng.lng() : e.latLng.lng;
                if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                  onManualPinPlacement({ lat, lng });
                }
              }
            }}
          >
            <PatrolGpsMarkerVisual
              currentGps={currentGps}
              isManualOverride={isManualOverride}
              effectiveHeading={effectiveHeading}
            />
          </AdvancedMarker>

          {/* Surrounding Sector Permits — Shape-Coded Beacons */}
          {showAllSectorPermits &&
            surroundingPermits.map((permit) => {
              const isSelected = Boolean(
                selectedPermit &&
                  (selectedPermit.tcNumber.trim() === permit.tcNumber.trim() ||
                    selectedPermit.id === permit.id)
              );
              const isVisited = Boolean(visitedTcNumbers?.has(permit.tcNumber));
              const lifecycle = inferPermitLifecycleStage(
                getLocalPermitNote(permit.tcNumber)?.inspectorNotes || []
              );
              const shape = classifyBeaconShape(permit, isVisited, lifecycle);
              const displayPos = spiderfiedPosById.get(permit.id) || {
                lat: permit.lat,
                lng: permit.lng,
                isSpiderfied: false,
              };

              return (
                <AdvancedMarker
                  key={permit.id}
                  position={{ lat: displayPos.lat, lng: displayPos.lng }}
                  title={`${permit.tcNumber} (${permit.projectTitle})`}
                  zIndex={isSelected ? 999 : isVisited ? 40 : 80}
                  onClick={() => onSelectPermit(permit)}
                >
                  <ShapeCodedBeacon
                    permit={permit}
                    shape={shape}
                    isSelected={isSelected}
                    isNavigating={false}
                    isOnSite={onSitePermitId === permit.id}
                  />
                </AdvancedMarker>
              );
            })}

          {/* Top 10 Closest Permits — Ranked Shape-Coded Beacons */}
          {closestPermits.map((permit, index) => {
            const isSelected = Boolean(
              selectedPermit &&
                (selectedPermit.tcNumber.trim() === permit.tcNumber.trim() ||
                  selectedPermit.id === permit.id)
            );
            const isNavigating = Boolean(
              navigatingPermit &&
                (navigatingPermit.tcNumber.trim() === permit.tcNumber.trim() ||
                  navigatingPermit.id === permit.id)
            );
            const isVisited = Boolean(visitedTcNumbers?.has(permit.tcNumber));
            const lifecycle = inferPermitLifecycleStage(
              getLocalPermitNote(permit.tcNumber)?.inspectorNotes || []
            );
            const shape = classifyBeaconShape(permit, isVisited, lifecycle);
            const displayPos = spiderfiedPosById.get(permit.id) || {
              lat: permit.lat,
              lng: permit.lng,
              isSpiderfied: false,
            };

            return (
              <AdvancedMarker
                key={permit.id}
                position={{ lat: displayPos.lat, lng: displayPos.lng }}
                title={`#${index + 1}: ${permit.tcNumber} (${permit.distanceMiles ?? 0} mi)`}
                zIndex={isSelected ? 999 : isNavigating ? 850 : isVisited ? 150 - index : 300 - index}
                onClick={() => onSelectPermit(permit)}
              >
                <ShapeCodedBeacon
                  permit={permit}
                  shape={shape}
                  rankIndex={index}
                  isSelected={isSelected}
                  isNavigating={isNavigating}
                  isOnSite={onSitePermitId === permit.id}
                />
              </AdvancedMarker>
            );
          })}

          {/* InfoWindow */}
          {activeInfoWindowPermit &&
            (() => {
              const liveSelected =
                selectedPermit &&
                selectedPermit.tcNumber.trim() === activeInfoWindowPermit.tcNumber.trim()
                  ? selectedPermit
                  : activeInfoWindowPermit;
              const spiderPos = spiderfiedPosById.get(liveSelected.id);

              return (
                <InfoWindow
                  position={{
                    lat: spiderPos ? spiderPos.lat : liveSelected.lat,
                    lng: spiderPos ? spiderPos.lng : liveSelected.lng,
                  }}
                  onCloseClick={() => setActiveInfoWindowPermit(null)}
                >
                  <PermitInfoCardContent
                    permit={liveSelected}
                    isVisitedToday={Boolean(visitedTcNumbers?.has(liveSelected.tcNumber))}
                    notesRevision={notesRevision}
                    onStartNavigation={onStartNavigation}
                    onOpenPermitNotes={onOpenPermitNotes}
                    onQuickNoWork={onQuickNoWork}
                  />
                </InfoWindow>
              );
            })()}
        </Map>
      ) : (
        <TacticalGisCanvas
          currentGps={currentGps}
          isManualOverride={isManualOverride}
          effectiveHeading={effectiveHeading}
          followMode={followMode}
          isDaylightMode={isDaylightMode}
          mapType={mapType}
          recenterTrigger={internalRecenterTrigger + externalRecenterTrigger}
          selectedPermit={selectedPermit}
          navigatingPermit={navigatingPermit}
          onSitePermitId={onSitePermitId}
          closestPermits={closestPermits}
          surroundingPermits={surroundingPermits}
          showAllSectorPermits={showAllSectorPermits}
          spiderfiedPosById={spiderfiedPosById}
          spiderLegs={spiderLegs}
          spiderHubCenters={spiderHubCenters}
          visitedTcNumbers={visitedTcNumbers}
          notesRevision={notesRevision}
          activeInfoWindowPermit={activeInfoWindowPermit}
          onCloseInfoWindow={() => setActiveInfoWindowPermit(null)}
          onZoomChange={setCurrentZoom}
          onSelectPermit={onSelectPermit}
          onStartNavigation={onStartNavigation}
          onOpenPermitNotes={onOpenPermitNotes}
          onQuickNoWork={onQuickNoWork}
          onManualPinPlacement={onManualPinPlacement}
          onUserPan={onUserPan}
          onBoundsChange={onBoundsChange}
        />
      )}

      {/* Top-Left Map Controls: Re-Center GPS */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            onResumeGps();
            setInternalRecenterTrigger((prev) => prev + 1);
          }}
          className="min-h-[44px] h-11 bg-white/95 hover:bg-blue-50 dark:bg-slate-900/95 dark:hover:bg-blue-950 text-[#090D16] dark:text-white border-2 border-slate-300 dark:border-slate-700 px-3 py-2 rounded-xl shadow-md flex items-center gap-1.5 text-xs font-extrabold transition cursor-pointer select-none whitespace-nowrap"
          title="Re-center map on live GPS patrol vehicle"
        >
          <LocateFixed className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
          <span>Re-center GPS</span>
        </button>
      </div>

      {/* Top-Right Map Layer & View Controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAllSectorPermits((prev) => !prev)}
          className="min-h-[44px] h-11 flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-[#090D16] dark:text-slate-100 shadow-md transition cursor-pointer select-none whitespace-nowrap"
          title="Toggle visibility of surrounding sector permits"
        >
          <Layers className="w-4 h-4 text-blue-700 dark:text-emerald-400 shrink-0" />
          <span>
            {showAllSectorPermits
              ? `All (${permits.length})`
              : `Nearest (${closestPermits.length})`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMapType((prev) => (prev === 'roadmap' ? 'hybrid' : 'roadmap'))}
          className="min-h-[44px] h-11 flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-[#090D16] dark:text-white shadow-md transition cursor-pointer select-none whitespace-nowrap"
          title="Toggle Street/Daylight vs Dark/Hybrid Map Surface"
        >
          <Globe className="w-4 h-4 text-blue-700 dark:text-sky-400 shrink-0" />
          <span>{mapType === 'roadmap' ? 'Hybrid' : 'Street'}</span>
        </button>
      </div>

      {/* Offline Mode Indicator */}
      {!isOnline && !navigatingPermit && (
        <div className="absolute top-16 left-3 z-10 bg-amber-400 text-[#090D16] font-extrabold px-3 py-1.5 rounded-xl shadow-lg text-xs flex items-center gap-1.5 border-2 border-[#090D16]">
          <span>Offline Mode — Using Cached Permits</span>
        </div>
      )}

      {/* Shape-Coded Beacon Legend below Top-Right Controls */}
      {!navigatingPermit && (
        <div className="hidden sm:flex absolute top-16 right-3 z-10 bg-white/95 dark:bg-slate-900/95 border-2 border-slate-300 dark:border-slate-700 rounded-xl shadow-md px-3 py-1.5 text-[11px] font-bold text-[#090D16] dark:text-slate-100 items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-1.5" title="Amber Diamond: Cust. Attention / Pre-Con">
            <span className="w-2.5 h-2.5 rotate-45 bg-amber-400 border border-[#090D16] inline-block shrink-0" />
            <span>Attn / Pre-Con</span>
          </div>
          <div className="flex items-center gap-1.5" title="Cobalt Blue Circle: Issued (Needs Visit)">
            <span className="w-3 h-3 rounded-full bg-[#1D4ED8] border border-white ring-1 ring-[#090D16] inline-block shrink-0" />
            <span>Issued</span>
          </div>
          <div className="flex items-center gap-1.5" title="Muted Sage Gray Pill: Logged Today">
            <span className="px-1 py-0.2 rounded-full bg-[#64748B] text-white text-[9px] leading-none inline-flex items-center">
              ✓
            </span>
            <span>Logged</span>
          </div>
          <div className="flex items-center gap-1 text-emerald-800 dark:text-emerald-300 font-mono">
            <span>150m Ring</span>
          </div>
        </div>
      )}
    </div>
  );
}

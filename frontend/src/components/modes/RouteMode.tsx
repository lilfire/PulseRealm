import { useEffect, useRef, useState } from "react";
import type { ClientProfile, RealmRole, WearableData } from "../../types/session";
import type { RouteConfig } from "../lobbies/RouteLobby";
import { estimateCaloriesPerSecond } from "../../utils/wearable";
import { useGoogleMaps } from "../../hooks/useGoogleMaps";
import { StaticRouteMode } from "./StaticRouteMode";
import { BindControlsHud } from "./BindControlsHud";
import { overlayPanel } from "./StreetViewMode";
import { PlayerHud } from "./PlayerHud";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
  route: RouteConfig;
  onEnd: (totalDistanceMeters: number) => void;
  role?: RealmRole;
  boundClientId?: string | null;
  clientInclines?: Record<string, number>;
  onSetIncline?: (clientId: string, percent: number) => void;
  clientSpeedOverrides?: Record<string, number>;
  onSetSpeedOverride?: (clientId: string, speedKmh: number) => void;
}

/** Extract a detailed path from all legs/steps of a directions result. */
function extractDetailedPath(result: google.maps.DirectionsResult): google.maps.LatLng[] {
  const path: google.maps.LatLng[] = [];
  const legs = result.routes[0].legs;
  for (const leg of legs) {
    for (const step of leg.steps) {
      // Each step has a detailed path
      for (const pt of step.path) {
        // Avoid duplicating the junction point between steps
        if (path.length === 0 || !pt.equals(path[path.length - 1])) {
          path.push(pt);
        }
      }
    }
  }
  return path;
}

export function RouteMode({ clients, clientProfiles, latestData, route, onEnd, role = "host", boundClientId, clientInclines, onSetIncline, clientSpeedOverrides, onSetSpeedOverride }: Props) {
  const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const walkedPolylineRef = useRef<google.maps.Polyline | null>(null);
  const routePathRef = useRef<google.maps.LatLng[]>([]);
  const routeDistancesRef = useRef<number[]>([]);
  const totalRouteLengthRef = useRef(0);
  const travelledRef = useRef(0);
  const speedRef = useRef(0);
  const totalDistanceRef = useRef(0);
  const caloriesRef = useRef(0);
  const [caloriesDisplay, setCaloriesDisplay] = useState(0);

  const [routeInfo, setRouteInfo] = useState<{ distanceText: string; durationText: string } | null>(null);
  const [finished, setFinished] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [totalDistanceDisplay, setTotalDistanceDisplay] = useState(0);

  // Enter browser fullscreen on mount
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => { document.exitFullscreen?.().catch(() => {}); };
  }, []);

  // Track speed
  useEffect(() => {
    speedRef.current = latestData?.speedKmh ?? 0;
  }, [latestData]);

  // Accumulate calories (1-second tick)
  useEffect(() => {
    const id = setInterval(() => {
      const clientId = clients[0];
      if (!clientId || !latestData) return;
      const profile = clientProfiles[clientId];
      if (profile?.weightKg && profile?.age && latestData.heartRate > 0) {
        caloriesRef.current += estimateCaloriesPerSecond(latestData.heartRate, profile.weightKg, profile.age);
        setCaloriesDisplay(Math.round(caloriesRef.current));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [clients, clientProfiles, latestData]);

  // Initialize map and directions
  useEffect(() => {
    if (!mapsLoaded || !mapContainerRef.current) return;

    const map = new google.maps.Map(mapContainerRef.current, {
      zoom: 14,
      center: { lat: route.from.lat, lng: route.from.lng },
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
        { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
        { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
        { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
        { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#263c3f" }] },
        { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6b7b8d" }] },
        { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
      ],
    });
    mapRef.current = map;

    // Request walking directions
    const directionsService = new google.maps.DirectionsService();

    directionsService.route(
      {
        origin: { lat: route.from.lat, lng: route.from.lng },
        destination: { lat: route.to.lat, lng: route.to.lng },
        travelMode: google.maps.TravelMode.WALKING,
      },
      (result, status) => {
        if (status !== google.maps.DirectionsStatus.OK || !result) {
          console.error("Directions request failed:", status);
          // Fallback: draw a straight line between the two points
          const fallbackPath = [
            new google.maps.LatLng(route.from.lat, route.from.lng),
            new google.maps.LatLng(route.to.lat, route.to.lng),
          ];
          new google.maps.Polyline({
            path: fallbackPath,
            strokeColor: "#ff4444",
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map,
          });
          return;
        }

        // Extract detailed path from all steps
        const path = extractDetailedPath(result);

        // Draw the full route (remaining portion - visible against dark map)
        new google.maps.Polyline({
          path,
          strokeColor: "#4285F4",
          strokeOpacity: 1,
          strokeWeight: 7,
          map,
          zIndex: 1,
        });

        // Build cumulative distances
        const distances: number[] = [0];
        let totalDist = 0;
        for (let i = 1; i < path.length; i++) {
          totalDist += google.maps.geometry.spherical.computeDistanceBetween(path[i - 1], path[i]);
          distances.push(totalDist);
        }

        routePathRef.current = path;
        routeDistancesRef.current = distances;
        totalRouteLengthRef.current = totalDist;

        // Route info
        const leg = result.routes[0].legs[0];
        setRouteInfo({
          distanceText: leg.distance?.text ?? "",
          durationText: leg.duration?.text ?? "",
        });

        // Walked-portion polyline (bright, drawn on top)
        walkedPolylineRef.current = new google.maps.Polyline({
          path: [path[0]],
          strokeColor: "#00D4FF",
          strokeOpacity: 1,
          strokeWeight: 6,
          map,
          zIndex: 10,
        });

        // Start marker
        new google.maps.Marker({
          position: path[0],
          map,
          label: { text: "A", color: "#fff", fontWeight: "bold" },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: "#22c55e",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
          zIndex: 5,
        });

        // End marker
        new google.maps.Marker({
          position: path[path.length - 1],
          map,
          label: { text: "B", color: "#fff", fontWeight: "bold" },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: "#ef4444",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
          zIndex: 5,
        });

        // Player position marker
        markerRef.current = new google.maps.Marker({
          position: path[0],
          map,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 7,
            fillColor: "#facc15",
            fillOpacity: 1,
            strokeColor: "#000",
            strokeWeight: 2,
            rotation: 0,
          },
          zIndex: 100,
        });

        // Fit map to route
        const bounds = new google.maps.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 60);
      },
    );

  }, [route, mapsLoaded]);

  // Progress along route based on speed
  useEffect(() => {
    const INTERVAL_MS = 500;
    const timer = setInterval(() => {
      if (finished) return;

      const speedKmh = speedRef.current;
      if (speedKmh <= 0) return;

      const speedMs = speedKmh / 3.6;
      const distanceDelta = speedMs * (INTERVAL_MS / 1000);
      totalDistanceRef.current += distanceDelta;
      travelledRef.current += distanceDelta;
      setTotalDistanceDisplay(Math.round(totalDistanceRef.current));

      const totalLength = totalRouteLengthRef.current;
      if (totalLength <= 0) return;

      const path = routePathRef.current;
      const distances = routeDistancesRef.current;
      if (path.length === 0) return;

      // Clamp to route length
      if (travelledRef.current >= totalLength) {
        travelledRef.current = totalLength;
        setProgressPct(100);
        setFinished(true);
        if (markerRef.current) {
          markerRef.current.setPosition(path[path.length - 1]);
        }
        if (walkedPolylineRef.current) {
          walkedPolylineRef.current.setPath(path);
        }
        return;
      }

      const travelled = travelledRef.current;
      setProgressPct(Math.min(100, (travelled / totalLength) * 100));

      // Binary search for the segment we're on
      let lo = 0;
      let hi = distances.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (distances[mid] <= travelled) lo = mid;
        else hi = mid;
      }

      // Interpolate position between path[lo] and path[hi]
      const segStart = distances[lo];
      const segEnd = distances[hi];
      const segLen = segEnd - segStart;
      const t = segLen > 0 ? (travelled - segStart) / segLen : 0;

      const lat = path[lo].lat() + (path[hi].lat() - path[lo].lat()) * t;
      const lng = path[lo].lng() + (path[hi].lng() - path[lo].lng()) * t;
      const pos = new google.maps.LatLng(lat, lng);

      // Update walked polyline — all points up to lo, plus the interpolated current position
      if (walkedPolylineRef.current) {
        const walkedPath = path.slice(0, lo + 1);
        walkedPath.push(pos);
        walkedPolylineRef.current.setPath(walkedPath);
      }

      // Update player marker
      if (markerRef.current) {
        markerRef.current.setPosition(pos);
        const heading = google.maps.geometry.spherical.computeHeading(path[lo], path[hi]);
        const icon = markerRef.current.getIcon() as google.maps.Symbol;
        markerRef.current.setIcon({ ...icon, rotation: heading });
      }

      // Pan map to follow
      if (mapRef.current) {
        mapRef.current.panTo(pos);
      }
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [finished]);

  const clientId = clients[0];
  const profile = clientId ? clientProfiles[clientId] : null;

  if (!mapsLoaded) {
    if (mapsError) {
      return (
        <StaticRouteMode
          clients={clients}
          clientProfiles={clientProfiles}
          latestData={latestData}
          route={route}
          onEnd={onEnd}
          role={role}
        />
      );
    }
    return (
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        {mapsError ? <div style={{ color: "#FF5C75" }}>Failed to load Google Maps: {mapsError}</div> : <div>Loading Google Maps…</div>}
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, background: "#000" }}>
      {/* Map container */}
      <div ref={mapContainerRef} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" }} />

      {/* Left panel: HUD stats + End Realm */}
      <div
        style={{
          ...overlayPanel,
          position: "absolute",
          top: "1rem",
          left: "1rem",
          zIndex: 10,
          padding: "0.75rem 1rem",
          fontSize: "0.95rem",
          lineHeight: 1.8,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <PlayerHud
          name={profile?.name || clientId || "Waiting for player..."}
          latestData={latestData}
          profile={profile ?? null}
          caloriesDisplay={caloriesDisplay}
          totalDistanceDisplay={totalDistanceDisplay}
        />
        {role !== "guest" && (
          <button
            onClick={() => onEnd(totalDistanceRef.current)}
            style={{
              marginTop: "0.25rem",
              background: "rgba(255,61,90,0.15)",
              color: "#FF5C75",
              border: "1px solid rgba(255,61,90,0.4)",
              borderRadius: 6,
              padding: "0.35rem 0.75rem",
              fontSize: "0.8rem",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            End Realm
          </button>
        )}
      </div>

      {/* Right panel: Route info */}
      {routeInfo && (
        <div
          style={{
            ...overlayPanel,
            position: "absolute",
            top: "1rem",
            right: "1rem",
            zIndex: 10,
            padding: "0.5rem 0.75rem",
            fontSize: "0.85rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 600 }}>{routeInfo.distanceText}</div>
          <div style={{ color: "#aaa", fontSize: "0.75rem" }}>Est. {routeInfo.durationText}</div>
          <div style={{ color: "#00D4FF", fontSize: "0.8rem", marginTop: "0.2rem" }}>{progressPct.toFixed(0)}%</div>
        </div>
      )}

      {/* Finish overlay */}
      {finished && (
        <div
          style={{
            ...overlayPanel,
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 20,
            padding: "2rem 3rem",
            textAlign: "center",
            borderColor: "#22c55e",
            borderWidth: 2,
          }}
        >
          <div style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Route Complete!</div>
          <div style={{ color: "#aaa" }}>
            {totalDistanceDisplay} m walked
          </div>
        </div>
      )}
      {boundClientId && (
        <div style={{ position: "absolute", bottom: "1rem", left: "1rem", zIndex: 50 }}>
          <BindControlsHud
            boundClientId={boundClientId}
            clientInclines={clientInclines}
            onSetIncline={onSetIncline}
            clientSpeedOverrides={clientSpeedOverrides}
            onSetSpeedOverride={onSetSpeedOverride}
          />
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { ClientProfile, RealmRole, WearableData } from "../../types/session";
import type { RouteConfig } from "../lobbies/RouteLobby";
import { estimateCaloriesPerSecond, getZoneForHr, getMaxHrForAge, ZONE_COLORS, formatPace } from "../../utils/wearable";
import { computeDistanceBetween, staticMapUrl } from "../../utils/staticMaps";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
  route: RouteConfig;
  onEnd: (totalDistanceMeters: number) => void;
  role?: RealmRole;
}

const IMG_W = 640;
const IMG_H = 640;
const UPDATE_INTERVAL_MS = 3000;

export function StaticRouteMode({
  clients,
  clientProfiles,
  latestData,
  route,
  onEnd,
  role = "host",
}: Props) {
  const totalRouteLength = computeDistanceBetween(route.from, route.to);

  const speedRef = useRef(0);
  const totalDistanceRef = useRef(0);
  const travelledRef = useRef(0);
  const caloriesRef = useRef(0);
  const [caloriesDisplay, setCaloriesDisplay] = useState(0);
  const [totalDistanceDisplay, setTotalDistanceDisplay] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [finished, setFinished] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Map image URL
  const [mapUrl, setMapUrl] = useState("");
  const lastMapUpdateRef = useRef(0);

  // Build the initial map URL
  useEffect(() => {
    const url = staticMapUrl({
      width: IMG_W,
      height: IMG_H,
      markers: [
        { lat: route.from.lat, lng: route.from.lng, label: "A", color: "green" },
        { lat: route.to.lat, lng: route.to.lng, label: "B", color: "red" },
      ],
      path: [route.from, route.to],
      pathColor: "0x4285F4ff",
      playerMarker: { lat: route.from.lat, lng: route.from.lng },
    });
    setMapUrl(url);
  }, [route]);

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

  // Progress along route
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

      if (totalRouteLength <= 0) return;

      // Check if finished
      if (travelledRef.current >= totalRouteLength) {
        travelledRef.current = totalRouteLength;
        setProgressPct(100);
        setFinished(true);
        return;
      }

      const t = travelledRef.current / totalRouteLength;
      setProgressPct(Math.min(100, t * 100));

      // Interpolate position along straight line
      const newLat = route.from.lat + (route.to.lat - route.from.lat) * t;
      const newLng = route.from.lng + (route.to.lng - route.from.lng) * t;

      // Update map image periodically
      const now = Date.now();
      if (now - lastMapUpdateRef.current >= UPDATE_INTERVAL_MS) {
        lastMapUpdateRef.current = now;
        const url = staticMapUrl({
          width: IMG_W,
          height: IMG_H,
          markers: [
            { lat: route.from.lat, lng: route.from.lng, label: "A", color: "green" },
            { lat: route.to.lat, lng: route.to.lng, label: "B", color: "red" },
          ],
          path: [route.from, route.to],
          pathColor: "0x4285F4ff",
          playerMarker: { lat: newLat, lng: newLng },
        });
        setMapUrl(url);
      }
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [finished, route, totalRouteLength]);

  const clientId = clients[0];
  const profile = clientId ? clientProfiles[clientId] : null;

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, background: "#000" }}>
      {/* Static map image */}
      {mapError ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#555",
            fontSize: "1.2rem",
          }}
        >
          Map unavailable
        </div>
      ) : (
        <img
          src={mapUrl}
          alt="Route Map"
          onError={() => setMapError(true)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      )}

      {/* Limited mode notice */}
      <div
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 10,
          background: "rgba(0,0,0,0.75)",
          color: "#f59e0b",
          padding: "0.4rem 0.6rem",
          borderRadius: "6px",
          fontSize: "0.75rem",
        }}
      >
        Static mode (limited browser)
      </div>

      {/* End realm button */}
      {role !== "guest" && (
        <button
          onClick={() => onEnd(totalDistanceRef.current)}
          style={{
            position: "absolute",
            top: "1rem",
            left: "1rem",
            zIndex: 10,
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            border: "1px solid rgba(255,61,90,0.5)",
            borderRadius: "8px",
            padding: "0.5rem 1rem",
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          End Realm
        </button>
      )}

      {/* Route info badge */}
      <div
        style={{
          position: "absolute",
          top: "3.5rem",
          right: "1rem",
          zIndex: 10,
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          padding: "0.5rem 0.75rem",
          borderRadius: "8px",
          fontSize: "0.85rem",
          textAlign: "center",
        }}
      >
        <div style={{ fontWeight: 600 }}>{(totalRouteLength / 1000).toFixed(1)} km</div>
        <div style={{ color: "#aaa", fontSize: "0.75rem" }}>Straight line</div>
        <div style={{ color: "#00D4FF", fontSize: "0.8rem", marginTop: "0.2rem" }}>{progressPct.toFixed(0)}%</div>
      </div>

      {/* Finish overlay */}
      {finished && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 20,
            background: "rgba(0,0,0,0.85)",
            color: "#fff",
            padding: "2rem 3rem",
            borderRadius: "16px",
            textAlign: "center",
            border: "2px solid #22c55e",
          }}
        >
          <div style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Route Complete!</div>
          <div style={{ color: "#aaa" }}>
            {totalDistanceDisplay} m walked
          </div>
        </div>
      )}

      {/* HUD overlay */}
      <div
        style={{
          position: "absolute",
          bottom: "1rem",
          left: "1rem",
          zIndex: 10,
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          padding: "0.75rem 1rem",
          borderRadius: "8px",
          fontSize: "0.95rem",
          lineHeight: 1.8,
          pointerEvents: "none",
        }}
      >
        <div style={{ fontWeight: 600 }}>{profile?.name || clientId || "Waiting for player..."}</div>
        {latestData ? (
          <>
            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{latestData.speedKmh.toFixed(1)} km/h</div>
            <div style={{ fontSize: "0.8rem", color: "#aaa", marginTop: -4 }}>{formatPace(latestData.speedKmh)}</div>
            <div className="fg-row" style={{ display: "flex", alignItems: "center", "--fg": "6px" } as React.CSSProperties}>
              <span>{latestData.heartRate} bpm</span>
              {latestData.heartRate > 0 && (() => {
                const maxHr = getMaxHrForAge(profile?.age);
                const zone = getZoneForHr(latestData.heartRate, maxHr);
                return (
                  <span style={{
                    background: ZONE_COLORS[zone - 1],
                    color: zone <= 2 ? "#111" : "#fff",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}>Z{zone}</span>
                );
              })()}
            </div>
            <div>{latestData.steps} steps</div>
            {caloriesDisplay > 0 && <div>{caloriesDisplay} kcal</div>}
            <div style={{ fontSize: "0.8rem", color: "#aaa" }}>{totalDistanceDisplay} m</div>
          </>
        ) : (
          <div style={{ color: "#888" }}>No data yet</div>
        )}
      </div>
    </div>
  );
}

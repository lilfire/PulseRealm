import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientProfile, RealmRole, WearableData } from "../../types/session";
import type { StreetViewLocation } from "../lobbies/StreetViewLobby";
import { estimateCaloriesPerSecond, getZoneForHr, getMaxHrForAge, ZONE_COLORS, formatPace } from "../../utils/wearable";
import {
  moveAlongHeading,
  streetViewImageUrl,
  streetViewMetadataUrl,
} from "../../utils/staticMaps";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
  startLocation: StreetViewLocation;
  onEnd: (totalDistanceMeters: number) => void;
  role?: RealmRole;
  apiKey: string;
}

const arrowBtnStyle: React.CSSProperties = {
  width: "34px",
  height: "34px",
  background: "rgba(0,0,0,0.65)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: "6px",
  fontSize: "16px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const MOVE_THRESHOLD_M = 15;
const IMG_W = 640;
const IMG_H = 640;

export function StaticStreetViewMode({
  clients,
  clientProfiles,
  latestData,
  startLocation,
  onEnd,
  role = "host",
  apiKey,
}: Props) {
  const pitch = 0;

  // Double-buffered images
  const [frontSrc, setFrontSrc] = useState("");
  const [backSrc, setBackSrc] = useState("");
  const [showFront, setShowFront] = useState(true);

  const speedRef = useRef(0);
  const accumulatedDistanceRef = useRef(0);
  const totalDistanceRef = useRef(0);
  const [totalDistanceDisplay, setTotalDistanceDisplay] = useState(0);
  const caloriesRef = useRef(0);
  const [caloriesDisplay, setCaloriesDisplay] = useState(0);
  const movingRef = useRef(false);
  const latRef = useRef(startLocation.lat);
  const lngRef = useRef(startLocation.lng);
  const headingRef = useRef(0);
  const showFrontRef = useRef(true);
  const pendingSwapRef = useRef<"front" | "back" | null>(null);

  // Build image URL for current position
  const buildUrl = useCallback(
    (la: number, ln: number, h: number) =>
      streetViewImageUrl(la, ln, h, pitch, IMG_W, IMG_H, apiKey),
    [pitch, apiKey],
  );

  // Initialize with the start location image
  useEffect(() => {
    const url = buildUrl(startLocation.lat, startLocation.lng, 0);
    setFrontSrc(url);
    setBackSrc(url);
  }, [startLocation, buildUrl]);

  // Snap to nearest panorama and update position
  const moveTo = useCallback(
    async (newLat: number, newLng: number, newHeading: number) => {
      if (movingRef.current) return;
      movingRef.current = true;

      try {
        const metaUrl = streetViewMetadataUrl(newLat, newLng, apiKey);
        const resp = await fetch(metaUrl);
        const data = await resp.json();

        if (data.status === "OK" && data.location) {
          const snappedLat = data.location.lat;
          const snappedLng = data.location.lng;
          const imgUrl = buildUrl(snappedLat, snappedLng, newHeading);

          // Preload on the hidden image, then swap on load
          if (showFrontRef.current) {
            pendingSwapRef.current = "back";
            setBackSrc(imgUrl);
          } else {
            pendingSwapRef.current = "front";
            setFrontSrc(imgUrl);
          }

          latRef.current = snappedLat;
          lngRef.current = snappedLng;
          headingRef.current = newHeading;
        }
        // If status !== OK, stay in place (dead end)
      } catch {
        // Network error — stay in place
      } finally {
        movingRef.current = false;
      }
    },
    [apiKey, buildUrl],
  );

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

  // Accumulate distance and move when threshold reached
  useEffect(() => {
    const INTERVAL_MS = 500;
    const timer = setInterval(() => {
      const speedKmh = speedRef.current;
      if (speedKmh <= 0) return;

      const speedMs = speedKmh / 3.6;
      const distanceDelta = speedMs * (INTERVAL_MS / 1000);
      accumulatedDistanceRef.current += distanceDelta;
      totalDistanceRef.current += distanceDelta;
      setTotalDistanceDisplay(totalDistanceRef.current);

      if (accumulatedDistanceRef.current >= MOVE_THRESHOLD_M) {
        accumulatedDistanceRef.current -= MOVE_THRESHOLD_M;
        const next = moveAlongHeading(latRef.current, lngRef.current, headingRef.current, MOVE_THRESHOLD_M);
        moveTo(next.lat, next.lng, headingRef.current);
      }
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [moveTo]);

  // Direction button handlers
  const handleForward = useCallback(() => {
    const next = moveAlongHeading(latRef.current, lngRef.current, headingRef.current, MOVE_THRESHOLD_M);
    moveTo(next.lat, next.lng, headingRef.current);
  }, [moveTo]);

  const handleLeft = useCallback(() => {
    const newHeading = (headingRef.current - 90 + 360) % 360;
    headingRef.current = newHeading;

    // Just rotate — reload image at same position with new heading
    const url = buildUrl(latRef.current, lngRef.current, newHeading);
    if (showFrontRef.current) {
      pendingSwapRef.current = "back";
      setBackSrc(url);
    } else {
      pendingSwapRef.current = "front";
      setFrontSrc(url);
    }
  }, [buildUrl]);

  const handleRight = useCallback(() => {
    const newHeading = (headingRef.current + 90) % 360;
    headingRef.current = newHeading;

    const url = buildUrl(latRef.current, lngRef.current, newHeading);
    if (showFrontRef.current) {
      pendingSwapRef.current = "back";
      setBackSrc(url);
    } else {
      pendingSwapRef.current = "front";
      setFrontSrc(url);
    }
  }, [buildUrl]);

  // Swap when the hidden (preloading) image finishes loading
  const handleFrontLoad = useCallback(() => {
    if (pendingSwapRef.current === "front") {
      pendingSwapRef.current = null;
      showFrontRef.current = true;
      setShowFront(true);
    }
  }, []);

  const handleBackLoad = useCallback(() => {
    if (pendingSwapRef.current === "back") {
      pendingSwapRef.current = null;
      showFrontRef.current = false;
      setShowFront(false);
    }
  }, []);

  const clientId = clients[0];
  const profile = clientId ? clientProfiles[clientId] : null;

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, background: "#111" }}>
      {/* Front image */}
      <img
        src={frontSrc}
        alt="Street View"
        onLoad={handleFrontLoad}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: showFront ? 1 : 0,
          transition: "opacity 200ms ease",
          zIndex: showFront ? 2 : 1,
        }}
      />
      {/* Back image (preloading) */}
      <img
        src={backSrc}
        alt="Street View"
        onLoad={handleBackLoad}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: showFront ? 0 : 1,
          transition: "opacity 200ms ease",
          zIndex: showFront ? 1 : 2,
        }}
      />

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
            <div style={{ fontSize: "0.8rem", color: "#aaa" }}>{totalDistanceDisplay.toFixed(0)} m</div>
          </>
        ) : (
          <div style={{ color: "#888" }}>No data yet</div>
        )}
      </div>

      {/* Direction arrows overlay */}
      <div
        style={{
          position: "absolute",
          bottom: "1rem",
          right: "1rem",
          zIndex: 10,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "repeat(3, 1fr)",
          gap: "2px",
          width: "108px",
          height: "108px",
        }}
      >
        <div />
        <button onClick={handleForward} style={arrowBtnStyle} title="Forward">&#9650;</button>
        <div />
        <button onClick={handleLeft} style={arrowBtnStyle} title="Left">&#9664;</button>
        <div />
        <button onClick={handleRight} style={arrowBtnStyle} title="Right">&#9654;</button>
        <div />
        <div />
        <div />
      </div>
    </div>
  );
}

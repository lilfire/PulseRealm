import { useEffect, useRef, useState } from "react";
import type { ClientProfile, RealmRole, WearableData } from "../../types/session";
import type { RouteConfig } from "../lobbies/RouteLobby";
import { estimateCaloriesPerSecond } from "../../utils/wearable";
import { PlayerHud } from "./PlayerHud";
import { overlayPanel } from "./StreetViewMode";
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
  const [directionsData, setDirectionsData] = useState<{
    overview_polyline: string;
    distance_meters: number;
    points: Array<{ lat: number; lng: number }>;
  } | null>(null);
  // Cumulative distances for the polyline points (for binary search interpolation)
  const cumulativeDistRef = useRef<number[]>([]);

  const speedRef = useRef(0);
  const totalDistanceRef = useRef(0);
  const travelledRef = useRef(0);
  const caloriesRef = useRef(0);
  const [caloriesDisplay, setCaloriesDisplay] = useState(0);
  const [totalDistanceDisplay, setTotalDistanceDisplay] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [finished, setFinished] = useState(false);
  const [mapError, setMapError] = useState("");
  // Whether the directions fetch has completed (success or failure)
  const [directionsLoaded, setDirectionsLoaded] = useState(false);

  // Map image URL — only updated when the image is confirmed loadable
  const [mapUrl, setMapUrl] = useState("");
  const lastMapUpdateRef = useRef(0);
  const pendingFetchRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up retry timer on unmount
  useEffect(function () {
    return function () {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  /** Try to load a static map URL. Only update <img> src if the server returns an image.
   *  Retries with exponential backoff (2s, 4s, 8s, 16s) on failure. */
  function tryLoadMap(url: string, isInitial: boolean, attempt?: number) {
    var currentAttempt = attempt || 0;
    // Cancel any stale retry timer when starting a fresh request
    if (currentAttempt === 0 && retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (pendingFetchRef.current && currentAttempt === 0) return;
    pendingFetchRef.current = true;
    fetch(url)
      .then(function (r) {
        pendingFetchRef.current = false;
        if (r.ok) {
          setMapUrl(url);
          setMapError("");
        } else {
          // Retry up to 4 times with exponential backoff
          if (currentAttempt < 4) {
            var delay = Math.pow(2, currentAttempt + 1) * 1000; // 2s, 4s, 8s, 16s
            retryTimerRef.current = setTimeout(function () {
              tryLoadMap(url, isInitial, currentAttempt + 1);
            }, delay);
          } else if (isInitial) {
            // All retries exhausted on initial load — show error
            r.json()
              .then(function (data) { setMapError(data && data.error ? data.error : "load_error"); })
              .catch(function () { setMapError("load_error"); });
          }
          // else: update retries exhausted — silently keep the last good image
        }
      })
      .catch(function () {
        pendingFetchRef.current = false;
        if (currentAttempt < 4) {
          var delay = Math.pow(2, currentAttempt + 1) * 1000;
          retryTimerRef.current = setTimeout(function () {
            tryLoadMap(url, isInitial, currentAttempt + 1);
          }, delay);
        } else if (isInitial) {
          setMapError("load_error");
        }
      });
  }

  // Fetch directions (road polyline) from server
  useEffect(function () {
    fetch("/api/maps/directions?origin=" + route.from.lat + "," + route.from.lng + "&destination=" + route.to.lat + "," + route.to.lng)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.points && data.points.length >= 2) {
          setDirectionsData(data);
          // Build cumulative distances along the polyline
          var distances = [0];
          var total = 0;
          for (var i = 1; i < data.points.length; i++) {
            total += computeDistanceBetween(data.points[i - 1], data.points[i]);
            distances.push(total);
          }
          cumulativeDistRef.current = distances;
        }
        setDirectionsLoaded(true);
      })
      .catch(function () { setDirectionsLoaded(true); /* fallback to straight line */ });
  }, [route]);

  // Build the initial map URL — wait until directions fetch completes so we
  // always use the encoded polyline when available (avoids straight-line race).
  useEffect(function () {
    if (!directionsLoaded) return;
    var opts: any = {
      width: IMG_W,
      height: IMG_H,
      markers: [
        { lat: route.from.lat, lng: route.from.lng, label: "A", color: "green" },
        { lat: route.to.lat, lng: route.to.lng, label: "B", color: "red" },
      ],
      pathColor: "0x4285F4ff",
      playerMarker: { lat: route.from.lat, lng: route.from.lng },
    };
    if (directionsData) {
      opts.encodedPath = directionsData.overview_polyline;
    } else {
      opts.path = [route.from, route.to];
    }
    var url = staticMapUrl(opts);
    tryLoadMap(url, true);
  }, [route, directionsLoaded]);

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
  useEffect(function () {
    var totalRouteLength = directionsData
      ? directionsData.distance_meters
      : computeDistanceBetween(route.from, route.to);

    var INTERVAL_MS = 500;
    var timer = setInterval(function () {
      if (finished) return;

      var speedKmh = speedRef.current;
      if (speedKmh <= 0) return;

      var speedMs = speedKmh / 3.6;
      var distanceDelta = speedMs * (INTERVAL_MS / 1000);
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

      setProgressPct(Math.min(100, (travelledRef.current / totalRouteLength) * 100));

      // Interpolate position along polyline or straight line
      var newLat: number;
      var newLng: number;
      if (directionsData && cumulativeDistRef.current.length >= 2) {
        var points = directionsData.points;
        var distances = cumulativeDistRef.current;
        // Binary search for the segment containing travelledRef.current
        var lo = 0;
        var hi = distances.length - 1;
        while (lo < hi - 1) {
          var mid = (lo + hi) >> 1;
          if (distances[mid] <= travelledRef.current) lo = mid;
          else hi = mid;
        }
        var segStart = distances[lo];
        var segEnd = distances[hi];
        var segLen = segEnd - segStart;
        var t2 = segLen > 0 ? (travelledRef.current - segStart) / segLen : 0;
        newLat = points[lo].lat + (points[hi].lat - points[lo].lat) * t2;
        newLng = points[lo].lng + (points[hi].lng - points[lo].lng) * t2;
      } else {
        var t = travelledRef.current / totalRouteLength;
        newLat = route.from.lat + (route.to.lat - route.from.lat) * t;
        newLng = route.from.lng + (route.to.lng - route.from.lng) * t;
      }

      // Update map image periodically — pre-validate via fetch so a 403 keeps the old image
      var now = Date.now();
      if (now - lastMapUpdateRef.current >= UPDATE_INTERVAL_MS) {
        lastMapUpdateRef.current = now;
        var opts: any = {
          width: IMG_W,
          height: IMG_H,
          markers: [
            { lat: route.from.lat, lng: route.from.lng, label: "A", color: "green" },
            { lat: route.to.lat, lng: route.to.lng, label: "B", color: "red" },
          ],
          pathColor: "0x4285F4ff",
          playerMarker: { lat: newLat, lng: newLng },
        };
        if (directionsData) {
          opts.encodedPath = directionsData.overview_polyline;
        } else {
          opts.path = [route.from, route.to];
        }
        tryLoadMap(staticMapUrl(opts), false);
      }
    }, INTERVAL_MS);
    return function () { clearInterval(timer); };
  }, [finished, route, directionsData]);

  const clientId = clients[0];
  const profile = clientId ? clientProfiles[clientId] : null;

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, background: "#000" }}>
      {/* Static map image */}
      {mapError ? (
        <div
          className="fg-col"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#555",
            fontSize: "1.2rem",
            "--fg": "0.5rem",
          } as React.CSSProperties}
        >
          <div>Map unavailable</div>
          {mapError !== "load_error" && (
            <div style={{ fontSize: "0.8rem", maxWidth: 500, textAlign: "center", color: "#666" }}>{mapError}</div>
          )}
        </div>
      ) : mapUrl ? (
        <img
          src={mapUrl}
          alt="Route Map"
          onError={function () { setMapError("load_error"); }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      ) : null}

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
        <div style={{ fontWeight: 600 }}>{((directionsData ? directionsData.distance_meters : computeDistanceBetween(route.from, route.to)) / 1000).toFixed(1)} km</div>
        <div style={{ color: "#aaa", fontSize: "0.75rem" }}>{directionsData ? "Walking route" : "Straight line"}</div>
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
    </div>
  );
}

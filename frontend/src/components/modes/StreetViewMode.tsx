import { useEffect, useRef, useCallback } from "react";
import type { ClientProfile, WearableData } from "../../types/session";
import type { StreetViewLocation } from "../Lobby";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
  startLocation: StreetViewLocation;
}

/**
 * Find the linked panorama whose heading is closest to the desired heading.
 */
function findBestLink(
  links: google.maps.StreetViewLink[],
  targetHeading: number,
): google.maps.StreetViewLink | null {
  if (links.length === 0) return null;

  let best = links[0];
  let bestDiff = 360;

  for (const link of links) {
    const diff = Math.abs(((link.heading! - targetHeading + 540) % 360) - 180);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = link;
    }
  }

  // Only follow the link if it's roughly in our direction (within 90 degrees)
  return bestDiff <= 90 ? best : null;
}

export function StreetViewMode({ clients, clientProfiles, latestData, startLocation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const headingRef = useRef(0);
  const speedRef = useRef(0);
  const accumulatedDistanceRef = useRef(0);
  const movingRef = useRef(false);
  const totalDistanceRef = useRef(0);

  // Initialize the panorama once
  useEffect(() => {
    if (!containerRef.current || panoramaRef.current) return;

    const startPos = new google.maps.LatLng(startLocation.lat, startLocation.lng);

    const svService = new google.maps.StreetViewService();

    svService.getPanorama(
      { location: startPos, radius: 500 },
      (data: google.maps.StreetViewPanoramaData | null, status: google.maps.StreetViewStatus) => {
        if (status !== google.maps.StreetViewStatus.OK || !data?.location?.latLng) return;

        const panorama = new google.maps.StreetViewPanorama(containerRef.current!, {
          position: data.location.latLng,
          pov: { heading: 0, pitch: 0 },
          zoom: 1,
          disableDefaultUI: true,
          showRoadLabels: false,
          clickToGo: false,
          linksControl: false,
        });

        // Track heading from user looking around
        panorama.addListener("pov_changed", () => {
          if (!movingRef.current) {
            headingRef.current = panorama.getPov().heading;
          }
        });

        panoramaRef.current = panorama;
      },
    );

    return () => {
      panoramaRef.current = null;
    };
  }, [startLocation]);

  // Keep speedRef in sync with latest wearable data
  useEffect(() => {
    speedRef.current = latestData?.speedKmh ?? 0;
  }, [latestData]);

  // Move to the next linked panorama in the current heading direction
  const moveToNextPanorama = useCallback(() => {
    const panorama = panoramaRef.current;
    if (!panorama || movingRef.current) return;

    const rawLinks = panorama.getLinks();
    if (!rawLinks || rawLinks.length === 0) return;
    const links = rawLinks.filter((l): l is google.maps.StreetViewLink => l !== null);
    if (links.length === 0) return;

    const bestLink = findBestLink(links, headingRef.current);
    if (!bestLink?.pano) return;

    movingRef.current = true;

    // Update heading to follow the road direction of the chosen link
    if (bestLink.heading != null) {
      headingRef.current = bestLink.heading;
      panorama.setPov({ heading: bestLink.heading, pitch: panorama.getPov().pitch });
    }

    panorama.setPano(bestLink.pano);

    // Reset moving flag after a short delay to allow the panorama to load
    setTimeout(() => {
      movingRef.current = false;
    }, 300);
  }, []);

  // Accumulate distance every second and jump to next panorama when threshold is reached
  useEffect(() => {
    const INTERVAL_MS = 500;
    const PANO_SPACING = 12; // approximate meters between street view panoramas

    const timer = setInterval(() => {
      const speedKmh = speedRef.current;
      if (speedKmh <= 0) return;

      const speedMs = speedKmh / 3.6;
      const distanceDelta = speedMs * (INTERVAL_MS / 1000);
      accumulatedDistanceRef.current += distanceDelta;
      totalDistanceRef.current += distanceDelta;

      // Move to next panorama when we've "walked" far enough
      if (accumulatedDistanceRef.current >= PANO_SPACING) {
        accumulatedDistanceRef.current -= PANO_SPACING;
        moveToNextPanorama();
      }
    }, INTERVAL_MS);

    return () => clearInterval(timer);
  }, [moveToNextPanorama]);

  const clientId = clients[0];
  const profile = clientId ? clientProfiles[clientId] : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "80vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

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
            <div>{latestData.heartRate} bpm</div>
            <div>{latestData.steps} steps</div>
            <div style={{ fontSize: "0.8rem", color: "#aaa" }}>{totalDistanceRef.current.toFixed(0)} m</div>
          </>
        ) : (
          <div style={{ color: "#888" }}>No data yet</div>
        )}
      </div>
    </div>
  );
}

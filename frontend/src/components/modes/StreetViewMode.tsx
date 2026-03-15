import { useEffect, useRef, useCallback, useState } from "react";
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
 * If no link is within the threshold, returns the closest link anyway when
 * `fallback` is true (used for explicit user actions so you never get stuck).
 */
function findBestLink(
  links: google.maps.StreetViewLink[],
  targetHeading: number,
  fallback = false,
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

  // Only follow the link if it's roughly in our direction (within 90 degrees),
  // unless fallback is requested (explicit user moves should never get stuck).
  if (bestDiff <= 90) return best;
  return fallback ? best : null;
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

const PRELOAD_COUNT = 3; // number of upcoming panoramas to preload
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

/** Build a Street View Static API URL matching the interactive panorama's POV */
function staticUrl(panoId: string, heading: number, width = 640, height = 480, fov = 90, pitch = 0) {
  return `https://maps.googleapis.com/maps/api/streetview?size=${width}x${height}&pano=${panoId}&heading=${heading}&fov=${fov}&pitch=${pitch}&key=${API_KEY}`;
}

export function StreetViewMode({ clients, clientProfiles, latestData, startLocation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);
  const headingRef = useRef(0);
  const pitchRef = useRef(0);
  const fovRef = useRef(90); // FOV in degrees, derived from zoom: 180 / 2^zoom
  const speedRef = useRef(0);
  const accumulatedDistanceRef = useRef(0);
  const movingRef = useRef(false);
  const totalDistanceRef = useRef(0);
  const currentPositionRef = useRef<google.maps.LatLng | null>(null);
  const panoSpacingRef = useRef(12); // dynamic, updated from actual panorama distances
  const visitedPanosRef = useRef<Set<string>>(new Set()); // all visited pano IDs

  // Image preload cache: panoId → { img (preloaded HTMLImageElement), heading }
  const imageCacheRef = useRef<Map<string, { img: HTMLImageElement; heading: number }>>(new Map());

  // Crossfade overlay state
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tilesListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addPanoLog = useCallback((_panoId: string, _heading: number, _linksCount: number, _filteredCount: number, _method: string) => {}, []);

  // Fade out the overlay (called when tiles are loaded or as a fallback timeout)
  const fadeOutOverlay = useCallback(() => {
    // Remove the tiles listener if still attached
    if (tilesListenerRef.current) {
      tilesListenerRef.current.remove();
      tilesListenerRef.current = null;
    }
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
    setOverlayVisible(false);
    setTimeout(() => setOverlayUrl(null), 400);
  }, []);

  // Show a preloaded static image as overlay, fade out once the panorama tiles finish loading.
  const showOverlay = useCallback((panoId: string, heading: number) => {
    const fov = Math.round(fovRef.current);
    const pitch = Math.round(pitchRef.current);
    const url = staticUrl(panoId, heading, 640, 480, fov, pitch);
    setOverlayUrl(url);
    setOverlayVisible(true);

    // Clear any previous listener / timer
    if (tilesListenerRef.current) {
      tilesListenerRef.current.remove();
      tilesListenerRef.current = null;
    }
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);

    // Wait for the interactive panorama to finish loading its tiles
    const panorama = panoramaRef.current;
    if (panorama) {
      tilesListenerRef.current = panorama.addListener("tilesloaded", () => {
        fadeOutOverlay();
      });
    }

    // Fallback: fade out after 3s in case tilesloaded never fires
    overlayTimerRef.current = setTimeout(() => {
      fadeOutOverlay();
    }, 3000);
  }, [fadeOutOverlay]);

  // Preload the current panorama's forward-facing links as static images.
  // Called on links_changed — replaces the preloaded map so the table always shows current candidates.
  const preloadCurrentLinks = useCallback(() => {
    const panorama = panoramaRef.current;
    if (!panorama) return;

    const rawLinks = panorama.getLinks();
    const allLinks = (rawLinks || []).filter((l): l is google.maps.StreetViewLink => l !== null);
    const visited = visitedPanosRef.current;
    const heading = headingRef.current;
    const cache = imageCacheRef.current;

    const candidates = [...allLinks]
      .filter(l => l.pano && !visited.has(l.pano))
      .sort((a, b) => {
        const diffA = Math.abs(((a.heading! - heading + 540) % 360) - 180);
        const diffB = Math.abs(((b.heading! - heading + 540) % 360) - 180);
        return diffA - diffB;
      });

    const newMap = new Map<string, number>();
    let count = 0;
    for (const link of candidates) {
      if (count >= PRELOAD_COUNT) break;
      if (!link.pano) continue;
      const h = Math.round(link.heading ?? heading);
      newMap.set(link.pano, h);

      // Pre-fetch the image with current POV (always refresh to match current pitch/fov)
      const fov = Math.round(fovRef.current);
      const pitch = Math.round(pitchRef.current);
      const img = new Image();
      img.src = staticUrl(link.pano, h, 640, 480, fov, pitch);
      cache.set(link.pano, { img, heading: h });
      count++;
    }
  }, []);

  // Initialize the panorama once
  useEffect(() => {
    if (!containerRef.current || panoramaRef.current) return;

    const startPos = new google.maps.LatLng(startLocation.lat, startLocation.lng);

    const svService = new google.maps.StreetViewService();
    svServiceRef.current = svService;

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

        // headingRef is only updated by movement functions, not by POV changes,
        // to prevent Google's automatic POV adjustments from corrupting the travel direction.
        // But we track pitch and zoom for the static image overlay to match the interactive view.
        panorama.addListener("pov_changed", () => {
          const pov = panorama.getPov();
          pitchRef.current = pov.pitch;
          fovRef.current = 180 / Math.pow(2, panorama.getZoom() ?? 1);
        });

        // Track position changes to compute actual distance between panoramas
        panorama.addListener("position_changed", () => {
          const newPos = panorama.getPosition();
          if (!newPos) return;

          const prevPos = currentPositionRef.current;
          if (prevPos) {
            const actualDist = google.maps.geometry.spherical.computeDistanceBetween(prevPos, newPos);
            // Use actual distance for total tracking (more accurate than speed estimate)
            // Only count reasonable distances (filter out teleports / initial load)
            if (actualDist > 0 && actualDist < 200) {
              // Update dynamic spacing: blend toward actual distance for smoother transitions
              panoSpacingRef.current = actualDist;
            }
          }
          currentPositionRef.current = newPos;
        });

        // Preload upcoming panos whenever links become available after a pano change
        panorama.addListener("links_changed", () => {
          preloadCurrentLinks();
        });

        currentPositionRef.current = data.location.latLng as google.maps.LatLng;
        if (data.location.pano) {
          visitedPanosRef.current.add(data.location.pano);
          addPanoLog(data.location.pano, 0, panorama.getLinks()?.length ?? 0, 0, "init");
        }
        panoramaRef.current = panorama;
      },
    );

    return () => {
      panoramaRef.current = null;
    };
  }, [startLocation, addPanoLog, preloadCurrentLinks]);

  // Keep speedRef in sync with latest wearable data
  useEffect(() => {
    speedRef.current = latestData?.speedKmh ?? 0;
  }, [latestData]);

  // Search ahead for a panorama when links run out (coverage gap).
  // Projects a point ~50m forward along the current heading and searches for nearby panos.
  const searchAhead = useCallback(() => {
    const panorama = panoramaRef.current;
    const svService = svServiceRef.current;
    const pos = currentPositionRef.current;
    if (!panorama || !svService || !pos) return;

    movingRef.current = true;

    const heading = headingRef.current;
    const aheadPoint = google.maps.geometry.spherical.computeOffset(pos, 50, heading);

    const tryJump = (data: google.maps.StreetViewPanoramaData) => {
      if (!data.location?.pano || visitedPanosRef.current.has(data.location.pano)) {
        movingRef.current = false;
        return;
      }
      // Verify the found pano is roughly ahead (within 90° of current heading)
      if (data.location.latLng) {
        const newHeading = google.maps.geometry.spherical.computeHeading(pos, data.location.latLng);
        const diff = Math.abs(((newHeading - heading + 540) % 360) - 180);
        if (diff > 90) {
          movingRef.current = false;
          return;
        }
        headingRef.current = newHeading;
        panorama.setPov({ heading: newHeading, pitch: panorama.getPov().pitch });
      }
      showOverlay(data.location.pano, headingRef.current);
      visitedPanosRef.current.add(panorama.getPano());
      visitedPanosRef.current.add(data.location.pano);
      addPanoLog(data.location.pano, headingRef.current, 0, 0, "search");
      panorama.setPano(data.location.pano);
      setTimeout(() => { movingRef.current = false; }, 300);
    };

    // Try official Street View first, then fall back to any source (photo spheres)
    svService.getPanorama(
      { location: aheadPoint, radius: 100, source: google.maps.StreetViewSource.OUTDOOR },
      (data, status) => {
        if (status === google.maps.StreetViewStatus.OK && data?.location?.pano &&
            !visitedPanosRef.current.has(data.location.pano)) {
          tryJump(data);
        } else {
          // Fallback: search without source filter
          svService.getPanorama(
            { location: aheadPoint, radius: 100 },
            (data2, status2) => {
              if (status2 === google.maps.StreetViewStatus.OK && data2?.location?.pano) {
                tryJump(data2);
              } else {
                movingRef.current = false;
              }
            },
          );
        }
      },
    );
  }, [addPanoLog, showOverlay]);

  // Move forward along the road (speed-based auto-movement).
  // Excludes the previous pano and picks the best remaining link — no heading threshold,
  // so it follows the road even through sharp curves.
  // Falls back to searching ahead if no links are available.
  const moveForwardAuto = useCallback(() => {
    const panorama = panoramaRef.current;
    if (!panorama || movingRef.current) return;

    const rawLinks = panorama.getLinks();
    const allLinks = (rawLinks || []).filter((l): l is google.maps.StreetViewLink => l !== null);

    // Exclude all previously visited panoramas so we never go backward
    const visited = visitedPanosRef.current;
    const links = allLinks.filter(l => !l.pano || !visited.has(l.pano));

    if (links.length === 0) {
      // No links available — search for a nearby panorama ahead
      searchAhead();
      return;
    }

    // Pick link within 90° of current heading; if none, search ahead instead
    const bestLink = findBestLink(links, headingRef.current, false);
    if (!bestLink?.pano) {
      searchAhead();
      return;
    }

    movingRef.current = true;

    if (bestLink.heading != null) {
      headingRef.current = bestLink.heading;
      panorama.setPov({ heading: bestLink.heading, pitch: panorama.getPov().pitch });
    }

    // Show preloaded static image as overlay during transition
    showOverlay(bestLink.pano, headingRef.current);

    visitedPanosRef.current.add(panorama.getPano());
    visitedPanosRef.current.add(bestLink.pano);
    addPanoLog(bestLink.pano, headingRef.current, allLinks.length, links.length, "link");
    panorama.setPano(bestLink.pano);

    setTimeout(() => {
      movingRef.current = false;
    }, 300);
  }, [searchAhead, addPanoLog, showOverlay]);

  // Move to a linked panorama in a given heading direction (arrow buttons).
  const moveInDirection = useCallback((headingOffset: number) => {
    const panorama = panoramaRef.current;
    if (!panorama || movingRef.current) return;

    const rawLinks = panorama.getLinks();
    if (!rawLinks || rawLinks.length === 0) return;
    const allLinks = rawLinks.filter((l): l is google.maps.StreetViewLink => l !== null);
    if (allLinks.length === 0) return;

    // For forward movement, filter out visited panos to prevent going backward
    const visited = visitedPanosRef.current;
    const links = (headingOffset === 0)
      ? allLinks.filter(l => !l.pano || !visited.has(l.pano))
      : allLinks;

    const currentHeading = headingRef.current;
    const targetHeading = (currentHeading + headingOffset + 360) % 360;

    // For forward: if no unvisited links, or best link is >90° off, search ahead instead
    if (headingOffset === 0) {
      const bestLink = links.length > 0 ? findBestLink(links, targetHeading, false) : null;
      if (!bestLink?.pano) {
        searchAhead();
        return;
      }

      movingRef.current = true;
      if (bestLink.heading != null) {
        headingRef.current = bestLink.heading;
        panorama.setPov({ heading: bestLink.heading, pitch: panorama.getPov().pitch });
      }
      showOverlay(bestLink.pano, headingRef.current);
      visitedPanosRef.current.add(panorama.getPano());
      visitedPanosRef.current.add(bestLink.pano);
      addPanoLog(bestLink.pano, headingRef.current, allLinks.length, links.length, "arrow");
      panorama.setPano(bestLink.pano);
      setTimeout(() => { movingRef.current = false; }, 300);
      return;
    }

    // For back/left/right: use all links with fallback
    const bestLink = findBestLink(links, targetHeading, true);
    if (!bestLink?.pano) return;

    movingRef.current = true;

    showOverlay(bestLink.pano, headingRef.current);
    visitedPanosRef.current.add(panorama.getPano());
    visitedPanosRef.current.add(bestLink.pano);
    addPanoLog(bestLink.pano, headingRef.current, allLinks.length, links.length, "arrow");
    panorama.setPano(bestLink.pano);

    setTimeout(() => {
      movingRef.current = false;
    }, 300);
  }, [addPanoLog, searchAhead, showOverlay]);

  // Accumulate distance every second and jump to next panorama when threshold is reached
  useEffect(() => {
    const INTERVAL_MS = 500;

    const timer = setInterval(() => {
      const speedKmh = speedRef.current;
      if (speedKmh <= 0) return;

      const speedMs = speedKmh / 3.6;
      const distanceDelta = speedMs * (INTERVAL_MS / 1000);
      accumulatedDistanceRef.current += distanceDelta;
      totalDistanceRef.current += distanceDelta;

      // Use dynamic spacing based on actual distance between panoramas
      const spacing = panoSpacingRef.current;
      if (accumulatedDistanceRef.current >= spacing) {
        accumulatedDistanceRef.current -= spacing;
        moveForwardAuto();
      }
    }, INTERVAL_MS);

    return () => clearInterval(timer);
  }, [moveForwardAuto]);

  const clientId = clients[0];
  const profile = clientId ? clientProfiles[clientId] : null;

  return (
    <>
    <div style={{ position: "relative", width: "100%", height: "80vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Static image overlay — shown during pano transitions to hide blurry tile loading */}
      {overlayUrl && (
        <img
          src={overlayUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 5,
            pointerEvents: "none",
            opacity: overlayVisible ? 1 : 0,
            transition: "opacity 0.35s ease-out",
          }}
        />
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
            <div>{latestData.heartRate} bpm</div>
            <div>{latestData.steps} steps</div>
            <div style={{ fontSize: "0.8rem", color: "#aaa" }}>{totalDistanceRef.current.toFixed(0)} m</div>
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
        {/* Row 1: empty / forward / empty */}
        <div />
        <button onClick={() => moveInDirection(0)} style={arrowBtnStyle} title="Forward">&#9650;</button>
        <div />
        {/* Row 2: left / empty / right */}
        <button onClick={() => moveInDirection(-90)} style={arrowBtnStyle} title="Left">&#9664;</button>
        <div />
        <button onClick={() => moveInDirection(90)} style={arrowBtnStyle} title="Right">&#9654;</button>
        {/* Row 3: empty */}
        <div />
        <div />
        <div />
      </div>
    </div>
    </>
  );
}

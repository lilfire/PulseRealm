import { useEffect, useRef, useCallback, useState } from "react";
import type { ClientProfile, RealmRole, WearableData } from "../../types/session";
import type { StreetViewLocation } from "../lobbies/StreetViewLobby";
import { estimateCaloriesPerSecond, getZoneForHr, getMaxHrForAge, ZONE_COLORS, formatPace } from "../../utils/wearable";
import { useGoogleMaps } from "../../hooks/useGoogleMaps";
import { StaticStreetViewMode } from "./StaticStreetViewMode";
import { BindControlsHud } from "./BindControlsHud";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
  startLocation: StreetViewLocation;
  onEnd: (totalDistanceMeters: number) => void;
  role?: RealmRole;
  boundClientId?: string | null;
  clientInclines?: Record<string, number>;
  onSetIncline?: (clientId: string, percent: number) => void;
  clientSpeedOverrides?: Record<string, number>;
  onSetSpeedOverride?: (clientId: string, speedKmh: number) => void;
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

const PRELOAD_COUNT = 3;

export function StreetViewMode({ clients, clientProfiles, latestData, startLocation, onEnd, role = "host", boundClientId, clientInclines, onSetIncline, clientSpeedOverrides, onSetSpeedOverride }: Props) {
  const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps();

  // Two containers — one visible, one hidden preloading the next pano
  const containerARef = useRef<HTMLDivElement>(null);
  const containerBRef = useRef<HTMLDivElement>(null);
  const panoARef = useRef<google.maps.StreetViewPanorama | null>(null);
  const panoBRef = useRef<google.maps.StreetViewPanorama | null>(null);
  // Which pano is currently visible: "A" or "B"
  const [activePano, setActivePano] = useState<"A" | "B">("A");
  const activePanoRef = useRef<"A" | "B">("A");

  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);
  const headingRef = useRef(startLocation.heading ?? 0);
  const speedRef = useRef(0);
  const accumulatedDistanceRef = useRef(0);
  const movingRef = useRef(false);
  const totalDistanceRef = useRef(0);
  const [totalDistanceDisplay, setTotalDistanceDisplay] = useState(0);
  const caloriesRef = useRef(0);
  const [caloriesDisplay, setCaloriesDisplay] = useState(0);
  const currentPositionRef = useRef<google.maps.LatLng | null>(null);
  const panoSpacingRef = useRef(12);
  const visitedPanosRef = useRef<Set<string>>(new Set());
  // Track whether the back pano is ready (tiles loaded) for the next swap
  const backReadyRef = useRef(false);
  const backTilesListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  const getActivePanorama = useCallback(() => {
    return activePanoRef.current === "A" ? panoARef.current : panoBRef.current;
  }, []);

  const getBackPanorama = useCallback(() => {
    return activePanoRef.current === "A" ? panoBRef.current : panoARef.current;
  }, []);

  // Swap visibility: bring back pano to front, old front becomes back
  const swapPanos = useCallback(() => {
    const next = activePanoRef.current === "A" ? "B" : "A";
    activePanoRef.current = next;
    setActivePano(next);
    backReadyRef.current = false;
  }, []);

  // Preload a specific pano on the back (hidden) panorama instance
  const preloadOnBack = useCallback((panoId: string, heading: number, pitch: number) => {
    const back = getBackPanorama();
    if (!back) return;

    backReadyRef.current = false;

    // Clean up previous listener
    if (backTilesListenerRef.current) {
      backTilesListenerRef.current.remove();
      backTilesListenerRef.current = null;
    }

    back.setPov({ heading, pitch });
    back.setPano(panoId);

    // Mark ready when tiles finish loading
    backTilesListenerRef.current = back.addListener("tilesloaded", () => {
      backReadyRef.current = true;
      if (backTilesListenerRef.current) {
        backTilesListenerRef.current.remove();
        backTilesListenerRef.current = null;
      }
    });
  }, [getBackPanorama]);

  // Preload upcoming panos via StreetViewService (warms Google's cache)
  const preloadCurrentLinks = useCallback(() => {
    const panorama = getActivePanorama();
    const svService = svServiceRef.current;
    if (!panorama || !svService) return;

    const rawLinks = panorama.getLinks();
    const allLinks = (rawLinks || []).filter((l): l is google.maps.StreetViewLink => l !== null);
    const visited = visitedPanosRef.current;
    const heading = headingRef.current;

    const candidates = [...allLinks]
      .filter(l => l.pano && !visited.has(l.pano))
      .sort((a, b) => {
        const diffA = Math.abs(((a.heading! - heading + 540) % 360) - 180);
        const diffB = Math.abs(((b.heading! - heading + 540) % 360) - 180);
        return diffA - diffB;
      });

    // Preload the best candidate on the back panorama for instant swap
    if (candidates.length > 0 && candidates[0].pano) {
      const bestHeading = candidates[0].heading ?? heading;
      preloadOnBack(candidates[0].pano, bestHeading, panorama.getPov().pitch);
    }

    // Also warm Google's cache for additional candidates
    let count = 0;
    for (const link of candidates) {
      if (count >= PRELOAD_COUNT) break;
      if (!link.pano) continue;
      svService.getPanorama({ pano: link.pano }, () => {});
      count++;
    }
  }, [getActivePanorama, preloadOnBack]);

  // Keep a ref to the latest preloadCurrentLinks so the init effect can call it
  // without listing it as a dependency (which would risk re-initializing the panos).
  const preloadCurrentLinksRef = useRef(preloadCurrentLinks);
  useEffect(() => {
    preloadCurrentLinksRef.current = preloadCurrentLinks;
  }, [preloadCurrentLinks]);

  // Initialize both panoramas once
  useEffect(() => {
    if (!mapsLoaded || !containerARef.current || !containerBRef.current || panoARef.current) return;

    const startPos = new google.maps.LatLng(startLocation.lat, startLocation.lng);
    const svService = new google.maps.StreetViewService();
    svServiceRef.current = svService;

    // Listeners registered inside the async callback — stored for cleanup.
    const registeredListeners: google.maps.MapsEventListener[] = [];

    svService.getPanorama(
      { location: startPos, radius: 500 },
      (data: google.maps.StreetViewPanoramaData | null, status: google.maps.StreetViewStatus) => {
        if (status !== google.maps.StreetViewStatus.OK || !data?.location?.latLng) return;

        const panoOptions: google.maps.StreetViewPanoramaOptions = {
          position: data.location.latLng,
          pov: { heading: startLocation.heading ?? 0, pitch: startLocation.pitch ?? 0 },
          zoom: 1,
          disableDefaultUI: true,
          showRoadLabels: false,
          clickToGo: false,
          linksControl: false,
        };

        const panoA = new google.maps.StreetViewPanorama(containerARef.current!, panoOptions);
        const panoB = new google.maps.StreetViewPanorama(containerBRef.current!, panoOptions);

        // Track position changes on both panos (whichever is active)
        const trackPosition = (pano: google.maps.StreetViewPanorama) => {
          const listener = pano.addListener("position_changed", () => {
            const newPos = pano.getPosition();
            if (!newPos) return;
            const prevPos = currentPositionRef.current;
            if (prevPos) {
              const actualDist = google.maps.geometry.spherical.computeDistanceBetween(prevPos, newPos);
              if (actualDist > 0 && actualDist < 200) {
                panoSpacingRef.current = actualDist;
              }
            }
            currentPositionRef.current = newPos;
          });
          registeredListeners.push(listener);
        };
        trackPosition(panoA);
        trackPosition(panoB);

        // Preload upcoming panos when links become available
        registeredListeners.push(
          panoA.addListener("links_changed", () => {
            if (activePanoRef.current === "A") preloadCurrentLinksRef.current();
          }),
        );
        registeredListeners.push(
          panoB.addListener("links_changed", () => {
            if (activePanoRef.current === "B") preloadCurrentLinksRef.current();
          }),
        );

        currentPositionRef.current = data.location.latLng as google.maps.LatLng;
        if (data.location.pano) {
          visitedPanosRef.current.add(data.location.pano);
        }

        panoARef.current = panoA;
        panoBRef.current = panoB;
      },
    );

    return () => {
      registeredListeners.forEach((l) => l.remove());
      if (backTilesListenerRef.current) {
        backTilesListenerRef.current.remove();
        backTilesListenerRef.current = null;
      }
      panoARef.current = null;
      panoBRef.current = null;
    };
  }, [startLocation, mapsLoaded]);

  // Enter browser fullscreen on mount
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => { document.exitFullscreen?.().catch(() => {}); };
  }, []);

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

  // Search ahead for a panorama when links run out
  const searchAhead = useCallback(() => {
    const panorama = getActivePanorama();
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
      if (data.location.latLng) {
        const newHeading = google.maps.geometry.spherical.computeHeading(pos, data.location.latLng);
        const diff = Math.abs(((newHeading - heading + 540) % 360) - 180);
        if (diff > 90) {
          movingRef.current = false;
          return;
        }
        headingRef.current = newHeading;
      }

      visitedPanosRef.current.add(panorama.getPano());
      visitedPanosRef.current.add(data.location.pano);

      // Set on the back pano, wait for tiles, then swap
      const back = getBackPanorama();
      if (back) {
        if (backTilesListenerRef.current) {
          backTilesListenerRef.current.remove();
        }
        back.setPov({ heading: headingRef.current, pitch: panorama.getPov().pitch });
        back.setPano(data.location.pano);
        backTilesListenerRef.current = back.addListener("tilesloaded", () => {
          if (backTilesListenerRef.current) {
            backTilesListenerRef.current.remove();
            backTilesListenerRef.current = null;
          }
          swapPanos();
          setTimeout(() => { movingRef.current = false; }, 100);
        });
        // Fallback: swap after 600ms even if tiles haven't loaded
        setTimeout(() => {
          if (movingRef.current) {
            swapPanos();
            movingRef.current = false;
          }
        }, 600);
      } else {
        // No back pano available, move directly on active
        panorama.setPov({ heading: headingRef.current, pitch: panorama.getPov().pitch });
        panorama.setPano(data.location.pano);
        setTimeout(() => { movingRef.current = false; }, 300);
      }
    };

    svService.getPanorama(
      { location: aheadPoint, radius: 100, source: google.maps.StreetViewSource.OUTDOOR },
      (data, status) => {
        if (status === google.maps.StreetViewStatus.OK && data?.location?.pano &&
            !visitedPanosRef.current.has(data.location.pano)) {
          tryJump(data);
        } else {
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
  }, [getActivePanorama, getBackPanorama, swapPanos]);

  // Move forward: if back pano is already preloaded with the right pano, just swap instantly.
  // Otherwise load on back, wait for tiles, then swap.
  const moveForwardAuto = useCallback(() => {
    const panorama = getActivePanorama();
    if (!panorama || movingRef.current) return;

    const rawLinks = panorama.getLinks();
    const allLinks = (rawLinks || []).filter((l): l is google.maps.StreetViewLink => l !== null);
    const visited = visitedPanosRef.current;
    const links = allLinks.filter(l => !l.pano || !visited.has(l.pano));

    if (links.length === 0) {
      searchAhead();
      return;
    }

    const bestLink = findBestLink(links, headingRef.current, false);
    if (!bestLink?.pano) {
      searchAhead();
      return;
    }

    movingRef.current = true;

    if (bestLink.heading != null) {
      headingRef.current = bestLink.heading;
    }

    visitedPanosRef.current.add(panorama.getPano());
    visitedPanosRef.current.add(bestLink.pano);

    const back = getBackPanorama();

    // Check if back pano already has this pano preloaded and ready
    if (back && backReadyRef.current && back.getPano() === bestLink.pano) {
      // Instant swap — tiles are already loaded!
      back.setPov({ heading: headingRef.current, pitch: panorama.getPov().pitch });
      swapPanos();
      setTimeout(() => { movingRef.current = false; }, 100);
      return;
    }

    // Otherwise, load on back pano and swap when ready
    if (back) {
      if (backTilesListenerRef.current) {
        backTilesListenerRef.current.remove();
      }
      backReadyRef.current = false;
      back.setPov({ heading: headingRef.current, pitch: panorama.getPov().pitch });
      back.setPano(bestLink.pano);
      backTilesListenerRef.current = back.addListener("tilesloaded", () => {
        if (backTilesListenerRef.current) {
          backTilesListenerRef.current.remove();
          backTilesListenerRef.current = null;
        }
        swapPanos();
        setTimeout(() => { movingRef.current = false; }, 100);
      });
      // Fallback: swap after 600ms
      setTimeout(() => {
        if (movingRef.current) {
          swapPanos();
          movingRef.current = false;
        }
      }, 600);
    } else {
      // Fallback: move on active pano directly
      panorama.setPov({ heading: headingRef.current, pitch: panorama.getPov().pitch });
      panorama.setPano(bestLink.pano);
      setTimeout(() => { movingRef.current = false; }, 300);
    }
  }, [getActivePanorama, getBackPanorama, searchAhead, swapPanos]);

  // Move to a linked panorama in a given heading direction (arrow buttons)
  const moveInDirection = useCallback((headingOffset: number) => {
    const panorama = getActivePanorama();
    if (!panorama || movingRef.current) return;

    const rawLinks = panorama.getLinks();
    if (!rawLinks || rawLinks.length === 0) return;
    const allLinks = rawLinks.filter((l): l is google.maps.StreetViewLink => l !== null);
    if (allLinks.length === 0) return;

    const visited = visitedPanosRef.current;
    const links = (headingOffset === 0)
      ? allLinks.filter(l => !l.pano || !visited.has(l.pano))
      : allLinks;

    const currentHeading = headingRef.current;
    const targetHeading = (currentHeading + headingOffset + 360) % 360;

    if (headingOffset === 0) {
      const bestLink = links.length > 0 ? findBestLink(links, targetHeading, false) : null;
      if (!bestLink?.pano) {
        searchAhead();
        return;
      }

      movingRef.current = true;
      if (bestLink.heading != null) {
        headingRef.current = bestLink.heading;
      }
      visitedPanosRef.current.add(panorama.getPano());
      visitedPanosRef.current.add(bestLink.pano);

      const back = getBackPanorama();
      if (back) {
        if (backTilesListenerRef.current) backTilesListenerRef.current.remove();
        back.setPov({ heading: headingRef.current, pitch: panorama.getPov().pitch });
        back.setPano(bestLink.pano);
        backTilesListenerRef.current = back.addListener("tilesloaded", () => {
          if (backTilesListenerRef.current) {
            backTilesListenerRef.current.remove();
            backTilesListenerRef.current = null;
          }
          swapPanos();
          setTimeout(() => { movingRef.current = false; }, 100);
        });
        setTimeout(() => {
          if (movingRef.current) {
            swapPanos();
            movingRef.current = false;
          }
        }, 600);
      } else {
        panorama.setPov({ heading: headingRef.current, pitch: panorama.getPov().pitch });
        panorama.setPano(bestLink.pano);
        setTimeout(() => { movingRef.current = false; }, 300);
      }
      return;
    }

    // For back/left/right: use all links with fallback
    const bestLink = findBestLink(links, targetHeading, true);
    if (!bestLink?.pano) return;

    movingRef.current = true;
    visitedPanosRef.current.add(panorama.getPano());
    visitedPanosRef.current.add(bestLink.pano);

    const back = getBackPanorama();
    if (back) {
      if (backTilesListenerRef.current) backTilesListenerRef.current.remove();
      back.setPov({ heading: headingRef.current, pitch: panorama.getPov().pitch });
      back.setPano(bestLink.pano);
      backTilesListenerRef.current = back.addListener("tilesloaded", () => {
        if (backTilesListenerRef.current) {
          backTilesListenerRef.current.remove();
          backTilesListenerRef.current = null;
        }
        swapPanos();
        setTimeout(() => { movingRef.current = false; }, 100);
      });
      setTimeout(() => {
        if (movingRef.current) {
          swapPanos();
          movingRef.current = false;
        }
      }, 600);
    } else {
      panorama.setPano(bestLink.pano);
      setTimeout(() => { movingRef.current = false; }, 300);
    }
  }, [getActivePanorama, getBackPanorama, searchAhead, swapPanos]);

  // Accumulate distance and jump when threshold is reached
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

  if (!mapsLoaded) {
    if (mapsError) {
      return (
        <StaticStreetViewMode
          clients={clients}
          clientProfiles={clientProfiles}
          latestData={latestData}
          startLocation={startLocation}
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
    <>
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 100 }}>
      {/* Panorama A */}
      <div
        ref={containerARef}
        style={{
          position: "absolute",
          top: 0, right: 0, bottom: 0, left: 0,
          width: "100%",
          height: "100%",
          zIndex: activePano === "A" ? 2 : 1,
          visibility: "visible", // both always render, z-index controls which is on top
        }}
      />
      {/* Panorama B */}
      <div
        ref={containerBRef}
        style={{
          position: "absolute",
          top: 0, right: 0, bottom: 0, left: 0,
          width: "100%",
          height: "100%",
          zIndex: activePano === "B" ? 2 : 1,
          visibility: "visible",
        }}
      />

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
        <button onClick={() => moveInDirection(0)} style={arrowBtnStyle} title="Forward">&#9650;</button>
        <div />
        <button onClick={() => moveInDirection(-90)} style={arrowBtnStyle} title="Left">&#9664;</button>
        <div />
        <button onClick={() => moveInDirection(90)} style={arrowBtnStyle} title="Right">&#9654;</button>
        <div />
        <div />
        <div />
      </div>
    </div>
    {boundClientId && (
      <BindControlsHud
        boundClientId={boundClientId}
        clientInclines={clientInclines}
        onSetIncline={onSetIncline}
        clientSpeedOverrides={clientSpeedOverrides}
        onSetSpeedOverride={onSetSpeedOverride}
      />
    )}
    </>
  );
}

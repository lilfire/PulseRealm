import { useState, useCallback, useEffect, useRef } from "react";
import type { ClientProfile, RealmMode, RealmRole } from "../../types/session";
import { LobbyShell } from "./LobbyShell";
import { OptionGrid } from "./OptionGrid";

export interface YouTubeVideo {
  videoId: string;
  url: string;
  title: string;
  baseSpeedKmh: number;
}

interface Props {
  joinCode: string;
  mode: RealmMode;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  onStart: (video: YouTubeVideo) => void;
  onLeave: () => void;
  onEnd?: () => void;
  onKick?: (clientId: string) => void;
  role?: RealmRole;
  hostSecret?: string;
  curatedVideos?: YouTubeVideo[] | null;
  lobbySettings?: Record<string, unknown> | null;
  onSettingsChange?: (settings: object) => void;
}

const CURATED_VIDEOS: YouTubeVideo[] = [
  { videoId: "hld4uaO1MDE", url: "https://www.youtube.com/watch?v=hld4uaO1MDE", title: "Walking Tour - Tokyo, Japan", baseSpeedKmh: 5 },
  { videoId: "HDMd3ArOWQk", url: "https://www.youtube.com/watch?v=HDMd3ArOWQk", title: "Walking Tour - New York City", baseSpeedKmh: 5 },
  { videoId: "a2HxLLnOuLk", url: "https://www.youtube.com/watch?v=a2HxLLnOuLk", title: "Walking Tour - Paris, France", baseSpeedKmh: 5 },
  { videoId: "5FxMHnOEbPU", url: "https://www.youtube.com/watch?v=5FxMHnOEbPU", title: "Walking Tour - London, England", baseSpeedKmh: 5 },
  { videoId: "LXb3EKWsInQ", url: "https://www.youtube.com/watch?v=LXb3EKWsInQ", title: "Snowfall in New York City", baseSpeedKmh: 5 },
  { videoId: "wTcNtgA6gHs", url: "https://www.youtube.com/watch?v=wTcNtgA6gHs", title: "Walking Tour - Seoul, South Korea", baseSpeedKmh: 5 },
  { videoId: "F2fGMsOdLog", url: "https://www.youtube.com/watch?v=F2fGMsOdLog", title: "Walking Tour - Rome, Italy", baseSpeedKmh: 5 },
  { videoId: "Scxs7L0vhZ4", url: "https://www.youtube.com/watch?v=Scxs7L0vhZ4", title: "Walking Tour - Dubai", baseSpeedKmh: 5 },
  { videoId: "sz8Lo1NOkks", url: "https://www.youtube.com/watch?v=sz8Lo1NOkks", title: "Rainy Night Walk - Osaka, Japan", baseSpeedKmh: 5 },
  { videoId: "PdUiCJnRb_4", url: "https://www.youtube.com/watch?v=PdUiCJnRb_4", title: "Walking Tour - Barcelona, Spain", baseSpeedKmh: 5 },
  { videoId: "qSk4VWboaE4", url: "https://www.youtube.com/watch?v=qSk4VWboaE4", title: "Walking Tour - Istanbul, Turkey", baseSpeedKmh: 5 },
  { videoId: "F0VKx9G1Mig", url: "https://www.youtube.com/watch?v=F0VKx9G1Mig", title: "Walking Tour - Amsterdam, Netherlands", baseSpeedKmh: 5 },
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseYouTubeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1) || null;
    }
    if (parsed.hostname === "www.youtube.com" || parsed.hostname === "youtube.com" || parsed.hostname === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }
      const embedMatch = parsed.pathname.match(/^\/embed\/([^/]+)/);
      if (embedMatch) return embedMatch[1];
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/]+)/);
      if (shortsMatch) return shortsMatch[1];
    }
  } catch {
    // not a valid URL
  }
  return null;
}

export function YouTubeTrailLobby({ joinCode, mode, clients, clientProfiles, connected, onStart, onLeave, onEnd, onKick, role, hostSecret, curatedVideos, lobbySettings, onSettingsChange }: Props) {
  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [inputUrl, setInputUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [cardDurations, setCardDurations] = useState<Record<string, number>>({});
  const durationContainerRef = useRef<HTMLDivElement>(null);
  const durationPlayerRef = useRef<YT.Player | null>(null);
  const cardDurationContainerRef = useRef<HTMLDivElement>(null);
  const videos = curatedVideos && curatedVideos.length > 0 ? curatedVideos : CURATED_VIDEOS;
  const [randomVideos] = useState(() => pickRandom(videos, 5));

  const isHost = role === "host" || role === "admin";
  const settingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isHost || !onSettingsChange || !video) return;
    if (settingsDebounceRef.current) clearTimeout(settingsDebounceRef.current);
    settingsDebounceRef.current = setTimeout(() => {
      onSettingsChange({ video });
    }, 300);
    return () => { if (settingsDebounceRef.current) clearTimeout(settingsDebounceRef.current); };
  }, [isHost, onSettingsChange, video]);

  useEffect(() => {
    if (role !== "guest" || !lobbySettings) return;
    const v = lobbySettings.video as YouTubeVideo | undefined;
    if (v && typeof v.videoId === "string" && typeof v.url === "string") {
      setVideo(v);
      setInputUrl(v.url);
    }
  }, [role, lobbySettings]);

  // Fetch video duration using a hidden YT player
  useEffect(() => {
    if (!video) {
      setVideoDuration(null);
      return;
    }

    setVideoDuration(null);
    const container = durationContainerRef.current;
    if (!container) return;

    const ytWindow = window as Window & { YT?: typeof YT; onYouTubeIframeAPIReady?: () => void };

    let destroyed = false;

    function create() {
      if (destroyed || !container) return;
      // Clear any previous hidden player
      if (durationPlayerRef.current) {
        durationPlayerRef.current.destroy();
        durationPlayerRef.current = null;
      }
      container.innerHTML = "";
      const div = document.createElement("div");
      container.appendChild(div);

      durationPlayerRef.current = new YT.Player(div, {
        videoId: video!.videoId,
        width: "1",
        height: "1",
        playerVars: { autoplay: 0, mute: 1 },
        events: {
          onReady: (event: YT.PlayerEvent) => {
            if (destroyed) return;
            // Duration may need a moment to become available
            const tryGetDuration = () => {
              const dur = event.target.getDuration();
              if (dur > 0) {
                setVideoDuration(dur);
                // Clean up hidden player
                event.target.destroy();
                durationPlayerRef.current = null;
              } else if (!destroyed) {
                setTimeout(tryGetDuration, 300);
              }
            };
            tryGetDuration();
          },
        },
      });
    }

    if (ytWindow.YT?.Player) {
      create();
    } else {
      const prevCallback = ytWindow.onYouTubeIframeAPIReady;
      ytWindow.onYouTubeIframeAPIReady = () => {
        prevCallback?.();
        create();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }

    return () => {
      destroyed = true;
      if (durationPlayerRef.current) {
        durationPlayerRef.current.destroy();
        durationPlayerRef.current = null;
      }
    };
  }, [video?.videoId]);

  // Fetch durations for suggestion cards
  useEffect(() => {
    const container = cardDurationContainerRef.current;
    if (!container || randomVideos.length === 0) return;

    let destroyed = false;
    const players: YT.Player[] = [];

    function createAll() {
      if (destroyed || !container) return;
      container.innerHTML = "";

      for (const v of randomVideos) {
        const div = document.createElement("div");
        container.appendChild(div);

        const player = new YT.Player(div, {
          videoId: v.videoId,
          width: "1",
          height: "1",
          playerVars: { autoplay: 0, mute: 1 },
          events: {
            onReady: (event: YT.PlayerEvent) => {
              if (destroyed) return;
              const tryGet = () => {
                const dur = event.target.getDuration();
                if (dur > 0) {
                  setCardDurations((prev) => ({ ...prev, [v.videoId]: dur }));
                  event.target.destroy();
                } else if (!destroyed) {
                  setTimeout(tryGet, 300);
                }
              };
              tryGet();
            },
          },
        });
        players.push(player);
      }
    }

    const ytWindow = window as Window & { YT?: typeof YT; onYouTubeIframeAPIReady?: () => void };
    if (ytWindow.YT?.Player) {
      createAll();
    } else {
      const prevCallback = ytWindow.onYouTubeIframeAPIReady;
      ytWindow.onYouTubeIframeAPIReady = () => {
        prevCallback?.();
        createAll();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }

    return () => {
      destroyed = true;
      players.forEach((p) => { try { p.destroy(); } catch {} });
    };
  }, [randomVideos]);

  const onInputChange = useCallback((value: string) => {
    setInputUrl(value);
    setUrlError("");

    if (!value.trim()) {
      setVideo(null);
      return;
    }

    const videoId = parseYouTubeUrl(value.trim());
    if (videoId) {
      setVideo({ videoId, url: value.trim(), title: "Custom Video", baseSpeedKmh: 5 });
      setUrlError("");
    } else {
      setVideo(null);
      if (value.trim().length > 5) {
        setUrlError("Not a valid YouTube link");
      }
    }
  }, []);

  const selectVideo = useCallback((v: YouTubeVideo) => {
    setVideo(v);
    setInputUrl(v.url);
    setUrlError("");
  }, []);

  return (
    <LobbyShell
      joinCode={joinCode}
      mode={mode}
      clients={clients}
      clientProfiles={clientProfiles}
      connected={connected}
      canStart={connected && clients.length > 0 && video !== null}
      onStart={() => video && onStart(video)}
      onLeave={onLeave}
      onEnd={onEnd}
      onKick={onKick}
      role={role}
      hostSecret={hostSecret}
    >
      {/* Hidden container for duration-fetching player */}
      <div ref={durationContainerRef} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }} />
      <div ref={cardDurationContainerRef} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }} />
      <div style={{ display: "flex", flexDirection: "column", height: "100%", paddingTop: "1.5rem", textAlign: "left" }}>
        <div style={{ maxWidth: "420px", flexShrink: 0 }}>
          <h3 style={{ marginTop: 0 }}>YouTube Video</h3>
          <div style={{ position: "relative", width: "100%" }}>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Paste a YouTube link..."
              style={{
                padding: "0.6rem 0.75rem",
                fontSize: "1rem",
                borderRadius: "6px",
                border: `2px solid ${video ? "#00D4FF" : urlError ? "#f87171" : "#555"}`,
                width: "100%",
                background: "#1a1a1a",
                color: "#fff",
                boxSizing: "border-box",
              }}
            />
            {urlError && (
              <p style={{ color: "#f87171", fontSize: "0.8rem", margin: "0.25rem 0 0" }}>{urlError}</p>
            )}
          </div>

          {video && (
            <div style={{ marginTop: "0.75rem" }}>
              <div
                style={{
                  position: "relative",
                  paddingBottom: "56.25%",
                  borderRadius: "8px",
                  overflow: "hidden",
                  background: "#000",
                }}
              >
                <img
                  src={`https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`}
                  alt="Video thumbnail"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                {videoDuration !== null && (
                  <span style={{
                    position: "absolute",
                    bottom: 8,
                    right: 8,
                    background: "rgba(0,0,0,0.8)",
                    color: "#fff",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}>{formatDuration(videoDuration)}</span>
                )}
              </div>
              {videoDuration !== null && (
                <p style={{ color: "#aaa", fontSize: "0.85rem", margin: "0.4rem 0 0" }}>
                  Video length: {formatDuration(videoDuration)}
                </p>
              )}
            </div>
          )}
          <p style={{ color: "#aaa", fontSize: "0.85rem", margin: "1rem 0 0.5rem" }}>Or pick a suggestion:</p>
        </div>
        <OptionGrid
          items={randomVideos}
          cardMinWidth={280}
          cardHeight={100}
          gap={12}
          keyExtractor={(v) => v.videoId}
          renderCard={(v) => {
            const isSelected = video?.videoId === v.videoId;
            return (
              <div
                onClick={() => selectVideo(v)}
                style={{
                  padding: "0.5rem 0.75rem",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  borderRadius: "6px",
                  border: isSelected ? "2px solid #00D4FF" : "1px solid #333",
                  background: isSelected ? "rgba(0,212,255,0.1)" : "#1a1a1a",
                  height: "100%",
                  boxSizing: "border-box",
                  transition: "background 0.15s, border-color 0.15s",
                  display: "flex",
                  alignItems: "center",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#2a2a2a"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "#1a1a1a"; }}
              >
                <img
                  src={`https://img.youtube.com/vi/${v.videoId}/default.jpg`}
                  alt=""
                  style={{ width: "80px", height: "60px", borderRadius: "4px", objectFit: "cover", flexShrink: 0, marginRight: "0.75rem" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</div>
                  <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.25rem", whiteSpace: "nowrap" }}>Target speed: {v.baseSpeedKmh} km/h</div>
                  {cardDurations[v.videoId] != null && (
                    <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.15rem" }}>Duration: {formatDuration(cardDurations[v.videoId])}</div>
                  )}
                </div>
              </div>
            );
          }}
        />
      </div>
    </LobbyShell>
  );
}

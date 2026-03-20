import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientProfile, RealmRole, WearableData } from "../../types/session";
import type { YouTubeVideo } from "../lobbies/YouTubeTrailLobby";
import { estimateCaloriesPerSecond } from "../../utils/wearable";
import { BindControlsHud } from "./BindControlsHud";
import { overlayPanel } from "./StreetViewMode";
import { PlayerHud } from "./PlayerHud";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
  video: YouTubeVideo;
  onEnd: (totalDistanceMeters: number) => void;
  role?: RealmRole;
  boundClientId?: string | null;
  clientInclines?: Record<string, number>;
  onSetIncline?: (clientId: string, percent: number) => void;
  clientSpeedOverrides?: Record<string, number>;
  onSetSpeedOverride?: (clientId: string, speedKmh: number) => void;
}

const DEFAULT_BASE_SPEED_KMH = 5;
const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 2.0;

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function YouTubeTrailMode({ clients, clientProfiles, latestData, video, onEnd, role = "host", boundClientId, clientInclines, onSetIncline, clientSpeedOverrides, onSetSpeedOverride }: Props) {
  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevYTCallbackRef = useRef<(() => void) | undefined>(undefined);
  const speedRef = useRef(0);
  const totalDistanceRef = useRef(0);
  const [totalDistanceDisplay, setTotalDistanceDisplay] = useState(0);
  const caloriesRef = useRef(0);
  const [caloriesDisplay, setCaloriesDisplay] = useState(0);
  const [muted, setMuted] = useState(true);
  const [currentRate, setCurrentRate] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const hasEverPlayedRef = useRef(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Enter browser fullscreen on mount
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => { document.exitFullscreen?.().catch(() => {}); };
  }, []);

  // Track speed from wearable data
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

  // Accumulate distance for summary
  useEffect(() => {
    const INTERVAL_MS = 500;
    const timer = setInterval(() => {
      const speedKmh = speedRef.current;
      if (speedKmh <= 0) return;
      const speedMs = speedKmh / 3.6;
      const distanceDelta = speedMs * (INTERVAL_MS / 1000);
      totalDistanceRef.current += distanceDelta;
      setTotalDistanceDisplay(totalDistanceRef.current);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // Load YouTube IFrame API
  useEffect(() => {
    const ytWindow = window as Window & { YT?: typeof YT; onYouTubeIframeAPIReady?: () => void };
    if (ytWindow.YT?.Player) {
      createPlayer();
      return;
    }

    // Set up callback before loading script; persist prevCallback in a ref
    // so the cleanup function can restore it even after this effect has closed.
    const prevCallback = ytWindow.onYouTubeIframeAPIReady;
    prevYTCallbackRef.current = prevCallback;
    ytWindow.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      createPlayer();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }

    function createPlayer() {
      if (playerRef.current || !containerRef.current) return;

      playerRef.current = new YT.Player(containerRef.current, {
        videoId: video.videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          fs: 0,
          iv_load_policy: 3,
          disablekb: 1,
          playsinline: 1,
        },
        events: {
          onReady: (event: YT.PlayerEvent) => {
            event.target.playVideo();
            setPlayerReady(true);
          },
          onStateChange: (event: YT.OnStateChangeEvent) => {
            const isPlaying = event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.BUFFERING;
            setVideoPlaying(isPlaying);
            if (isPlaying) hasEverPlayedRef.current = true;
            if (event.data === YT.PlayerState.ENDED) {
              onEnd(totalDistanceRef.current);
            }
          },
        },
      });
    }

    return () => {
      // Restore the global callback that was in place before this component
      // installed its own, so other callers are not silently dropped.
      const ytWin = window as Window & { onYouTubeIframeAPIReady?: () => void };
      ytWin.onYouTubeIframeAPIReady = prevYTCallbackRef.current;

      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [video.videoId]);

  // Elapsed walking time (wall clock since mount)
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Poll video current time and duration
  useEffect(() => {
    if (!playerReady) return;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const dur = player.getDuration?.();
      const cur = player.getCurrentTime?.();
      if (dur > 0) setVideoDuration(dur);
      if (cur >= 0) setVideoCurrentTime(cur);
    }, 500);
    return () => clearInterval(id);
  }, [playerReady]);

  // Adjust playback speed based on walking speed
  useEffect(() => {
    if (!playerReady) return;

    const INTERVAL_MS = 1000;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const speedKmh = speedRef.current;

      let rate: number;
      if (speedKmh <= 0.5) {
        // Stopped or barely moving — pause the video
        if (player.getPlayerState() === YT.PlayerState.PLAYING) {
          player.pauseVideo();
        }
        setCurrentRate(0);
        return;
      } else {
        // Map walking speed to playback rate
        rate = speedKmh / (video.baseSpeedKmh || DEFAULT_BASE_SPEED_KMH);
        rate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
      }

      // Resume if paused
      if (player.getPlayerState() === YT.PlayerState.PAUSED) {
        player.playVideo();
      }

      player.setPlaybackRate(rate);
      setCurrentRate(rate);
    }, INTERVAL_MS);

    return () => clearInterval(timer);
  }, [playerReady]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (muted) {
      player.unMute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  }, [muted]);

  const handleManualPlay = useCallback(() => {
    const player = playerRef.current;
    if (player) {
      player.playVideo();
    }
  }, []);

  const clientId = clients[0];
  const profile = clientId ? clientProfiles[clientId] : null;

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, background: "#000" }}>
      {/* YouTube player container */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: 0, right: 0, bottom: 0, left: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Transparent overlay to prevent clicks on the iframe */}
      <div
        style={{
          position: "absolute",
          top: 0, right: 0, bottom: 0, left: 0,
          zIndex: 2,
          pointerEvents: "none",
        }}
      />

      {/* Play button — shown when autoplay failed or video should be playing but isn't */}
      {playerReady && !videoPlaying && (!hasEverPlayedRef.current || currentRate > 0) && (
        <button
          onClick={handleManualPlay}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 20,
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.6)",
            border: "2px solid rgba(255,255,255,0.3)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Play video"
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="#fff">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      {/* Left panel: HUD stats + mute + End Realm */}
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
          totalDistanceDisplay={totalDistanceDisplay.toFixed(0)}
        />
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
          <button
            onClick={toggleMute}
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              padding: "0.3rem 0.6rem",
              fontSize: "1rem",
              cursor: "pointer",
            }}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? "\u{1F507}" : "\u{1F50A}"}
          </button>
          {role !== "guest" && (
            <button
              onClick={() => onEnd(totalDistanceRef.current)}
              style={{
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

      {/* Right panel: Playback speed */}
      <div
        style={{
          ...overlayPanel,
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 10,
          padding: "0.5rem 0.75rem",
          fontSize: "0.85rem",
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "0.7rem", color: "#aaa" }}>Playback</div>
        <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
          {currentRate === 0 ? "Paused" : `${currentRate.toFixed(2)}x`}
        </div>
      </div>

      {/* Progress bar and time info */}
      <div
        className="fg-row"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          background: "rgba(0,0,0,0.8)",
          padding: "0.4rem 1rem",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          fontSize: "0.8rem",
          color: "#fff",
          "--fg": "0.75rem",
        } as React.CSSProperties}
      >
        <span style={{ whiteSpace: "nowrap", color: "#aaa" }}>
          {formatTime(elapsedSeconds)}
        </span>
        <span style={{ whiteSpace: "nowrap" }}>
          {formatTime(videoCurrentTime)}
        </span>
        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              width: videoDuration > 0 ? `${(videoCurrentTime / videoDuration) * 100}%` : "0%",
              height: "100%",
              background: "#33DFFF",
              borderRadius: 2,
              transition: "width 0.5s linear",
            }}
          />
        </div>
        <span style={{ whiteSpace: "nowrap" }}>
          {videoDuration > 0 ? formatTime(videoDuration) : "--:--"}
        </span>
      </div>
      {boundClientId && (
        <div style={{ position: "absolute", bottom: "3.5rem", left: "1rem", zIndex: 50 }}>
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

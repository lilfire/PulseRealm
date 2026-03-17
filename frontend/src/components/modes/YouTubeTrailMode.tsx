import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientProfile, RealmRole, WearableData } from "../../types/session";
import type { YouTubeVideo } from "../lobbies/YouTubeTrailLobby";
import { estimateCaloriesPerSecond } from "../../utils/wearable";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
  video: YouTubeVideo;
  onEnd: (totalDistanceMeters: number) => void;
  role?: RealmRole;
}

// Average walking speed ~5 km/h → playback rate 1.0
const BASE_WALKING_SPEED_KMH = 5;
const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 2.0;

export function YouTubeTrailMode({ clients, clientProfiles, latestData, video, onEnd, role = "host" }: Props) {
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
        rate = speedKmh / BASE_WALKING_SPEED_KMH;
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

  const clientId = clients[0];
  const profile = clientId ? clientProfiles[clientId] : null;

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 100, background: "#000" }}>
      {/* YouTube player container */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Transparent overlay to prevent clicks on the iframe */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
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

      {/* Mute toggle */}
      <button
        onClick={toggleMute}
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 10,
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: "8px",
          padding: "0.5rem 1rem",
          fontSize: "1.2rem",
          cursor: "pointer",
        }}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? "\u{1F507}" : "\u{1F50A}"}
      </button>

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
            {caloriesDisplay > 0 && <div>{caloriesDisplay} kcal</div>}
            <div style={{ fontSize: "0.8rem", color: "#aaa" }}>{totalDistanceDisplay.toFixed(0)} m</div>
          </>
        ) : (
          <div style={{ color: "#888" }}>No data yet</div>
        )}
      </div>

      {/* Playback speed indicator */}
      <div
        style={{
          position: "absolute",
          bottom: "1rem",
          right: "1rem",
          zIndex: 10,
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          padding: "0.5rem 0.75rem",
          borderRadius: "8px",
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
    </div>
  );
}

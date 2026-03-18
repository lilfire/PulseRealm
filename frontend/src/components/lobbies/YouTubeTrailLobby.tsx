import React, { useState, useCallback } from "react";
import type { ClientProfile, RealmMode, RealmRole } from "../../types/session";
import { LobbyShell } from "./LobbyShell";

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

export function YouTubeTrailLobby({ joinCode, mode, clients, clientProfiles, connected, onStart, onLeave, onEnd, onKick, role, hostSecret, curatedVideos }: Props) {
  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [inputUrl, setInputUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const videos = curatedVideos && curatedVideos.length > 0 ? curatedVideos : CURATED_VIDEOS;
  const [randomVideos] = useState(() => pickRandom(videos, 5));

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
      <div style={{ margin: "1.5rem 0" }}>
        <h3>YouTube Video</h3>
        <div style={{ position: "relative", display: "inline-block", width: "100%", maxWidth: "420px" }}>
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
            <p style={{ color: "#f87171", fontSize: "0.8rem", margin: "0.25rem 0 0", textAlign: "left" }}>{urlError}</p>
          )}
        </div>

        {video && (
          <div style={{ marginTop: "0.75rem", maxWidth: "420px", display: "inline-block", width: "100%" }}>
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
            </div>
          </div>
        )}

        <div style={{ marginTop: "1rem", textAlign: "left", maxWidth: "420px", display: "inline-block", width: "100%" }}>
          <p style={{ color: "#aaa", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>Or pick a suggestion:</p>
          <ul role="listbox" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {randomVideos.map((v) => (
              <li
                key={v.videoId}
                role="option"
                aria-selected={video?.videoId === v.videoId}
                onClick={() => selectVideo(v)}
                className="fg-row"
                style={{
                  padding: "0.5rem 0.75rem",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  borderRadius: "4px",
                  border: video?.videoId === v.videoId ? "1px solid #00D4FF" : "1px solid #333",
                  marginBottom: "0.4rem",
                  background: video?.videoId === v.videoId ? "rgba(0,212,255,0.1)" : "#1a1a1a",
                  transition: "background 0.15s, border-color 0.15s",
                  display: "flex",
                  alignItems: "center",
                  "--fg": "0.75rem",
                } as React.CSSProperties}
                onMouseEnter={(e) => {
                  if (video?.videoId !== v.videoId) e.currentTarget.style.background = "#2a2a2a";
                }}
                onMouseLeave={(e) => {
                  if (video?.videoId !== v.videoId) e.currentTarget.style.background = "#1a1a1a";
                }}
              >
                <img
                  src={`https://img.youtube.com/vi/${v.videoId}/default.jpg`}
                  alt=""
                  style={{ width: "60px", height: "45px", borderRadius: "3px", objectFit: "cover", flexShrink: 0 }}
                />
                <span style={{ flex: 1 }}>{v.title}</span>
                <span style={{ fontSize: "0.75rem", color: "#888", whiteSpace: "nowrap" }}>{v.baseSpeedKmh} km/h = 1×</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </LobbyShell>
  );
}

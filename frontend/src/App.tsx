import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
import { useRealmHub, type RealmSummary } from "./hooks/useSessionHub";
import { useServerConnection } from "./hooks/useServerConnection";
import { ServerConnect } from "./components/ServerConnect";
import { CompetitionLobby } from "./components/lobbies/CompetitionLobby";
import { StreetViewLobby, type StreetViewLocation } from "./components/lobbies/StreetViewLobby";
import { DefaultLobby } from "./components/lobbies/DefaultLobby";
import { YouTubeTrailLobby, type YouTubeVideo } from "./components/lobbies/YouTubeTrailLobby";
import { RouteLobby, type RouteConfig } from "./components/lobbies/RouteLobby";
import { DungeonLobby, type DungeonConfig } from "./components/lobbies/DungeonLobby";
import { CompetitionMode } from "./components/modes/CompetitionMode";
import { StreetViewMode } from "./components/modes/StreetViewMode";
import { YouTubeTrailMode } from "./components/modes/YouTubeTrailMode";
import { RouteMode } from "./components/modes/RouteMode";
import { DungeonMode } from "./components/modes/DungeonMode";
import { SocialMode } from "./components/modes/SocialMode";
import { RealmSummaryScreen } from "./components/SessionSummaryScreen";
import { AdminLogin } from "./components/admin/AdminLogin";
import { AdminDashboard } from "./components/admin/AdminDashboard";
import { TermsOfService } from "./components/TermsOfService";
import { CalibrationPanel } from "./components/CalibrationPanel";
import { Toast, createToast, type ToastMessage } from "./components/Toast";
import type { CompetitionConfig, CompetitionSubMode, PlayerFormat, Realm, RealmMode, RealmRole } from "./types/session";
import type { DungeonDifficulty } from "./components/lobbies/DungeonLobby";
import "./App.css";

const APP_VERSION = __APP_VERSION__;

// Map server numeric mode enum back to string
const MODE_FROM_NUMBER: Partial<Record<number, RealmMode>> = {
  0: "competition",
  1: "streetview",
  2: "youtubetrail",
  3: "route",
  4: "dungeon",
  5: "social",
};

const VALID_MODES = new Set<string>(["competition", "streetview", "youtubetrail", "route", "dungeon", "social"]);

// Issue #11 — type guard functions moved to module scope (outside the component)
function isStreetViewLocation(v: unknown): v is StreetViewLocation {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return "lat" in r && typeof r.lat === "number" && "lng" in r && typeof r.lng === "number";
}
function isCompetitionConfig(v: unknown): v is CompetitionConfig {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return "subMode" in r && typeof r.subMode === "string";
}
function isYouTubeVideo(v: unknown): v is YouTubeVideo {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return "videoId" in r && typeof r.videoId === "string";
}
function isRouteConfig(v: unknown): v is RouteConfig {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return "from" in r && typeof r.from === "object" && r.from !== null && "to" in r && typeof r.to === "object" && r.to !== null;
}
function isDungeonConfig(v: unknown): v is DungeonConfig {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return "difficulty" in r && typeof r.difficulty === "string";
}

// When VITE_API_URL is set (e.g. in Docker where frontend is served from the
// same origin as the API), skip the server connect screen entirely.
const PRESET_API_URL = import.meta.env.VITE_API_URL ?? "";

interface LobbyDefaults {
  competition: {
    subMode: CompetitionSubMode;
    playerFormat: PlayerFormat;
    targetDistanceKm: number;
    intervalMinutes: number;
    targetZone: number;
    durationMinutes: number;
  };
  dungeon: {
    difficulty: DungeonDifficulty;
    timeframeMinutes: number;
  };
  streetViewLocations: { lat: number; lng: number; address: string; heading?: number; pitch?: number }[];
  youTubeVideos: { videoId: string; url: string; title: string; baseSpeedKmh: number }[];
  curatedRoutes: { fromLat: number; fromLng: number; fromAddress: string; toLat: number; toLng: number; toAddress: string }[];
}

function App() {
  const server = useServerConnection();
  const [realm, setRealm] = useState<Realm | null>(null);
  const [role, setRole] = useState<RealmRole>("host");
  const [hostSecret, setHostSecret] = useState<string | null>(null);
  const [creatingMode, setCreatingMode] = useState<RealmMode | null>(null);
  const [streetViewLocation, setStreetViewLocation] = useState<StreetViewLocation | null>(null);
  const [competitionConfig, setCompetitionConfig] = useState<CompetitionConfig | null>(null);
  const [youtubeVideo, setYoutubeVideo] = useState<YouTubeVideo | null>(null);
  const [routeConfig, setRouteConfig] = useState<RouteConfig | null>(null);
  const [dungeonConfig, setDungeonConfig] = useState<DungeonConfig | null>(null);

  // Admin state
  const [page, setPage] = useState<"home" | "admin-login" | "admin" | "tos">("home");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [lobbyDefaults, setLobbyDefaults] = useState<LobbyDefaults | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Join realm UI state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [hostKeyInput, setHostKeyInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [virtualKeyboardOpen, setVirtualKeyboardOpen] = useState(false);

  // Detect on-screen keyboard via Visual Viewport API
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const threshold = 150;
    const onResize = () => {
      setVirtualKeyboardOpen(window.innerHeight - vv.height > threshold);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Android download QR modal
  const [showAndroidQR, setShowAndroidQR] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Coming soon modal for unsupported platforms
  const [comingSoonDevice, setComingSoonDevice] = useState<string | null>(null);

  // Stride calibration panel
  const [showCalibration, setShowCalibration] = useState(false);

  // Use preset URL if available, otherwise use the dynamically configured one
  const apiUrl = PRESET_API_URL || server.apiUrl;
  const hubUrl = PRESET_API_URL
    ? (import.meta.env.VITE_HUB_URL ?? `${PRESET_API_URL}/hubs/realm`)
    : server.hubUrl;

  const { connected, started, ended, realmSummary, clients, clientProfiles, latestData, realmConfig, lobbySettings, startRealm, endRealm, notifyEliminated, kickClient, updateLobbySettings, boundClientId, bindCode, bindPending, bindResult, clientBindings, clientInclines, clientSpeedOverrides, requestBind, cancelBind, setIncline, setSpeedOverride } = useRealmHub(
    realm?.id ?? null,
    hubUrl,
    hostSecret ?? undefined
  );

  // Fetch lobby defaults and admin status from server config
  useEffect(() => {
    if (!apiUrl) return;
    fetch(`${apiUrl}/api/config`)
      .then((r) => r.json())
      .then((data) => {
        setAdminEnabled(data.adminEnabled ?? false);
        if (data.defaults && typeof data.defaults === "object") {
          setLobbyDefaults(data.defaults as LobbyDefaults);
        }
      })
      .catch(() => {});
  }, [apiUrl]);

  const addToast = useCallback((text: string, type: "error" | "info" = "error") => {
    setToasts((prev) => [...prev, createToast(text, type)]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Issue #7 — resetRealm wrapped in useCallback so identity is stable across renders
  const resetRealm = useCallback(() => {
    setRealm(null);
    setRole("host");
    setHostSecret(null);
    setStreetViewLocation(null);
    setYoutubeVideo(null);
    setRouteConfig(null);
    setDungeonConfig(null);
    setCompetitionConfig(null);
    setShowJoinModal(false);
    setJoinCodeInput("");
    setHostKeyInput("");
    setJoinError("");
  }, []);

  // If realm ended from lobby (never started), skip summary and reset
  useEffect(() => {
    if (ended && !started) {
      resetRealm();
    }
  }, [ended, started, resetRealm]);

  // Render QR code when Android download modal opens
  useEffect(() => {
    if (showAndroidQR && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, "https://github.com/lilfire/PulseRealm/releases/latest", {
        width: 200,
        margin: 2,
        color: { dark: "#f3f4f6", light: "#16171d" },
      });
    }
  }, [showAndroidQR]);


  // Issue #8 — noOpEnd is a stable no-op for view-only mode
  // Issue #21 — typed to match the widest onEnd signature
  const noOpEnd = useCallback((_totalDistance: number, _overrides?: Partial<RealmSummary>) => {}, []);

  const isGuest = role === "guest";

  // Issue #8 — stable onEnd handlers for each mode; they delegate to noOpEnd or endRealm
  const onEndSimple = useCallback(
    (totalDistance?: number) => {
      if (isGuest) return;
      endRealm(totalDistance ? { totalDistanceMeters: totalDistance } : undefined);
    },
    [isGuest, endRealm]
  );
  const onEndWithOverrides = useCallback(
    (totalDistance: number, overrides?: Partial<RealmSummary>) => {
      if (isGuest) return;
      endRealm({ totalDistanceMeters: totalDistance, ...overrides });
    },
    [isGuest, endRealm]
  );
  // Stable eliminate handler
  const onEliminate = useCallback(
    (clientId: string) => {
      if (isGuest) return;
      notifyEliminated(clientId);
    },
    [isGuest, notifyEliminated]
  );

  // Terms of Service page
  if (page === "tos") {
    return <TermsOfService onBack={() => setPage("home")} />;
  }

  // Admin pages
  if (page === "admin-login") {
    return (
      <AdminLogin
        apiUrl={apiUrl}
        onSuccess={(token) => { setAdminToken(token); setPage("admin"); }}
        onBack={() => setPage("home")}
      />
    );
  }
  if (page === "admin" && adminToken) {
    return (
      <AdminDashboard
        apiUrl={apiUrl}
        token={adminToken}
        onLogout={() => { setAdminToken(null); setPage("home"); }}
        onJoinRealm={(realmData) => {
          const mode = typeof realmData.mode === "number"
            ? MODE_FROM_NUMBER[realmData.mode]
            : MODE_FROM_NUMBER[{ Competition: 0, StreetView: 1, YouTubeTrail: 2, Route: 3, Dungeon: 4, Social: 5 }[realmData.mode as string] ?? 0];
          // Issue #10 — null-safe: skip if mode is unrecognised
          if (!mode) return;
          setRealm({ id: realmData.id, joinCode: realmData.joinCode, mode });
          setRole("admin");
          setPage("home");
        }}
      />
    );
  }

  // If no preset URL and not connected to a server, show the connect screen
  if (!PRESET_API_URL && !server.isConnected) {
    return (
      <ServerConnect
        onConnectRemote={server.connectRemote}
        onSwitchToLocal={server.switchToLocal}
        checking={server.checking}
        error={server.error}
        connectionMode={server.connectionMode}
        remoteUrl={server.remoteUrl}
        searchPhase={server.searchPhase}
        searchProgress={server.searchProgress}
        searchAttempt={server.searchAttempt}
        onRetrySearch={server.searchForServer}
      />
    );
  }

  async function createRealm(mode: RealmMode) {
    setCreatingMode(mode);
    try {
      const modeMap: Record<RealmMode, number> = {
        competition: 0,
        streetview: 1,
        youtubetrail: 2,
        route: 3,
        dungeon: 4,
        social: 5,
      };
      const modeValue = modeMap[mode];
      const res = await fetch(`${apiUrl}/api/realm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: modeValue }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          addToast("Too many realms created. Please wait a moment and try again.");
        } else {
          addToast("Could not create realm. Please try again.");
        }
        return;
      }
      const data = await res.json();
      setRealm({
        id: data.id,
        joinCode: data.joinCode,
        mode,
      });
      setHostSecret(data.hostSecret ?? null);
    } catch {
      addToast("Could not reach the server. Check your connection and try again.");
    } finally {
      setCreatingMode(null);
    }
  }

  async function joinRealm() {
    const code = joinCodeInput.trim();
    if (!code) return;
    const hostKey = hostKeyInput.trim();
    setJoinError("");
    setJoining(true);
    try {
      // If host key provided, try to claim host
      if (hostKey) {
        const claimRes = await fetch(`${apiUrl}/api/realm/${encodeURIComponent(code)}/claim-host`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostSecret: hostKey }),
        });
        if (claimRes.status === 401) {
          setJoinError("Invalid host key.");
          return;
        }
        if (claimRes.status === 404) {
          setJoinError("Realm not found. Check the code and try again.");
          return;
        }
        if (!claimRes.ok) {
          const err = await claimRes.json().catch(() => null);
          setJoinError(err?.error ?? "Failed to claim host.");
          return;
        }
        const data = await claimRes.json();
        const rawMode = typeof data.mode === "number" ? MODE_FROM_NUMBER[data.mode] : String(data.mode);
        if (!rawMode || !VALID_MODES.has(rawMode)) { setJoinError("Unknown realm mode."); return; }
        const mode = rawMode as RealmMode;
        setRealm({ id: data.id, joinCode: data.joinCode, mode });
        setRole("host");
        return;
      }

      // Normal guest join
      const res = await fetch(`${apiUrl}/api/realm/${encodeURIComponent(code)}`);
      if (!res.ok) {
        setJoinError(res.status === 404 ? "Realm not found. Check the code and try again." : "Failed to join realm.");
        return;
      }
      const data = await res.json();
      const rawMode = typeof data.mode === "number" ? MODE_FROM_NUMBER[data.mode] : String(data.mode);
      if (!rawMode || !VALID_MODES.has(rawMode)) {
        setJoinError("Unknown realm mode.");
        return;
      }
      const mode = rawMode as RealmMode;
      if (data.status === "Ended") {
        setJoinError("This realm has already ended.");
        return;
      }
      setRealm({ id: data.id, joinCode: data.joinCode, mode });
      setRole("guest");
    } catch {
      setJoinError("Could not connect to server.");
    } finally {
      setJoining(false);
    }
  }

  // For view-only mode, use realmConfig from the hub when the host hasn't set local config.
  // Runtime type guards (Issue #16) prevent unsafe blind casts.
  const effectiveStreetViewLocation = streetViewLocation ?? (isStreetViewLocation(realmConfig) ? realmConfig : null);
  const effectiveCompetitionConfig = competitionConfig ?? (isCompetitionConfig(realmConfig) ? realmConfig : null);
  const effectiveYoutubeVideo = youtubeVideo ?? (isYouTubeVideo(realmConfig) ? realmConfig : null);
  const effectiveRouteConfig = routeConfig ?? (isRouteConfig(realmConfig) ? realmConfig : null);
  const effectiveDungeonConfig = dungeonConfig ?? (isDungeonConfig(realmConfig) ? realmConfig : null);

  if (!realm) {
    return (
      <div className="home-screen">
        <Toast messages={toasts} onDismiss={dismissToast} />
        <div className="home-body">
          <div className="home-content">
            <div className="brand-header">
              <img src="/logo.png" alt="PulseRealm" className="logo" />
            </div>
            <p className="home-subtitle">
              Choose a mode to create a realm or{" "}
              <button className="btn-join-link" onClick={() => setShowJoinModal(true)}>
                join an existing realm
              </button>
            </p>
            <div className="mode-section">
              <h3 className="mode-section-label">Multiplayer</h3>
              <div className="mode-grid" aria-busy={creatingMode !== null}>
                <button
                  className="mode-card"
                  onClick={() => createRealm("competition")}
                  disabled={creatingMode !== null}
                >
                  <span className="mode-icon">&#9876;</span>
                  <span className="mode-name">Competition</span>
                  <span className="mode-desc">Compete in races, elimination, and more</span>
                </button>
                <button
                  className="mode-card"
                  onClick={() => createRealm("dungeon")}
                  disabled={creatingMode !== null}
                >
                  <span className="mode-icon">&#128081;</span>
                  <span className="mode-name">Dungeon</span>
                  <span className="mode-desc">Fight enemies and dodge traps as a team</span>
                </button>
                <button
                  className="mode-card"
                  onClick={() => createRealm("social")}
                  disabled={creatingMode !== null}
                >
                  <span className="mode-icon">&#128172;</span>
                  <span className="mode-name">Social</span>
                  <span className="mode-desc">Walk together and see each other's live stats</span>
                </button>
              </div>
            </div>

            <div className="mode-section">
              <h3 className="mode-section-label">Solo</h3>
              <div className="mode-grid" aria-busy={creatingMode !== null}>
                <button
                  className="mode-card"
                  onClick={() => createRealm("streetview")}
                  disabled={creatingMode !== null}
                >
                  <span className="mode-icon">&#127758;</span>
                  <span className="mode-name">Street View</span>
                  <span className="mode-desc">Walk through real streets on Google Street View</span>
                </button>
                <button
                  className="mode-card"
                  onClick={() => createRealm("youtubetrail")}
                  disabled={creatingMode !== null}
                >
                  <span className="mode-icon">&#9654;</span>
                  <span className="mode-name">YouTube Trail</span>
                  <span className="mode-desc">Watch videos that play at your walking speed</span>
                </button>
                <button
                  className="mode-card"
                  onClick={() => createRealm("route")}
                  disabled={creatingMode !== null}
                >
                  <span className="mode-icon">&#128739;</span>
                  <span className="mode-name">Route</span>
                  <span className="mode-desc">Walk a route between two locations on the map</span>
                </button>
              </div>
            </div>

            <p className="home-tagline">
              PulseRealm is a real-time treadmill workout platform — connect your wearable and get moving.
            </p>

          </div>
          <div className="device-sidebar">
            <span className="device-sidebar-label">Connect your device</span>
            <button className="device-link" onClick={() => setShowAndroidQR(true)}>
              Android
            </button>
            <button className="device-link" onClick={() => setComingSoonDevice("Apple")}>
              Apple
            </button>
            <button className="device-link" onClick={() => setComingSoonDevice("Garmin")}>
              Garmin
            </button>
            <div className="device-sidebar-divider" />
            <button className="device-link device-link-calibrate" onClick={() => setShowCalibration(true)}>
              Calibrate
            </button>
          </div>
        </div>
        <footer className="server-footer">
          <div className="footer-left">
            {!PRESET_API_URL && server.serverInfo && (
              <button className="btn-server-name" onClick={server.disconnect} title="Change server">
                {server.serverInfo.name ?? server.serverUrl}
                {server.serverInfo.version && (
                  <span className="server-version">v{server.serverInfo.version}</span>
                )}
              </button>
            )}
            {adminEnabled && (
              <button className="btn-admin-gear" onClick={() => setPage("admin-login")} title="Admin Settings">
                &#9881;
              </button>
            )}
          </div>
          <div className="footer-right">
            <button className="btn-tos-link" onClick={() => setPage("tos")}>
              Terms of Service
            </button>
            <span className="app-version">v{APP_VERSION}</span>
          </div>
        </footer>
        {showAndroidQR && (
          <div className="qr-overlay" onClick={() => setShowAndroidQR(false)}>
            <div className="qr-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <h3>Download Android App</h3>
              <p>Scan to download the latest APK from GitHub</p>
              <canvas ref={qrCanvasRef} />
              <a
                href="https://github.com/lilfire/PulseRealm/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="qr-direct-link"
              >
                Or open directly
              </a>
              <button className="qr-close" onClick={() => setShowAndroidQR(false)}>Close</button>
            </div>
          </div>
        )}
        {comingSoonDevice && (
          <div className="qr-overlay" onClick={() => setComingSoonDevice(null)}>
            <div className="qr-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <h3>{comingSoonDevice}</h3>
              <p>{comingSoonDevice} support is coming soon.</p>
              <button className="qr-close" onClick={() => setComingSoonDevice(null)}>Close</button>
            </div>
          </div>
        )}
        {showCalibration && hubUrl && (
          <CalibrationPanel hubUrl={hubUrl} onClose={() => setShowCalibration(false)} />
        )}
        {showJoinModal && !virtualKeyboardOpen && (
          <div className="qr-overlay" onClick={() => { setShowJoinModal(false); setJoinError(""); }}>
            <div className="qr-modal join-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <h3>Join a Realm</h3>
              <p>Enter a 6-digit join code to watch a realm</p>
              <label htmlFor="join-code-input" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
                Join code
              </label>
              <input
                id="join-code-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={joinCodeInput}
                onChange={(e) => {
                  setJoinCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setJoinError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && joinRealm()}
                placeholder="000000"
                maxLength={6}
                className="input-join-code"
                autoFocus
              />
              <input
                type="text"
                value={hostKeyInput}
                onChange={(e) => {
                  setHostKeyInput(e.target.value.toUpperCase().slice(0, 8));
                  setJoinError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && joinRealm()}
                placeholder="Host key (optional)"
                className="input-host-key"
              />
              {joinError && <p className="error-message">{joinError}</p>}
              <div className="join-modal-actions">
                <button
                  onClick={joinRealm}
                  disabled={joinCodeInput.length < 6 || joining}
                  className="btn-join-go"
                >
                  {joining ? "Joining..." : hostKeyInput.trim() ? "Join as Host" : "Watch"}
                </button>
                <button
                  className="qr-close"
                  onClick={() => { setShowJoinModal(false); setJoinCodeInput(""); setHostKeyInput(""); setJoinError(""); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {showJoinModal && virtualKeyboardOpen && (
          <div className="join-bar-backdrop" onClick={() => { setShowJoinModal(false); setJoinCodeInput(""); setHostKeyInput(""); setJoinError(""); }} />
        )}
        {showJoinModal && virtualKeyboardOpen && (
          <div className="join-bar" role="dialog" aria-modal="true">
            <div className="join-bar-row">
              <label htmlFor="join-code-input-bar" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
                Join code
              </label>
              <input
                id="join-code-input-bar"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={joinCodeInput}
                onChange={(e) => {
                  setJoinCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setJoinError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && joinRealm()}
                placeholder="Join code"
                maxLength={6}
                className="join-bar-code"
                autoFocus
              />
              <input
                type="text"
                value={hostKeyInput}
                onChange={(e) => {
                  setHostKeyInput(e.target.value.toUpperCase().slice(0, 8));
                  setJoinError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && joinRealm()}
                placeholder="Host key"
                className="join-bar-host"
              />
              <button
                onClick={joinRealm}
                disabled={joinCodeInput.length < 6 || joining}
                className="join-bar-go"
              >
                {joining ? "..." : hostKeyInput.trim() ? "Host" : "Join"}
              </button>
              <button
                className="join-bar-close"
                onClick={() => { setShowJoinModal(false); setJoinCodeInput(""); setHostKeyInput(""); setJoinError(""); }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {joinError && <p className="join-bar-error">{joinError}</p>}
          </div>
        )}
      </div>
    );
  }

  // Show summary screen only when a started realm has ended
  if (ended && realmSummary && started) {
    return (
      <RealmSummaryScreen
        summary={realmSummary}
        clientProfiles={clientProfiles}
        onClose={resetRealm}
      />
    );
  }


  // Show lobby until the realm is started
  if (!started) {
    const lobbyProps = {
      joinCode: realm.joinCode,
      mode: realm.mode,
      clients,
      clientProfiles,
      connected,
      role,
      hostSecret: hostSecret ?? undefined,
      onLeave: resetRealm,
      onEnd: () => { endRealm(); },
      onKick: kickClient,
      lobbySettings,
      onSettingsChange: updateLobbySettings,
      onRequestBind: requestBind,
      onCancelBind: cancelBind,
      bindCode,
      bindPending,
      bindResult,
      boundClientId,
      clientBindings,
      serverUrl: apiUrl,
    };

    if (realm.mode === "competition") {
      return (
        <CompetitionLobby
          {...lobbyProps}
          defaults={lobbyDefaults?.competition}
          onStart={(config) => {
            setCompetitionConfig(config);
            startRealm(config);
          }}
        />
      );
    }

    if (realm.mode === "streetview") {
      return (
        <StreetViewLobby
          {...lobbyProps}
          curatedLocations={lobbyDefaults?.streetViewLocations}
          onStart={(location) => {
            setStreetViewLocation(location);
            startRealm(location);
          }}
        />
      );
    }

    if (realm.mode === "youtubetrail") {
      return (
        <YouTubeTrailLobby
          {...lobbyProps}
          curatedVideos={lobbyDefaults?.youTubeVideos}
          onStart={(video) => {
            setYoutubeVideo(video);
            startRealm(video);
          }}
        />
      );
    }

    if (realm.mode === "route") {
      return (
        <RouteLobby
          {...lobbyProps}
          curatedRoutes={lobbyDefaults?.curatedRoutes}
          onStart={(config) => {
            setRouteConfig(config);
            startRealm(config);
          }}
        />
      );
    }

    if (realm.mode === "dungeon") {
      return (
        <DungeonLobby
          {...lobbyProps}
          defaults={lobbyDefaults?.dungeon}
          onStart={(cfg) => {
            setDungeonConfig(cfg);
            startRealm(cfg);
          }}
        />
      );
    }

    if (realm.mode === "social") {
      return (
        <DefaultLobby
          {...lobbyProps}
          onStart={() => startRealm()}
        />
      );
    }

    return (
      <DefaultLobby
        {...lobbyProps}
        onStart={() => startRealm()}
      />
    );
  }

  if (realm.mode === "youtubetrail" && effectiveYoutubeVideo) {
    return (
      <YouTubeTrailMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        video={effectiveYoutubeVideo}
        onEnd={isGuest ? noOpEnd : onEndSimple}
        role={role}
        boundClientId={boundClientId}
        clientInclines={clientInclines}
        onSetIncline={setIncline}
        clientSpeedOverrides={clientSpeedOverrides}
        onSetSpeedOverride={setSpeedOverride}
      />
    );
  }

  if (realm.mode === "streetview" && effectiveStreetViewLocation) {
    return (
      <StreetViewMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        startLocation={effectiveStreetViewLocation}
        onEnd={isGuest ? noOpEnd : onEndSimple}
        role={role}
        boundClientId={boundClientId}
        clientInclines={clientInclines}
        onSetIncline={setIncline}
        clientSpeedOverrides={clientSpeedOverrides}
        onSetSpeedOverride={setSpeedOverride}
      />
    );
  }

  if (realm.mode === "route" && effectiveRouteConfig) {
    return (
      <RouteMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        route={effectiveRouteConfig}
        onEnd={isGuest ? noOpEnd : onEndSimple}
        role={role}
        boundClientId={boundClientId}
        clientInclines={clientInclines}
        onSetIncline={setIncline}
        clientSpeedOverrides={clientSpeedOverrides}
        onSetSpeedOverride={setSpeedOverride}
      />
    );
  }

  if (realm.mode === "dungeon" && effectiveDungeonConfig) {
    return (
      <DungeonMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        config={effectiveDungeonConfig}
        onEnd={isGuest ? noOpEnd : onEndWithOverrides}
        role={role}
        boundClientId={boundClientId}
        clientInclines={clientInclines}
        onSetIncline={setIncline}
        clientSpeedOverrides={clientSpeedOverrides}
        onSetSpeedOverride={setSpeedOverride}
      />
    );
  }

  if (realm.mode === "social") {
    return (
      <SocialMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        onEnd={isGuest ? noOpEnd : onEndWithOverrides}
        role={role}
        boundClientId={boundClientId}
        clientInclines={clientInclines}
        onSetIncline={setIncline}
        clientSpeedOverrides={clientSpeedOverrides}
        onSetSpeedOverride={setSpeedOverride}
      />
    );
  }

  if (realm.mode === "competition" && effectiveCompetitionConfig) {
    return (
      <CompetitionMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        config={effectiveCompetitionConfig}
        onEnd={isGuest ? noOpEnd : onEndWithOverrides}
        onEliminate={onEliminate}
        role={role}
        boundClientId={boundClientId}
        clientInclines={clientInclines}
        onSetIncline={setIncline}
      />
    );
  }

  return (
    <div className="app">
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>
      <div style={{
        display: "inline-block",
        padding: "0.3rem 1rem",
        borderRadius: "6px",
        background: role === "guest" ? "rgba(51, 223, 255, 0.12)" : role === "admin" ? "rgba(250, 204, 21, 0.12)" : "rgba(255, 92, 117, 0.12)",
        border: `1px solid ${role === "guest" ? "rgba(51, 223, 255, 0.3)" : role === "admin" ? "rgba(250, 204, 21, 0.3)" : "rgba(255, 92, 117, 0.3)"}`,
        color: role === "guest" ? "#33DFFF" : role === "admin" ? "#FACC15" : "#FF5C75",
        fontSize: "0.85rem",
        fontWeight: 600,
        marginBottom: "0.5rem",
      }}>
        {role.toUpperCase()}
      </div>
      <p>
        Join Code: <strong>{realm.joinCode}</strong>
      </p>
      <p>Status: {connected ? "Connected" : "Connecting..."}</p>
    </div>
  );
}

export default App;

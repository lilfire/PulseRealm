import { useState, useEffect, useCallback } from "react";
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
import type { CompetitionConfig, Realm, RealmMode, RealmRole } from "./types/session";
import "./App.css";

const APP_VERSION = __APP_VERSION__;

// Map server numeric mode enum back to string
const MODE_FROM_NUMBER: Record<number, RealmMode> = {
  0: "competition",
  1: "streetview",
  2: "youtubetrail",
  3: "route",
  4: "dungeon",
  5: "social",
};

// When VITE_API_URL is set (e.g. in Docker where frontend is served from the
// same origin as the API), skip the server connect screen entirely.
const PRESET_API_URL = import.meta.env.VITE_API_URL ?? "";

interface LobbyDefaults {
  competition: {
    subMode: string;
    playerFormat: string;
    targetDistanceKm: number;
    intervalMinutes: number;
    targetZone: number;
    durationMinutes: number;
  };
  dungeon: {
    difficulty: string;
    timeframeMinutes: number;
  };
  streetViewLocations: { lat: number; lng: number; address: string }[];
  youTubeVideos: { videoId: string; url: string; title: string }[];
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
  const [page, setPage] = useState<"home" | "admin-login" | "admin">("home");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [lobbyDefaults, setLobbyDefaults] = useState<LobbyDefaults | null>(null);

  // Create realm error state (auto-cleared after display)
  const [createError, setCreateError] = useState<string | null>(null);

  // Join realm UI state
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [hostKeyInput, setHostKeyInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  // Use preset URL if available, otherwise use the dynamically configured one
  const apiUrl = PRESET_API_URL || server.apiUrl;
  const hubUrl = PRESET_API_URL
    ? (import.meta.env.VITE_HUB_URL ?? `${PRESET_API_URL}/hubs/realm`)
    : server.hubUrl;

  const { connected, started, ended, realmSummary, clients, clientProfiles, latestData, realmConfig, startRealm, endRealm, notifyEliminated } = useRealmHub(
    realm?.id ?? null,
    hubUrl
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
    setShowJoinInput(false);
    setJoinCodeInput("");
    setHostKeyInput("");
    setJoinError("");
  }, []);

  // Issue #8 — noOpEnd is a stable no-op for view-only mode
  const noOpEnd = useCallback(() => {}, []);

  const isGuest = role === "guest";

  // Issue #8 — stable onEnd handlers for each mode; they delegate to noOpEnd or endRealm
  const onEndSimple = useCallback(
    (totalDistance: number) => {
      if (isGuest) return;
      endRealm(totalDistance);
    },
    [isGuest, endRealm]
  );
  const onEndWithOverrides = useCallback(
    (totalDistance: number, overrides?: Partial<RealmSummary>) => {
      if (isGuest) return;
      endRealm(totalDistance, overrides);
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

  // Issue #16 — lightweight runtime type guards before casting realmConfig
  function isStreetViewLocation(v: unknown): v is StreetViewLocation {
    return typeof v === "object" && v !== null && "lat" in v && "lng" in v;
  }
  function isCompetitionConfig(v: unknown): v is CompetitionConfig {
    return typeof v === "object" && v !== null && "subMode" in v;
  }
  function isYouTubeVideo(v: unknown): v is YouTubeVideo {
    return typeof v === "object" && v !== null && "videoId" in v;
  }
  function isRouteConfig(v: unknown): v is RouteConfig {
    return typeof v === "object" && v !== null && "waypoints" in v;
  }
  function isDungeonConfig(v: unknown): v is DungeonConfig {
    return typeof v === "object" && v !== null && "difficulty" in v;
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
    setCreateError(null);
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
        throw new Error(`Server returned ${res.status}`);
      }
      const data = await res.json();
      setRealm({
        id: data.id,
        joinCode: data.joinCode,
        mode,
      });
      setHostSecret(data.hostSecret ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create realm.";
      setCreateError(message);
      // Auto-clear the error after 5 seconds
      setTimeout(() => setCreateError(null), 5000);
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
        const mode = typeof data.mode === "number" ? MODE_FROM_NUMBER[data.mode] : (data.mode as RealmMode);
        if (!mode) { setJoinError("Unknown realm mode."); return; }
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
      const mode = typeof data.mode === "number" ? MODE_FROM_NUMBER[data.mode] : (data.mode as RealmMode);
      if (!mode) {
        setJoinError("Unknown realm mode.");
        return;
      }
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
        <div className="home-content">
          <div className="brand-header">
            <img src="/logo.png" alt="PulseRealm" className="logo" />
          </div>
          <p className="home-subtitle">Choose a mode to create a realm</p>
          <div className="mode-grid">
            <button
              className="mode-card"
              onClick={() => createRealm("competition")}
              disabled={creatingMode !== null}
            >
              <span className="mode-icon">&#9876;</span>
              <span className="mode-name">Competition</span>
              <span className="mode-desc">Race against others in real-time</span>
            </button>
            <button
              className="mode-card"
              onClick={() => createRealm("streetview")}
              disabled={creatingMode !== null}
            >
              <span className="mode-icon">&#127758;</span>
              <span className="mode-name">Street View</span>
              <span className="mode-desc">Explore the world together</span>
            </button>
            <button
              className="mode-card"
              onClick={() => createRealm("youtubetrail")}
              disabled={creatingMode !== null}
            >
              <span className="mode-icon">&#9654;</span>
              <span className="mode-name">YouTube Trail</span>
              <span className="mode-desc">Walk through videos together</span>
            </button>
            <button
              className="mode-card"
              onClick={() => createRealm("route")}
              disabled={creatingMode !== null}
            >
              <span className="mode-icon">&#128739;</span>
              <span className="mode-name">Route</span>
              <span className="mode-desc">Follow a path in the real world</span>
            </button>
            <button
              className="mode-card"
              onClick={() => createRealm("dungeon")}
              disabled={creatingMode !== null}
            >
              <span className="mode-icon">&#128081;</span>
              <span className="mode-name">Dungeon</span>
              <span className="mode-desc">Conquer dungeons with your team</span>
            </button>
            <button
              className="mode-card"
              onClick={() => createRealm("social")}
              disabled={creatingMode !== null}
            >
              <span className="mode-icon">&#128172;</span>
              <span className="mode-name">Social</span>
              <span className="mode-desc">Hang out and move together</span>
            </button>
          </div>

          {/* Create realm error banner (Issue #28) */}
          {createError && (
            <p className="error-message" style={{ textAlign: "center", marginTop: "0.75rem" }}>
              {createError}
            </p>
          )}

          {/* Join Realm Section */}
          <div className="join-realm-section">
            {!showJoinInput ? (
              <button
                className="btn-join-realm"
                onClick={() => setShowJoinInput(true)}
              >
                Join a Realm
              </button>
            ) : (
              <div className="join-realm-form">
                <p style={{ color: "var(--text, #9ca3af)", fontSize: "0.9rem", margin: "0 0 0.75rem" }}>
                  Enter a 6-digit join code to watch a realm
                </p>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="text"
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
                  <button
                    onClick={joinRealm}
                    disabled={joinCodeInput.length < 6 || joining}
                    className="btn-join-go"
                  >
                    {joining ? "Joining..." : hostKeyInput.trim() ? "Join as Host" : "Watch"}
                  </button>
                </div>
                <input
                  type="text"
                  value={hostKeyInput}
                  onChange={(e) => {
                    setHostKeyInput(e.target.value.toUpperCase().slice(0, 8));
                    setJoinError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && joinRealm()}
                  placeholder="Host key (optional)"
                  maxLength={8}
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    fontSize: "0.85rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border, #2e303a)",
                    background: "var(--bg, #16171d)",
                    color: "var(--text-h, #f3f4f6)",
                    marginTop: "0.5rem",
                    boxSizing: "border-box",
                  }}
                />
                {joinError && <p className="error-message">{joinError}</p>}
                <button
                  className="btn-join-cancel"
                  onClick={() => { setShowJoinInput(false); setJoinCodeInput(""); setHostKeyInput(""); setJoinError(""); }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
        <footer className="server-footer">
          {!PRESET_API_URL && server.serverInfo && (
            <>
              <span>
                {server.serverInfo.name ?? server.serverUrl}
                {server.serverInfo.version && (
                  <span className="server-version">v{server.serverInfo.version}</span>
                )}
              </span>
              <button className="btn-change-server" onClick={server.disconnect}>
                Change
              </button>
            </>
          )}
          {adminEnabled && (
            <button className="btn-admin-gear" onClick={() => setPage("admin-login")} title="Admin Settings">
              &#9881;
            </button>
          )}
        </footer>
        <span className="app-version">v{APP_VERSION}</span>
      </div>
    );
  }

  // Show summary screen when realm has ended
  if (ended && realmSummary) {
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
      onEnd: () => { endRealm(0); },
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
        onEnd={isGuest ? noOpEnd : onEndSimple}
        role={role}
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

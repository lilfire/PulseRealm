import { useState } from "react";
import { useRealmHub } from "./hooks/useSessionHub";
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
import type { CompetitionConfig, Realm, RealmMode } from "./types/session";
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

function App() {
  const server = useServerConnection();
  const [realm, setRealm] = useState<Realm | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [creatingMode, setCreatingMode] = useState<RealmMode | null>(null);
  const [streetViewLocation, setStreetViewLocation] = useState<StreetViewLocation | null>(null);
  const [competitionConfig, setCompetitionConfig] = useState<CompetitionConfig | null>(null);
  const [youtubeVideo, setYoutubeVideo] = useState<YouTubeVideo | null>(null);
  const [routeConfig, setRouteConfig] = useState<RouteConfig | null>(null);
  const [dungeonConfig, setDungeonConfig] = useState<DungeonConfig | null>(null);

  // Join realm UI state
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
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

  function resetRealm() {
    setRealm(null);
    setViewOnly(false);
    setStreetViewLocation(null);
    setYoutubeVideo(null);
    setRouteConfig(null);
    setDungeonConfig(null);
    setCompetitionConfig(null);
    setShowJoinInput(false);
    setJoinCodeInput("");
    setJoinError("");
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
      const data = await res.json();
      setRealm({
        id: data.id,
        joinCode: data.joinCode,
        mode,
      });
    } finally {
      setCreatingMode(null);
    }
  }

  async function joinRealm() {
    const code = joinCodeInput.trim();
    if (!code) return;
    setJoinError("");
    setJoining(true);
    try {
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
      setViewOnly(true);
    } catch {
      setJoinError("Could not connect to server.");
    } finally {
      setJoining(false);
    }
  }

  // For view-only mode, use realmConfig from the hub when the host hasn't set local config
  const effectiveStreetViewLocation = streetViewLocation ?? (realmConfig as StreetViewLocation | null);
  const effectiveCompetitionConfig = competitionConfig ?? (realmConfig as CompetitionConfig | null);
  const effectiveYoutubeVideo = youtubeVideo ?? (realmConfig as YouTubeVideo | null);
  const effectiveRouteConfig = routeConfig ?? (realmConfig as RouteConfig | null);
  const effectiveDungeonConfig = dungeonConfig ?? (realmConfig as DungeonConfig | null);

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
                    {joining ? "Joining..." : "Watch"}
                  </button>
                </div>
                {joinError && <p className="error-message">{joinError}</p>}
                <button
                  className="btn-join-cancel"
                  onClick={() => { setShowJoinInput(false); setJoinCodeInput(""); setJoinError(""); }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
        {!PRESET_API_URL && server.serverInfo && (
          <footer className="server-footer">
            <span>
              {server.serverInfo.name ?? server.serverUrl}
              {server.serverInfo.version && (
                <span className="server-version">v{server.serverInfo.version}</span>
              )}
            </span>
            <button className="btn-change-server" onClick={server.disconnect}>
              Change
            </button>
          </footer>
        )}
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
      clients,
      clientProfiles,
      connected,
      viewOnly,
      onLeave: resetRealm,
    };

    if (realm.mode === "competition") {
      return (
        <CompetitionLobby
          {...lobbyProps}
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

  // No-op end handler for view-only mode
  const noOpEnd = () => {};

  if (realm.mode === "youtubetrail" && effectiveYoutubeVideo) {
    return (
      <YouTubeTrailMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        video={effectiveYoutubeVideo}
        onEnd={viewOnly ? noOpEnd : (totalDistance) => endRealm(totalDistance)}
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
        onEnd={viewOnly ? noOpEnd : (totalDistance) => endRealm(totalDistance)}
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
        onEnd={viewOnly ? noOpEnd : (totalDistance) => endRealm(totalDistance)}
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
        onEnd={viewOnly ? noOpEnd : (totalDistance) => endRealm(totalDistance)}
      />
    );
  }

  if (realm.mode === "social") {
    return (
      <SocialMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        onEnd={viewOnly ? noOpEnd : (totalDistance, overrides) => endRealm(totalDistance, overrides)}
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
        onEnd={viewOnly ? noOpEnd : (totalDistance, overrides) => endRealm(totalDistance, overrides)}
        onEliminate={viewOnly ? () => {} : notifyEliminated}
      />
    );
  }

  return (
    <div className="app">
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>
      {viewOnly && (
        <div style={{
          display: "inline-block",
          padding: "0.3rem 1rem",
          borderRadius: "6px",
          background: "rgba(51, 223, 255, 0.12)",
          border: "1px solid rgba(51, 223, 255, 0.3)",
          color: "#33DFFF",
          fontSize: "0.85rem",
          fontWeight: 600,
          marginBottom: "0.5rem",
        }}>
          VIEW ONLY
        </div>
      )}
      <p>
        Join Code: <strong>{realm.joinCode}</strong>
      </p>
      <p>Status: {connected ? "Connected" : "Connecting..."}</p>
    </div>
  );
}

export default App;

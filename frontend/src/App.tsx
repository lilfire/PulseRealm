import { useState } from "react";
import { useRealmHub } from "./hooks/useSessionHub";
import { useServerConnection } from "./hooks/useServerConnection";
import { ServerConnect } from "./components/ServerConnect";
import { CompetitionLobby } from "./components/lobbies/CompetitionLobby";
import { StreetViewLobby, type StreetViewLocation } from "./components/lobbies/StreetViewLobby";
import { DefaultLobby } from "./components/lobbies/DefaultLobby";
import { YouTubeTrailLobby, type YouTubeVideo } from "./components/lobbies/YouTubeTrailLobby";
import { RouteLobby, type RouteConfig } from "./components/lobbies/RouteLobby";
import { CompetitionMode } from "./components/modes/CompetitionMode";
import { StreetViewMode } from "./components/modes/StreetViewMode";
import { YouTubeTrailMode } from "./components/modes/YouTubeTrailMode";
import { RouteMode } from "./components/modes/RouteMode";
import { DungeonMode } from "./components/modes/DungeonMode";
import { SocialMode } from "./components/modes/SocialMode";
import { RealmSummaryScreen } from "./components/SessionSummaryScreen";
import type { CompetitionType, Realm, RealmMode } from "./types/session";
import "./App.css";

// When VITE_API_URL is set (e.g. in Docker where frontend is served from the
// same origin as the API), skip the server connect screen entirely.
const PRESET_API_URL = import.meta.env.VITE_API_URL ?? "";

function App() {
  const server = useServerConnection();
  const [realm, setRealm] = useState<Realm | null>(null);
  const [creatingMode, setCreatingMode] = useState<RealmMode | null>(null);
  const [streetViewLocation, setStreetViewLocation] = useState<StreetViewLocation | null>(null);
  const [competitionType, setCompetitionType] = useState<CompetitionType>("race");
  const [youtubeVideo, setYoutubeVideo] = useState<YouTubeVideo | null>(null);
  const [routeConfig, setRouteConfig] = useState<RouteConfig | null>(null);

  // Use preset URL if available, otherwise use the dynamically configured one
  const apiUrl = PRESET_API_URL || server.apiUrl;
  const hubUrl = PRESET_API_URL
    ? (import.meta.env.VITE_HUB_URL ?? `${PRESET_API_URL}/hubs/realm`)
    : server.hubUrl;

  const { connected, started, ended, realmSummary, clients, clientProfiles, latestData, startRealm, endRealm } = useRealmHub(
    realm?.id ?? null,
    hubUrl
  );

  // If no preset URL and not connected to a server, show the connect screen
  if (!PRESET_API_URL && !server.isConnected) {
    return (
      <ServerConnect
        onConnect={server.connect}
        checking={server.checking}
        error={server.error}
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
        </div>
        {!PRESET_API_URL && server.serverInfo && (
          <footer className="server-footer">
            <span>
              {server.serverInfo.name ?? server.serverUrl}
            </span>
            <button className="btn-change-server" onClick={server.disconnect}>
              Change
            </button>
          </footer>
        )}
      </div>
    );
  }

  // Show summary screen when realm has ended
  if (ended && realmSummary) {
    return (
      <RealmSummaryScreen
        summary={realmSummary}
        onClose={() => {
          setRealm(null);
          setStreetViewLocation(null);
          setYoutubeVideo(null);
          setRouteConfig(null);
        }}
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
      onLeave: () => {
        setRealm(null);
        setStreetViewLocation(null);
        setYoutubeVideo(null);
        setRouteConfig(null);
      },
    };

    if (realm.mode === "competition") {
      return (
        <CompetitionLobby
          {...lobbyProps}
          onStart={(compType) => {
            setCompetitionType(compType);
            startRealm();
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
            startRealm();
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
            startRealm();
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
            startRealm();
          }}
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

  if (realm.mode === "youtubetrail" && youtubeVideo) {
    return (
      <YouTubeTrailMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        video={youtubeVideo}
        onEnd={(totalDistance) => {
          endRealm(totalDistance);
        }}
      />
    );
  }

  if (realm.mode === "streetview" && streetViewLocation) {
    return (
      <StreetViewMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        startLocation={streetViewLocation}
        onEnd={(totalDistance) => {
          endRealm(totalDistance);
        }}
      />
    );
  }

  if (realm.mode === "route" && routeConfig) {
    return (
      <RouteMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        route={routeConfig}
        onEnd={(totalDistance) => endRealm(totalDistance)}
      />
    );
  }

  return (
    <div className="app">
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>
      <p>
        Join Code: <strong>{realm.joinCode}</strong>
      </p>
      <p>Status: {connected ? "Connected" : "Connecting..."}</p>

      {realm.mode === "competition" && (
        <CompetitionMode clients={clients} clientProfiles={clientProfiles} latestData={latestData} competitionType={competitionType} />
      )}
      {realm.mode === "dungeon" && (
        <DungeonMode clients={clients} clientProfiles={clientProfiles} latestData={latestData} />
      )}
      {realm.mode === "social" && (
        <SocialMode clients={clients} clientProfiles={clientProfiles} latestData={latestData} />
      )}
    </div>
  );
}

export default App;

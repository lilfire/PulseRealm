import { useState } from "react";
import { useRealmHub } from "./hooks/useSessionHub";
import { useServerConnection } from "./hooks/useServerConnection";
import { ServerConnect } from "./components/ServerConnect";
import { Lobby, type StreetViewLocation } from "./components/Lobby";
import { CompetitionMode } from "./components/modes/CompetitionMode";
import { StreetViewMode } from "./components/modes/StreetViewMode";
import { RealmSummaryScreen } from "./components/SessionSummaryScreen";
import type { Realm, RealmMode } from "./types/session";
import "./App.css";

// When VITE_API_URL is set (e.g. in Docker where frontend is served from the
// same origin as the API), skip the server connect screen entirely.
const PRESET_API_URL = import.meta.env.VITE_API_URL ?? "";

function App() {
  const server = useServerConnection();
  const [realm, setRealm] = useState<Realm | null>(null);
  const [creatingMode, setCreatingMode] = useState<RealmMode | null>(null);
  const [streetViewLocation, setStreetViewLocation] = useState<StreetViewLocation | null>(null);

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
      const modeValue = mode === "competition" ? 0 : 1;
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
        }}
      />
    );
  }

  // Show lobby until the realm is started
  if (!started) {
    return (
      <Lobby
        joinCode={realm.joinCode}
        clients={clients}
        clientProfiles={clientProfiles}
        connected={connected}
        mode={realm.mode}
        onStart={(location) => {
          if (location) setStreetViewLocation(location);
          startRealm();
        }}
        onLeave={() => {
          setRealm(null);
          setStreetViewLocation(null);
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
        <CompetitionMode clients={clients} clientProfiles={clientProfiles} latestData={latestData} />
      )}
    </div>
  );
}

export default App;

import { useState } from "react";
import { useSessionHub } from "./hooks/useSessionHub";
import { useServerConnection } from "./hooks/useServerConnection";
import { ServerConnect } from "./components/ServerConnect";
import { Lobby, type StreetViewLocation } from "./components/Lobby";
import { CompetitionMode } from "./components/modes/CompetitionMode";
import { StreetViewMode } from "./components/modes/StreetViewMode";
import { SessionSummaryScreen } from "./components/SessionSummaryScreen";
import type { Session, SessionMode } from "./types/session";
import "./App.css";

// When VITE_API_URL is set (e.g. in Docker where frontend is served from the
// same origin as the API), skip the server connect screen entirely.
const PRESET_API_URL = import.meta.env.VITE_API_URL ?? "";

function App() {
  const server = useServerConnection();
  const [session, setSession] = useState<Session | null>(null);
  const [selectedMode, setSelectedMode] = useState<SessionMode>("competition");
  const [streetViewLocation, setStreetViewLocation] = useState<StreetViewLocation | null>(null);

  // Use preset URL if available, otherwise use the dynamically configured one
  const apiUrl = PRESET_API_URL || server.apiUrl;
  const hubUrl = PRESET_API_URL
    ? (import.meta.env.VITE_HUB_URL ?? `${PRESET_API_URL}/hubs/session`)
    : server.hubUrl;

  const { connected, started, ended, sessionSummary, clients, clientProfiles, latestData, startSession, endSession } = useSessionHub(
    session?.id ?? null,
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

  async function createSession() {
    const modeValue = selectedMode === "competition" ? 0 : 1;
    const res = await fetch(`${apiUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: modeValue }),
    });
    const data = await res.json();
    setSession({
      id: data.id,
      joinCode: data.joinCode,
      mode: selectedMode,
    });
  }

  if (!session) {
    return (
      <div className="app">
        <div className="brand-header">
          <img src="/logo.png" alt="PulseRealm" className="logo" />
        </div>
        {!PRESET_API_URL && server.serverInfo && (
          <p style={{ fontSize: "0.85rem", color: "#888" }}>
            Connected to {server.serverUrl}{" "}
            <button
              onClick={server.disconnect}
              style={{
                fontSize: "0.75rem",
                padding: "0.2rem 0.5rem",
                background: "transparent",
                border: "1px solid #666",
                color: "#aaa",
                cursor: "pointer",
              }}
            >
              Change server
            </button>
          </p>
        )}
        <p>Create a session to get started.</p>
        <div>
          <label>
            Mode:{" "}
            <select
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value as SessionMode)}
            >
              <option value="competition">Competition</option>
              <option value="streetview">Street View</option>
            </select>
          </label>
        </div>
        <button onClick={createSession}>Create Session</button>
      </div>
    );
  }

  // Show summary screen when session has ended
  if (ended && sessionSummary) {
    return (
      <SessionSummaryScreen
        summary={sessionSummary}
        onClose={() => {
          setSession(null);
          setStreetViewLocation(null);
        }}
      />
    );
  }

  // Show lobby until the session is started
  if (!started) {
    return (
      <Lobby
        joinCode={session.joinCode}
        clients={clients}
        clientProfiles={clientProfiles}
        connected={connected}
        mode={session.mode}
        onStart={(location) => {
          if (location) setStreetViewLocation(location);
          startSession();
        }}
      />
    );
  }

  if (session.mode === "streetview" && streetViewLocation) {
    return (
      <StreetViewMode
        clients={clients}
        clientProfiles={clientProfiles}
        latestData={latestData}
        startLocation={streetViewLocation}
        onEnd={(totalDistance) => {
          endSession(totalDistance);
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
        Join Code: <strong>{session.joinCode}</strong>
      </p>
      <p>Status: {connected ? "Connected" : "Connecting..."}</p>

      {session.mode === "competition" && (
        <CompetitionMode clients={clients} clientProfiles={clientProfiles} latestData={latestData} />
      )}
    </div>
  );
}

export default App;

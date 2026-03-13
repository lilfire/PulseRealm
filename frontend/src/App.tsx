import { useState } from "react";
import { useSessionHub } from "./hooks/useSessionHub";
import { CompetitionMode } from "./components/modes/CompetitionMode";
import { StreetViewMode } from "./components/modes/StreetViewMode";
import type { Session, SessionMode } from "./types/session";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5062";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [selectedMode, setSelectedMode] = useState<SessionMode>("competition");
  const { connected, clients, latestData } = useSessionHub(session?.id ?? null);

  async function createSession() {
    const modeValue = selectedMode === "competition" ? 0 : 1;
    const res = await fetch(`${API_URL}/api/session`, {
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
        <h1>PulseRealm</h1>
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

  return (
    <div className="app">
      <h1>PulseRealm</h1>
      <p>
        Join Code: <strong>{session.joinCode}</strong>
      </p>
      <p>Status: {connected ? "Connected" : "Connecting..."}</p>

      {session.mode === "competition" && (
        <CompetitionMode clients={clients} latestData={latestData} />
      )}
      {session.mode === "streetview" && (
        <StreetViewMode clients={clients} latestData={latestData} />
      )}
    </div>
  );
}

export default App;

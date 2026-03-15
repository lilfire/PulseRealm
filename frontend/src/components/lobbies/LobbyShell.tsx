import type { ClientProfile } from "../../types/session";
import type { ReactNode } from "react";

interface Props {
  joinCode: string;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  canStart: boolean;
  onStart: () => void;
  onLeave: () => void;
  children?: ReactNode;
}

export function LobbyShell({ joinCode, clients, clientProfiles, connected, canStart, onStart, onLeave, children }: Props) {
  return (
    <div className="app">
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>
      <p>
        Join Code: <strong style={{ fontSize: "2rem", letterSpacing: "0.15em" }}>{joinCode}</strong>
      </p>
      <p>Status: {connected ? "Waiting for players..." : "Connecting..."}</p>

      <div style={{ margin: "1.5rem 0" }}>
        <h3>Players ({clients.length})</h3>
        {clients.length === 0 ? (
          <p style={{ color: "#888" }}>No players yet. Share the join code to get started.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {clients.map((id) => {
              const profile = clientProfiles[id];
              return (
                <li key={id} style={{ padding: "0.4rem 0" }}>
                  {profile?.name || id}
                  {profile?.heightCm ? ` — ${profile.heightCm} cm` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {children}

      <button
        onClick={onStart}
        disabled={!canStart}
        style={{ fontSize: "1.2rem", padding: "0.6rem 2rem" }}
      >
        Start Realm
      </button>
      <div>
        <button
          onClick={onLeave}
          style={{
            background: "transparent",
            border: "1px solid var(--border, #2e303a)",
            color: "var(--text, #9ca3af)",
            fontSize: "0.85rem",
            padding: "0.4rem 1rem",
          }}
        >
          Leave Realm
        </button>
      </div>
    </div>
  );
}

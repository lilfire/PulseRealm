import type { ClientProfile, RealmMode } from "../../types/session";
import { maxClientsForMode } from "../../types/session";
import type { ReactNode } from "react";

interface Props {
  joinCode: string;
  mode: RealmMode;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  canStart: boolean;
  onStart: () => void;
  onLeave: () => void;
  viewOnly?: boolean;
  minPlayers?: number;
  children?: ReactNode;
}

export function LobbyShell({ joinCode, mode, clients, clientProfiles, connected: _connected, canStart, onStart, onLeave, viewOnly, minPlayers, children }: Props) {
  return (
    <div className="app lobby-app">
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>

      <div className="lobby-header">
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
            letterSpacing: "0.05em",
            marginBottom: "0.5rem",
          }}>
            VIEW ONLY
          </div>
        )}
        <p style={{ margin: 0 }}>Join Code</p>
        <p style={{ margin: 0 }}><strong style={{ fontSize: "2rem", letterSpacing: "0.15em" }}>{joinCode}</strong></p>

      </div>

      <div className="lobby-columns">
        <div className="lobby-col-settings">
          {!viewOnly && children}
        </div>

        <div className="lobby-col-players">
          <h3>Players ({clients.length}/{maxClientsForMode(mode)})</h3>
          {minPlayers != null && minPlayers > 1 && clients.length < minPlayers && (
            <p style={{ color: "#FF5C75", fontSize: "0.85rem", margin: "0.25rem 0 0.5rem" }}>
              Minimum {minPlayers} players required
            </p>
          )}
          {clients.length === 0 ? (
            <p style={{ color: "#888" }}>No players yet.</p>
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
      </div>

      <div className="lobby-footer">
        {!viewOnly && (
          <button
            onClick={onStart}
            disabled={!canStart}
            style={{ fontSize: "1.2rem", padding: "0.6rem 2rem", background: "#00D4FF", color: "#0f172a" }}
          >
            Start Realm
          </button>
        )}
        <button
          onClick={onLeave}
          style={{
            background: "#FF3D5A",
            color: "#fff",
            fontSize: "1.2rem",
            padding: "0.6rem 2rem",
          }}
        >
          {viewOnly ? "Leave" : "Leave Realm"}
        </button>
      </div>
    </div>
  );
}

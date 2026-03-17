import { useState } from "react";
import type { ClientProfile, RealmMode, RealmRole } from "../../types/session";
import { maxClientsForMode } from "../../types/session";
import type { ReactNode } from "react";

const ROLE_STYLES: Record<RealmRole, { bg: string; border: string; color: string }> = {
  host:  { bg: "rgba(255, 92, 117, 0.12)", border: "rgba(255, 92, 117, 0.3)", color: "#FF5C75" },
  guest: { bg: "rgba(51, 223, 255, 0.12)", border: "rgba(51, 223, 255, 0.3)", color: "#33DFFF" },
  admin: { bg: "rgba(250, 204, 21, 0.12)", border: "rgba(250, 204, 21, 0.3)", color: "#FACC15" },
};

interface Props {
  joinCode: string;
  mode: RealmMode;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  canStart: boolean;
  onStart: () => void;
  onLeave: () => void;
  onEnd?: () => void;
  role?: RealmRole;
  hostSecret?: string;
  minPlayers?: number;
  children?: ReactNode;
}

export function LobbyShell({ joinCode, mode, clients, clientProfiles, connected: _connected, canStart, onStart, onLeave, onEnd, role = "host", hostSecret, minPlayers, children }: Props) {
  const isGuest = role === "guest";
  const canControl = role === "host" || role === "admin";
  const rs = ROLE_STYLES[role];

  return (
    <div className="app lobby-app">
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>

      <div className="lobby-header">
        <div style={{
          display: "inline-block",
          padding: "0.3rem 1rem",
          borderRadius: "6px",
          background: rs.bg,
          border: `1px solid ${rs.border}`,
          color: rs.color,
          fontSize: "0.85rem",
          fontWeight: 600,
          letterSpacing: "0.05em",
          marginBottom: "0.5rem",
        }}>
          {role.toUpperCase()}
        </div>
        <p style={{ margin: 0 }}>Join Code</p>
        <p style={{ margin: 0 }}><strong style={{ fontSize: "2rem", letterSpacing: "0.15em" }}>{joinCode}</strong></p>
        {hostSecret && canControl && <HostKeyToggle hostSecret={hostSecret} />}
      </div>

      <div className="lobby-columns">
        <div className="lobby-col-settings">
          {canControl && children}
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
        {canControl && (
          <button
            onClick={onStart}
            disabled={!canStart}
            style={{ fontSize: "1.2rem", padding: "0.6rem 2rem", background: "#00D4FF", color: "#0f172a" }}
          >
            Start Realm
          </button>
        )}
        {canControl && onEnd && (
          <button
            onClick={onEnd}
            style={{
              fontSize: "1.2rem",
              padding: "0.6rem 2rem",
              background: "transparent",
              border: "1px solid rgba(255,61,90,0.4)",
              color: "#FF3D5A",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            End Realm
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
          {isGuest ? "Leave" : "Leave Realm"}
        </button>
      </div>
    </div>
  );
}

function HostKeyToggle({ hostSecret }: { hostSecret: string }) {
  const [show, setShow] = useState(false);
  return (
    <p style={{ margin: "0.25rem 0 0", color: "var(--text, #9ca3af)", fontSize: "0.75rem" }}>
      <button
        onClick={() => setShow(!show)}
        style={{
          background: "none",
          border: "none",
          color: "var(--text, #9ca3af)",
          fontSize: "0.75rem",
          cursor: "pointer",
          padding: 0,
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textUnderlineOffset: "2px",
        }}
      >
        {show ? "Hide Host Key" : "Show Host Key"}
      </button>
      {show && (
        <span style={{ marginLeft: "0.5rem", letterSpacing: "0.1em", color: "var(--text-h, #f3f4f6)", fontWeight: 600 }}>
          {hostSecret}
        </span>
      )}
    </p>
  );
}

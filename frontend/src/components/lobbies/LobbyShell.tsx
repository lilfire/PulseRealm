import React, { useState } from "react";
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
  onKick?: (clientId: string) => void;
  role?: RealmRole;
  hostSecret?: string;
  minPlayers?: number;
  children?: ReactNode;
}

export function LobbyShell({ joinCode, mode, clients, clientProfiles, canStart, onStart, onLeave, onEnd, onKick, role = "host", hostSecret, minPlayers, children }: Props) {
  const isGuest = role === "guest";
  const canControl = role === "host" || role === "admin";
  const rs = ROLE_STYLES[role];

  return (
    <div className="app lobby-app">
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>

      <div className="lobby-header">
        <p style={{ margin: "0 0 0.15rem", fontSize: "0.7rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>Join Code</p>
        <p style={{ margin: 0 }}><strong style={{ fontSize: "1.6rem", letterSpacing: "0.2em", lineHeight: 1 }}>{joinCode}</strong></p>
      </div>

      <div className="lobby-columns">
        <div className="lobby-col-settings">
          {canControl ? children : (
            <div style={{ pointerEvents: "none", opacity: 0.7 }}>{children}</div>
          )}
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
                  <li key={id} className="fg-row" style={{ padding: "0.4rem 0", display: "flex", alignItems: "center", "--fg": "0.5rem" } as React.CSSProperties}>
                    <span>
                      {profile?.name || id}
                      {profile?.heightCm ? ` — ${profile.heightCm} cm` : ""}
                    </span>
                    {canControl && onKick && (
                      <button
                        onClick={() => onKick(id)}
                        title="Kick player"
                        style={{
                          background: "none",
                          border: "1px solid rgba(255,61,90,0.3)",
                          color: "#FF3D5A",
                          borderRadius: "4px",
                          cursor: "pointer",
                          padding: "0.15rem 0.4rem",
                          fontSize: "0.7rem",
                          lineHeight: 1,
                        }}
                      >
                        Kick
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="lobby-footer">
        <div style={{
          position: "absolute",
          left: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}>
          <div style={{
            padding: "0.15rem 0.6rem",
            borderRadius: "4px",
            background: rs.bg,
            border: `1px solid ${rs.border}`,
            color: rs.color,
            fontSize: "0.6rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}>
            {role.toUpperCase()}
          </div>
          {hostSecret && canControl && <HostKeyToggle hostSecret={hostSecret} />}
        </div>
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
        {isGuest && (
          <button
            onClick={onLeave}
            style={{
              background: "#FF3D5A",
              color: "#fff",
              fontSize: "1.2rem",
              padding: "0.6rem 2rem",
            }}
          >
            Leave
          </button>
        )}
      </div>
    </div>
  );
}

function HostKeyToggle({ hostSecret }: { hostSecret: string }) {
  const [show, setShow] = useState(false);
  return (
    <p style={{ margin: "0.15rem 0 0", color: "var(--text, #9ca3af)", fontSize: "0.75rem" }}>
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

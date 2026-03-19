import React, { useEffect, useState } from "react";
import type { ClientProfile, RealmMode, RealmRole } from "../../types/session";
import { maxClientsForMode } from "../../types/session";
import type { ReactNode } from "react";

const ROLE_STYLES: Record<RealmRole, { bg: string; border: string; color: string }> = {
  host:  { bg: "rgba(255, 92, 117, 0.12)", border: "rgba(255, 92, 117, 0.3)", color: "#FF5C75" },
  guest: { bg: "rgba(51, 223, 255, 0.12)", border: "rgba(51, 223, 255, 0.3)", color: "#33DFFF" },
  admin: { bg: "rgba(250, 204, 21, 0.12)", border: "rgba(250, 204, 21, 0.3)", color: "#FACC15" },
};

const MULTI_CLIENT_MODES: RealmMode[] = ["competition", "dungeon", "social"];

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
  onRequestBind?: (clientId: string) => void;
  onCancelBind?: (clientId: string) => void;
  bindCode?: string | null;
  bindPending?: boolean;
  bindResult?: "approved" | "declined" | null;
  boundClientId?: string | null;
  clientBindings?: Record<string, boolean>;
}

export function LobbyShell({ joinCode, mode, clients, clientProfiles, canStart, onStart, onLeave, onEnd, onKick, role = "host", hostSecret, minPlayers, children, onRequestBind, onCancelBind, bindCode, bindPending, bindResult, boundClientId, clientBindings }: Props) {
  const isGuest = role === "guest";
  const canControl = role === "host" || role === "admin";
  const rs = ROLE_STYLES[role];
  const isMultiClient = MULTI_CLIENT_MODES.includes(mode);
  const [bindTargetId, setBindTargetId] = useState<string | null>(null);

  // Auto-bind for single-client modes (max 1 player)
  useEffect(() => {
    if (isMultiClient || !onRequestBind) return;
    if (clients.length !== 1) return;
    if (boundClientId || bindPending || clientBindings?.[clients[0]]) return;
    const clientId = clients[0];
    setBindTargetId(clientId);
    onRequestBind(clientId);
  }, [isMultiClient, clients, boundClientId, bindPending, clientBindings, onRequestBind]);

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
                const isBound = clientBindings?.[id];
                const isMine = boundClientId === id;
                const canBind = isMultiClient && !isBound && !boundClientId && onRequestBind;
                return (
                  <li
                    key={id}
                    className="fg-row"
                    style={{
                      padding: "0.4rem 0",
                      display: "flex",
                      alignItems: "center",
                      "--fg": "0.5rem",
                      cursor: canBind ? "pointer" : "default",
                    } as React.CSSProperties}
                    onClick={canBind ? () => { setBindTargetId(id); onRequestBind(id); } : undefined}
                  >
                    {isBound && (
                      <span title={isMine ? "Bound to you" : "Bound"} style={{
                        display: "inline-block",
                        width: 8, height: 8, borderRadius: "50%",
                        background: isMine ? "#33DFFF" : "#888",
                        flexShrink: 0,
                      }} />
                    )}
                    <span style={{ flex: 1 }}>
                      {profile?.name || id}
                      {profile?.heightCm ? ` — ${profile.heightCm} cm` : ""}
                    </span>
                    {canBind && (
                      <span style={{ fontSize: "0.65rem", color: "#888" }}>click to bind</span>
                    )}
                    {canControl && onKick && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onKick(id); }}
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
        <div className="fg-row" style={{
          position: "absolute",
          left: "1rem",
          display: "flex",
          alignItems: "center",
          "--fg": "0.75rem",
        } as React.CSSProperties}>
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
        {(isGuest || role === "admin") && (
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

      {/* Bind modal */}
      {bindCode && bindTargetId && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100,
        }} onClick={() => { setBindTargetId(null); onCancelBind?.(bindTargetId); }}>
          <div style={{
            background: "var(--code-bg, #1e1f26)",
            border: "1px solid var(--border, #333)",
            borderRadius: 12,
            padding: "2rem 3rem",
            textAlign: "center",
            minWidth: 280,
          }} onClick={(e) => e.stopPropagation()}>
            {bindResult === "approved" ? (
              <>
                <div style={{ fontSize: "1.2rem", color: "#22c55e", fontWeight: 700, marginBottom: 8 }}>Bound!</div>
                <div style={{ color: "var(--text)", fontSize: "0.85rem" }}>
                  You are now bound to {clientProfiles[bindTargetId]?.name || bindTargetId}
                </div>
              </>
            ) : bindResult === "declined" ? (
              <>
                <div style={{ fontSize: "1.2rem", color: "#FF5C75", fontWeight: 700, marginBottom: 8 }}>Declined</div>
                <div style={{ color: "var(--text)", fontSize: "0.85rem" }}>
                  {clientProfiles[bindTargetId]?.name || bindTargetId} declined the bind request.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: "0.75rem", color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Bind Code
                </div>
                <div style={{
                  fontSize: "3rem", fontWeight: 700, fontFamily: "var(--mono)",
                  letterSpacing: "0.3em", color: "var(--text-h)",
                  marginBottom: 12,
                }}>
                  {bindCode}
                </div>
                <div style={{ color: "var(--text)", fontSize: "0.85rem", marginBottom: 16 }}>
                  Confirm this code on {clientProfiles[bindTargetId]?.name || bindTargetId}'s watch
                </div>
                {bindPending && (
                  <div style={{ color: "#33DFFF", fontSize: "0.8rem" }}>Waiting for approval...</div>
                )}
                <button
                  onClick={() => { setBindTargetId(null); onCancelBind?.(bindTargetId); }}
                  style={{
                    marginTop: 12,
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "var(--text)",
                    borderRadius: 6,
                    padding: "0.4rem 1.2rem",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HostKeyToggle({ hostSecret }: { hostSecret: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ display: "flex", alignItems: "center", color: "var(--text, #9ca3af)", fontSize: "0.75rem" }}>
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
    </span>
  );
}

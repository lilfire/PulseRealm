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
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {clients.map((id) => {
                const profile = clientProfiles[id];
                const isBound = clientBindings?.[id];
                const isMine = boundClientId === id;
                const canBind = isMultiClient && !isBound && !boundClientId && onRequestBind;
                return (
                  <li
                    key={id}
                    style={{
                      padding: "0.6rem 0.75rem",
                      marginBottom: "0.4rem",
                      display: "flex",
                      alignItems: "center",
                      background: isMine
                        ? "rgba(51, 223, 255, 0.08)"
                        : isBound
                          ? "rgba(255, 255, 255, 0.03)"
                          : "rgba(255, 255, 255, 0.04)",
                      border: isMine
                        ? "1px solid rgba(51, 223, 255, 0.25)"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 8,
                      cursor: canBind ? "pointer" : "default",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={canBind ? (e) => {
                      e.currentTarget.style.background = "rgba(51, 223, 255, 0.1)";
                      e.currentTarget.style.borderColor = "rgba(51, 223, 255, 0.3)";
                    } : undefined}
                    onMouseLeave={canBind ? (e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                    } : undefined}
                    onClick={canBind ? () => { setBindTargetId(id); onRequestBind(id); } : undefined}
                  >
                    {/* Status indicator */}
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: isMine
                        ? "rgba(51, 223, 255, 0.15)"
                        : isBound
                          ? "rgba(136, 136, 136, 0.15)"
                          : "rgba(255, 255, 255, 0.06)",
                      flexShrink: 0,
                      marginRight: "0.6rem",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color: isMine ? "#33DFFF" : isBound ? "#888" : "#555",
                    }}>
                      {isMine ? "✓" : isBound ? "⊘" : "●"}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", lineHeight: 1.2 }}>
                        {profile?.name || id}
                      </div>
                      {profile?.heightCm && (
                        <div style={{ fontSize: "0.7rem", color: "#666", marginTop: 1 }}>{profile.heightCm} cm</div>
                      )}
                    </div>

                    {/* Bind status badge */}
                    {isMine && (
                      <span style={{
                        fontSize: "0.6rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "#33DFFF",
                        background: "rgba(51, 223, 255, 0.12)",
                        border: "1px solid rgba(51, 223, 255, 0.2)",
                        padding: "2px 8px",
                        borderRadius: 4,
                        marginRight: "0.4rem",
                      }}>Bound</span>
                    )}
                    {isBound && !isMine && (
                      <span style={{
                        fontSize: "0.6rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "#888",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        padding: "2px 8px",
                        borderRadius: 4,
                        marginRight: "0.4rem",
                      }}>Taken</span>
                    )}

                    {canBind && (
                      <span style={{
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        color: "#33DFFF",
                        background: "rgba(51, 223, 255, 0.1)",
                        border: "1px solid rgba(51, 223, 255, 0.2)",
                        padding: "3px 10px",
                        borderRadius: 4,
                        whiteSpace: "nowrap",
                      }}>Bind</span>
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
                          marginLeft: "0.4rem",
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
          background: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100,
        }} onClick={() => { setBindTargetId(null); onCancelBind?.(bindTargetId); }}>
          <div style={{
            background: "var(--code-bg, #1e1f26)",
            border: "1px solid var(--border, #333)",
            borderRadius: 16,
            padding: "2.5rem 3rem",
            textAlign: "center",
            minWidth: 320,
            maxWidth: 400,
            boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
          }} onClick={(e) => e.stopPropagation()}>
            {bindResult === "approved" ? (
              <>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "rgba(34, 197, 94, 0.15)",
                  border: "2px solid rgba(34, 197, 94, 0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: "1.5rem", color: "#22c55e",
                }}>✓</div>
                <div style={{ fontSize: "1.3rem", color: "#22c55e", fontWeight: 700, marginBottom: 8 }}>Bound!</div>
                <div style={{ color: "var(--text)", fontSize: "0.85rem" }}>
                  You are now bound to <strong>{clientProfiles[bindTargetId]?.name || bindTargetId}</strong>
                </div>
              </>
            ) : bindResult === "declined" ? (
              <>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "rgba(255, 92, 117, 0.15)",
                  border: "2px solid rgba(255, 92, 117, 0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: "1.5rem", color: "#FF5C75",
                }}>✕</div>
                <div style={{ fontSize: "1.3rem", color: "#FF5C75", fontWeight: 700, marginBottom: 8 }}>Declined</div>
                <div style={{ color: "var(--text)", fontSize: "0.85rem" }}>
                  <strong>{clientProfiles[bindTargetId]?.name || bindTargetId}</strong> declined the bind request.
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "rgba(51, 223, 255, 0.1)",
                  border: "2px solid rgba(51, 223, 255, 0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: "1.2rem", color: "#33DFFF",
                }}>⊙</div>
                <div style={{ fontSize: "0.7rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: 12 }}>
                  Bind Code
                </div>
                <div style={{
                  fontSize: "3rem", fontWeight: 700, fontFamily: "var(--mono)",
                  letterSpacing: "0.3em", color: "var(--text-h)",
                  marginBottom: 4,
                  background: "rgba(51, 223, 255, 0.05)",
                  border: "1px solid rgba(51, 223, 255, 0.1)",
                  borderRadius: 10,
                  padding: "0.3rem 1rem",
                  display: "inline-block",
                }}>
                  {bindCode}
                </div>
                <div style={{ color: "#aaa", fontSize: "0.8rem", marginTop: 16, marginBottom: 8 }}>
                  Confirm this code on <strong style={{ color: "var(--text-h)" }}>{clientProfiles[bindTargetId]?.name || bindTargetId}</strong>'s watch
                </div>
                {bindPending && (
                  <div style={{
                    color: "#33DFFF",
                    fontSize: "0.8rem",
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <span className="bind-pulse" style={{
                      display: "inline-block",
                      width: 8, height: 8, borderRadius: "50%",
                      background: "#33DFFF",
                      marginRight: 8,
                      animation: "pulse-glow 1.5s ease-in-out infinite",
                    }} />
                    Waiting for approval…
                  </div>
                )}
                <button
                  onClick={() => { setBindTargetId(null); onCancelBind?.(bindTargetId); }}
                  style={{
                    marginTop: 20,
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#aaa",
                    borderRadius: 8,
                    padding: "0.5rem 1.6rem",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "#aaa"; }}
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

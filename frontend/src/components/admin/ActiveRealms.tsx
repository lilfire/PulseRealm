import { useCallback, useEffect, useState } from "react";

interface RealmInfo {
  id: string;
  joinCode: string;
  hostSecret: string;
  mode: string;
  status: string;
  createdAt: string;
  connectedClients: number;
  maxClients: number;
}

interface Props {
  apiUrl: string;
  token: string;
  onLogout: () => void;
  onJoinRealm?: (realm: { id: string; joinCode: string; mode: string }) => void;
  onRealmCount?: (count: number) => void;
}

export function ActiveRealms({ apiUrl, token, onLogout, onJoinRealm, onRealmCount }: Props) {
  const [realms, setRealms] = useState<RealmInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState<string | null>(null);

  const fetchRealms = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/realms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      const data = await res.json();
      const arr: RealmInfo[] = Array.isArray(data) ? data : [];
      setRealms(arr);
      onRealmCount?.(arr.length);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token, onLogout, onRealmCount]);

  useEffect(() => {
    fetchRealms();
    const interval = setInterval(fetchRealms, 5000);
    return () => clearInterval(interval);
  }, [fetchRealms]);

  async function endRealm(realmId: string) {
    setEnding(realmId);
    try {
      const res = await fetch(`${apiUrl}/api/admin/realms/${realmId}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      await fetchRealms();
    } catch {
      /* ignore */
    } finally {
      setEnding(null);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--text)" }}>Loading...</p>;
  }

  if (realms.length === 0) {
    return <div className="admin-empty-state">No active realms</div>;
  }

  const isLobby = (s: string) => s === "Lobby";

  return (
    <div className="admin-realms-grid">
      {realms.map((r) => (
        <div key={r.id} className="admin-realm-card">
          <div className="admin-realm-top">
            <span className={`admin-status-dot ${isLobby(r.status) ? "admin-status-dot-lobby" : "admin-status-dot-active"}`} />
            <span className="admin-realm-mode">{r.mode}</span>
            <span className={`admin-realm-status ${isLobby(r.status) ? "admin-realm-status-lobby" : "admin-realm-status-active"}`}>
              {r.status}
            </span>
          </div>

          <div className="admin-realm-joincode">{r.joinCode}</div>

          <div className="admin-realm-connected">
            {r.connectedClients} / {r.maxClients} connected
          </div>

          <HostKeyReveal secret={r.hostSecret} />

          <div className="admin-realm-bottom">
            <div className="admin-realm-bottom-actions">
              {onJoinRealm && (
                <button
                  className="admin-btn-action"
                  onClick={() => onJoinRealm({ id: r.id, joinCode: r.joinCode, mode: r.mode })}
                >
                  Join
                </button>
              )}
              <button
                className="admin-btn-action-danger"
                onClick={() => endRealm(r.id)}
                disabled={ending === r.id}
                style={ending === r.id ? { opacity: 0.5, cursor: "default" } : undefined}
              >
                {ending === r.id ? "Ending..." : "End"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HostKeyReveal({ secret }: { secret: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ fontSize: "0.75rem", color: "var(--text, #9ca3af)" }}>
      <button
        onClick={() => setShow(!show)}
        style={{
          background: "none",
          border: "none",
          color: "var(--text, #9ca3af)",
          fontSize: "0.75rem",
          cursor: "pointer",
          padding: 0,
          margin: 0,
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textUnderlineOffset: "2px",
        }}
      >
        {show ? "Hide Host Key" : "Show Host Key"}
      </button>
      {show && (
        <strong style={{ marginLeft: "0.5rem", letterSpacing: "0.08em", color: "var(--text-h, #f3f4f6)" }}>
          {secret}
        </strong>
      )}
    </span>
  );
}

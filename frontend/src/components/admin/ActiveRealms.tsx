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
}

const actionBtnStyle: React.CSSProperties = {
  padding: "0.3rem 0.7rem",
  fontSize: "0.8rem",
  borderRadius: "6px",
  background: "transparent",
  border: "1px solid var(--border, #2e303a)",
  color: "var(--text, #9ca3af)",
  cursor: "pointer",
};

export function ActiveRealms({ apiUrl, token, onLogout, onJoinRealm }: Props) {
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
      setRealms(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token, onLogout]);

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
    return <p style={{ color: "var(--text)" }}>No active realms.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {realms.map((r) => (
        <div
          key={r.id}
          style={{
            background: "var(--code-bg, #1f2028)",
            border: "1px solid var(--border, #2e303a)",
            borderRadius: "8px",
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ color: "var(--text-h, #f3f4f6)", fontWeight: 600, fontSize: "1rem" }}>
              {r.mode}
            </span>
            <span style={{ color: "var(--text, #9ca3af)", fontSize: "0.8rem" }}>
              {r.connectedClients}/{r.maxClients} connected &middot;{" "}
              <span style={{ color: r.status === "Lobby" ? "var(--accent2, #33DFFF)" : "#22c55e" }}>
                {r.status}
              </span>
            </span>
            <HostKeyReveal secret={r.hostSecret} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: "1.4rem",
                fontWeight: 700,
                letterSpacing: "0.15em",
                color: "var(--accent2, #33DFFF)",
                background: "rgba(51, 223, 255, 0.08)",
                padding: "0.3rem 0.8rem",
                borderRadius: "6px",
              }}
            >
              {r.joinCode}
            </div>
            {onJoinRealm && (
              <button
                onClick={() => onJoinRealm({ id: r.id, joinCode: r.joinCode, mode: r.mode })}
                style={actionBtnStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#FACC15";
                  e.currentTarget.style.borderColor = "#FACC15";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text, #9ca3af)";
                  e.currentTarget.style.borderColor = "var(--border, #2e303a)";
                }}
              >
                Join
              </button>
            )}
            <button
              onClick={() => endRealm(r.id)}
              disabled={ending === r.id}
              style={{
                ...actionBtnStyle,
                cursor: ending === r.id ? "default" : "pointer",
                opacity: ending === r.id ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#f87171";
                e.currentTarget.style.borderColor = "#f87171";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text, #9ca3af)";
                e.currentTarget.style.borderColor = "var(--border, #2e303a)";
              }}
            >
              {ending === r.id ? "Ending..." : "End"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function HostKeyReveal({ secret }: { secret: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ color: "var(--text, #9ca3af)", fontSize: "0.75rem" }}>
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
        <strong style={{ marginLeft: "0.5rem", letterSpacing: "0.08em", color: "var(--text-h, #f3f4f6)" }}>
          {secret}
        </strong>
      )}
    </span>
  );
}

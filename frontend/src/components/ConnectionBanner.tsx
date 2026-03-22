import { useEffect, useState } from "react";
import type { ConnectionStatus } from "../hooks/useSessionHub";

interface Props {
  status: ConnectionStatus;
  onRetry?: () => void;
}

const SHOW_DELAY_MS = 2000;

export function ConnectionBanner({ status, onRetry }: Props) {
  const shouldShow = status === "reconnecting" || status === "disconnected";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShow) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shouldShow]);

  if (!visible) return null;

  const isReconnecting = status === "reconnecting";

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      padding: "8px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: isReconnecting ? "rgba(245, 158, 11, 0.95)" : "rgba(239, 68, 68, 0.95)",
      color: "#fff",
      fontSize: "0.9rem",
      fontWeight: 600,
      backdropFilter: "blur(4px)",
      animation: "banner-fade-in 0.3s ease-out",
    }}>
      {isReconnecting ? (
        <>
          <span style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#fff",
            marginRight: 8,
            animation: "pulse-dot 1.4s ease-in-out infinite",
          }} />
          Reconnecting to server...
        </>
      ) : (
        <>
          Connection lost.
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                marginLeft: 12,
                padding: "4px 12px",
                background: "rgba(255,255,255,0.25)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.5)",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              Retry
            </button>
          )}
        </>
      )}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes banner-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

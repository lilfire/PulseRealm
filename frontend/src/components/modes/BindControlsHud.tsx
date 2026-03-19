interface Props {
  boundClientId: string;
  clientInclines?: Record<string, number>;
  onSetIncline?: (clientId: string, percent: number) => void;
  clientSpeedOverrides?: Record<string, number>;
  onSetSpeedOverride?: (clientId: string, speedKmh: number) => void;
}

export function BindControlsHud({ boundClientId, clientInclines, onSetIncline, clientSpeedOverrides, onSetSpeedOverride }: Props) {
  if (!onSetIncline && !onSetSpeedOverride) return null;

  const incline = clientInclines?.[boundClientId] ?? 0;
  const overrideSpeed = clientSpeedOverrides?.[boundClientId] ?? 0;
  const hasOverride = overrideSpeed > 0;

  return (
    <div style={{
      position: "fixed", bottom: 16, right: 16,
      background: "rgba(15,23,42,0.92)",
      border: "1px solid var(--border)",
      borderRadius: 12, padding: "12px 16px",
      display: "flex", flexDirection: "column", gap: 10,
      backdropFilter: "blur(8px)",
      zIndex: 50,
      minWidth: 180,
    }}>
      <div style={{ fontSize: 11, color: "var(--text)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
        Controls
      </div>

      {onSetIncline && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, width: 52 }}>Incline</span>
          <button
            onClick={() => onSetIncline(boundClientId, Math.max(0, incline - 0.5))}
            style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)",
              borderRadius: 6, width: 32, height: 32, cursor: "pointer",
              color: "#f59e0b", fontSize: 20, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >−</button>
          <span style={{
            fontSize: 18, fontWeight: 700, fontFamily: "var(--mono)",
            color: "#f59e0b", minWidth: 52, textAlign: "center",
          }}>{incline.toFixed(1)}%</span>
          <button
            onClick={() => onSetIncline(boundClientId, Math.min(15, incline + 0.5))}
            style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)",
              borderRadius: 6, width: 32, height: 32, cursor: "pointer",
              color: "#f59e0b", fontSize: 20, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >+</button>
        </div>
      )}

      {onSetSpeedOverride && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => onSetSpeedOverride(boundClientId, hasOverride ? 0 : 5)}
            style={{
              background: hasOverride ? "rgba(51,223,255,0.15)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${hasOverride ? "#33DFFF" : "var(--border)"}`,
              borderRadius: 6, padding: "2px 8px", cursor: "pointer",
              color: hasOverride ? "#33DFFF" : "var(--text)",
              fontSize: 11, fontWeight: 600, width: 52, textAlign: "center",
            }}
          >{hasOverride ? "Override" : "Auto"}</button>
          {hasOverride ? (
            <>
              <button
                onClick={() => onSetSpeedOverride(boundClientId, Math.max(0.5, overrideSpeed - 0.5))}
                style={{
                  background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)",
                  borderRadius: 6, width: 32, height: 32, cursor: "pointer",
                  color: "#33DFFF", fontSize: 20, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >−</button>
              <span style={{
                fontSize: 18, fontWeight: 700, fontFamily: "var(--mono)",
                color: "#33DFFF", minWidth: 52, textAlign: "center",
              }}>{overrideSpeed.toFixed(1)}</span>
              <button
                onClick={() => onSetSpeedOverride(boundClientId, Math.min(30, overrideSpeed + 0.5))}
                style={{
                  background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)",
                  borderRadius: 6, width: 32, height: 32, cursor: "pointer",
                  color: "#33DFFF", fontSize: 20, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >+</button>
              <span style={{ fontSize: 12, color: "var(--text)" }}>km/h</span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text)" }}>Speed: auto</span>
          )}
        </div>
      )}
    </div>
  );
}

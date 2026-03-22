import type React from "react";

interface Props {
  boundClientId: string;
  clientInclines?: Record<string, number>;
  onSetIncline?: (clientId: string, percent: number) => void;
  clientSpeedOverrides?: Record<string, number>;
  onSetSpeedOverride?: (clientId: string, speedKmh: number) => void;
}

const btnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 6, width: 32, height: 32, cursor: "pointer",
  fontSize: 20, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0,
};

const valueStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)",
  width: 72, textAlign: "center", whiteSpace: "nowrap",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, width: 52,
};

export function BindControlsHud({ boundClientId, clientInclines, onSetIncline, clientSpeedOverrides, onSetSpeedOverride }: Props) {
  if (!onSetIncline && !onSetSpeedOverride) return null;

  const incline = clientInclines?.[boundClientId] ?? 0;
  const overrideSpeed = clientSpeedOverrides?.[boundClientId] ?? 0;
  const hasOverride = overrideSpeed > 0;

  return (
    <div className="fg-col" style={{
      background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 8, padding: "10px 14px",
      display: "flex", flexDirection: "column",
      "--fg": "8px",
      color: "#fff",
    } as React.CSSProperties}>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
        Controls
      </div>

      {onSetIncline && (
        <div className="fg-row" style={{ display: "flex", alignItems: "center", "--fg": "6px" } as React.CSSProperties}>
          <span style={{ ...labelStyle, color: "#f59e0b" }}>Incline</span>
          <button onClick={() => onSetIncline(boundClientId, Math.max(0, incline - 0.5))} style={{ ...btnStyle, color: "#f59e0b" }}>−</button>
          <span style={{ ...valueStyle, color: "#f59e0b" }}>{incline.toFixed(1)}%</span>
          <button onClick={() => onSetIncline(boundClientId, Math.min(15, incline + 0.5))} style={{ ...btnStyle, color: "#f59e0b" }}>+</button>
        </div>
      )}

      {onSetSpeedOverride && (
        <div className="fg-row" style={{ display: "flex", alignItems: "center", "--fg": "6px" } as React.CSSProperties}>
          <button
            onClick={() => onSetSpeedOverride(boundClientId, hasOverride ? 0 : 5)}
            style={{
              ...labelStyle,
              background: hasOverride ? "rgba(51,223,255,0.15)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${hasOverride ? "#33DFFF" : "rgba(255,255,255,0.15)"}`,
              borderRadius: 6, padding: "2px 0", cursor: "pointer",
              color: hasOverride ? "#33DFFF" : "#888",
              fontSize: 10, textAlign: "center", whiteSpace: "nowrap",
            }}
          >{hasOverride ? "Manual" : "Auto"}</button>
          <button
            onClick={() => hasOverride && onSetSpeedOverride(boundClientId, Math.max(0.5, overrideSpeed - 0.5))}
            style={{ ...btnStyle, color: "#33DFFF", opacity: hasOverride ? 1 : 0.3, cursor: hasOverride ? "pointer" : "default" }}
            disabled={!hasOverride}
          >−</button>
          <span style={{ ...valueStyle, color: hasOverride ? "#33DFFF" : "#555" }}>
            {hasOverride ? `${overrideSpeed.toFixed(1)} km/h` : "— km/h"}
          </span>
          <button
            onClick={() => hasOverride && onSetSpeedOverride(boundClientId, Math.min(30, overrideSpeed + 0.5))}
            style={{ ...btnStyle, color: "#33DFFF", opacity: hasOverride ? 1 : 0.3, cursor: hasOverride ? "pointer" : "default" }}
            disabled={!hasOverride}
          >+</button>
        </div>
      )}
    </div>
  );
}

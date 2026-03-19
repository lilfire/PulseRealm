import type { ClientProfile, WearableData } from "../../types/session";
import { getZoneForHr, getMaxHrForAge, ZONE_COLORS, formatPace } from "../../utils/wearable";

interface Props {
  name: string;
  latestData: WearableData | null;
  profile: ClientProfile | null;
  caloriesDisplay: number;
  totalDistanceDisplay: number | string;
}

const labelStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  fontWeight: 600,
};

const valueStyle: React.CSSProperties = {
  fontWeight: 700,
  fontFamily: "var(--mono)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

export function PlayerHud({ name, latestData, profile, caloriesDisplay, totalDistanceDisplay }: Props) {
  if (!latestData) {
    return (
      <>
        <div style={{ fontWeight: 600 }}>{name}</div>
        <div style={{ color: "#888", fontSize: "0.85rem" }}>No data yet</div>
      </>
    );
  }

  const maxHr = getMaxHrForAge(profile?.age);
  const zone = latestData.heartRate > 0 ? getZoneForHr(latestData.heartRate, maxHr) : null;
  const dist = typeof totalDistanceDisplay === "number"
    ? `${totalDistanceDisplay.toFixed(0)} m`
    : `${totalDistanceDisplay} m`;

  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{name}</div>

      <div style={rowStyle}>
        <span style={labelStyle}>Speed</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ ...valueStyle, fontSize: "1.4rem" }}>{latestData.speedKmh.toFixed(1)}</span>
          <span style={{ fontSize: "0.8rem", color: "#aaa" }}>km/h</span>
          <span style={{ fontSize: "0.75rem", color: "#666" }}>{formatPace(latestData.speedKmh)}</span>
        </div>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Heart Rate</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ ...valueStyle, fontSize: "1.1rem" }}>{latestData.heartRate}</span>
          <span style={{ fontSize: "0.8rem", color: "#aaa" }}>bpm</span>
          {zone && (
            <span style={{
              background: ZONE_COLORS[zone - 1],
              color: zone <= 2 ? "#111" : "#fff",
              fontSize: "0.65rem",
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: 3,
            }}>Z{zone}</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={rowStyle}>
          <span style={labelStyle}>Steps</span>
          <span style={{ ...valueStyle, fontSize: "0.95rem" }}>{latestData.steps}</span>
        </div>
        {caloriesDisplay > 0 && (
          <div style={rowStyle}>
            <span style={labelStyle}>Calories</span>
            <span style={{ ...valueStyle, fontSize: "0.95rem" }}>{caloriesDisplay} <span style={{ fontWeight: 400, color: "#aaa" }}>kcal</span></span>
          </div>
        )}
        <div style={rowStyle}>
          <span style={labelStyle}>Distance</span>
          <span style={{ ...valueStyle, fontSize: "0.95rem", color: "#aaa" }}>{dist}</span>
        </div>
      </div>
    </>
  );
}

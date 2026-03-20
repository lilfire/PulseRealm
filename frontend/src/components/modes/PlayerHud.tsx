import type { ClientProfile, WearableData } from "../../types/session";
import { getZoneForHr, getMaxHrForProfile, ZONE_COLORS, formatPace, STRIDE_FACTOR, getStrideFactor } from "../../utils/wearable";

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

  const maxHr = getMaxHrForProfile(profile);
  const zone = latestData.heartRate > 0 ? getZoneForHr(latestData.heartRate, maxHr, profile?.zoneBounds) : null;
  const dist = typeof totalDistanceDisplay === "number"
    ? `${totalDistanceDisplay.toFixed(0)} m`
    : `${totalDistanceDisplay} m`;

  const strideCm = profile?.heightCm
    ? profile.heightCm * getStrideFactor(profile) * 100
    : null;
  const isCalibrated = profile?.strideFactor != null && profile.strideFactor > 0
    && profile.strideFactor !== 0.415;
  const strideDiffCm = isCalibrated && profile?.heightCm
    ? strideCm! - profile.heightCm * STRIDE_FACTOR * 100
    : null;

  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{name}</div>

      <div style={{ ...rowStyle, marginBottom: 4 }}>
        <span style={labelStyle}>Speed</span>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ ...valueStyle, fontSize: "1.4rem" }}>{latestData.speedKmh.toFixed(1)}</span>
          <span style={{ fontSize: "0.8rem", color: "#aaa", marginLeft: 6 }}>km/h</span>
          <span style={{ fontSize: "0.75rem", color: "#666", marginLeft: 6 }}>{formatPace(latestData.speedKmh)}</span>
        </div>
      </div>

      <div style={{ ...rowStyle, marginBottom: 4 }}>
        <span style={labelStyle}>Heart Rate</span>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ ...valueStyle, fontSize: "1.1rem" }}>{latestData.heartRate}</span>
          <span style={{ fontSize: "0.8rem", color: "#aaa", marginLeft: 6 }}>bpm</span>
          {zone && (
            <span style={{
              background: ZONE_COLORS[zone - 1],
              color: zone <= 2 ? "#111" : "#fff",
              fontSize: "0.65rem",
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: 3,
              marginLeft: 6,
            }}>Z{zone}</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex" }}>
        <div style={{ ...rowStyle, marginRight: "1rem" }}>
          <span style={labelStyle}>Steps</span>
          <span style={{ ...valueStyle, fontSize: "0.95rem" }}>{latestData.steps}</span>
        </div>
        {caloriesDisplay > 0 && (
          <div style={{ ...rowStyle, marginRight: "1rem" }}>
            <span style={labelStyle}>Calories</span>
            <span style={{ ...valueStyle, fontSize: "0.95rem" }}>{caloriesDisplay} <span style={{ fontWeight: 400, color: "#aaa" }}>kcal</span></span>
          </div>
        )}
        <div style={{ ...rowStyle, marginRight: "1rem" }}>
          <span style={labelStyle}>Distance</span>
          <span style={{ ...valueStyle, fontSize: "0.95rem", color: "#aaa" }}>{dist}</span>
        </div>
        {strideCm != null && (
          <div style={rowStyle}>
            <span style={labelStyle}>Stride</span>
            <span style={{ ...valueStyle, fontSize: "0.95rem" }}>
              {strideCm.toFixed(0)} <span style={{ fontWeight: 400, color: "#aaa" }}>cm</span>
              {strideDiffCm != null && (
                <span style={{ fontSize: "0.75rem", color: strideDiffCm >= 0 ? "#33DFFF" : "#FF5C75", marginLeft: 4 }}>
                  {strideDiffCm >= 0 ? "+" : ""}{strideDiffCm.toFixed(1)}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

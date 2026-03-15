import type { SessionSummary } from "../hooks/useSessionHub";

interface Props {
  summary: SessionSummary;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function SessionSummaryScreen({ summary, onClose }: Props) {
  const distance = summary.totalDistanceMeters >= 1000
    ? `${(summary.totalDistanceMeters / 1000).toFixed(2)} km`
    : `${Math.round(summary.totalDistanceMeters)} m`;

  return (
    <div className="app" style={{ textAlign: "center" }}>
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>
      <h1 className="brand-title">Session Complete</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
          maxWidth: "400px",
          margin: "2rem auto",
        }}
      >
        <StatCard label="Duration" value={formatDuration(summary.durationSeconds)} />
        <StatCard label="Distance" value={distance} />
        <StatCard label="Steps" value={summary.totalSteps.toLocaleString()} />
        <StatCard label="Avg Speed" value={`${summary.averageSpeedKmh.toFixed(1)} km/h`} />
        <StatCard label="Avg Heart Rate" value={summary.averageHeartRate > 0 ? `${summary.averageHeartRate} bpm` : "—"} />
        <StatCard label="Max Heart Rate" value={summary.maxHeartRate > 0 ? `${summary.maxHeartRate} bpm` : "—"} />
      </div>

      <button onClick={onClose} style={{ marginTop: "1rem" }}>
        Back to Home
      </button>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(0,212,255,0.2)",
        borderRadius: "10px",
        padding: "1rem",
      }}
    >
      <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "0.3rem" }}>{label}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

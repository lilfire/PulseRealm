import type { RealmSummary } from "../hooks/useSessionHub";

interface Props {
  summary: RealmSummary;
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

function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(2)} km`
    : `${Math.round(meters)} m`;
}

export function RealmSummaryScreen({ summary, onClose }: Props) {
  const isGroup = summary.clientSummaries && summary.clientSummaries.length > 0;
  const prefix = isGroup ? "Team " : "";

  return (
    <div className="app" style={{ textAlign: "center" }}>
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>
      <h1 className="brand-title">Realm Complete</h1>

      {/* ── Group / overall stats ─────────────────────────────── */}
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
        <StatCard label={`${prefix}Distance`} value={formatDistance(summary.totalDistanceMeters)} />
        <StatCard label={`${prefix}Steps`} value={summary.totalSteps.toLocaleString()} />
        <StatCard label="Avg Speed" value={`${summary.averageSpeedKmh.toFixed(1)} km/h`} />
        <StatCard label={`${prefix}Avg HR`} value={summary.averageHeartRate > 0 ? `${summary.averageHeartRate} bpm` : "—"} />
        <StatCard label={`${prefix}Max HR`} value={summary.maxHeartRate > 0 ? `${summary.maxHeartRate} bpm` : "—"} />
      </div>

      {/* ── Per-runner breakdown (social mode) ────────────────── */}
      {isGroup && (
        <>
          <h2 style={{ marginTop: "2rem", marginBottom: "1rem" }}>Individual</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(summary.clientSummaries!.length, 4)}, 1fr)`,
              gap: "1rem",
              maxWidth: "800px",
              margin: "0 auto",
              padding: "0 1rem",
            }}
          >
            {summary.clientSummaries!.map((cs) => (
              <div
                key={cs.name}
                style={{
                  background: "var(--code-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-h)", marginBottom: 10 }}>
                  {cs.name}
                </div>
                <MiniStat label="Steps" value={cs.steps.toLocaleString()} />
                <MiniStat label="Distance" value={formatDistance(cs.distanceMeters)} />
                <MiniStat label="Avg HR" value={cs.averageHeartRate > 0 ? `${cs.averageHeartRate} bpm` : "—"} />
                <MiniStat label="Max HR" value={cs.maxHeartRate > 0 ? `${cs.maxHeartRate} bpm` : "—"} />
              </div>
            ))}
          </div>
        </>
      )}

      <button onClick={onClose} style={{ marginTop: "2rem" }}>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ fontSize: "0.8rem", color: "var(--text)" }}>{label}</span>
      <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-h)", fontFamily: "var(--mono)" }}>{value}</span>
    </div>
  );
}

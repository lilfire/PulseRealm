import type { ClientSummary, RealmSummary } from "../hooks/useSessionHub";
import type { ClientProfile } from "../types/session";

interface Props {
  summary: RealmSummary;
  clientProfiles: Record<string, ClientProfile>;
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

function formatZoneTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

const ZONE_COLORS = ["#2dd4bf", "#22c55e", "#f59e0b", "#f87171", "#ef4444"];

export function RealmSummaryScreen({ summary, clientProfiles, onClose }: Props) {
  const hasClients = summary.clientSummaries && summary.clientSummaries.length > 0;
  const isTeam = summary.isTeamFormat && hasClients;
  const clientNames = Object.values(clientProfiles).map((p) => p.name).filter(Boolean);

  return (
    <div style={{
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
      color: "var(--text-h)",
      padding: "1.5rem 2.5rem",
      boxSizing: "border-box",
    }}>
      {/* Header row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "1rem",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <img src="/logo.png" alt="PulseRealm" style={{ height: 36 }} />
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>Realm Complete</h1>
          {clientNames.length > 0 && (
            <span style={{ fontSize: "0.9rem", color: "var(--text)", marginLeft: "0.5rem" }}>
              {clientNames.join(", ")}
            </span>
          )}
        </div>
        <button onClick={onClose} style={{ flexShrink: 0 }}>Back to Home</button>
      </div>

      {/* Realm stats bar */}
      <div style={{
        display: "flex",
        gap: "1rem",
        marginBottom: "1rem",
        flexShrink: 0,
      }}>
        <StatCard label="Duration" value={formatDuration(summary.durationSeconds)} />
        <StatCard label="Active Time" value={formatDuration(summary.activePeriodSeconds ?? 0)} />
        <StatCard label="Participants" value={`${summary.participantCount ?? 0}`} />
      </div>

      {/* Main content area – fills remaining space */}
      <div style={{ flex: 1, minHeight: 0 }}>

        {/* ── Per-Team Stats (competition team format) ──────────── */}
        {isTeam && <TeamSection summary={summary} />}

        {/* ── Individual Stats (non-team, multi-client) ────────── */}
        {!isTeam && hasClients && (
          <div style={{ height: "100%" }}>
            <SectionTitle title="Individual" />
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${summary.clientSummaries?.length ?? 0}, 1fr)`,
              gap: "1rem",
              height: "calc(100% - 2rem)",
            }}>
              {summary.clientSummaries?.map((cs) => (
                <ClientCard key={cs.clientId || cs.name} cs={cs} />
              ))}
            </div>
          </div>
        )}

        {/* ── Solo Stats (no clients) ──────────────────────────── */}
        {!hasClients && <SoloSection summary={summary} />}
      </div>
    </div>
  );
}

function TeamSection({ summary }: { summary: RealmSummary }) {
  const teamMap = new Map<string, { color: string; clients: ClientSummary[] }>();
  for (const cs of summary.clientSummaries ?? []) {
    const tName = cs.teamName ?? "Unknown";
    if (!teamMap.has(tName)) teamMap.set(tName, { color: cs.teamColor ?? "var(--accent2)", clients: [] });
    teamMap.get(tName)!.clients.push(cs);
  }
  const teams = Array.from(teamMap.entries());

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${teams.length}, 1fr)`,
      gap: "1.5rem",
      height: "100%",
    }}>
      {teams.map(([teamName, team]) => {
        const teamDist = team.clients.reduce((s, c) => s + c.distanceMeters, 0);
        const teamSteps = team.clients.reduce((s, c) => s + c.steps, 0);
        const hrsWithData = team.clients.filter((c) => c.averageHeartRate > 0);
        const teamAvgHr = hrsWithData.length > 0 ? Math.round(hrsWithData.reduce((s, c) => s + c.averageHeartRate, 0) / hrsWithData.length) : 0;
        const teamMaxHr = Math.max(...team.clients.map((c) => c.maxHeartRate));

        return (
          <div key={teamName} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <h2 style={{
              margin: "0 0 0.5rem",
              fontSize: "0.85rem", fontWeight: 600,
              textTransform: "uppercase", letterSpacing: 1.5,
              color: team.color,
              flexShrink: 0,
            }}>
              {teamName}
            </h2>

            {/* Team aggregate row */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: "0.5rem", marginBottom: "0.75rem", flexShrink: 0,
            }}>
              <StatCard label="Distance" value={formatDistance(teamDist)} compact />
              <StatCard label="Steps" value={teamSteps.toLocaleString()} compact />
              <StatCard label="Avg HR" value={teamAvgHr > 0 ? `${teamAvgHr} bpm` : "—"} compact />
              <StatCard label="Peak HR" value={teamMaxHr > 0 ? `${teamMaxHr} bpm` : "—"} compact />
            </div>

            {/* Per-member cards fill remaining space */}
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(team.clients.length, 3)}, 1fr)`,
              gap: "0.75rem",
              flex: 1,
              minHeight: 0,
            }}>
              {team.clients.map((cs) => (
                <ClientCard key={cs.clientId || cs.name} cs={cs} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SoloSection({ summary }: { summary: RealmSummary }) {
  const hasZones = summary.timeInZone && Object.keys(summary.timeInZone).length > 0;
  const activeZones = hasZones ? [1, 2, 3, 4, 5].filter((z) => (summary.timeInZone[z] ?? 0) > 0) : [];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: hasZones ? "1fr 1fr 1fr 1fr 1fr 1fr 2fr" : "repeat(6, 1fr)",
      gap: "1rem",
      height: "100%",
      alignItems: "stretch",
    }}>
      <StatCard label="Distance" value={formatDistance(summary.totalDistanceMeters)} tall />
      <StatCard label="Steps" value={summary.totalSteps.toLocaleString()} tall />
      <StatCard label="Avg HR" value={summary.averageHeartRate > 0 ? `${summary.averageHeartRate} bpm` : "—"} tall />
      <StatCard label="Peak HR" value={summary.maxHeartRate > 0 ? `${summary.maxHeartRate} bpm` : "—"} tall />
      <StatCard label="Avg Cadence" value={summary.avgCadenceSpm > 0 ? `${summary.avgCadenceSpm} spm` : "—"} tall />
      <StatCard label="Avg Speed" value={`${(summary.averageSpeedKmh ?? 0).toFixed(1)} km/h`} tall />
      {activeZones.length > 0 && (
        <div style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(0,212,255,0.2)",
          borderRadius: 10,
          padding: "1rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}>
          <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: 8 }}>Zone Breakdown</div>
          {activeZones.map((z) => (
            <div key={z} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ fontSize: "0.85rem", color: ZONE_COLORS[z - 1], fontWeight: 600 }}>
                Zone {z}
              </span>
              <span style={{ fontSize: "0.95rem", fontFamily: "var(--mono)", fontWeight: 600, color: "var(--text-h)" }}>
                {formatZoneTime(summary.timeInZone[z])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientCard({ cs }: { cs: ClientSummary }) {
  const hasZones = cs.timeInZone && Object.keys(cs.timeInZone).length > 0;
  const activeZones = hasZones ? [1, 2, 3, 4, 5].filter((z) => (cs.timeInZone[z] ?? 0) > 0) : [];

  return (
    <div style={{
      background: "var(--code-bg)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "0.75rem 1rem",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-h)", marginBottom: 6, flexShrink: 0 }}>
        {cs.name}
      </div>
      <MiniStat label="Distance" value={formatDistance(cs.distanceMeters)} />
      <MiniStat label="Steps" value={cs.steps.toLocaleString()} />
      <MiniStat label="Avg HR" value={cs.averageHeartRate > 0 ? `${cs.averageHeartRate} bpm` : "—"} />
      <MiniStat label="Peak HR" value={cs.maxHeartRate > 0 ? `${cs.maxHeartRate} bpm` : "—"} />
      <MiniStat label="Cadence" value={cs.avgCadenceSpm > 0 ? `${cs.avgCadenceSpm} spm` : "—"} />
      {activeZones.length > 0 && (
        <div style={{ marginTop: "auto", paddingTop: 6 }}>
          <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: 2 }}>Zones</div>
          {activeZones.map((z) => (
            <div key={z} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span style={{ fontSize: "0.75rem", color: ZONE_COLORS[z - 1], fontWeight: 600 }}>
                Zone {z}
              </span>
              <span style={{ fontSize: "0.8rem", fontFamily: "var(--mono)", color: "var(--text-h)" }}>
                {formatZoneTime(cs.timeInZone[z])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 style={{
      margin: "0 0 0.5rem",
      fontSize: "0.85rem", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: 1.5,
      color: "var(--accent2, #33DFFF)",
    }}>
      {title}
    </h2>
  );
}

function StatCard({ label, value, compact, tall }: { label: string; value: string; compact?: boolean; tall?: boolean }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(0,212,255,0.2)",
      borderRadius: 10,
      padding: compact ? "0.5rem 0.75rem" : "1rem",
      display: "flex",
      flexDirection: "column",
      justifyContent: tall ? "center" : undefined,
    }}>
      <div style={{ fontSize: compact ? "0.7rem" : "0.8rem", color: "#888", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: compact ? "1.1rem" : "1.4rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
      <span style={{ fontSize: "0.78rem", color: "var(--text)" }}>{label}</span>
      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-h)", fontFamily: "var(--mono)" }}>{value}</span>
    </div>
  );
}

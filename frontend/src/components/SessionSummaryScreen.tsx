import React from "react";
import type { ClientSummary, RealmSummary } from "../hooks/useSessionHub";
import type { ClientProfile } from "../types/session";
import { formatPace } from "../utils/wearable";

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
const ZONE_LABELS = ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5"];

export function RealmSummaryScreen({ summary, clientProfiles, onClose }: Props) {
  const hasClients = summary.clientSummaries && summary.clientSummaries.length > 0;
  const clientCount = summary.clientSummaries?.length ?? 0;
  const isTeam = summary.isTeamFormat && hasClients;
  const clientNames = Object.values(clientProfiles).map((p) => p.name).filter(Boolean);

  return (
    <div className="realm-summary" style={{
      minHeight: "100vh",
      width: "100%",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
      color: "var(--text-h)",
      padding: "0.75rem 2rem",
      boxSizing: "border-box",
    }}>
      {/* Header row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "0.5rem",
        flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <div className="fg-row" style={{ display: "flex", alignItems: "center", "--fg": "1rem" } as React.CSSProperties}>
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
      <div className="fg-wrap" style={{
        display: "flex",
        marginBottom: "0.5rem",
        flexShrink: 0,
        flexWrap: "wrap",
        "--fg": "1rem",
      } as React.CSSProperties}>
        <StatCard label="Duration" value={formatDuration(summary.durationSeconds)} />
        <StatCard label="Active Time" value={formatDuration(summary.activePeriodSeconds ?? 0)} />
        <StatCard label="Participants" value={`${summary.participantCount ?? 0}`} />
      </div>

      {/* Main content area – fills remaining space */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

        {/* ── Per-Team Stats (competition team format) ──────────── */}
        {isTeam && <TeamSection summary={summary} />}

        {/* ── Individual Stats (non-team, multi-client) ────────── */}
        {!isTeam && hasClients && (
          <IndividualSection summary={summary} clientCount={clientCount} />
        )}

        {/* ── Solo Stats (no clients) ──────────────────────────── */}
        {!hasClients && <SoloSection summary={summary} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZONE BAR — horizontal stacked bar showing zone time distribution
   ═══════════════════════════════════════════════════════════════════════════ */

function ZoneBar({ timeInZone, height = 28 }: { timeInZone: Record<string, number>; height?: number }) {
  const zones = [1, 2, 3, 4, 5];
  const total = zones.reduce((sum, z) => sum + (timeInZone[z] ?? 0), 0);
  if (total === 0) return null;

  return (
    <div style={{
      display: "flex",
      borderRadius: 6,
      overflow: "hidden",
      height,
      width: "100%",
      background: "rgba(255,255,255,0.03)",
    }}>
      {zones.map((z) => {
        const secs = timeInZone[z] ?? 0;
        if (secs === 0) return null;
        const pct = (secs / total) * 100;
        return (
          <div
            key={z}
            title={`Zone ${z}: ${formatZoneTime(secs)}`}
            style={{
              width: `${pct}%`,
              background: ZONE_COLORS[z - 1],
              minWidth: pct > 0 ? 4 : 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.65rem",
              fontWeight: 700,
              color: z <= 2 ? "#111" : "#fff",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {pct >= 12 ? `Z${z}` : ""}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPARISON BARS — horizontal bars comparing clients on a metric
   ═══════════════════════════════════════════════════════════════════════════ */

function ComparisonBars({ clients, metric, label, formatter }: {
  clients: ClientSummary[];
  metric: keyof Pick<ClientSummary, "steps" | "distanceMeters" | "averageHeartRate" | "maxHeartRate" | "avgCadenceSpm" | "averageSpeedKmh" | "peakSpeedKmh">;
  label: string;
  formatter: (v: number) => string;
}) {
  const maxVal = Math.max(...clients.map((c) => c[metric] as number), 1);

  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(0,212,255,0.2)",
      borderRadius: 10,
      padding: "0.75rem 1rem",
    }}>
      <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </div>
      {clients.map((c) => {
        const val = c[metric] as number;
        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
        return (
          <div key={c.clientId || c.name} className="fg-row" style={{ display: "flex", alignItems: "center", marginBottom: 4, "--fg": "8px" } as React.CSSProperties}>
            <span style={{ fontSize: "0.75rem", color: "var(--text)", minWidth: 70, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.name}
            </span>
            <div style={{ flex: 1, height: 16, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                width: `${pct}%`,
                height: "100%",
                background: "linear-gradient(90deg, rgba(0,212,255,0.6), rgba(0,212,255,0.3))",
                borderRadius: 4,
                minWidth: val > 0 ? 4 : 0,
                transition: "width 0.3s ease",
              }} />
            </div>
            <span style={{ fontSize: "0.75rem", fontFamily: "var(--mono)", color: "var(--text-h)", minWidth: 60, fontWeight: 600 }}>
              {formatter(val)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOLO SECTION — compact centered layout
   ═══════════════════════════════════════════════════════════════════════════ */

function SoloSection({ summary }: { summary: RealmSummary }) {
  const hasZones = summary.timeInZone && Object.keys(summary.timeInZone).length > 0;
  const activeZones = hasZones ? [1, 2, 3, 4, 5].filter((z) => (summary.timeInZone[z] ?? 0) > 0) : [];
  const totalZoneTime = activeZones.reduce((sum, z) => sum + (summary.timeInZone[z] ?? 0), 0);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
    }}>
      <div className="fg-wrap" style={{
        display: "flex",
        maxWidth: 900,
        width: "100%",
        flexWrap: "wrap",
        "--fg": "1.5rem",
      } as React.CSSProperties}>
        {/* Left: stat grid + zone bar */}
        <div className="fg-col" style={{ flex: 3, display: "flex", flexDirection: "column", "--fg": "1rem" } as React.CSSProperties}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.75rem",
          }}>
            <StatCard label="Distance" value={formatDistance(summary.totalDistanceMeters)} />
            <StatCard label="Steps" value={summary.totalSteps.toLocaleString()} />
            <StatCard label="Avg HR" value={summary.averageHeartRate > 0 ? `${summary.averageHeartRate} bpm` : "—"} />
            <StatCard label="Peak HR" value={summary.maxHeartRate > 0 ? `${summary.maxHeartRate} bpm` : "—"} />
            <StatCard label="Calories" value={summary.caloriesBurned > 0 ? `${summary.caloriesBurned} kcal` : "—"} />
            <StatCard label="Avg Cadence" value={summary.avgCadenceSpm > 0 ? `${summary.avgCadenceSpm} spm` : "—"} />
            <StatCard label="Avg Speed" value={`${(summary.averageSpeedKmh ?? 0).toFixed(1)} km/h`} />
            <StatCard label="Avg Pace" value={formatPace(summary.averageSpeedKmh ?? 0)} />
            <StatCard label="Peak Speed" value={summary.peakSpeedKmh > 0 ? `${summary.peakSpeedKmh.toFixed(1)} km/h` : "—"} />
          </div>
          {activeZones.length > 0 && (
            <ZoneBar timeInZone={summary.timeInZone} height={32} />
          )}
        </div>

        {/* Right: zone breakdown list */}
        {activeZones.length > 0 && (
          <div style={{
            flex: 2,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(0,212,255,0.2)",
            borderRadius: 10,
            padding: "1rem 1.25rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}>
            <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: 8 }}>Zone Breakdown</div>
            {activeZones.map((z) => {
              const pct = totalZoneTime > 0 ? Math.round((summary.timeInZone[z] / totalZoneTime) * 100) : 0;
              return (
                <div key={z} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ fontSize: "0.85rem", color: ZONE_COLORS[z - 1], fontWeight: 600 }}>
                    {ZONE_LABELS[z - 1]}
                  </span>
                  <span style={{ fontSize: "0.95rem", fontFamily: "var(--mono)", fontWeight: 600, color: "var(--text-h)" }}>
                    {formatZoneTime(summary.timeInZone[z])} <span style={{ fontSize: "0.75rem", color: "#888" }}>({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   INDIVIDUAL SECTION — adaptive based on client count
   ═══════════════════════════════════════════════════════════════════════════ */

function IndividualSection({ summary, clientCount }: { summary: RealmSummary; clientCount: number }) {
  const clients = summary.clientSummaries ?? [];

  // 7+ clients: compact table view
  if (clientCount >= 7) {
    return <CompactTableView summary={summary} clients={clients} />;
  }

  // 4-6 clients: grid with capped columns, compact cards (zone bar but no zone list)
  if (clientCount >= 4) {
    return <MediumClientView summary={summary} clients={clients} />;
  }

  // 1-3 clients: full cards with zone details + comparison bars
  return <FewClientView summary={summary} clients={clients} />;
}

/* ── Few clients (1–3): rich cards + comparison bars ─────────────────────── */

function FewClientView({ summary, clients }: { summary: RealmSummary; clients: ClientSummary[] }) {
  const hasZones = summary.timeInZone && Object.keys(summary.timeInZone).length > 0;
  const activeZones = hasZones ? [1, 2, 3, 4, 5].filter((z) => (summary.timeInZone[z] ?? 0) > 0) : [];

  return (
    <div className="fg-col" style={{ display: "flex", flexDirection: "column", height: "100%", "--fg": "0.75rem" } as React.CSSProperties}>
      <SectionTitle title="Individual" />
      {/* Realm-level zone bar */}
      {activeZones.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            Overall Zone Distribution
          </div>
          <ZoneBar timeInZone={summary.timeInZone} height={24} />
        </div>
      )}

      {/* Comparison bars (only if 2+ clients) */}
      {clients.length >= 2 && (
        <div className="fg-wrap" style={{ display: "flex", flexShrink: 0, flexWrap: "wrap", "--fg": "0.75rem" } as React.CSSProperties}>
          <div style={{ flex: 1 }}>
            <ComparisonBars clients={clients} metric="distanceMeters" label="Distance" formatter={formatDistance} />
          </div>
          <div style={{ flex: 1 }}>
            <ComparisonBars clients={clients} metric="steps" label="Steps" formatter={(v) => v.toLocaleString()} />
          </div>
          <div style={{ flex: 1 }}>
            <ComparisonBars clients={clients} metric="averageSpeedKmh" label="Avg Speed" formatter={(v) => `${v.toFixed(1)} km/h`} />
          </div>
        </div>
      )}

      {/* Client cards */}
      <div className="summary-clients" style={{
        display: "grid",
        gridTemplateColumns: `repeat(${clients.length}, 1fr)`,
        gap: "0.75rem",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}>
        {clients.map((cs) => (
          <ClientCard key={cs.clientId || cs.name} cs={cs} showZones />
        ))}
      </div>
    </div>
  );
}

/* ── Medium clients (4–6): compact grid, zone bars but no zone lists ───── */

function MediumClientView({ summary, clients }: { summary: RealmSummary; clients: ClientSummary[] }) {
  const hasZones = summary.timeInZone && Object.keys(summary.timeInZone).length > 0;
  const activeZones = hasZones ? [1, 2, 3, 4, 5].filter((z) => (summary.timeInZone[z] ?? 0) > 0) : [];
  const cols = Math.min(clients.length, 3);

  return (
    <div className="fg-col" style={{ display: "flex", flexDirection: "column", height: "100%", "--fg": "0.75rem" } as React.CSSProperties}>
      {/* Realm-level zone bar */}
      {activeZones.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            Overall Zone Distribution
          </div>
          <ZoneBar timeInZone={summary.timeInZone} height={24} />
        </div>
      )}

      {/* Client cards grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: "0.75rem",
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
      }}>
        {clients.map((cs) => (
          <ClientCard key={cs.clientId || cs.name} cs={cs} showZones={false} showZoneBar />
        ))}
      </div>
    </div>
  );
}

/* ── Many clients (7+): compact table ────────────────────────────────────── */

function CompactTableView({ summary, clients }: { summary: RealmSummary; clients: ClientSummary[] }) {
  const hasZones = summary.timeInZone && Object.keys(summary.timeInZone).length > 0;
  const activeZones = hasZones ? [1, 2, 3, 4, 5].filter((z) => (summary.timeInZone[z] ?? 0) > 0) : [];

  return (
    <div className="fg-col" style={{ display: "flex", flexDirection: "column", height: "100%", "--fg": "0.75rem" } as React.CSSProperties}>
      {/* Realm-level zone bar */}
      {activeZones.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            Overall Zone Distribution
          </div>
          <ZoneBar timeInZone={summary.timeInZone} height={24} />
        </div>
      )}

      {/* Table */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "auto",
        background: "rgba(255,255,255,0.02)",
        borderRadius: 10,
        border: "1px solid var(--border)",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--code-bg)" }}>
              {["Name", "Distance", "Steps", "Avg HR", "Peak HR", "Calories", "Cadence", "Avg Speed", "Peak Speed"].map((h) => (
                <th key={h} style={{
                  padding: "0.6rem 0.75rem",
                  textAlign: "left",
                  fontSize: "0.75rem",
                  color: "#888",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((cs) => (
              <tr key={cs.clientId || cs.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "var(--text-h)" }}>{cs.name}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--mono)", color: "var(--text-h)" }}>{formatDistance(cs.distanceMeters)}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--mono)", color: "var(--text-h)" }}>{cs.steps.toLocaleString()}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--mono)", color: "var(--text-h)" }}>{cs.averageHeartRate > 0 ? `${cs.averageHeartRate}` : "—"}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--mono)", color: "var(--text-h)" }}>{cs.maxHeartRate > 0 ? `${cs.maxHeartRate}` : "—"}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--mono)", color: "var(--text-h)" }}>{cs.caloriesBurned > 0 ? `${cs.caloriesBurned}` : "—"}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--mono)", color: "var(--text-h)" }}>{cs.avgCadenceSpm > 0 ? `${cs.avgCadenceSpm}` : "—"}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--mono)", color: "var(--text-h)" }}>{cs.averageSpeedKmh > 0 ? `${cs.averageSpeedKmh.toFixed(1)}` : "—"}</td>
                <td style={{ padding: "0.5rem 0.75rem", fontFamily: "var(--mono)", color: "var(--text-h)" }}>{cs.peakSpeedKmh > 0 ? `${cs.peakSpeedKmh.toFixed(1)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TEAM SECTION
   ═══════════════════════════════════════════════════════════════════════════ */

function TeamSection({ summary }: { summary: RealmSummary }) {
  const teamMap = new Map<string, { color: string; clients: ClientSummary[] }>();
  for (const cs of summary.clientSummaries ?? []) {
    const tName = cs.teamName ?? "Unknown";
    if (!teamMap.has(tName)) teamMap.set(tName, { color: cs.teamColor ?? "var(--accent2)", clients: [] });
    teamMap.get(tName)!.clients.push(cs);
  }
  const teams = Array.from(teamMap.entries());
  const cols = Math.min(teams.length, 3);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: "1rem",
      height: "100%",
      overflowY: "auto",
    }}>
      {teams.map(([teamName, team]) => {
        const teamDist = team.clients.reduce((s, c) => s + c.distanceMeters, 0);
        const teamSteps = team.clients.reduce((s, c) => s + c.steps, 0);
        const hrsWithData = team.clients.filter((c) => c.averageHeartRate > 0);
        const teamAvgHr = hrsWithData.length > 0 ? Math.round(hrsWithData.reduce((s, c) => s + c.averageHeartRate, 0) / hrsWithData.length) : 0;
        const teamMaxHr = Math.max(...team.clients.map((c) => c.maxHeartRate));

        // Aggregate team zones
        const teamZones: Record<string, number> = {};
        for (const c of team.clients) {
          if (c.timeInZone) {
            for (const [z, secs] of Object.entries(c.timeInZone)) {
              teamZones[z] = (teamZones[z] ?? 0) + secs;
            }
          }
        }

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
              display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
              gap: "0.5rem", marginBottom: "0.5rem", flexShrink: 0,
            }}>
              <StatCard label="Distance" value={formatDistance(teamDist)} compact />
              <StatCard label="Steps" value={teamSteps.toLocaleString()} compact />
              <StatCard label="Avg HR" value={teamAvgHr > 0 ? `${teamAvgHr} bpm` : "—"} compact />
              <StatCard label="Peak HR" value={teamMaxHr > 0 ? `${teamMaxHr} bpm` : "—"} compact />
              <StatCard label="Avg Speed" value={(() => {
                const speedClients = team.clients.filter((c) => c.averageSpeedKmh > 0);
                if (speedClients.length === 0) return "—";
                const avg = speedClients.reduce((s, c) => s + c.averageSpeedKmh, 0) / speedClients.length;
                return `${avg.toFixed(1)} km/h`;
              })()} compact />
            </div>

            {/* Team zone bar */}
            {Object.keys(teamZones).length > 0 && (
              <div style={{ marginBottom: "0.5rem", flexShrink: 0 }}>
                <ZoneBar timeInZone={teamZones} height={20} />
              </div>
            )}

            {/* Per-member cards fill remaining space */}
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(team.clients.length, 3)}, 1fr)`,
              gap: "0.75rem",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}>
              {team.clients.map((cs) => (
                <ClientCard key={cs.clientId || cs.name} cs={cs} showZoneBar />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function ClientCard({ cs, showZones, showZoneBar }: { cs: ClientSummary; showZones?: boolean; showZoneBar?: boolean }) {
  const hasZones = cs.timeInZone && Object.keys(cs.timeInZone).length > 0;
  const activeZones = hasZones ? [1, 2, 3, 4, 5].filter((z) => (cs.timeInZone[z] ?? 0) > 0) : [];
  const totalZoneTime = activeZones.reduce((sum, z) => sum + (cs.timeInZone[z] ?? 0), 0);

  return (
    <div style={{
      background: "var(--code-bg)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "0.75rem 1rem",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-h)", marginBottom: 6, flexShrink: 0 }}>
        {cs.name}
      </div>
      <MiniStat label="Distance" value={formatDistance(cs.distanceMeters)} />
      <MiniStat label="Steps" value={cs.steps.toLocaleString()} />
      <MiniStat label="Avg HR" value={cs.averageHeartRate > 0 ? `${cs.averageHeartRate} bpm` : "—"} />
      <MiniStat label="Peak HR" value={cs.maxHeartRate > 0 ? `${cs.maxHeartRate} bpm` : "—"} />
      <MiniStat label="Calories" value={cs.caloriesBurned > 0 ? `${cs.caloriesBurned} kcal` : "—"} />
      <MiniStat label="Cadence" value={cs.avgCadenceSpm > 0 ? `${cs.avgCadenceSpm} spm` : "—"} />
      <MiniStat label="Avg Speed" value={cs.averageSpeedKmh > 0 ? `${cs.averageSpeedKmh.toFixed(1)} km/h` : "—"} />
      <MiniStat label="Peak Speed" value={cs.peakSpeedKmh > 0 ? `${cs.peakSpeedKmh.toFixed(1)} km/h` : "—"} />

      {/* Zone bar (compact visual) */}
      {(showZoneBar || showZones) && hasZones && (
        <div style={{ marginTop: 6, flexShrink: 0 }}>
          <ZoneBar timeInZone={cs.timeInZone} height={18} />
        </div>
      )}

      {/* Zone detail list (only for few-client view) */}
      {showZones && activeZones.length > 0 && (
        <div style={{ marginTop: "auto", paddingTop: 6 }}>
          <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: 2 }}>Zones</div>
          {activeZones.map((z) => {
            const pct = totalZoneTime > 0 ? Math.round((cs.timeInZone[z] / totalZoneTime) * 100) : 0;
            return (
              <div key={z} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span style={{ fontSize: "0.75rem", color: ZONE_COLORS[z - 1], fontWeight: 600 }}>
                  {ZONE_LABELS[z - 1]}
                </span>
                <span style={{ fontSize: "0.8rem", fontFamily: "var(--mono)", color: "var(--text-h)" }}>
                  {formatZoneTime(cs.timeInZone[z])} <span style={{ fontSize: "0.65rem", color: "#888" }}>({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, compact }: { label: string; value: string; compact?: boolean; tall?: boolean }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(0,212,255,0.2)",
      borderRadius: 10,
      padding: compact ? "0.5rem 0.75rem" : "0.75rem 1rem",
      display: "flex",
      flexDirection: "column",
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

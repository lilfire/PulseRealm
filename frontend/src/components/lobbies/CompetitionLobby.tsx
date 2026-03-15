import { useState } from "react";
import type { ClientProfile, CompetitionConfig, CompetitionSubMode, PlayerFormat, TeamAssignment } from "../../types/session";
import { LobbyShell } from "./LobbyShell";

interface Props {
  joinCode: string;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  onStart: (config: CompetitionConfig) => void;
  onLeave: () => void;
}

const SUB_MODES: { value: CompetitionSubMode; label: string; desc: string }[] = [
  { value: "race", label: "Race", desc: "First to a target distance wins" },
  { value: "elimination", label: "Elimination", desc: "Slowest runner gets eliminated each round" },
  { value: "heartzone", label: "Heart Zone", desc: "Earn points by staying in a target HR zone" },
  { value: "king", label: "King", desc: "Hold the crown by running the most distance" },
];

const TEAM_COLORS = ["#FF5C75", "#33DFFF", "#22c55e", "#f59e0b", "#818cf8", "#D06ACA", "#fb923c", "#2dd4bf"];

const btnStyle = (selected: boolean) => ({
  padding: "0.6rem 1.5rem",
  fontSize: "0.95rem",
  borderRadius: "8px",
  border: selected ? "2px solid var(--accent2, #33DFFF)" : "1px solid #333",
  background: selected ? "rgba(51, 223, 255, 0.1)" : "var(--code-bg, #1f2028)",
  color: selected ? "#fff" : "var(--text, #9ca3af)",
  cursor: "pointer" as const,
  transition: "border-color 0.15s, background 0.15s",
  fontWeight: selected ? 600 : 400,
});

export function CompetitionLobby({ joinCode, clients, clientProfiles, connected, onStart, onLeave }: Props) {
  const [subMode, setSubMode] = useState<CompetitionSubMode>("race");
  const [playerFormat, setPlayerFormat] = useState<PlayerFormat>("individual");
  const [teams, setTeams] = useState<TeamAssignment[]>([
    { name: "Team 1", color: TEAM_COLORS[0], clientIds: [] },
    { name: "Team 2", color: TEAM_COLORS[1], clientIds: [] },
  ]);

  // Race config
  const [targetDistanceKm, setTargetDistanceKm] = useState(5.0);

  // Elimination config
  const [intervalMinutes, setIntervalMinutes] = useState(3);

  // Heartzone config
  const [targetZone, setTargetZone] = useState(3);
  const [hzDuration, setHzDuration] = useState(20);

  // King config
  const [kingDuration, setKingDuration] = useState(15);

  const durationMinutes = subMode === "heartzone" ? hzDuration : kingDuration;

  function addTeam() {
    const idx = teams.length;
    setTeams([...teams, { name: `Team ${idx + 1}`, color: TEAM_COLORS[idx % TEAM_COLORS.length], clientIds: [] }]);
  }

  function removeTeam(index: number) {
    if (teams.length <= 2) return;
    setTeams(teams.filter((_, i) => i !== index));
  }

  function assignClient(clientId: string, teamIndex: number) {
    setTeams(teams.map((t, i) => ({
      ...t,
      clientIds: i === teamIndex
        ? (t.clientIds.includes(clientId) ? t.clientIds : [...t.clientIds, clientId])
        : t.clientIds.filter((id) => id !== clientId),
    })));
  }

  function renameTeam(index: number, name: string) {
    setTeams(teams.map((t, i) => i === index ? { ...t, name } : t));
  }

  const allAssigned = playerFormat === "individual" || clients.every((cid) => teams.some((t) => t.clientIds.includes(cid)));

  return (
    <LobbyShell
      joinCode={joinCode}
      clients={clients}
      clientProfiles={clientProfiles}
      connected={connected}
      canStart={connected && clients.length > 0 && allAssigned && (subMode !== "elimination" || clients.length >= 3)}
      onStart={() => onStart({ subMode, playerFormat, teams, targetDistanceKm, intervalMinutes, targetZone, durationMinutes })}
      onLeave={onLeave}
    >
      {/* Sub-mode selector */}
      <div style={{ margin: "1.5rem 0" }}>
        <h3>Sub-mode</h3>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "0.75rem", flexWrap: "wrap" }}>
          {SUB_MODES.map((m) => (
            <button key={m.value} onClick={() => setSubMode(m.value)} style={btnStyle(subMode === m.value)}>
              {m.label}
            </button>
          ))}
        </div>
        <p style={{ color: "#888", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          {SUB_MODES.find((m) => m.value === subMode)?.desc}
        </p>
      </div>

      {/* Player format */}
      <div style={{ margin: "1.5rem 0" }}>
        <h3>Player Format</h3>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "0.75rem" }}>
          {(["individual", "team"] as const).map((f) => (
            <button key={f} onClick={() => setPlayerFormat(f)} style={btnStyle(playerFormat === f)}>
              {f === "individual" ? "Individual" : "Team"}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-mode specific config */}
      {subMode === "race" && (
        <div style={{ margin: "1.5rem 0" }}>
          <h3>Target Distance</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", justifyContent: "center", marginTop: "0.75rem" }}>
            <input
              type="range"
              min={0.1}
              max={42}
              step={0.1}
              value={targetDistanceKm}
              onChange={(e) => setTargetDistanceKm(Number(e.target.value))}
              style={{ width: "200px" }}
            />
            <span style={{ fontSize: "1.3rem", fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text-h)", minWidth: 60 }}>
              {targetDistanceKm.toFixed(1)} km
            </span>
          </div>
        </div>
      )}

      {subMode === "elimination" && (
        <div style={{ margin: "1.5rem 0" }}>
          <h3>Elimination Interval</h3>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "0.75rem" }}>
            {[1, 2, 3, 5, 10].map((v) => (
              <button key={v} onClick={() => setIntervalMinutes(v)} style={btnStyle(intervalMinutes === v)}>
                {v} min
              </button>
            ))}
          </div>
          {clients.length < 3 && (
            <p style={{ color: "#f87171", fontSize: "0.8rem", marginTop: "0.75rem" }}>
              Elimination requires at least 3 players
            </p>
          )}
        </div>
      )}

      {subMode === "heartzone" && (
        <div style={{ margin: "1.5rem 0" }}>
          <h3>Target Zone</h3>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "0.75rem" }}>
            {[1, 2, 3, 4, 5].map((z) => (
              <button key={z} onClick={() => setTargetZone(z)} style={btnStyle(targetZone === z)}>
                Zone {z}
              </button>
            ))}
          </div>
          <h3 style={{ marginTop: "1rem" }}>Duration</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", justifyContent: "center", marginTop: "0.75rem" }}>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={hzDuration}
              onChange={(e) => setHzDuration(Number(e.target.value))}
              style={{ width: "200px" }}
            />
            <span style={{ fontSize: "1.3rem", fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text-h)", minWidth: 70 }}>
              {hzDuration} min
            </span>
          </div>
        </div>
      )}

      {subMode === "king" && (
        <div style={{ margin: "1.5rem 0" }}>
          <h3>Duration</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", justifyContent: "center", marginTop: "0.75rem" }}>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={kingDuration}
              onChange={(e) => setKingDuration(Number(e.target.value))}
              style={{ width: "200px" }}
            />
            <span style={{ fontSize: "1.3rem", fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text-h)", minWidth: 70 }}>
              {kingDuration} min
            </span>
          </div>
        </div>
      )}

      {/* Team assignment */}
      {playerFormat === "team" && (
        <div style={{ margin: "1.5rem 0" }}>
          <h3>Team Assignment</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "0.75rem", maxWidth: 500, margin: "0.75rem auto 0" }}>
            {teams.map((team, ti) => (
              <div key={ti} style={{
                background: "var(--code-bg, #1f2028)",
                border: `2px solid ${team.color}`,
                borderRadius: 10,
                padding: "0.75rem 1rem",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: team.color, flexShrink: 0 }} />
                  <input
                    value={team.name}
                    onChange={(e) => renameTeam(ti, e.target.value)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-h)",
                      fontSize: "1rem",
                      fontWeight: 600,
                      flex: 1,
                      outline: "none",
                    }}
                  />
                  {teams.length > 2 && (
                    <button
                      onClick={() => removeTeam(ti)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#888",
                        cursor: "pointer",
                        fontSize: "1rem",
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {clients.map((cid) => {
                    const inTeam = team.clientIds.includes(cid);
                    const name = clientProfiles[cid]?.name ?? cid.slice(0, 8);
                    return (
                      <button
                        key={cid}
                        onClick={() => assignClient(cid, ti)}
                        style={{
                          padding: "0.3rem 0.7rem",
                          fontSize: "0.8rem",
                          borderRadius: 6,
                          border: inTeam ? `1px solid ${team.color}` : "1px solid #444",
                          background: inTeam ? `${team.color}22` : "transparent",
                          color: inTeam ? "#fff" : "#888",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              onClick={addTeam}
              style={{
                padding: "0.4rem 1rem",
                fontSize: "0.85rem",
                borderRadius: 8,
                border: "1px dashed #555",
                background: "transparent",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              + Add Team
            </button>
          </div>
          {!allAssigned && clients.length > 0 && (
            <p style={{ color: "#f87171", fontSize: "0.8rem", marginTop: "0.5rem" }}>
              All players must be assigned to a team before starting
            </p>
          )}
        </div>
      )}
    </LobbyShell>
  );
}

interface Props {
  subMode: string;
  playerFormat: string;
  targetDistanceKm: number;
  intervalMinutes: number;
  targetZone: number;
  durationMinutes: number;
  onChange: (field: string, value: string | number) => void;
}

const btnStyle = (selected: boolean) => ({
  padding: "0.5rem 1.2rem",
  fontSize: "0.9rem",
  borderRadius: "8px",
  border: selected ? "2px solid var(--accent2, #33DFFF)" : "1px solid #333",
  background: selected ? "rgba(51, 223, 255, 0.1)" : "var(--code-bg, #1f2028)",
  color: selected ? "#fff" : "var(--text, #9ca3af)",
  cursor: "pointer" as const,
  fontWeight: selected ? 600 : 400,
  margin: 0,
});

export function CompetitionDefaults({ subMode, playerFormat, targetDistanceKm, intervalMinutes, targetZone, durationMinutes, onChange }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <label className="admin-label">Default Sub-Mode</label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {["race", "elimination", "heartzone", "king"].map((m) => (
            <button key={m} onClick={() => onChange("competitionSubMode", m)} style={btnStyle(subMode === m)}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="admin-label">Default Player Format</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {["individual", "team"].map((f) => (
            <button key={f} onClick={() => onChange("competitionPlayerFormat", f)} style={btnStyle(playerFormat === f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="admin-label">Default Target Distance (Race)</label>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <input
            type="range"
            min={0.1}
            max={42}
            step={0.1}
            value={targetDistanceKm}
            onChange={(e) => onChange("competitionTargetDistanceKm", Number(e.target.value))}
            style={{ width: "200px" }}
          />
          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-h)", minWidth: 60 }}>
            {targetDistanceKm.toFixed(1)} km
          </span>
        </div>
      </div>

      <div>
        <label className="admin-label">Default Elimination Interval</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[1, 2, 3, 5, 10].map((v) => (
            <button key={v} onClick={() => onChange("competitionIntervalMinutes", v)} style={btnStyle(intervalMinutes === v)}>
              {v} min
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="admin-label">Default Heart Zone Target</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[1, 2, 3, 4, 5].map((z) => (
            <button key={z} onClick={() => onChange("competitionTargetZone", z)} style={btnStyle(targetZone === z)}>
              Zone {z}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="admin-label">Default Duration (Heart Zone / King)</label>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={durationMinutes}
            onChange={(e) => onChange("competitionDurationMinutes", Number(e.target.value))}
            style={{ width: "200px" }}
          />
          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-h)", minWidth: 70 }}>
            {durationMinutes} min
          </span>
        </div>
      </div>
    </div>
  );
}

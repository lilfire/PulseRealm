import type { AdminConfig } from "./AdminDashboard";

interface Props {
  subMode: string;
  playerFormat: string;
  targetDistanceKm: number;
  intervalMinutes: number;
  targetZone: number;
  durationMinutes: number;
  onChange: <K extends keyof AdminConfig>(field: K, value: AdminConfig[K]) => void;
}

export function CompetitionDefaults({ subMode, playerFormat, targetDistanceKm, intervalMinutes, targetZone, durationMinutes, onChange }: Props) {
  return (
    <div className="admin-card">
      <div className="admin-form-section">
        <label className="admin-label">Default Sub-Mode</label>
        <div className="admin-btn-group">
          {["race", "elimination", "heartzone", "king"].map((m) => (
            <button key={m} onClick={() => onChange("competitionSubMode", m)} className={`admin-btn-option${subMode === m ? " admin-btn-option-active" : ""}`}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-divider" />

      <div className="admin-form-section">
        <label className="admin-label">Default Player Format</label>
        <div className="admin-btn-group">
          {["individual", "team"].map((f) => (
            <button key={f} onClick={() => onChange("competitionPlayerFormat", f)} className={`admin-btn-option${playerFormat === f ? " admin-btn-option-active" : ""}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-divider" />

      <div className="admin-form-grid">
        <div>
          <label className="admin-label">Default Target Distance (Race)</label>
          <div className="admin-slider-row">
            <input
              type="range"
              min={0.1}
              max={42}
              step={0.1}
              value={targetDistanceKm}
              onChange={(e) => onChange("competitionTargetDistanceKm", Number(e.target.value))}
              style={{ width: "200px" }}
            />
            <span className="admin-slider-value">{targetDistanceKm.toFixed(1)} km</span>
          </div>
        </div>

        <div>
          <label className="admin-label">Default Duration (Heart Zone / King)</label>
          <div className="admin-slider-row">
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={durationMinutes}
              onChange={(e) => onChange("competitionDurationMinutes", Number(e.target.value))}
              style={{ width: "200px" }}
            />
            <span className="admin-slider-value">{durationMinutes} min</span>
          </div>
        </div>
      </div>

      <div className="admin-divider" />

      <div className="admin-form-section">
        <label className="admin-label">Default Elimination Interval</label>
        <div className="admin-btn-group">
          {[1, 2, 3, 5, 10].map((v) => (
            <button key={v} onClick={() => onChange("competitionIntervalMinutes", v)} className={`admin-btn-option${intervalMinutes === v ? " admin-btn-option-active" : ""}`}>
              {v} min
            </button>
          ))}
        </div>
      </div>

      <div className="admin-divider" />

      <div className="admin-form-section">
        <label className="admin-label">Default Heart Zone Target</label>
        <div className="admin-btn-group">
          {[1, 2, 3, 4, 5].map((z) => (
            <button key={z} onClick={() => onChange("competitionTargetZone", z)} className={`admin-btn-option${targetZone === z ? " admin-btn-option-active" : ""}`}>
              Zone {z}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface Props {
  difficulty: string;
  timeframeMinutes: number;
  onChange: (field: string, value: string | number) => void;
}

export function DungeonDefaults({ difficulty, timeframeMinutes, onChange }: Props) {
  return (
    <div className="admin-card">
      <div className="admin-form-grid">
        <div>
          <label className="admin-label">Default Difficulty</label>
          <div className="admin-btn-group">
            {["easy", "normal", "hard"].map((d) => (
              <button key={d} onClick={() => onChange("dungeonDifficulty", d)} className={`admin-btn-option${difficulty === d ? " admin-btn-option-active" : ""}`}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="admin-label">Default Timeframe</label>
          <div className="admin-btn-group">
            {[15, 30, 45, 60].map((t) => (
              <button key={t} onClick={() => onChange("dungeonTimeframeMinutes", t)} className={`admin-btn-option${timeframeMinutes === t ? " admin-btn-option-active" : ""}`}>
                {t} min
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

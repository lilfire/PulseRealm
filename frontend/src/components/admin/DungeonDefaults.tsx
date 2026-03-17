import React from "react";

interface Props {
  difficulty: string;
  timeframeMinutes: number;
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

export function DungeonDefaults({ difficulty, timeframeMinutes, onChange }: Props) {
  return (
    <div className="fg-col" style={{ display: "flex", flexDirection: "column", "--fg": "1.5rem" } as React.CSSProperties}>
      <div>
        <label className="admin-label">Default Difficulty</label>
        <div className="fg-row" style={{ display: "flex", "--fg": "0.5rem" } as React.CSSProperties}>
          {["easy", "normal", "hard"].map((d) => (
            <button key={d} onClick={() => onChange("dungeonDifficulty", d)} style={btnStyle(difficulty === d)}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="admin-label">Default Timeframe</label>
        <div className="fg-row" style={{ display: "flex", "--fg": "0.5rem" } as React.CSSProperties}>
          {[15, 30, 45, 60].map((t) => (
            <button key={t} onClick={() => onChange("dungeonTimeframeMinutes", t)} style={btnStyle(timeframeMinutes === t)}>
              {t} min
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import type { ClientProfile, RealmMode, RealmRole } from "../../types/session";
import { LobbyShell } from "./LobbyShell";

export type DungeonDifficulty = "easy" | "normal" | "hard";

export interface DungeonConfig {
  difficulty: DungeonDifficulty;
  timeframe: number; // minutes
}

export interface DungeonDefaults {
  difficulty?: string;
  timeframeMinutes?: number;
}

interface Props {
  joinCode: string;
  mode: RealmMode;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  onStart: (config: DungeonConfig) => void;
  onLeave: () => void;
  onEnd?: () => void;
  role?: RealmRole;
  hostSecret?: string;
  defaults?: DungeonDefaults | null;
}

const difficulties: { value: DungeonDifficulty; label: string; desc: string }[] = [
  { value: "easy", label: "Easy", desc: "Wider windows, lower HP pools" },
  { value: "normal", label: "Normal", desc: "Balanced challenge for most teams" },
  { value: "hard", label: "Hard", desc: "Tight precision, punishing mechanics" },
];

const timeframes = [15, 30, 45, 60];

export function DungeonLobby({ joinCode, mode, clients, clientProfiles, connected, onStart, onLeave, onEnd, role, hostSecret, defaults }: Props) {
  const validDifficulties: DungeonDifficulty[] = ["easy", "normal", "hard"];
  const [difficulty, setDifficulty] = useState<DungeonDifficulty>(
    validDifficulties.includes(defaults?.difficulty as DungeonDifficulty) ? (defaults!.difficulty as DungeonDifficulty) : "normal"
  );
  const [timeframe, setTimeframe] = useState(defaults?.timeframeMinutes ?? 30);

  return (
    <LobbyShell
      joinCode={joinCode}
      mode={mode}
      clients={clients}
      clientProfiles={clientProfiles}
      connected={connected}
      canStart={connected && clients.length > 0}
      onStart={() => onStart({ difficulty, timeframe })}
      onLeave={onLeave}
      onEnd={onEnd}
      role={role}
      hostSecret={hostSecret}
    >
      <div style={{ margin: "1.5rem 0" }}>
        <h3>Difficulty</h3>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "0.75rem" }}>
          {difficulties.map((d) => (
            <button
              key={d.value}
              onClick={() => setDifficulty(d.value)}
              style={{
                padding: "0.6rem 1.5rem",
                fontSize: "0.95rem",
                borderRadius: "8px",
                border: difficulty === d.value ? "2px solid var(--accent2, #33DFFF)" : "1px solid #333",
                background: difficulty === d.value ? "rgba(51, 223, 255, 0.1)" : "var(--code-bg, #1f2028)",
                color: difficulty === d.value ? "#fff" : "var(--text, #9ca3af)",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
                fontWeight: difficulty === d.value ? 600 : 400,
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p style={{ color: "#888", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          {difficulties.find((d) => d.value === difficulty)?.desc}
        </p>
      </div>

      <div style={{ margin: "1.5rem 0" }}>
        <h3>Timeframe</h3>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "0.75rem" }}>
          {timeframes.map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              style={{
                padding: "0.6rem 1.2rem",
                fontSize: "0.95rem",
                borderRadius: "8px",
                border: timeframe === t ? "2px solid var(--accent2, #33DFFF)" : "1px solid #333",
                background: timeframe === t ? "rgba(51, 223, 255, 0.1)" : "var(--code-bg, #1f2028)",
                color: timeframe === t ? "#fff" : "var(--text, #9ca3af)",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
                fontWeight: timeframe === t ? 600 : 400,
              }}
            >
              {t} min
            </button>
          ))}
        </div>
      </div>
    </LobbyShell>
  );
}

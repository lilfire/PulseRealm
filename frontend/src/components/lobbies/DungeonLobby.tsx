import React, { useState, useEffect, useRef } from "react";
import type { ClientProfile, RealmMode, RealmRole } from "../../types/session";
import { LobbyShell } from "./LobbyShell";

export type DungeonDifficulty = "easy" | "normal" | "hard";

export interface DungeonConfig {
  difficulty: DungeonDifficulty;
  timeframe: number; // minutes
}

export interface DungeonDefaults {
  difficulty?: DungeonDifficulty;
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
  onKick?: (clientId: string) => void;
  role?: RealmRole;
  hostSecret?: string;
  defaults?: DungeonDefaults | null;
  lobbySettings?: Record<string, unknown> | null;
  onSettingsChange?: (settings: Record<string, unknown>) => void;
  onRequestBind?: (clientId: string) => void;
  onCancelBind?: (clientId: string) => void;
  bindCode?: string | null;
  bindPending?: boolean;
  bindResult?: "approved" | "declined" | null;
  boundClientId?: string | null;
  clientBindings?: Record<string, boolean>;
}

const difficulties: { value: DungeonDifficulty; label: string; desc: string }[] = [
  { value: "easy", label: "Easy", desc: "Wider windows, lower HP pools" },
  { value: "normal", label: "Normal", desc: "Balanced challenge for most teams" },
  { value: "hard", label: "Hard", desc: "Tight precision, punishing mechanics" },
];

const timeframes = [15, 30, 45, 60];

export function DungeonLobby({ joinCode, mode, clients, clientProfiles, connected, onStart, onLeave, onEnd, onKick, role, hostSecret, defaults, lobbySettings, onSettingsChange, onRequestBind, onCancelBind, bindCode, bindPending, bindResult, boundClientId, clientBindings }: Props) {
  const validDifficulties: DungeonDifficulty[] = ["easy", "normal", "hard"];
  const [difficulty, setDifficulty] = useState<DungeonDifficulty>(
    defaults?.difficulty != null && validDifficulties.includes(defaults.difficulty) ? defaults.difficulty : "normal"
  );
  const [timeframe, setTimeframe] = useState(defaults?.timeframeMinutes ?? 30);

  const isHost = role === "host" || role === "admin";
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isHost || !onSettingsChange) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSettingsChange({ difficulty, timeframe });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [isHost, onSettingsChange, difficulty, timeframe]);

  useEffect(() => {
    if (role !== "guest" || !lobbySettings) return;
    if (typeof lobbySettings.difficulty === "string" && validDifficulties.includes(lobbySettings.difficulty as DungeonDifficulty))
      setDifficulty(lobbySettings.difficulty as DungeonDifficulty);
    if (typeof lobbySettings.timeframe === "number")
      setTimeframe(lobbySettings.timeframe);
  }, [role, lobbySettings]);

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
      onKick={onKick}
      role={role}
      hostSecret={hostSecret}
      onRequestBind={onRequestBind}
      onCancelBind={onCancelBind}
      bindCode={bindCode}
      bindPending={bindPending}
      bindResult={bindResult}
      boundClientId={boundClientId}
      clientBindings={clientBindings}
    >
      <div style={{ margin: "1.5rem 0" }}>
        <h3>Difficulty</h3>
        <div className="fg-row" style={{ display: "flex", justifyContent: "flex-start", marginTop: "0.75rem", "--fg": "0.75rem" } as React.CSSProperties}>
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
        <div className="fg-row" style={{ display: "flex", justifyContent: "flex-start", marginTop: "0.75rem", "--fg": "0.75rem" } as React.CSSProperties}>
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

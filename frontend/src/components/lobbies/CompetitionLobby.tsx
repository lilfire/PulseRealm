import { useState } from "react";
import type { ClientProfile, CompetitionType } from "../../types/session";
import { LobbyShell } from "./LobbyShell";

interface Props {
  joinCode: string;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  onStart: (competitionType: CompetitionType) => void;
  onLeave: () => void;
}

export function CompetitionLobby({ joinCode, clients, clientProfiles, connected, onStart, onLeave }: Props) {
  const [competitionType, setCompetitionType] = useState<CompetitionType>("race");

  return (
    <LobbyShell
      joinCode={joinCode}
      clients={clients}
      clientProfiles={clientProfiles}
      connected={connected}
      canStart={connected && clients.length > 0}
      onStart={() => onStart(competitionType)}
      onLeave={onLeave}
    >
      <div style={{ margin: "1.5rem 0" }}>
        <h3>Competition Type</h3>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "0.75rem" }}>
          {(["race", "elimination"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setCompetitionType(type)}
              style={{
                padding: "0.6rem 1.5rem",
                fontSize: "0.95rem",
                borderRadius: "8px",
                border: competitionType === type ? "2px solid var(--accent2, #33DFFF)" : "1px solid #333",
                background: competitionType === type ? "rgba(51, 223, 255, 0.1)" : "var(--code-bg, #1f2028)",
                color: competitionType === type ? "#fff" : "var(--text, #9ca3af)",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
                fontWeight: competitionType === type ? 600 : 400,
                marginTop: 0,
              }}
            >
              {type === "race" ? "Race" : "Elimination"}
            </button>
          ))}
        </div>
        <p style={{ color: "#888", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          {competitionType === "race"
            ? "First to finish wins"
            : "Slowest player gets eliminated each round"}
        </p>
      </div>
    </LobbyShell>
  );
}

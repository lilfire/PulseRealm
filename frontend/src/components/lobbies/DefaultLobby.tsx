import type { ClientProfile, RealmMode } from "../../types/session";
import { LobbyShell } from "./LobbyShell";

interface Props {
  joinCode: string;
  mode: RealmMode;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  onStart: () => void;
  onLeave: () => void;
  viewOnly?: boolean;
}

export function DefaultLobby({ joinCode, mode, clients, clientProfiles, connected, onStart, onLeave, viewOnly }: Props) {
  return (
    <LobbyShell
      joinCode={joinCode}
      mode={mode}
      clients={clients}
      clientProfiles={clientProfiles}
      connected={connected}
      canStart={connected && clients.length > 0}
      onStart={onStart}
      onLeave={onLeave}
      viewOnly={viewOnly}
    />
  );
}

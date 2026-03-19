import type { ClientProfile, RealmMode, RealmRole } from "../../types/session";
import { LobbyShell } from "./LobbyShell";

interface Props {
  joinCode: string;
  mode: RealmMode;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  onStart: () => void;
  onLeave: () => void;
  onEnd?: () => void;
  onKick?: (clientId: string) => void;
  role?: RealmRole;
  hostSecret?: string;
  onRequestBind?: (clientId: string) => void;
  onCancelBind?: (clientId: string) => void;
  bindCode?: string | null;
  bindPending?: boolean;
  bindResult?: "approved" | "declined" | null;
  boundClientId?: string | null;
  clientBindings?: Record<string, boolean>;
}

export function DefaultLobby({ joinCode, mode, clients, clientProfiles, connected, onStart, onLeave, onEnd, onKick, role, hostSecret, onRequestBind, onCancelBind, bindCode, bindPending, bindResult, boundClientId, clientBindings }: Props) {
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
    />
  );
}

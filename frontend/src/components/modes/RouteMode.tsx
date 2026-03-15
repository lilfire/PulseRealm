import type { ClientProfile, WearableData } from "../../types/session";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
}

export function RouteMode({ clients, clientProfiles, latestData }: Props) {
  return (
    <div>
      <h2>Route</h2>
      <p>Connected players: {clients.length}</p>
      {latestData && (
        <p>
          Latest: {clientProfiles[latestData.clientId]?.name || latestData.clientId} — {latestData.steps} steps,{" "}
          {latestData.heartRate} bpm
        </p>
      )}
      <p>
        <em>Route mode coming soon...</em>
      </p>
    </div>
  );
}

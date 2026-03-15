import type { ClientProfile, WearableData } from "../../types/session";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
}

export function SocialMode({ clients, clientProfiles, latestData }: Props) {
  return (
    <div>
      <h2>Social</h2>
      <p>Connected players: {clients.length}</p>
      {latestData && (
        <p>
          Latest: {clientProfiles[latestData.clientId]?.name || latestData.clientId} — {latestData.steps} steps,{" "}
          {latestData.heartRate} bpm
        </p>
      )}
      <p>
        <em>Social mode coming soon...</em>
      </p>
    </div>
  );
}

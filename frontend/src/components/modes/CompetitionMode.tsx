import type { ClientProfile, WearableData } from "../../types/session";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
}

export function CompetitionMode({ clients, clientProfiles, latestData }: Props) {
  // TODO: Implement live leaderboard rendering
  // - Track cumulative steps per client
  // - Sort and display ranked leaderboard
  // - Animate position changes in real-time
  return (
    <div>
      <h2>Competition Mode</h2>
      <p>Connected runners: {clients.length}</p>
      {latestData && (
        <p>
          Latest: {clientProfiles[latestData.clientId]?.name || latestData.clientId} — {latestData.steps} steps,{" "}
          {latestData.heartRate} bpm, {latestData.speedKmh} km/h
        </p>
      )}
      <p>
        <em>Leaderboard coming soon...</em>
      </p>
    </div>
  );
}

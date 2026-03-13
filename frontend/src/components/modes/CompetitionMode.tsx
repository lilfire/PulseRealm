import type { WearableData } from "../../types/session";

interface Props {
  clients: string[];
  latestData: WearableData | null;
}

export function CompetitionMode({ clients, latestData }: Props) {
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
          Latest: {latestData.clientId} — {latestData.steps} steps,{" "}
          {latestData.heartRate} bpm
        </p>
      )}
      <p>
        <em>Leaderboard coming soon...</em>
      </p>
    </div>
  );
}

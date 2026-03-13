import type { WearableData } from "../../types/session";

interface Props {
  clients: string[];
  latestData: WearableData | null;
}

export function StreetViewMode({ clients, latestData }: Props) {
  // TODO: Implement Google Street View rendering
  // - Integrate Google Maps Street View API
  // - Calculate distance from step data and pace
  // - Advance Street View position based on accumulated distance
  // - Support single and multi-client views
  return (
    <div>
      <h2>Street View Mode</h2>
      <p>Connected runners: {clients.length}</p>
      {latestData && (
        <p>
          Latest: {latestData.clientId} — {latestData.steps} steps,{" "}
          {latestData.heartRate} bpm
        </p>
      )}
      <p>
        <em>Street View rendering coming soon...</em>
      </p>
    </div>
  );
}

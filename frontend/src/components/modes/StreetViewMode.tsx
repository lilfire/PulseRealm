import type { ClientProfile, WearableData } from "../../types/session";

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
}

export function StreetViewMode({ clients, clientProfiles, latestData }: Props) {
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
          Latest: {clientProfiles[latestData.clientId]?.name || latestData.clientId} — {latestData.steps} steps,{" "}
          {latestData.heartRate} bpm
        </p>
      )}
      <p>
        <em>Street View rendering coming soon...</em>
      </p>
    </div>
  );
}

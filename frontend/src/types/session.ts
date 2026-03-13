export type SessionMode = "competition" | "streetview";

export interface Session {
  id: string;
  joinCode: string;
  mode: SessionMode;
}

export interface WearableData {
  clientId: string;
  heartRate: number;
  steps: number;
  timestamp: string;
}

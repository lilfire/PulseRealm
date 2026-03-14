export type SessionMode = "competition" | "streetview";

export interface Session {
  id: string;
  joinCode: string;
  mode: SessionMode;
}

export interface ClientProfile {
  clientId: string;
  name: string;
  heightCm: number;
  weightKg: number;
}

export interface WearableData {
  clientId: string;
  heartRate: number;
  steps: number;
  timestamp: string;
}

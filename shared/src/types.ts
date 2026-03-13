/** Available session modes. Expand this union as new modes are added. */
export type SessionMode = "competition" | "streetview";

/** A live treadmill session. */
export interface Session {
  id: string;
  joinCode: string;
  mode: SessionMode;
  createdAt: string;
  connectedClientIds: string[];
}

/** Real-time data streamed from a wearable client. */
export interface WearableData {
  clientId: string;
  heartRate: number;
  steps: number;
  timestamp: string;
}

/** Request body for creating a new session. */
export interface CreateSessionRequest {
  mode: SessionMode;
}

/** Available realm modes. Expand this union as new modes are added. */
export type RealmMode = "competition" | "streetview";

/** A live treadmill realm. */
export interface Realm {
  id: string;
  joinCode: string;
  mode: RealmMode;
  createdAt: string;
  connectedClientIds: string[];
}

/** Profile data sent by a wearable client when joining a realm. */
export interface ClientProfile {
  clientId: string;
  name: string;
  heightCm: number;
  weightKg: number;
}

/** Real-time data streamed from a wearable client. */
export interface WearableData {
  clientId: string;
  heartRate: number;
  steps: number;
  timestamp: string;
  /** Estimated speed in km/h, calculated server-side from steps and client height. */
  speedKmh: number;
}

/** Request body for creating a new realm. */
export interface CreateRealmRequest {
  mode: RealmMode;
}

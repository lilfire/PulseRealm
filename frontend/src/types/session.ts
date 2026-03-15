export type RealmMode = "competition" | "streetview" | "youtubetrail" | "route" | "dungeon" | "social";

export type CompetitionType = "race" | "elimination";

export interface Realm {
  id: string;
  joinCode: string;
  mode: RealmMode;
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
  /** Estimated speed in km/h, calculated server-side from steps and client height. */
  speedKmh: number;
}

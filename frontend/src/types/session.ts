export type RealmMode = "competition" | "streetview" | "youtubetrail" | "route" | "dungeon" | "social";

export type CompetitionSubMode = "race" | "elimination" | "heartzone" | "king";

/** @deprecated Use CompetitionSubMode instead */
export type CompetitionType = CompetitionSubMode;

export type PlayerFormat = "individual" | "team";

export interface TeamAssignment {
  name: string;
  color: string;
  clientIds: string[];
}

export interface CompetitionConfig {
  subMode: CompetitionSubMode;
  playerFormat: PlayerFormat;
  teams: TeamAssignment[];
  // Race config
  targetDistanceKm: number;
  // Elimination config
  intervalMinutes: number;
  // Heartzone config
  targetZone: number;
  durationMinutes: number;
  // King config (shares durationMinutes)
}

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

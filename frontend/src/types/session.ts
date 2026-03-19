export type RealmMode = "competition" | "streetview" | "youtubetrail" | "route" | "dungeon" | "social";

export type RealmRole = "host" | "guest" | "admin";

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

export function maxClientsForMode(mode: RealmMode): number {
  switch (mode) {
    case "competition": return 8;
    case "streetview": return 1;
    case "youtubetrail": return 1;
    case "route": return 1;
    case "dungeon": return 4;
    case "social": return 4;
    default: return 4;
  }
}

export interface ClientProfile {
  clientId: string;
  name: string;
  age: number;
  heightCm: number;
  weightKg: number;
  strideFactor?: number;
  zoneBounds?: number[];
  maxHr?: number;
}

export interface WearableData {
  clientId: string;
  heartRate: number;
  steps: number;
  timestamp: string;
  /** Estimated speed in km/h, calculated server-side from steps and client height. */
  speedKmh: number;
}

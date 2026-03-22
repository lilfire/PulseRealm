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
    default: {
      const _exhaustive: never = mode;
      void _exhaustive;
      return 4;
    }
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
  strideCalibration?: { speedKmh: number; strideFactor: number }[];
}

export type LobbySettings = Record<string, unknown> | null;

export type OnEndSimple = (totalDistanceMeters: number) => void;

export interface ClientSummary {
  clientId: string;
  name: string;
  steps: number;
  distanceMeters: number;
  averageHeartRate: number;
  maxHeartRate: number;
  avgCadenceSpm: number;
  caloriesBurned: number;
  timeInZone: Record<string, number>;
  averageSpeedKmh: number;
  peakSpeedKmh: number;
  elevationGainMeters?: number;
  teamName?: string;
  teamColor?: string;
}

export interface RealmSummary {
  durationSeconds: number;
  totalDistanceMeters: number;
  totalSteps: number;
  averageHeartRate: number;
  maxHeartRate: number;
  averageSpeedKmh: number;
  avgCadenceSpm: number;
  caloriesBurned: number;
  peakSpeedKmh: number;
  timeInZone: Record<string, number>;
  activePeriodSeconds: number;
  participantCount: number;
  isTeamFormat?: boolean;
  elevationGainMeters?: number;
  clientSummaries?: ClientSummary[];
}

export type OnEndWithOverrides = (totalDistanceMeters: number, overrides?: Partial<RealmSummary>) => void;

export interface WearableData {
  clientId: string;
  heartRate: number;
  steps: number;
  timestamp: string;
  /** Estimated speed in km/h, calculated server-side from steps and client height. */
  speedKmh: number;
}

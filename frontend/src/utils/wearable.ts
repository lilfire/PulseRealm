/**
 * Shared constants and helpers for wearable data processing.
 * Used by CompetitionMode, SocialMode, DungeonMode, and useSessionHub.
 */

/** Default maximum heart rate used when age is unknown. */
export const MAX_HR = 190;

/** Returns age-based max HR using the standard formula (220 − age). Falls back to MAX_HR. */
export function getMaxHrForAge(age: number | undefined): number {
  if (age != null && age >= 5 && age <= 120) return 220 - age;
  return MAX_HR;
}

/** Multiply height(cm) by this to get stride length in meters. */
export const STRIDE_FACTOR = 0.415 / 100;

import type { ClientProfile } from "../types/session";

/** Returns the stride factor for a client, using their calibrated value if available. */
export function getStrideFactor(profile?: ClientProfile): number {
  return profile?.strideFactor && profile.strideFactor > 0
    ? profile.strideFactor / 100
    : STRIDE_FACTOR;
}

/** Window (ms) over which cadence is averaged. */
export const CADENCE_WINDOW_MS = 10_000;

/** Timeout (ms) before a client is considered idle. */
export const IDLE_TIMEOUT_MS = 10_000;

/** Default zone boundary percentages (transitions between zones 1→2, 2→3, 3→4, 4→5). */
export const DEFAULT_ZONE_BOUNDS = [0.57, 0.63, 0.76, 0.89];

/** HR zone boundary percentages of MAX_HR: [zone1Low, zone2Low, zone3Low, zone4Low, zone5Low, cap]. */
export const ZONE_BOUNDS = [0, ...DEFAULT_ZONE_BOUNDS, 1.0];

/** Color for each zone (index 0 = Zone 1). */
export const ZONE_COLORS = ["#2dd4bf", "#22c55e", "#f59e0b", "#f87171", "#ef4444"];

/** Returns the max HR for a profile, using maxHr override if set, otherwise age-based formula. */
export function getMaxHrForProfile(profile?: ClientProfile | null): number {
  if (profile?.maxHr && profile.maxHr > 0) return profile.maxHr;
  return getMaxHrForAge(profile?.age);
}

/** Returns the HR zone number (1–5) for the given heart rate. */
export function getZoneForHr(hr: number, maxHr = MAX_HR, bounds?: number[]): number {
  const pct = hr / maxHr;
  const b = bounds ?? DEFAULT_ZONE_BOUNDS;
  if (pct < b[0]) return 1;
  if (pct < b[1]) return 2;
  if (pct < b[2]) return 3;
  if (pct < b[3]) return 4;
  return 5;
}

/** Returns the BPM range [low, high] for a given zone number. */
export function getZoneBpmRange(zone: number, maxHr = MAX_HR, bounds?: number[]): [number, number] {
  const b = [0, ...(bounds ?? DEFAULT_ZONE_BOUNDS), 1.0];
  return [Math.round(b[zone - 1] * maxHr), Math.round(b[zone] * maxHr)];
}

/**
 * Estimate calories burned per second using a gender-neutral HR-based formula.
 * Averaged from Keytel et al. (2005) male/female equations.
 * Returns 0 when inputs are insufficient for a meaningful estimate.
 */
export function estimateCaloriesPerSecond(heartRate: number, weightKg: number, age: number): number {
  if (heartRate <= 0 || weightKg <= 0 || age <= 0) return 0;
  const calsPerMin = (-37.549 + 0.5391 * heartRate + 0.1626 * weightKg + 0.1379 * age) / 4.184;
  return Math.max(0, calsPerMin / 60);
}

/** Format seconds as m:ss. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Convert speed (km/h) to pace (min/km). Returns Infinity when speed ≤ 0. */
export function speedToPace(speedKmh: number): number {
  return speedKmh > 0 ? 60 / speedKmh : Infinity;
}

/** Format speed as pace string like "6:15 /km", or "—" when speed ≤ 0. */
export function formatPace(speedKmh: number): string {
  if (speedKmh <= 0) return "—";
  const pace = 60 / speedKmh;
  const mins = Math.floor(pace);
  const secs = Math.round((pace - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")} /km`;
}

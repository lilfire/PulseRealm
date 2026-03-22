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

/** Default walking stride factor (height × factor = stride length). */
export const DEFAULT_WALKING_FACTOR = 0.415;

/** Multiply height(cm) by this to get stride length in meters (legacy constant). */
export const STRIDE_FACTOR = DEFAULT_WALKING_FACTOR / 100;

import type { ClientProfile } from "../types/session";

/**
 * Default speed-stride curve data points (biomechanical research).
 * Sorted by speed ascending.
 */
const DEFAULT_CURVE: readonly [number, number][] = [
  [0, 0.35],
  [3, 0.35],
  [5, 0.415],
  [8, 0.55],
  [12, 0.65],
  [15, 0.75],
];

/**
 * Piecewise linear interpolation over sorted (speed, factor) data points.
 * Clamps to first/last value outside range.
 */
function interpolate(points: readonly [number, number][], speedKmh: number): number {
  if (points.length === 0) return DEFAULT_WALKING_FACTOR;
  if (points.length === 1) return points[0][1];

  if (speedKmh <= points[0][0]) return points[0][1];
  if (speedKmh >= points[points.length - 1][0]) return points[points.length - 1][1];

  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (speedKmh >= x0 && speedKmh <= x1) {
      if (Math.abs(x1 - x0) < 0.001) return y0;
      const t = (speedKmh - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }

  return points[points.length - 1][1];
}

/**
 * Returns the default stride factor for a given speed using piecewise linear interpolation.
 * Factor is a raw multiplier (e.g., 0.415), NOT divided by 100.
 */
export function getSpeedDependentStrideFactor(
  speedKmh: number,
  calibration?: { speedKmh: number; strideFactor: number }[],
): number {
  if (calibration && calibration.length >= 2) {
    const points: [number, number][] = calibration
      .slice()
      .sort((a, b) => a.speedKmh - b.speedKmh)
      .map((p) => [p.speedKmh, p.strideFactor]);
    return interpolate(points, speedKmh);
  }
  return interpolate(DEFAULT_CURVE, speedKmh);
}

/**
 * Returns the stride factor for a client, considering speed-dependent curve and calibration.
 * When speedKmh is provided, uses the speed-dependent model.
 * When not provided, falls back to the legacy fixed factor for backward compatibility.
 * Returns factor / 100 (ready to multiply with height in cm to get meters).
 */
export function getStrideFactor(profile?: ClientProfile, speedKmh?: number): number {
  if (speedKmh != null) {
    // Speed-dependent mode
    const calibration = profile?.strideCalibration;
    if (calibration && calibration.length >= 2) {
      // Use personal calibration curve
      return getSpeedDependentStrideFactor(speedKmh, calibration) / 100;
    }
    // Apply user's strideFactor as a proportional multiplier on the default curve
    const baseFactor = getSpeedDependentStrideFactor(speedKmh);
    if (profile?.strideFactor && profile.strideFactor > 0 && Math.abs(profile.strideFactor - DEFAULT_WALKING_FACTOR) > 0.001) {
      return (baseFactor * (profile.strideFactor / DEFAULT_WALKING_FACTOR)) / 100;
    }
    return baseFactor / 100;
  }

  // Legacy fixed mode (no speed provided)
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

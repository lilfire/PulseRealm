import { describe, it, expect } from "vitest";
import type { ClientProfile } from "../types/session";
import {
  MAX_HR,
  STRIDE_FACTOR,
  DEFAULT_ZONE_BOUNDS,
  ZONE_BOUNDS,
  getMaxHrForAge,
  getMaxHrForProfile,
  getStrideFactor,
  getZoneForHr,
  getZoneBpmRange,
  estimateCaloriesPerSecond,
  formatDuration,
  speedToPace,
  formatPace,
} from "./wearable";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    clientId: "test-client",
    name: "Tester",
    age: 30,
    heightCm: 170,
    weightKg: 70,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getMaxHrForAge
// ---------------------------------------------------------------------------

describe("getMaxHrForAge", () => {
  it("returns 220 - age for valid mid-range ages", () => {
    expect(getMaxHrForAge(30)).toBe(190);
    expect(getMaxHrForAge(20)).toBe(200);
    expect(getMaxHrForAge(50)).toBe(170);
  });

  it("accepts the lower boundary age of 5", () => {
    expect(getMaxHrForAge(5)).toBe(215);
  });

  it("accepts the upper boundary age of 120", () => {
    expect(getMaxHrForAge(120)).toBe(100);
  });

  it("returns MAX_HR fallback for age 4 (one below the lower boundary)", () => {
    expect(getMaxHrForAge(4)).toBe(MAX_HR);
  });

  it("returns MAX_HR fallback for age 121 (one above the upper boundary)", () => {
    expect(getMaxHrForAge(121)).toBe(MAX_HR);
  });

  it("returns MAX_HR fallback for age 0", () => {
    expect(getMaxHrForAge(0)).toBe(MAX_HR);
  });

  it("returns MAX_HR fallback for a negative age", () => {
    expect(getMaxHrForAge(-1)).toBe(MAX_HR);
    expect(getMaxHrForAge(-100)).toBe(MAX_HR);
  });

  it("returns MAX_HR fallback for a very high age", () => {
    expect(getMaxHrForAge(999)).toBe(MAX_HR);
  });

  it("returns MAX_HR fallback for undefined", () => {
    expect(getMaxHrForAge(undefined)).toBe(MAX_HR);
  });
});

// ---------------------------------------------------------------------------
// getMaxHrForProfile
// ---------------------------------------------------------------------------

describe("getMaxHrForProfile", () => {
  it("uses the maxHr override when it is a positive value", () => {
    const profile = makeProfile({ maxHr: 180 });
    expect(getMaxHrForProfile(profile)).toBe(180);
  });

  it("ignores maxHr=0 and falls through to the age-based formula", () => {
    // maxHr: 0 is falsy so the guard `profile.maxHr > 0` is false
    const profile = makeProfile({ age: 30, maxHr: 0 });
    expect(getMaxHrForProfile(profile)).toBe(190); // 220 - 30
  });

  it("ignores negative maxHr and falls through to the age-based formula", () => {
    const profile = makeProfile({ age: 40, maxHr: -5 });
    expect(getMaxHrForProfile(profile)).toBe(180); // 220 - 40
  });

  it("uses age-based formula when maxHr is not set", () => {
    const profile = makeProfile({ age: 25 });
    expect(getMaxHrForProfile(profile)).toBe(195); // 220 - 25
  });

  it("falls back to MAX_HR when profile has no maxHr and age is out of range", () => {
    const profile = makeProfile({ age: 0 });
    expect(getMaxHrForProfile(profile)).toBe(MAX_HR);
  });

  it("returns MAX_HR fallback when profile is null", () => {
    expect(getMaxHrForProfile(null)).toBe(MAX_HR);
  });

  it("returns MAX_HR fallback when profile is undefined", () => {
    expect(getMaxHrForProfile(undefined)).toBe(MAX_HR);
  });
});

// ---------------------------------------------------------------------------
// getStrideFactor
// ---------------------------------------------------------------------------

describe("getStrideFactor", () => {
  it("returns STRIDE_FACTOR when no profile is provided", () => {
    expect(getStrideFactor(undefined)).toBe(STRIDE_FACTOR);
  });

  it("returns STRIDE_FACTOR when profile has no strideFactor field", () => {
    const profile = makeProfile(); // strideFactor not set
    expect(getStrideFactor(profile)).toBe(STRIDE_FACTOR);
  });

  it("returns STRIDE_FACTOR when profile.strideFactor is 0 (falsy guard)", () => {
    const profile = makeProfile({ strideFactor: 0 });
    expect(getStrideFactor(profile)).toBe(STRIDE_FACTOR);
  });

  it("returns STRIDE_FACTOR when profile.strideFactor is negative", () => {
    // The guard requires strideFactor > 0
    const profile = makeProfile({ strideFactor: -10 });
    expect(getStrideFactor(profile)).toBe(STRIDE_FACTOR);
  });

  it("returns calibrated strideFactor / 100 when it is a positive value", () => {
    const profile = makeProfile({ strideFactor: 41.5 });
    expect(getStrideFactor(profile)).toBeCloseTo(0.415);
  });

  it("handles a strideFactor that differs significantly from the default", () => {
    const profile = makeProfile({ strideFactor: 50 });
    expect(getStrideFactor(profile)).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// getZoneForHr
// ---------------------------------------------------------------------------

describe("getZoneForHr", () => {
  // Default bounds at maxHr=190: [0.57, 0.63, 0.76, 0.89]
  // => absolute thresholds: 108.3, 119.7, 144.4, 169.1

  it("returns zone 1 for HR clearly below zone 2 threshold", () => {
    expect(getZoneForHr(100, MAX_HR)).toBe(1);
  });

  it("returns zone 1 for HR=0", () => {
    // 0 / 190 = 0.0 < 0.57
    expect(getZoneForHr(0, MAX_HR)).toBe(1);
  });

  it("returns zone 1 for a negative HR (treated as very low pct)", () => {
    expect(getZoneForHr(-10, MAX_HR)).toBe(1);
  });

  it("returns zone 2 for HR at the exact zone-1/2 boundary (pct === b[0])", () => {
    // pct === 0.57 is NOT < 0.57, so it crosses into zone 2
    const hrAtBoundary = 0.57 * MAX_HR; // 108.3
    expect(getZoneForHr(hrAtBoundary, MAX_HR)).toBe(2);
  });

  it("returns zone 2 for HR in the middle of the zone-2 range", () => {
    expect(getZoneForHr(114, MAX_HR)).toBe(2);
  });

  it("returns zone 3 for HR at the exact zone-2/3 boundary (pct === b[1])", () => {
    const hrAtBoundary = 0.63 * MAX_HR; // 119.7
    expect(getZoneForHr(hrAtBoundary, MAX_HR)).toBe(3);
  });

  it("returns zone 3 for HR in the middle of the zone-3 range", () => {
    expect(getZoneForHr(130, MAX_HR)).toBe(3);
  });

  it("returns zone 4 for HR at the exact zone-3/4 boundary (pct === b[2])", () => {
    const hrAtBoundary = 0.76 * MAX_HR; // 144.4
    expect(getZoneForHr(hrAtBoundary, MAX_HR)).toBe(4);
  });

  it("returns zone 4 for HR in the middle of the zone-4 range", () => {
    expect(getZoneForHr(155, MAX_HR)).toBe(4);
  });

  it("returns zone 5 for HR at the exact zone-4/5 boundary (pct === b[3])", () => {
    // pct === 0.89 is NOT < 0.89, so it falls through to zone 5
    const hrAtBoundary = 0.89 * MAX_HR; // 169.1
    expect(getZoneForHr(hrAtBoundary, MAX_HR)).toBe(5);
  });

  it("returns zone 5 for HR clearly above zone-4 threshold", () => {
    expect(getZoneForHr(175, MAX_HR)).toBe(5);
  });

  it("returns zone 5 for HR equal to maxHr (pct === 1.0)", () => {
    expect(getZoneForHr(MAX_HR, MAX_HR)).toBe(5);
  });

  it("returns zone 5 for HR above maxHr (pct > 1.0)", () => {
    expect(getZoneForHr(MAX_HR + 20, MAX_HR)).toBe(5);
  });

  it("uses default maxHr=MAX_HR when the second argument is omitted", () => {
    // 100 bpm / 190 default = 0.526 → zone 1
    expect(getZoneForHr(100)).toBe(1);
  });

  it("respects custom bounds passed as the third argument", () => {
    // Custom narrower bounds: zone 2 starts at 50%, zone 3 at 60%, zone 4 at 70%, zone 5 at 80%
    const customBounds = [0.5, 0.6, 0.7, 0.8];
    // 95 bpm / 190 = 0.5 → not < 0.5, so zone 2
    expect(getZoneForHr(95, MAX_HR, customBounds)).toBe(2);
    // 120 bpm / 190 = 0.6316 → pct < 0.7 → zone 3
    expect(getZoneForHr(120, MAX_HR, customBounds)).toBe(3);
    // 160 bpm / 190 = 0.842 → zone 5
    expect(getZoneForHr(160, MAX_HR, customBounds)).toBe(5);
  });

  it("uses DEFAULT_ZONE_BOUNDS when bounds argument is undefined", () => {
    // Explicitly passing undefined should behave like omitting it
    expect(getZoneForHr(100, MAX_HR, undefined)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getZoneBpmRange
// ---------------------------------------------------------------------------

describe("getZoneBpmRange", () => {
  it("returns correct range for zone 1", () => {
    // ZONE_BOUNDS[0]=0, ZONE_BOUNDS[1]=0.57 → [0, 108]
    const [low, high] = getZoneBpmRange(1, MAX_HR);
    expect(low).toBe(Math.round(ZONE_BOUNDS[0] * MAX_HR));
    expect(high).toBe(Math.round(ZONE_BOUNDS[1] * MAX_HR));
  });

  it("returns correct range for zone 2", () => {
    // ZONE_BOUNDS[1]=0.57, ZONE_BOUNDS[2]=0.63 → [108, 120]
    const [low, high] = getZoneBpmRange(2, MAX_HR);
    expect(low).toBe(Math.round(ZONE_BOUNDS[1] * MAX_HR));
    expect(high).toBe(Math.round(ZONE_BOUNDS[2] * MAX_HR));
  });

  it("returns correct range for zone 3", () => {
    // ZONE_BOUNDS[2]=0.63, ZONE_BOUNDS[3]=0.76 → [120, 144]
    const [low, high] = getZoneBpmRange(3, MAX_HR);
    expect(low).toBe(Math.round(ZONE_BOUNDS[2] * MAX_HR));
    expect(high).toBe(Math.round(ZONE_BOUNDS[3] * MAX_HR));
  });

  it("returns correct range for zone 4", () => {
    // ZONE_BOUNDS[3]=0.76, ZONE_BOUNDS[4]=0.89 → [144, 169]
    const [low, high] = getZoneBpmRange(4, MAX_HR);
    expect(low).toBe(Math.round(ZONE_BOUNDS[3] * MAX_HR));
    expect(high).toBe(Math.round(ZONE_BOUNDS[4] * MAX_HR));
  });

  it("returns correct range for zone 5", () => {
    // ZONE_BOUNDS[4]=0.89, ZONE_BOUNDS[5]=1.0 → [169, 190]
    const [low, high] = getZoneBpmRange(5, MAX_HR);
    expect(low).toBe(Math.round(ZONE_BOUNDS[4] * MAX_HR));
    expect(high).toBe(Math.round(ZONE_BOUNDS[5] * MAX_HR));
  });

  it("uses a custom maxHr correctly", () => {
    const customMax = 200;
    const [low, high] = getZoneBpmRange(3, customMax);
    expect(low).toBe(Math.round(DEFAULT_ZONE_BOUNDS[1] * customMax)); // 0.63 * 200 = 126
    expect(high).toBe(Math.round(DEFAULT_ZONE_BOUNDS[2] * customMax)); // 0.76 * 200 = 152
  });

  it("respects custom bounds passed as the third argument", () => {
    const customBounds = [0.5, 0.6, 0.7, 0.8];
    // Zone 2 low = b[1]=0.5, high = b[2]=0.6
    const [low, high] = getZoneBpmRange(2, MAX_HR, customBounds);
    expect(low).toBe(Math.round(0.5 * MAX_HR));
    expect(high).toBe(Math.round(0.6 * MAX_HR));
  });

  it("uses default maxHr=MAX_HR when the second argument is omitted", () => {
    const [low, high] = getZoneBpmRange(1);
    expect(low).toBe(0);
    expect(high).toBe(Math.round(0.57 * MAX_HR));
  });
});

// ---------------------------------------------------------------------------
// estimateCaloriesPerSecond
// ---------------------------------------------------------------------------

describe("estimateCaloriesPerSecond", () => {
  it("returns a positive number for typical inputs", () => {
    // 150 bpm, 70 kg, 30 years
    const result = estimateCaloriesPerSecond(150, 70, 30);
    expect(result).toBeGreaterThan(0);
  });

  it("returns 0 when heartRate is 0", () => {
    expect(estimateCaloriesPerSecond(0, 70, 30)).toBe(0);
  });

  it("returns 0 when heartRate is negative", () => {
    expect(estimateCaloriesPerSecond(-10, 70, 30)).toBe(0);
  });

  it("returns 0 when weightKg is 0", () => {
    expect(estimateCaloriesPerSecond(150, 0, 30)).toBe(0);
  });

  it("returns 0 when weightKg is negative", () => {
    expect(estimateCaloriesPerSecond(150, -1, 30)).toBe(0);
  });

  it("returns 0 when age is 0", () => {
    expect(estimateCaloriesPerSecond(150, 70, 0)).toBe(0);
  });

  it("returns 0 when age is negative", () => {
    expect(estimateCaloriesPerSecond(150, 70, -5)).toBe(0);
  });

  it("clamps to 0 and does not return a negative value for extremely low inputs that produce a negative formula result", () => {
    // Very low HR, very low weight, very low age can yield a negative calsPerMin
    // (-37.549 + 0.5391*1 + 0.1626*1 + 0.1379*1) / 4.184 = (-36.534) / 4.184 < 0
    const result = estimateCaloriesPerSecond(1, 1, 1);
    expect(result).toBe(0);
  });

  it("returns a reasonable per-second rate for a high-effort scenario", () => {
    // 180 bpm, 80 kg, 40 years — should be well under 1 cal/s for typical humans
    const result = estimateCaloriesPerSecond(180, 80, 40);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it("produces higher output for higher heart rate, all else equal", () => {
    const low = estimateCaloriesPerSecond(120, 70, 30);
    const high = estimateCaloriesPerSecond(180, 70, 30);
    expect(high).toBeGreaterThan(low);
  });

  it("produces higher output for higher weight, all else equal", () => {
    const light = estimateCaloriesPerSecond(150, 60, 30);
    const heavy = estimateCaloriesPerSecond(150, 90, 30);
    expect(heavy).toBeGreaterThan(light);
  });

  it("produces higher output for higher age, all else equal", () => {
    const young = estimateCaloriesPerSecond(150, 70, 20);
    const older = estimateCaloriesPerSecond(150, 70, 50);
    expect(older).toBeGreaterThan(young);
  });

  it("matches the manual formula result for known inputs", () => {
    const hr = 150;
    const kg = 70;
    const age = 30;
    const calsPerMin = (-37.549 + 0.5391 * hr + 0.1626 * kg + 0.1379 * age) / 4.184;
    const expected = Math.max(0, calsPerMin / 60);
    expect(estimateCaloriesPerSecond(hr, kg, age)).toBeCloseTo(expected, 10);
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  it("formats 0 seconds as 0:00", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("formats single-digit seconds with a leading zero", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  it("formats double-digit seconds without padding", () => {
    expect(formatDuration(75)).toBe("1:15");
  });

  it("formats exactly 60 seconds as 1:00", () => {
    expect(formatDuration(60)).toBe("1:00");
  });

  it("formats 3600 seconds as 60:00", () => {
    expect(formatDuration(3600)).toBe("60:00");
  });

  it("formats 59 seconds as 0:59", () => {
    expect(formatDuration(59)).toBe("0:59");
  });
});

// ---------------------------------------------------------------------------
// speedToPace
// ---------------------------------------------------------------------------

describe("speedToPace", () => {
  it("returns Infinity when speed is 0", () => {
    expect(speedToPace(0)).toBe(Infinity);
  });

  it("returns Infinity when speed is negative", () => {
    expect(speedToPace(-5)).toBe(Infinity);
  });

  it("returns 10 min/km for 6 km/h (60 / 6 = 10)", () => {
    expect(speedToPace(6)).toBe(10);
  });

  it("returns 6 min/km for 10 km/h", () => {
    expect(speedToPace(10)).toBe(6);
  });

  it("returns 4 min/km for 15 km/h", () => {
    expect(speedToPace(15)).toBeCloseTo(4);
  });

  it("returns a very large pace for very slow speed", () => {
    expect(speedToPace(0.1)).toBeCloseTo(600);
  });
});

// ---------------------------------------------------------------------------
// formatPace
// ---------------------------------------------------------------------------

describe("formatPace", () => {
  it("returns '—' when speed is 0", () => {
    expect(formatPace(0)).toBe("—");
  });

  it("returns '—' when speed is negative", () => {
    expect(formatPace(-1)).toBe("—");
    expect(formatPace(-100)).toBe("—");
  });

  it("formats a typical jogging pace correctly (10 km/h → 6:00 /km)", () => {
    expect(formatPace(10)).toBe("6:00 /km");
  });

  it("formats a walking pace correctly (6 km/h → 10:00 /km)", () => {
    expect(formatPace(6)).toBe("10:00 /km");
  });

  it("formats a fast running pace (15 km/h → 4:00 /km)", () => {
    expect(formatPace(15)).toBe("4:00 /km");
  });

  it("pads seconds with a leading zero when seconds < 10", () => {
    // 8 km/h → 60/8 = 7.5 min/km → 7 min 30 sec → "7:30 /km"
    expect(formatPace(8)).toBe("7:30 /km");
  });

  it("formats a pace with non-zero seconds that does not need padding", () => {
    // 9 km/h → 60/9 ≈ 6.667 min/km → 6 min 40 sec → "6:40 /km"
    expect(formatPace(9)).toBe("6:40 /km");
  });

  it("handles very slow speed with large minute value", () => {
    // 1 km/h → 60 min/km → "60:00 /km"
    expect(formatPace(1)).toBe("60:00 /km");
  });

  it("handles a very fast sprint speed", () => {
    // 20 km/h → 3 min/km → "3:00 /km"
    expect(formatPace(20)).toBe("3:00 /km");
  });

  it("rounds seconds correctly (pace with fractional seconds)", () => {
    // 7 km/h → 60/7 ≈ 8.5714 min → 8 min 34.28... sec → rounds to 34 → "8:34 /km"
    expect(formatPace(7)).toBe("8:34 /km");
  });
});

import { getZoneForHr, getZoneBpmRange, formatDuration, getMaxHrForAge, MAX_HR, ZONE_BOUNDS } from "./wearable";

describe("getZoneForHr", () => {
  it("returns zone 1 for low HR", () => {
    expect(getZoneForHr(100, MAX_HR)).toBe(1); // 100/190 = 0.526 < 0.57
  });

  it("returns zone 2 for HR in 57-63% range", () => {
    expect(getZoneForHr(114, MAX_HR)).toBe(2); // 114/190 = 0.6 → zone 2
  });

  it("returns zone 3 for HR in 63-76% range", () => {
    expect(getZoneForHr(130, MAX_HR)).toBe(3); // 130/190 = 0.684 → zone 3
  });

  it("returns zone 4 for HR in 76-89% range", () => {
    expect(getZoneForHr(155, MAX_HR)).toBe(4); // 155/190 = 0.816 → zone 4
  });

  it("returns zone 5 for HR >= 89%", () => {
    expect(getZoneForHr(175, MAX_HR)).toBe(5); // 175/190 = 0.921 → zone 5
  });
});

describe("getZoneBpmRange", () => {
  it("returns correct range for zone 3", () => {
    const [low, high] = getZoneBpmRange(3, MAX_HR);
    expect(low).toBe(Math.round(ZONE_BOUNDS[2] * MAX_HR)); // 120
    expect(high).toBe(Math.round(ZONE_BOUNDS[3] * MAX_HR)); // 144
  });
});

describe("getMaxHrForAge", () => {
  it("returns 220 - age for valid ages", () => {
    expect(getMaxHrForAge(30)).toBe(190);
    expect(getMaxHrForAge(20)).toBe(200);
    expect(getMaxHrForAge(50)).toBe(170);
  });

  it("returns MAX_HR for boundary ages", () => {
    expect(getMaxHrForAge(5)).toBe(215);
    expect(getMaxHrForAge(120)).toBe(100);
  });

  it("returns MAX_HR fallback for undefined or out-of-range", () => {
    expect(getMaxHrForAge(undefined)).toBe(MAX_HR);
    expect(getMaxHrForAge(0)).toBe(MAX_HR);
    expect(getMaxHrForAge(121)).toBe(MAX_HR);
    expect(getMaxHrForAge(-1)).toBe(MAX_HR);
  });
});

describe("formatDuration", () => {
  it("formats 0 as 0:00", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("formats 65 as 1:05", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  it("formats 3600 as 60:00", () => {
    expect(formatDuration(3600)).toBe("60:00");
  });
});

import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { PlayerHud } from "./PlayerHud";
import type { ClientProfile, WearableData } from "../../types/session";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

const makeProfile = (overrides: Partial<ClientProfile> = {}): ClientProfile => ({
  clientId: "client-1",
  name: "Alice",
  age: 30,
  heightCm: 170,
  weightKg: 70,
  ...overrides,
});

const makeData = (overrides: Partial<WearableData> = {}): WearableData => ({
  clientId: "client-1",
  heartRate: 140,
  steps: 500,
  speedKmh: 8,
  timestamp: new Date().toISOString(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../utils/wearable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/wearable")>();
  return {
    ...actual,
    // Keep real implementations — we spy or override per-test where needed.
  };
});

// ---------------------------------------------------------------------------
// Branch 1 — latestData is null (early return)
// ---------------------------------------------------------------------------

describe("PlayerHud — no data yet", () => {
  it("renders the player name when latestData is null", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={null}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders 'No data yet' when latestData is null", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={null}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("does not render Speed or Heart Rate labels when latestData is null", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={null}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.queryByText(/Speed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Heart Rate/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branch 2 — heartRate > 0 → zone badge is shown
// ---------------------------------------------------------------------------

describe("PlayerHud — zone badge when heartRate > 0", () => {
  it("shows a zone badge (Z1–Z5) when heartRate is above zero", () => {
    // 140 bpm with default maxHr ~190 → 140/190 ≈ 73.7% → Zone 3
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ heartRate: 140 })}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText(/^Z[1-5]$/)).toBeInTheDocument();
  });

  it("renders the correct zone number for a high heart rate (Zone 5)", () => {
    // 185 bpm, default maxHr 190 → 185/190 ≈ 97.4% → Zone 5 (>= 89%)
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ heartRate: 185 })}
        profile={makeProfile({ age: 30 })} // maxHr = 220-30 = 190
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Z5")).toBeInTheDocument();
  });

  it("applies dark text color (#111) for zones 1 and 2", () => {
    // Zone 1: below 57% of 190 ≈ below 108 bpm
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ heartRate: 100 })}
        profile={makeProfile({ age: 30 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    const badge = screen.getByText("Z1");
    expect(badge).toHaveStyle({ color: "#111" });
  });

  it("applies light text color (#fff) for zones 3, 4 and 5", () => {
    // Zone 3: 63–76% of 190 → 120–144 bpm. Use 130.
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ heartRate: 130 })}
        profile={makeProfile({ age: 30 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    const badge = screen.getByText("Z3");
    expect(badge).toHaveStyle({ color: "#fff" });
  });
});

// ---------------------------------------------------------------------------
// Branch 3 — heartRate === 0 → zone is null, no zone badge
// ---------------------------------------------------------------------------

describe("PlayerHud — no zone badge when heartRate is 0", () => {
  it("does not render a zone badge when heartRate is 0", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ heartRate: 0 })}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.queryByText(/^Z[1-5]$/)).not.toBeInTheDocument();
  });

  it("still renders the heart rate value (0) without a badge", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ heartRate: 0 })}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    // 0 is rendered as the bpm value; there may be other zeros on screen
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Z[1-5]$/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branch 4 — caloriesDisplay > 0 → calories section shown
// ---------------------------------------------------------------------------

describe("PlayerHud — calories section visibility", () => {
  it("shows Calories label and value when caloriesDisplay > 0", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile()}
        caloriesDisplay={250}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Calories")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("kcal")).toBeInTheDocument();
  });

  it("hides Calories section when caloriesDisplay is 0", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.queryByText("Calories")).not.toBeInTheDocument();
    expect(screen.queryByText("kcal")).not.toBeInTheDocument();
  });

  it("hides Calories section when caloriesDisplay is negative", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile()}
        caloriesDisplay={-5}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.queryByText("Calories")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branch 5 — profile null → strideCm is null, stride section hidden
// ---------------------------------------------------------------------------

describe("PlayerHud — stride section with no profile", () => {
  it("does not render the Stride section when profile is null", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={null}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.queryByText("Stride")).not.toBeInTheDocument();
  });

  it("does not render the Stride section when profile has no heightCm", () => {
    // Cast to bypass TypeScript; the component defensively uses optional chaining.
    const profileWithoutHeight = {
      clientId: "client-1",
      name: "Alice",
      age: 30,
      weightKg: 70,
    } as ClientProfile;

    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={profileWithoutHeight}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.queryByText("Stride")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branch 6 — profile with heightCm but NOT calibrated → stride shown, no diff
// ---------------------------------------------------------------------------

describe("PlayerHud — stride section without calibration", () => {
  it("renders the Stride section when profile has heightCm", () => {
    // strideFactor absent → isCalibrated = false → strideDiffCm = null
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile({ heightCm: 170 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Stride")).toBeInTheDocument();
  });

  it("shows the stride value in cm using speed-dependent curve when not calibrated", () => {
    // At speedKmh=8, default curve factor=0.55. strideCm = 170 * (0.55/100) * 100 = 93.5 → "94"
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile({ heightCm: 170 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("94")).toBeInTheDocument();
  });

  it("does not render the stride diff span when not calibrated", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile({ heightCm: 170 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    // strideDiffCm is null → diff span not rendered; no "+"/"-" prefix for stride
    // Check that neither a positive nor negative diff marker appears
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it("treats strideFactor === 0 as not calibrated (stride section visible, no diff)", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile({ heightCm: 170, strideFactor: 0 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    // strideFactor 0 → isCalibrated = false (condition: strideFactor > 0)
    expect(screen.getByText("Stride")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it("treats strideFactor === 0.415 as not calibrated (default value, no diff)", () => {
    // strideFactor 0.415 matches the default constant → isCalibrated = false
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile({ heightCm: 170, strideFactor: 0.415 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Stride")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branch 7 — isCalibrated true → stride section shown WITH positive diff
// ---------------------------------------------------------------------------

describe("PlayerHud — stride section with calibration (positive diff)", () => {
  it("shows a positive diff when calibrated strideFactor is larger than default 0.415", () => {
    // Default stride: 170 * 0.415 * 100 = 70.55 cm
    // Calibrated stride (strideFactor 50 / 100 = 0.50): 170 * 0.50 * 100 = 85 cm
    // diff = 85 - 70.55 = 14.45 → toFixed(1) = "14.5"
    // getStrideFactor uses strideFactor/100 when strideFactor > 0
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile({ heightCm: 170, strideFactor: 50 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Stride")).toBeInTheDocument();
    // Positive diff has "+" prefix
    const diffEl = screen.getByText(/^\+/);
    expect(diffEl).toBeInTheDocument();
    expect(diffEl).toHaveStyle({ color: "#33DFFF" });
  });
});

// ---------------------------------------------------------------------------
// Branch 8 — isCalibrated true → stride section shown WITH negative diff
// ---------------------------------------------------------------------------

describe("PlayerHud — stride section with calibration (negative diff)", () => {
  it("shows a negative diff when calibrated strideFactor is smaller than default 0.415", () => {
    // STRIDE_FACTOR = 0.415 / 100 = 0.00415
    // Default stride: 170 * 0.00415 * 100 = 70.55 cm
    // getStrideFactor with strideFactor=0.30 returns 0.30/100 = 0.003
    // Calibrated stride: 170 * 0.003 * 100 = 51 cm
    // diff = 51 - 70.55 = -19.55 → toFixed(1) = "-19.6"
    // isCalibrated: strideFactor (0.30) != null, > 0, and !== 0.415 → true
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile({ heightCm: 170, strideFactor: 0.30 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Stride")).toBeInTheDocument();
    // Negative diff has no "+" prefix and uses red brand color
    const diffEl = screen.getByText(/^-/);
    expect(diffEl).toBeInTheDocument();
    expect(diffEl).toHaveStyle({ color: "#FF5C75" });
  });
});

// ---------------------------------------------------------------------------
// Branch 9 — totalDistanceDisplay as number vs string
// ---------------------------------------------------------------------------

describe("PlayerHud — totalDistanceDisplay formatting", () => {
  it("formats a numeric totalDistanceDisplay with toFixed(0) and ' m' suffix", () => {
    // 1234.7 → "1235 m"
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={1234.7}
      />,
    );
    expect(screen.getByText("1235 m")).toBeInTheDocument();
  });

  it("appends ' m' to a string totalDistanceDisplay without numeric formatting", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={"1.2 km"}
      />,
    );
    expect(screen.getByText("1.2 km m")).toBeInTheDocument();
  });

  it("handles zero numeric distance as '0 m'", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("0 m")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branch 10 — Speed and Steps always rendered when latestData is present
// ---------------------------------------------------------------------------

describe("PlayerHud — speed and steps always shown with latestData", () => {
  it("shows the speed value in km/h", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ speedKmh: 9.5 })}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("9.5")).toBeInTheDocument();
    expect(screen.getByText("km/h")).toBeInTheDocument();
  });

  it("shows formatted pace alongside speed", () => {
    // 10 km/h → pace = 60/10 = 6:00 /km
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ speedKmh: 10 })}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("6:00 /km")).toBeInTheDocument();
  });

  it("shows '—' pace when speed is 0", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ speedKmh: 0 })}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the steps value", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ steps: 1337 })}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("1337")).toBeInTheDocument();
  });

  it("renders all section labels: Speed, Heart Rate, Steps, Distance", () => {
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData()}
        profile={makeProfile()}
        caloriesDisplay={0}
        totalDistanceDisplay={100}
      />,
    );
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("Heart Rate")).toBeInTheDocument();
    expect(screen.getByText("Steps")).toBeInTheDocument();
    expect(screen.getByText("Distance")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branch 11 — profile with maxHr override used for zone calculation
// ---------------------------------------------------------------------------

describe("PlayerHud — custom maxHr on profile", () => {
  it("uses profile.maxHr for zone calculation when set", () => {
    // maxHr = 200, HR = 180 → 180/200 = 90% → Zone 5 (>= 89%)
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ heartRate: 180 })}
        profile={makeProfile({ maxHr: 200 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Z5")).toBeInTheDocument();
  });

  it("falls back to age-based maxHr when maxHr is not set on profile", () => {
    // age 30 → maxHr = 190; HR 100 → 100/190 ≈ 52.6% → below 57% → Zone 1
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ heartRate: 100 })}
        profile={makeProfile({ age: 30 })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Z1")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branch 12 — custom zoneBounds on profile
// ---------------------------------------------------------------------------

describe("PlayerHud — custom zoneBounds on profile", () => {
  it("applies custom zoneBounds when computing the zone", () => {
    // Custom bounds: [0.4, 0.6, 0.75, 0.9]
    // HR 100, maxHr 190 (age 30) → 100/190 ≈ 52.6% — between 0.4 and 0.6 → Zone 2
    render(
      <PlayerHud
        name="Alice"
        latestData={makeData({ heartRate: 100 })}
        profile={makeProfile({ age: 30, zoneBounds: [0.4, 0.6, 0.75, 0.9] })}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Z2")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branch 13 — player name rendered in both early return and main render
// ---------------------------------------------------------------------------

describe("PlayerHud — player name always rendered", () => {
  it("renders the player name in the main data view", () => {
    render(
      <PlayerHud
        name="Bob"
        latestData={makeData()}
        profile={null}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders the player name in the no-data early return", () => {
    render(
      <PlayerHud
        name="Carol"
        latestData={null}
        profile={null}
        caloriesDisplay={0}
        totalDistanceDisplay={0}
      />,
    );
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });
});

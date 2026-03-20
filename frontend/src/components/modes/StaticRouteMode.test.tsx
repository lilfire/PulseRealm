import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";

// Mock staticMaps utils
vi.mock("../../utils/staticMaps", () => ({
  computeDistanceBetween: vi.fn(() => 5000),
  staticMapUrl: vi.fn(() => "/mock-map-url"),
}));

// Mock wearable utils
vi.mock("../../utils/wearable", () => ({
  estimateCaloriesPerSecond: vi.fn(() => 0.1),
  getZoneForHr: vi.fn(() => 3),
  getMaxHrForProfile: vi.fn(() => 190),
  ZONE_COLORS: ["#93c5fd", "#4ade80", "#facc15", "#fb923c", "#ef4444"],
  formatPace: vi.fn(() => "7:30 /km"),
}));

import { StaticRouteMode } from "./StaticRouteMode";
import type { ClientProfile, WearableData } from "../../types/session";
import type { RouteConfig } from "../lobbies/RouteLobby";
import { computeDistanceBetween, staticMapUrl } from "../../utils/staticMaps";

const makeProfile = (overrides?: Partial<ClientProfile>): ClientProfile => ({
  clientId: "c1",
  name: "Alice",
  heightCm: 170,
  weightKg: 65,
  age: 30,
  ...overrides,
});

const makeData = (overrides?: Partial<WearableData>): WearableData => ({
  clientId: "c1",
  heartRate: 140,
  steps: 500,
  timestamp: new Date().toISOString(),
  speedKmh: 8,
  ...overrides,
});

const makeRoute = (): RouteConfig => ({
  from: { lat: 40.7, lng: -74.0, address: "NYC" },
  to: { lat: 40.8, lng: -73.9, address: "Harlem" },
});

describe("StaticRouteMode", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Default: directions fetch succeeds
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/maps/directions")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            overview_polyline: "enc123",
            distance_meters: 5000,
            points: [
              { lat: 40.7, lng: -74.0 },
              { lat: 40.75, lng: -73.95 },
              { lat: 40.8, lng: -73.9 },
            ],
          }),
        });
      }
      // Map image fetch
      return Promise.resolve({ ok: true });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  function renderMode(overrides?: {
    role?: string;
    latestData?: WearableData | null;
  }) {
    const onEnd = vi.fn();
    const result = render(
      <StaticRouteMode
        clients={["c1"]}
        clientProfiles={{ c1: makeProfile() }}
        latestData={overrides?.latestData ?? null}
        route={makeRoute()}
        onEnd={onEnd}
        role={(overrides?.role as any) ?? "host"}
      />,
    );
    return { onEnd, ...result };
  }

  it("renders the static mode notice", () => {
    renderMode();
    expect(screen.getByText("Static mode (limited browser)")).toBeInTheDocument();
  });

  it("renders End Realm button for host", () => {
    renderMode({ role: "host" });
    expect(screen.getByText("End Realm")).toBeInTheDocument();
  });

  it("hides End Realm button for guest", () => {
    renderMode({ role: "guest" });
    expect(screen.queryByText("End Realm")).not.toBeInTheDocument();
  });

  it("calls onEnd when End Realm is clicked", () => {
    const { onEnd } = renderMode();
    fireEvent.click(screen.getByText("End Realm"));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("fetches directions on mount", async () => {
    renderMode();

    await act(async () => {
      await Promise.resolve();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/maps/directions")
    );
  });

  it("builds initial map URL via staticMapUrl", async () => {
    renderMode();

    await act(async () => {
      await Promise.resolve();
    });

    expect(staticMapUrl).toHaveBeenCalled();
  });

  it("shows player name in HUD", () => {
    renderMode();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows 'No data yet' when latestData is null", () => {
    renderMode({ latestData: null });
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("shows speed and HR when latestData is provided", () => {
    renderMode({ latestData: makeData() });
    expect(screen.getByText("8.0 km/h")).toBeInTheDocument();
    expect(screen.getByText("140 bpm")).toBeInTheDocument();
    expect(screen.getByText("500 steps")).toBeInTheDocument();
  });

  it("shows zone badge for non-zero HR", () => {
    renderMode({ latestData: makeData({ heartRate: 150 }) });
    expect(screen.getByText("Z3")).toBeInTheDocument();
  });

  it("displays route distance", async () => {
    (computeDistanceBetween as ReturnType<typeof vi.fn>).mockReturnValue(5000);
    renderMode();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/km/)).toBeInTheDocument();
  });

  it("shows progress percentage", () => {
    renderMode();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("retries map fetch with exponential backoff on failure", async () => {
    let callCount = 0;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/maps/directions")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            overview_polyline: "enc",
            distance_meters: 1000,
            points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
          }),
        });
      }
      callCount++;
      if (callCount <= 2) return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true });
    });

    renderMode();

    // First map fetch
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // Advance for retry at 2s
    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { await Promise.resolve(); });

    // Advance for retry at 4s
    await act(async () => { vi.advanceTimersByTime(4000); });
    await act(async () => { await Promise.resolve(); });

    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it("shows map error when all retries exhausted", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/maps/directions")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            overview_polyline: "enc",
            distance_meters: 1000,
            points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "API key invalid" }),
      });
    });

    renderMode();

    // Allow initial fetch + all 5 retries (0 + 2s + 4s + 8s + 16s)
    for (const delay of [0, 2000, 4000, 8000, 16000]) {
      await act(async () => { vi.advanceTimersByTime(delay); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    }

    // After all retries exhausted on initial load, should show error
    expect(screen.getByText("Map unavailable")).toBeInTheDocument();
  });

  it("shows 'Route Complete!' when finished", async () => {
    // Make computeDistanceBetween return tiny distance so route completes fast
    (computeDistanceBetween as ReturnType<typeof vi.fn>).mockReturnValue(5);

    // Directions also return tiny distance
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/maps/directions")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            overview_polyline: "enc",
            distance_meters: 5,
            points: [{ lat: 40.7, lng: -74.0 }, { lat: 40.8, lng: -73.9 }],
          }),
        });
      }
      return Promise.resolve({ ok: true });
    });

    render(
      <StaticRouteMode
        clients={["c1"]}
        clientProfiles={{ c1: makeProfile() }}
        latestData={makeData({ speedKmh: 100 })}
        route={makeRoute()}
        onEnd={vi.fn()}
        role="host"
      />,
    );

    // Let directions fetch resolve
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // Advance enough 500ms intervals for route to complete (100km/h = 27.8 m/s, 5m in ~0.2s)
    for (let i = 0; i < 10; i++) {
      await act(async () => { vi.advanceTimersByTime(500); });
    }

    expect(screen.getByText("Route Complete!")).toBeInTheDocument();
  });

  it("accumulates calories when profile has weight/age", async () => {
    // Make estimateCaloriesPerSecond return a larger value
    const { estimateCaloriesPerSecond } = await import("../../utils/wearable");
    (estimateCaloriesPerSecond as ReturnType<typeof vi.fn>).mockReturnValue(5);

    renderMode({ latestData: makeData({ heartRate: 140 }) });

    // Advance several 1-second calorie ticks
    for (let i = 0; i < 5; i++) {
      await act(async () => { vi.advanceTimersByTime(1000); });
    }

    // Calories should have accumulated (5 * 5 = 25 kcal)
    expect(screen.getByText(/kcal/)).toBeInTheDocument();
  });

  it("shows 'Waiting for player...' when no client", () => {
    render(
      <StaticRouteMode
        clients={[]}
        clientProfiles={{}}
        latestData={null}
        route={makeRoute()}
        onEnd={vi.fn()}
      />,
    );
    expect(screen.getByText("Waiting for player...")).toBeInTheDocument();
  });

  it("handles directions fetch failure gracefully", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/maps/directions")) {
        return Promise.reject(new Error("network error"));
      }
      return Promise.resolve({ ok: true });
    });

    // Should not throw
    renderMode();

    await act(async () => { await Promise.resolve(); });

    // Still renders
    expect(screen.getByText("Static mode (limited browser)")).toBeInTheDocument();
  });
});

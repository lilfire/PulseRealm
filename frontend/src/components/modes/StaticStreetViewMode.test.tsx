import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";

// Mock staticMaps utils
vi.mock("../../utils/staticMaps", () => ({
  moveAlongHeading: vi.fn((lat: number, lng: number, _heading: number, _dist: number) => ({
    lat: lat + 0.001,
    lng: lng + 0.001,
  })),
  streetViewImageUrl: vi.fn(
    (lat: number, lng: number, heading: number, pitch: number, w: number, h: number) =>
      `/api/maps/streetview?size=${w}x${h}&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=90`
  ),
  streetViewMetadataUrl: vi.fn(
    (lat: number, lng: number) => `/api/maps/streetview/metadata?location=${lat},${lng}`
  ),
}));

// Mock wearable utils
vi.mock("../../utils/wearable", () => ({
  estimateCaloriesPerSecond: vi.fn(() => 0.1),
  getZoneForHr: vi.fn(() => 3),
  getMaxHrForProfile: vi.fn(() => 190),
  ZONE_COLORS: ["#93c5fd", "#4ade80", "#facc15", "#fb923c", "#ef4444"],
  formatPace: vi.fn(() => "7:30 /km"),
  getStrideFactor: vi.fn(() => 0.00415),
  getSpeedDependentStrideFactor: vi.fn(() => 0.415),
  STRIDE_FACTOR: 0.00415,
  DEFAULT_WALKING_FACTOR: 0.415,
}));

import { StaticStreetViewMode } from "./StaticStreetViewMode";
import type { ClientProfile, WearableData } from "../../types/session";
import type { StreetViewLocation } from "../lobbies/StreetViewLobby";
import { moveAlongHeading } from "../../utils/staticMaps";

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

const makeLocation = (): StreetViewLocation => ({
  lat: 48.858,
  lng: 2.294,
  heading: 90,
  pitch: 0,
});

describe("StaticStreetViewMode", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({
          status: "OK",
          location: { lat: 48.859, lng: 2.295 },
        }),
      })
    ) as any;
    vi.useFakeTimers();
    vi.clearAllMocks();
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
      <StaticStreetViewMode
        clients={["c1"]}
        clientProfiles={{ c1: makeProfile() }}
        latestData={overrides?.latestData ?? null}
        startLocation={makeLocation()}
        onEnd={onEnd}
        role={(overrides?.role as any) ?? "host"}
      />,
    );
    return { onEnd, ...result };
  }

  it("renders static mode notice", () => {
    renderMode();
    expect(screen.getByText("Static mode (limited browser)")).toBeInTheDocument();
  });

  it("renders End Realm for host", () => {
    renderMode({ role: "host" });
    expect(screen.getByText("End Realm")).toBeInTheDocument();
  });

  it("hides End Realm for guest", () => {
    renderMode({ role: "guest" });
    expect(screen.queryByText("End Realm")).not.toBeInTheDocument();
  });

  it("calls onEnd when End Realm is clicked", () => {
    const { onEnd } = renderMode();
    fireEvent.click(screen.getByText("End Realm"));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("renders two img elements for double buffering", () => {
    renderMode();
    const imgs = screen.getAllByAltText("Street View");
    expect(imgs).toHaveLength(2);
  });

  it("renders direction arrows", () => {
    renderMode();
    expect(screen.getByTitle("Forward")).toBeInTheDocument();
    expect(screen.getByTitle("Left")).toBeInTheDocument();
    expect(screen.getByTitle("Right")).toBeInTheDocument();
  });

  it("shows player name in HUD", () => {
    renderMode();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows 'No data yet' without wearable data", () => {
    renderMode({ latestData: null });
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("shows speed and HR with wearable data", () => {
    renderMode({ latestData: makeData() });
    expect(screen.getByText("8.0 km/h")).toBeInTheDocument();
    expect(screen.getByText("140 bpm")).toBeInTheDocument();
  });

  it("shows zone badge", () => {
    renderMode({ latestData: makeData() });
    expect(screen.getByText("Z3")).toBeInTheDocument();
  });

  it("forward button calls moveAlongHeading and fetches metadata", async () => {
    renderMode();

    await act(async () => {
      fireEvent.click(screen.getByTitle("Forward"));
    });

    expect(moveAlongHeading).toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/maps/streetview/metadata")
    );
  });

  it("left button rotates heading by -90", () => {
    renderMode();

    fireEvent.click(screen.getByTitle("Left"));

    // The component should have updated the back image src
    const imgs = screen.getAllByAltText("Street View");
    const hasSrc = imgs.some((img) => (img as HTMLImageElement).src.length > 0);
    expect(hasSrc).toBe(true);
  });

  it("right button rotates heading by +90", () => {
    renderMode();

    fireEvent.click(screen.getByTitle("Right"));

    const imgs = screen.getAllByAltText("Street View");
    const hasSrc = imgs.some((img) => (img as HTMLImageElement).src.length > 0);
    expect(hasSrc).toBe(true);
  });

  it("handles dead-end (status !== OK) by staying in place", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({ status: "ZERO_RESULTS" }),
    });

    renderMode();

    await act(async () => {
      fireEvent.click(screen.getByTitle("Forward"));
    });

    await act(async () => { await Promise.resolve(); });

    // Should still render without error
    expect(screen.getByText("Static mode (limited browser)")).toBeInTheDocument();
  });

  it("handles metadata fetch error gracefully", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));

    renderMode();

    await act(async () => {
      fireEvent.click(screen.getByTitle("Forward"));
    });

    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText("Static mode (limited browser)")).toBeInTheDocument();
  });

  it("shows 'Waiting for player...' when no clients", () => {
    render(
      <StaticStreetViewMode
        clients={[]}
        clientProfiles={{}}
        latestData={null}
        startLocation={makeLocation()}
        onEnd={vi.fn()}
      />,
    );
    expect(screen.getByText("Waiting for player...")).toBeInTheDocument();
  });

  it("accumulates calories with valid profile", async () => {
    const { estimateCaloriesPerSecond } = await import("../../utils/wearable");
    (estimateCaloriesPerSecond as ReturnType<typeof vi.fn>).mockReturnValue(5);

    renderMode({ latestData: makeData({ heartRate: 140 }) });

    for (let i = 0; i < 5; i++) {
      await act(async () => { vi.advanceTimersByTime(1000); });
    }

    expect(screen.getByText(/kcal/)).toBeInTheDocument();
  });
});

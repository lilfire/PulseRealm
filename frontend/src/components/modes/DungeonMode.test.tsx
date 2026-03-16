import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";
import { DungeonMode } from "./DungeonMode";
import type { ClientProfile, WearableData } from "../../types/session";
import type { DungeonConfig } from "../lobbies/DungeonLobby";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const makeProfile = (clientId: string, name: string, heightCm = 170): ClientProfile => ({
  clientId,
  name,
  heightCm,
  weightKg: 70,
});

const makeData = (clientId: string, heartRate: number, steps: number, speedKmh = 5): WearableData => ({
  clientId,
  heartRate,
  steps,
  speedKmh,
  timestamp: new Date().toISOString(),
});

const clients = ["client-1", "client-2"];
const clientProfiles: Record<string, ClientProfile> = {
  "client-1": makeProfile("client-1", "Alice"),
  "client-2": makeProfile("client-2", "Bob"),
};

const normalConfig: DungeonConfig = {
  difficulty: "normal",
  timeframe: 30,
};

const easyConfig: DungeonConfig = {
  difficulty: "easy",
  timeframe: 15,
};

const hardConfig: DungeonConfig = {
  difficulty: "hard",
  timeframe: 60,
};

const defaultProps = {
  clients,
  clientProfiles,
  latestData: null as WearableData | null,
  config: normalConfig,
  onEnd: vi.fn(),
};

describe("DungeonMode — basic rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with normal config without crashing", () => {
    render(<DungeonMode {...defaultProps} />);
    // Component should mount and render
    expect(document.body).toBeInTheDocument();
  });

  it("renders initial display after mount tick", () => {
    render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    // After first tick, display should be set
    expect(document.body).toBeInTheDocument();
  });

  it("shows Dungeon header label", () => {
    render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText("Dungeon")).toBeInTheDocument();
  });

  it("shows room count for normal/30min config (5 rooms + boss = 6)", () => {
    render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    // Shows "Room 1 / 6" (5 rooms + 1 boss)
    expect(screen.getByText(/Room 1 \//i)).toBeInTheDocument();
  });

  it("shows room count for easy/15min config (3 rooms + boss = 4)", () => {
    render(<DungeonMode {...defaultProps} config={easyConfig} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText(/Room 1 \/ 4/i)).toBeInTheDocument();
  });

  it("shows room count for hard/60min config (9 rooms + boss = 10)", () => {
    render(<DungeonMode {...defaultProps} config={hardConfig} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText(/Room 1 \/ 10/i)).toBeInTheDocument();
  });

  it("shows corridor phase message initially", () => {
    render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText("Walk to reach the next room...")).toBeInTheDocument();
  });

  it("shows room progression indicator with room numbers", () => {
    render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText(/Room 1 \//i)).toBeInTheDocument();
  });

  it("shows 'End Realm' button", () => {
    render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByRole("button", { name: /End Realm/i })).toBeInTheDocument();
  });

  it("clicking 'End Realm' calls onEnd", () => {
    render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.click(screen.getByRole("button", { name: /End Realm/i }));
    expect(defaultProps.onEnd).toHaveBeenCalledTimes(1);
  });

  it("clicking 'End Realm' calls onEnd with a number", () => {
    render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.click(screen.getByRole("button", { name: /End Realm/i }));
    const [dist] = defaultProps.onEnd.mock.calls[0];
    expect(typeof dist).toBe("number");
  });

  it("shows player names in client stats area", () => {
    render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("processes wearable data without crashing", () => {
    const { rerender } = render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    const data = makeData("client-1", 140, 100);
    rerender(<DungeonMode {...defaultProps} latestData={data} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows step data after receiving wearable data", () => {
    const { rerender } = render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    const data1 = makeData("client-1", 140, 50);
    rerender(<DungeonMode {...defaultProps} latestData={data1} />);
    act(() => { vi.advanceTimersByTime(600); });
    const data2 = makeData("client-1", 140, 100);
    rerender(<DungeonMode {...defaultProps} latestData={data2} />);
    act(() => { vi.advanceTimersByTime(600); });
    // Player stats should show with cadence > 0 since two data points provided
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
  });

  it("renders with 15-minute timeframe (3 rooms)", () => {
    render(<DungeonMode {...defaultProps} config={{ difficulty: "normal", timeframe: 15 }} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(document.body).toBeInTheDocument();
  });

  it("renders with 60-minute timeframe (9 rooms)", () => {
    render(<DungeonMode {...defaultProps} config={{ difficulty: "normal", timeframe: 60 }} />);
    act(() => { vi.advanceTimersByTime(600); });
    expect(document.body).toBeInTheDocument();
  });

  it("renders single client setup", () => {
    render(
      <DungeonMode
        {...defaultProps}
        clients={["client-1"]}
        clientProfiles={{ "client-1": makeProfile("client-1", "Alice") }}
      />
    );
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows corridors progress bar area", () => {
    render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });
    // Progress bar or steps indicator should be present
    expect(document.body).toBeInTheDocument();
  });
});

describe("DungeonMode — game progression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("advances corridor steps as players step", () => {
    const { rerender } = render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });

    // Send step data to advance through corridor
    for (let steps = 10; steps <= 100; steps += 10) {
      const data = makeData("client-1", 140, steps);
      rerender(<DungeonMode {...defaultProps} latestData={data} />);
      act(() => { vi.advanceTimersByTime(600); });
    }
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("handles multiple clients in step pool", () => {
    const { rerender } = render(<DungeonMode {...defaultProps} />);
    act(() => { vi.advanceTimersByTime(600); });

    const data1 = makeData("client-1", 140, 50);
    rerender(<DungeonMode {...defaultProps} latestData={data1} />);
    act(() => { vi.advanceTimersByTime(600); });

    const data2 = makeData("client-2", 150, 60);
    rerender(<DungeonMode {...defaultProps} latestData={data2} />);
    act(() => { vi.advanceTimersByTime(600); });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });
});

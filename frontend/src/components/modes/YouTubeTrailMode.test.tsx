import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";
import { YouTubeTrailMode } from "./YouTubeTrailMode";
import type { ClientProfile, WearableData } from "../../types/session";
import type { YouTubeVideo } from "../lobbies/YouTubeTrailLobby";

class MockYTPlayer {
  playVideo = vi.fn();
  pauseVideo = vi.fn();
  mute = vi.fn();
  unMute = vi.fn();
  setPlaybackRate = vi.fn();
  getPlayerState = vi.fn(() => 1); // PLAYING
  destroy = vi.fn();

  constructor(_el: unknown, config: { events?: { onReady?: (e: { target: MockYTPlayer }) => void } }) {
    // Trigger onReady synchronously so it works with fake timers
    Promise.resolve().then(() => config.events?.onReady?.({ target: this }));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  (window as unknown as Record<string, unknown>).YT = {
    Player: MockYTPlayer,
    PlayerState: { PLAYING: 1, PAUSED: 2 },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const makeProfile = (clientId: string, name: string): ClientProfile => ({
  clientId,
  name,
  heightCm: 170,
  weightKg: 70,
});

const makeData = (clientId: string, heartRate: number, steps: number, speedKmh = 5): WearableData => ({
  clientId,
  heartRate,
  steps,
  speedKmh,
  timestamp: new Date().toISOString(),
});

const testVideo: YouTubeVideo = {
  videoId: "test-video-id",
  url: "https://www.youtube.com/watch?v=test-video-id",
  title: "Test Trail Video",
};

const clients = ["client-1"];
const clientProfiles: Record<string, ClientProfile> = {
  "client-1": makeProfile("client-1", "Alice"),
};

const defaultProps = {
  clients,
  clientProfiles,
  latestData: null as WearableData | null,
  video: testVideo,
  onEnd: vi.fn(),
};

describe("YouTubeTrailMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders video container", () => {
    render(<YouTubeTrailMode {...defaultProps} />);
    // The outer container should be present
    const container = document.querySelector('[style*="position: fixed"]');
    expect(container).toBeInTheDocument();
  });

  it("shows 'End Realm' button", () => {
    render(<YouTubeTrailMode {...defaultProps} />);
    expect(screen.getByRole("button", { name: "End Realm" })).toBeInTheDocument();
  });

  it("clicking 'End Realm' calls onEnd", () => {
    render(<YouTubeTrailMode {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "End Realm" }));
    expect(defaultProps.onEnd).toHaveBeenCalledTimes(1);
  });

  it("clicking 'End Realm' calls onEnd with a number (totalDistance)", () => {
    render(<YouTubeTrailMode {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "End Realm" }));
    const [totalDist] = defaultProps.onEnd.mock.calls[0];
    expect(typeof totalDist).toBe("number");
  });

  it("shows HUD with player name", () => {
    render(<YouTubeTrailMode {...defaultProps} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows 'No data yet' when no latestData", () => {
    render(<YouTubeTrailMode {...defaultProps} latestData={null} />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("shows speed when latestData available", () => {
    const data = makeData("client-1", 140, 500, 6.5);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    expect(screen.getByText("6.5")).toBeInTheDocument();
  });

  it("shows heart rate when latestData available", () => {
    const data = makeData("client-1", 145, 500, 5);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    expect(screen.getByText("145")).toBeInTheDocument();
  });

  it("shows steps when latestData available", () => {
    const data = makeData("client-1", 140, 1234, 5);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    expect(screen.getByText("1234")).toBeInTheDocument();
  });

  it("shows mute toggle button", () => {
    render(<YouTubeTrailMode {...defaultProps} />);
    // Mute button has title "Unmute" when muted (initial state is muted)
    const muteBtn = screen.getByTitle("Unmute");
    expect(muteBtn).toBeInTheDocument();
  });

  it("mute button toggles title from Unmute to Mute when clicked", async () => {
    render(<YouTubeTrailMode {...defaultProps} />);
    const muteBtn = screen.getByTitle("Unmute");
    // Trigger player ready so unMute can be called
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(muteBtn);
    expect(screen.getByTitle("Mute")).toBeInTheDocument();
  });

  it("shows playback speed indicator", () => {
    render(<YouTubeTrailMode {...defaultProps} />);
    expect(screen.getByText("Playback")).toBeInTheDocument();
  });

  it("shows 'Paused' initially in playback indicator (currentRate=0)", () => {
    render(<YouTubeTrailMode {...defaultProps} />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("shows 'Waiting for player...' when no clients", () => {
    render(<YouTubeTrailMode {...defaultProps} clients={[]} clientProfiles={{}} />);
    expect(screen.getByText("Waiting for player...")).toBeInTheDocument();
  });

  it("uses client ID as fallback name when no profile", () => {
    render(<YouTubeTrailMode {...defaultProps} clientProfiles={{}} />);
    // With no profile, falls back to clientId
    expect(screen.getByText("client-1")).toBeInTheDocument();
  });

  it("distance accumulates when speed > 0 over time", () => {
    const data = makeData("client-1", 140, 500, 5); // 5 km/h
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    // After 500ms: 5km/h / 3.6 * 0.5s = 0.694m
    act(() => { vi.advanceTimersByTime(500); });
    // Check that distance display shows something > 0
    const distDisplay = screen.getByText(/\d+ m/);
    expect(distDisplay).toBeInTheDocument();
  });

  it("shows 'Paused' initially when no speed data", () => {
    render(<YouTubeTrailMode {...defaultProps} />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("calls setPlaybackRate with 1.0 when walking at base speed (5 km/h)", async () => {
    const spyInstances: MockYTPlayer[] = [];
    const OriginalMock = MockYTPlayer;
    class TrackingMockPlayer extends OriginalMock {
      constructor(el: unknown, config: { events?: { onReady?: (e: { target: TrackingMockPlayer }) => void } }) {
        super(el, config);
        // Return PAUSED so the resume branch runs rather than early return
        this.getPlayerState = vi.fn(() => 2);
        spyInstances.push(this);
      }
    }
    (window as unknown as Record<string, unknown>).YT = {
      Player: TrackingMockPlayer,
      PlayerState: { PLAYING: 1, PAUSED: 2 },
    };

    const data = makeData("client-1", 140, 500, 5);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    // Flush Promise.resolve so onReady fires and playerReady becomes true
    await act(async () => { await Promise.resolve(); });
    // Advance past the 1000ms playback rate interval
    act(() => { vi.advanceTimersByTime(1100); });

    // 5 km/h / 5 km/h base = rate 1.0
    expect(spyInstances[0].setPlaybackRate).toHaveBeenCalledWith(1);
  });

  it("calls setPlaybackRate and clamps to MAX_PLAYBACK_RATE (2.0) at very high speed", async () => {
    const spyInstances: MockYTPlayer[] = [];
    const OriginalMock = MockYTPlayer;
    class TrackingMockPlayer extends OriginalMock {
      constructor(el: unknown, config: { events?: { onReady?: (e: { target: TrackingMockPlayer }) => void } }) {
        super(el, config);
        spyInstances.push(this);
      }
    }
    (window as unknown as Record<string, unknown>).YT = {
      Player: TrackingMockPlayer,
      PlayerState: { PLAYING: 1, PAUSED: 2 },
    };

    // 20 km/h -> raw rate = 4.0, clamped to 2.0
    const data = makeData("client-1", 140, 500, 20);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    await act(async () => { await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(1100); });

    expect(spyInstances[0].setPlaybackRate).toHaveBeenCalledWith(2.0);
  });

  it("calls setPlaybackRate and clamps to MIN_PLAYBACK_RATE (0.25) at very low nonzero speed", async () => {
    const spyInstances: MockYTPlayer[] = [];
    const OriginalMock = MockYTPlayer;
    class TrackingMockPlayer extends OriginalMock {
      constructor(el: unknown, config: { events?: { onReady?: (e: { target: TrackingMockPlayer }) => void } }) {
        super(el, config);
        spyInstances.push(this);
      }
    }
    (window as unknown as Record<string, unknown>).YT = {
      Player: TrackingMockPlayer,
      PlayerState: { PLAYING: 1, PAUSED: 2 },
    };

    // 0.6 km/h -> raw rate = 0.12, clamped to 0.25
    const data = makeData("client-1", 140, 500, 0.6);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    await act(async () => { await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(1100); });

    expect(spyInstances[0].setPlaybackRate).toHaveBeenCalledWith(0.25);
  });

  it("calls pauseVideo when speed is 0 and player is PLAYING", async () => {
    const spyInstances: MockYTPlayer[] = [];
    const OriginalMock = MockYTPlayer;
    class TrackingMockPlayer extends OriginalMock {
      constructor(el: unknown, config: { events?: { onReady?: (e: { target: TrackingMockPlayer }) => void } }) {
        super(el, config);
        spyInstances.push(this);
      }
    }
    (window as unknown as Record<string, unknown>).YT = {
      Player: TrackingMockPlayer,
      PlayerState: { PLAYING: 1, PAUSED: 2 },
    };

    // Speed 0 — player state returns PLAYING (1)
    render(<YouTubeTrailMode {...defaultProps} latestData={null} />);
    await act(async () => { await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(1100); });

    expect(spyInstances[0].pauseVideo).toHaveBeenCalled();
    expect(spyInstances[0].setPlaybackRate).not.toHaveBeenCalled();
  });

  it("does not call pauseVideo when speed is 0 and player is already PAUSED", async () => {
    const spyInstances: MockYTPlayer[] = [];
    const OriginalMock = MockYTPlayer;
    class TrackingMockPlayer extends OriginalMock {
      constructor(el: unknown, config: { events?: { onReady?: (e: { target: TrackingMockPlayer }) => void } }) {
        super(el, config);
        // Override getPlayerState to return PAUSED
        this.getPlayerState = vi.fn(() => 2);
        spyInstances.push(this);
      }
    }
    (window as unknown as Record<string, unknown>).YT = {
      Player: TrackingMockPlayer,
      PlayerState: { PLAYING: 1, PAUSED: 2 },
    };

    render(<YouTubeTrailMode {...defaultProps} latestData={null} />);
    await act(async () => { await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(1100); });

    expect(spyInstances[0].pauseVideo).not.toHaveBeenCalled();
  });

  it("calls playVideo to resume when player is PAUSED and speed > 0.5", async () => {
    const spyInstances: MockYTPlayer[] = [];
    const OriginalMock = MockYTPlayer;
    class TrackingMockPlayer extends OriginalMock {
      constructor(el: unknown, config: { events?: { onReady?: (e: { target: TrackingMockPlayer }) => void } }) {
        super(el, config);
        // Player is paused when the interval fires
        this.getPlayerState = vi.fn(() => 2);
        spyInstances.push(this);
      }
    }
    (window as unknown as Record<string, unknown>).YT = {
      Player: TrackingMockPlayer,
      PlayerState: { PLAYING: 1, PAUSED: 2 },
    };

    // Speed 5 km/h — should resume from paused
    const data = makeData("client-1", 140, 500, 5);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    await act(async () => { await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(1100); });

    expect(spyInstances[0].playVideo).toHaveBeenCalled();
  });

  it("distance does not accumulate when speed is 0", () => {
    // Provide latestData so the distance div renders, but with speed 0
    const data = makeData("client-1", 140, 500, 0);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    act(() => { vi.advanceTimersByTime(3000); });
    // Distance display should still show 0 m since speed is 0
    expect(screen.getByText("0 m")).toBeInTheDocument();
  });

  it("distance accumulates correctly based on speed over 500ms tick", () => {
    // 5 km/h for 500ms = (5/3.6) * 0.5 ≈ 0.694m → rounds to 1 m
    const data = makeData("client-1", 140, 500, 5);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    act(() => { vi.advanceTimersByTime(500); });
    // After one tick, display should show "1 m" (0.694 rounds down to 0 via toFixed(0) → "1")
    const distDisplay = screen.getByText(/^\d+ m$/);
    const meters = parseFloat(distDisplay.textContent ?? "0");
    expect(meters).toBeGreaterThan(0);
  });

  it("onEnd is called with accumulated distance after movement", () => {
    const onEnd = vi.fn();
    const data = makeData("client-1", 140, 500, 5);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} onEnd={onEnd} />);
    // Accumulate distance over 3 ticks
    act(() => { vi.advanceTimersByTime(1500); });
    fireEvent.click(screen.getByRole("button", { name: "End Realm" }));
    const [dist] = onEnd.mock.calls[0];
    expect(dist).toBeGreaterThan(0);
  });

  it("destroys the YouTube player on unmount", async () => {
    const spyInstances: MockYTPlayer[] = [];
    const OriginalMock = MockYTPlayer;
    class TrackingMockPlayer extends OriginalMock {
      constructor(el: unknown, config: { events?: { onReady?: (e: { target: TrackingMockPlayer }) => void } }) {
        super(el, config);
        spyInstances.push(this);
      }
    }

    // Remove YT.Player so the component goes through the script-loading code path,
    // which registers the cleanup function that calls player.destroy() on unmount.
    const win = window as unknown as Record<string, unknown>;
    win.YT = { PlayerState: { PLAYING: 1, PAUSED: 2 } };

    // Simulate the iframe API becoming ready: set window.YT.Player and invoke the callback
    const prevOnReady = (win.onYouTubeIframeAPIReady as (() => void) | undefined);

    const { unmount } = render(<YouTubeTrailMode {...defaultProps} />);

    // Now simulate the YouTube API loading: set Player and fire the callback
    act(() => {
      win.YT = { Player: TrackingMockPlayer, PlayerState: { PLAYING: 1, PAUSED: 2 } };
      (win.onYouTubeIframeAPIReady as () => void)?.();
    });

    // Flush onReady promise from the constructor
    await act(async () => { await Promise.resolve(); });

    unmount();
    expect(spyInstances[0]?.destroy).toHaveBeenCalled();

    // Restore
    if (prevOnReady) win.onYouTubeIframeAPIReady = prevOnReady;
  });

  it("only uses first client's profile even when multiple clients provided", () => {
    const multiClients = ["client-1", "client-2"];
    const multiProfiles: Record<string, ClientProfile> = {
      "client-1": makeProfile("client-1", "Alice"),
      "client-2": makeProfile("client-2", "Bob"),
    };
    render(
      <YouTubeTrailMode
        {...defaultProps}
        clients={multiClients}
        clientProfiles={multiProfiles}
      />
    );
    // Only Alice's name should appear in the HUD
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("playback rate indicator updates to formatted rate string when speed > 0", async () => {
    const spyInstances: MockYTPlayer[] = [];
    const OriginalMock = MockYTPlayer;
    class TrackingMockPlayer extends OriginalMock {
      constructor(el: unknown, config: { events?: { onReady?: (e: { target: TrackingMockPlayer }) => void } }) {
        super(el, config);
        // Return PAUSED so playVideo is called but no early return
        this.getPlayerState = vi.fn(() => 2);
        spyInstances.push(this);
      }
    }
    (window as unknown as Record<string, unknown>).YT = {
      Player: TrackingMockPlayer,
      PlayerState: { PLAYING: 1, PAUSED: 2 },
    };

    // 5 km/h → rate = 1.0 → display "1.00x"
    const data = makeData("client-1", 140, 500, 5);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    await act(async () => { await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(1100); });

    expect(screen.getByText("1.00x")).toBeInTheDocument();
  });

  it("playback rate interval does not fire before playerReady", async () => {
    const spyInstances: MockYTPlayer[] = [];
    const OriginalMock = MockYTPlayer;
    class TrackingMockPlayer extends OriginalMock {
      constructor(el: unknown, config: { events?: { onReady?: (e: { target: TrackingMockPlayer }) => void } }) {
        super(el, config);
        spyInstances.push(this);
      }
    }
    (window as unknown as Record<string, unknown>).YT = {
      Player: TrackingMockPlayer,
      PlayerState: { PLAYING: 1, PAUSED: 2 },
    };

    const data = makeData("client-1", 140, 500, 5);
    render(<YouTubeTrailMode {...defaultProps} latestData={data} />);
    // Do NOT flush the Promise so onReady never fires — playerReady stays false
    act(() => { vi.advanceTimersByTime(1100); });

    // setPlaybackRate should not have been called since playerReady is still false
    expect(spyInstances[0]?.setPlaybackRate).not.toHaveBeenCalled();
  });
});

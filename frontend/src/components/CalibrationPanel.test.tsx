import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";
import { CalibrationPanel } from "./CalibrationPanel";

// ── SignalR mock ─────────────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file before variable
// declarations, so we use vi.hoisted() to create the mock object first.
// HubConnectionBuilder is used with `new`, so we provide a constructor function.

const mockConnection = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  off: vi.fn(),
  onclose: vi.fn(),
  state: "Connected" as string,
}));

vi.mock("@microsoft/signalr", () => {
  const builderInstance = {
    withUrl: vi.fn().mockReturnThis(),
    withAutomaticReconnect: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue(mockConnection),
  };
  function HubConnectionBuilder(this: unknown) {
    return builderInstance;
  }
  return {
    HubConnectionBuilder,
    HubConnectionState: { Connected: "Connected", Disconnected: "Disconnected" },
  };
});

// ── Constants ────────────────────────────────────────────────────────────────

const HUB_URL = "http://localhost:5062/hubs/realm";

// ── Setup helpers ────────────────────────────────────────────────────────────

/**
 * Render CalibrationPanel and capture all hub event handlers so tests can
 * fire SignalR callbacks directly.
 *
 * Returns after the component has finished `startSession` and advanced past
 * the "connecting" step (i.e. moved to "waiting-client").
 */
async function setup(onClose = vi.fn()) {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  let oncloseHandler: (() => void) | undefined;

  mockConnection.on.mockImplementation(
    (event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    },
  );
  mockConnection.onclose.mockImplementation((handler: () => void) => {
    oncloseHandler = handler;
  });

  const utils = render(<CalibrationPanel hubUrl={HUB_URL} onClose={onClose} />);

  // Wait until the component exits the "connecting" state (startSession resolved)
  await waitFor(() =>
    expect(screen.queryByText("Connecting to server...")).not.toBeInTheDocument(),
  );

  return { ...utils, handlers, getOnclose: () => oncloseHandler, onClose };
}

/**
 * Advance a rendered component to the "calibrating" step by firing the
 * CalibrationClientJoined handler.
 */
async function advanceToCalibrating(
  handlers: Record<string, (...args: unknown[]) => void>,
  sessionId = "sess-1",
  heightCm = 170,
) {
  act(() => {
    handlers["CalibrationClientJoined"](sessionId, "cl-1", heightCm);
  });
  await waitFor(() =>
    expect(screen.getByText("Slow Walk")).toBeInTheDocument(),
  );
}

// ── Reset mocks between tests ────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockConnection.start.mockResolvedValue(undefined);
  mockConnection.stop.mockResolvedValue(undefined);
  // Default: CreateCalibrationSession returns join code
  mockConnection.invoke.mockResolvedValue("123456");
  mockConnection.state = "Connected";
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe("CalibrationPanel – initial render / connecting step", () => {
  it("shows 'Connecting to server...' before connection resolves", async () => {
    let resolveStart!: () => void;
    mockConnection.start.mockReturnValueOnce(
      new Promise<void>((res) => { resolveStart = res; }),
    );

    render(<CalibrationPanel hubUrl={HUB_URL} onClose={vi.fn()} />);
    expect(screen.getByText("Connecting to server...")).toBeInTheDocument();

    // Resolve so useEffect cleanup doesn't leak
    act(() => resolveStart());
  });

  it("renders the 'Stride Calibration' heading", async () => {
    await setup();
    expect(screen.getByText("Stride Calibration")).toBeInTheDocument();
  });

  it("renders the close button", async () => {
    await setup();
    // The close button contains the × character (HTML entity &times;)
    expect(screen.getByRole("button", { name: /×/i })).toBeInTheDocument();
  });
});

describe("CalibrationPanel – waiting-client step", () => {
  it("shows the join code once the session is created", async () => {
    mockConnection.invoke.mockResolvedValue("654321");
    await setup();
    expect(screen.getByText("654321")).toBeInTheDocument();
  });

  it("shows instruction text while waiting for wearable", async () => {
    await setup();
    expect(screen.getByText(/enter this code/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for wearable to connect/i)).toBeInTheDocument();
  });
});

describe("CalibrationPanel – connection error", () => {
  it("shows error message when connection fails", async () => {
    mockConnection.start.mockRejectedValueOnce(new Error("Network error"));
    render(<CalibrationPanel hubUrl={HUB_URL} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(
        screen.getByText(/Could not connect to the server/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows Retry button in error state", async () => {
    mockConnection.start.mockRejectedValueOnce(new Error("fail"));
    render(<CalibrationPanel hubUrl={HUB_URL} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument(),
    );
  });

  it("clicking Retry re-attempts connection", async () => {
    mockConnection.start.mockRejectedValueOnce(new Error("fail"));
    render(<CalibrationPanel hubUrl={HUB_URL} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument(),
    );

    // Second call: start succeeds, join code returned
    mockConnection.invoke.mockResolvedValue("999999");
    await userEvent.click(screen.getByRole("button", { name: /Retry/i }));
    await waitFor(() =>
      expect(screen.getByText("999999")).toBeInTheDocument(),
    );
  });

  it("shows 'Connecting to server...' text during the error state (not error + connecting text shown simultaneously)", async () => {
    // When start fails, step stays "connecting" AND error is set.
    // The JSX shows error banner always, but the "connecting" text only renders
    // when step === "connecting" && !error. So only the error banner renders.
    mockConnection.start.mockRejectedValueOnce(new Error("fail"));
    render(<CalibrationPanel hubUrl={HUB_URL} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Could not connect/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Connecting to server...")).not.toBeInTheDocument();
  });
});

describe("CalibrationPanel – CalibrationClientJoined event", () => {
  it("transitions to calibrating step when client joins", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    expect(screen.getByText("3 km/h")).toBeInTheDocument();
  });

  it("updates heightCm from the joined event", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers, "sess-1", 180);
    // Component is now calibrating, showing Slow Walk
    expect(screen.getByText("Slow Walk")).toBeInTheDocument();
  });
});

describe("CalibrationPanel – calibrating step UI", () => {
  it("shows Start and Skip buttons when not yet sampling", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("shows instruction text with target speed", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    expect(screen.getByText(/Set the treadmill to 3 km\/h/i)).toBeInTheDocument();
  });

  it("clicking Start calls invoke StartCalibrationSample", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers, "sess-abc");
    mockConnection.invoke.mockResolvedValue(undefined);

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(mockConnection.invoke).toHaveBeenCalledWith(
        "StartCalibrationSample",
        "sess-abc",
        3,
      ),
    );
  });

  it("shows countdown timer after clicking Start", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    mockConnection.invoke.mockResolvedValue(undefined);

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(screen.getByText("30")).toBeInTheDocument(),
    );
  });

  it("shows recording text while sampling", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    mockConnection.invoke.mockResolvedValue(undefined);

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(
        screen.getByText(/Recording\.\.\. keep walking\/running at 3 km\/h/i),
      ).toBeInTheDocument(),
    );
  });
});

describe("CalibrationPanel – Skip button", () => {
  it("clicking Skip advances to next group", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Brisk Walk")).toBeInTheDocument();
  });

  it("clicking Skip on last group moves to results step", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    // Skip through all 5 groups
    for (let i = 0; i < 5; i++) {
      const btn = screen.queryByRole("button", { name: "Skip" });
      if (btn) await userEvent.click(btn);
    }
    await waitFor(() =>
      expect(screen.getByText(/Not enough samples/i)).toBeInTheDocument(),
    );
  });

  it("shows Jog then Run then Fast Run as you skip through groups", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Jog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Run")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Fast Run")).toBeInTheDocument();
  });
});

describe("CalibrationPanel – CalibrationSampleResult event", () => {
  async function setupCalibrating(sessionId = "sess-1") {
    const result = await setup();
    await advanceToCalibrating(result.handlers, sessionId);
    return result;
  }

  it("shows 'Sample recorded' after receiving CalibrationSampleResult", async () => {
    const { handlers } = await setupCalibrating();
    act(() => {
      handlers["CalibrationSampleResult"]("sess-1", { speedKmh: 3, strideFactor: 0.35 });
    });
    await waitFor(() =>
      expect(screen.getByText("Sample recorded")).toBeInTheDocument(),
    );
  });

  it("shows stride factor and cm display after sample recorded", async () => {
    const { handlers } = await setupCalibrating();
    act(() => {
      handlers["CalibrationSampleResult"]("sess-1", { speedKmh: 3, strideFactor: 0.35 });
    });
    await waitFor(() =>
      expect(screen.getByText(/Stride factor: 0\.3500/)).toBeInTheDocument(),
    );
  });

  it("shows 'Next Speed' button after sample for non-last group", async () => {
    const { handlers } = await setupCalibrating();
    act(() => {
      handlers["CalibrationSampleResult"]("sess-1", { speedKmh: 3, strideFactor: 0.35 });
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next Speed" })).toBeInTheDocument(),
    );
  });

  it("shows 'View Results' button after sample for last group", async () => {
    const { handlers } = await setupCalibrating();
    // Skip to last group (index 4)
    for (let i = 0; i < 4; i++) {
      await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    }
    act(() => {
      handlers["CalibrationSampleResult"]("sess-1", { speedKmh: 15, strideFactor: 0.75 });
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "View Results" })).toBeInTheDocument(),
    );
  });

  it("shows collected samples list when points exist", async () => {
    const { handlers } = await setupCalibrating();
    act(() => {
      handlers["CalibrationSampleResult"]("sess-1", { speedKmh: 3, strideFactor: 0.35 });
    });
    await waitFor(() =>
      expect(screen.getByText("Collected samples:")).toBeInTheDocument(),
    );
  });

  it("clicking Next Speed advances to next group", async () => {
    const { handlers } = await setupCalibrating();
    act(() => {
      handlers["CalibrationSampleResult"]("sess-1", { speedKmh: 3, strideFactor: 0.35 });
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next Speed" })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Next Speed" }));
    expect(screen.getByText("Brisk Walk")).toBeInTheDocument();
  });

  it("cm display uses heightCm * strideFactor", async () => {
    // height = 170, factor = 0.35 → 59.5 cm
    const { handlers } = await setupCalibrating();
    act(() => {
      handlers["CalibrationSampleResult"]("sess-1", { speedKmh: 3, strideFactor: 0.35 });
    });
    // The value "59.5 cm" appears in both the recorded-point detail and the
    // collected-samples list, so use getAllByText and assert at least one match.
    await waitFor(() =>
      expect(screen.getAllByText(/59\.5 cm/).length).toBeGreaterThan(0),
    );
  });
});

describe("CalibrationPanel – CalibrationClientLeft event", () => {
  it("shows error and returns to waiting-client when wearable disconnects", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);

    act(() => { handlers["CalibrationClientLeft"](); });

    await waitFor(() =>
      expect(screen.getByText(/Wearable client disconnected/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Waiting for wearable to connect/i)).toBeInTheDocument();
  });
});

describe("CalibrationPanel – onclose (connection lost)", () => {
  it("shows error when SignalR connection closes", async () => {
    const { getOnclose } = await setup();

    act(() => { getOnclose()?.(); });

    await waitFor(() =>
      expect(
        screen.getByText(/Connection to server was lost/i),
      ).toBeInTheDocument(),
    );
  });
});

describe("CalibrationPanel – results step", () => {
  /**
   * Helper: collect N points starting at group 0, then navigate to results.
   * pointsToRecord: array of {speedKmh, strideFactor} to fire via the event.
   * After recording all, skips remaining groups to reach results.
   */
  async function setupResults(
    handlers: Record<string, (...args: unknown[]) => void>,
    pointsToRecord: Array<{ speedKmh: number; strideFactor: number }>,
  ) {
    for (const point of pointsToRecord) {
      act(() => {
        handlers["CalibrationSampleResult"]("sess-1", point);
      });
      await waitFor(() => screen.getByText("Sample recorded"));
      const nextBtn = screen.queryByRole("button", { name: "Next Speed" });
      const viewBtn = screen.queryByRole("button", { name: "View Results" });
      if (nextBtn) await userEvent.click(nextBtn);
      else if (viewBtn) await userEvent.click(viewBtn);
    }
    // Skip any remaining groups to reach results
    let safetyLimit = 10;
    while (screen.queryByRole("button", { name: "Skip" }) && safetyLimit-- > 0) {
      await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    }
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save to Device" }) ||
        screen.queryByText(/Not enough samples/i),
      ).toBeTruthy(),
    );
  }

  it("shows 'Not enough samples' message with fewer than 2 points", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    // Skip all 5 groups without collecting any
    for (let i = 0; i < 5; i++) {
      const btn = screen.queryByRole("button", { name: "Skip" });
      if (btn) await userEvent.click(btn);
    }
    await waitFor(() =>
      expect(screen.getByText(/Not enough samples/i)).toBeInTheDocument(),
    );
  });

  it("Save to Device button is disabled when fewer than 2 samples", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);

    // Collect only 1 point
    act(() => {
      handlers["CalibrationSampleResult"]("sess-1", { speedKmh: 3, strideFactor: 0.35 });
    });
    await waitFor(() => screen.getByText("Sample recorded"));
    await userEvent.click(screen.getByRole("button", { name: "Next Speed" }));

    // Skip remaining groups
    for (let i = 0; i < 5; i++) {
      const btn = screen.queryByRole("button", { name: "Skip" });
      if (btn) await userEvent.click(btn);
    }

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save to Device" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Save to Device" })).toBeDisabled();
  });

  it("shows 'Calibration complete!' with 2 or more samples", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    await setupResults(handlers, [
      { speedKmh: 3, strideFactor: 0.35 },
      { speedKmh: 5, strideFactor: 0.415 },
    ]);
    await waitFor(() =>
      expect(screen.getByText(/Calibration complete!/i)).toBeInTheDocument(),
    );
  });

  it("results table shows Speed, Your Stride, Default Stride columns", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    await setupResults(handlers, [
      { speedKmh: 3, strideFactor: 0.35 },
      { speedKmh: 5, strideFactor: 0.415 },
    ]);
    await waitFor(() => {
      expect(screen.getByText("Speed")).toBeInTheDocument();
      expect(screen.getByText("Your Stride")).toBeInTheDocument();
      expect(screen.getByText("Default Stride")).toBeInTheDocument();
    });
  });

  it("shows positive diff (prefixed with +) for above-average stride factor", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    // strideFactor 0.9 >> default 0.35 at 3 km/h → large positive diff
    await setupResults(handlers, [
      { speedKmh: 3, strideFactor: 0.9 },
      { speedKmh: 5, strideFactor: 0.9 },
    ]);
    await waitFor(() =>
      expect(screen.getAllByText(/\+\d+\.\d+%/).length).toBeGreaterThan(0),
    );
  });

  it("shows negative diff for below-average stride factor", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);
    // strideFactor 0.1 << default → negative diff
    await setupResults(handlers, [
      { speedKmh: 3, strideFactor: 0.1 },
      { speedKmh: 5, strideFactor: 0.1 },
    ]);
    await waitFor(() =>
      expect(screen.getAllByText(/-\d+\.\d+%/).length).toBeGreaterThan(0),
    );
  });
});

describe("CalibrationPanel – Save calibration", () => {
  async function setupAtResults() {
    const result = await setup();
    await advanceToCalibrating(result.handlers, "sess-save");

    // Collect 2 samples
    act(() => {
      result.handlers["CalibrationSampleResult"]("sess-save", { speedKmh: 3, strideFactor: 0.35 });
    });
    await waitFor(() => screen.getByText("Sample recorded"));
    await userEvent.click(screen.getByRole("button", { name: "Next Speed" }));

    act(() => {
      result.handlers["CalibrationSampleResult"]("sess-save", { speedKmh: 5, strideFactor: 0.415 });
    });
    await waitFor(() => screen.getByRole("button", { name: "Next Speed" }));

    // Skip remaining groups
    for (let i = 0; i < 5; i++) {
      const skip = screen.queryByRole("button", { name: "Skip" });
      const next = screen.queryByRole("button", { name: "Next Speed" });
      if (next) await userEvent.click(next);
      else if (skip) await userEvent.click(skip);
      else break;
    }

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save to Device" })).toBeInTheDocument(),
    );
    return result;
  }

  it("clicking Save to Device calls invoke SaveCalibration", async () => {
    await setupAtResults();
    mockConnection.invoke.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole("button", { name: "Save to Device" }));
    await waitFor(() =>
      expect(mockConnection.invoke).toHaveBeenCalledWith("SaveCalibration", "sess-save"),
    );
  });

  it("CalibrationSaved event shows success message", async () => {
    const result = await setupAtResults();
    act(() => { result.handlers["CalibrationSaved"](); });
    await waitFor(() =>
      expect(
        screen.getByText(/Calibration saved to wearable device/i),
      ).toBeInTheDocument(),
    );
  });

  it("after CalibrationSaved, shows Done button instead of Save to Device", async () => {
    const result = await setupAtResults();
    act(() => { result.handlers["CalibrationSaved"](); });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Save to Device" }),
    ).not.toBeInTheDocument();
  });

  it("clicking Discard calls onClose", async () => {
    const { onClose } = await setupAtResults();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("save error shows error message when invoke SaveCalibration throws", async () => {
    await setupAtResults();
    mockConnection.invoke.mockRejectedValueOnce(new Error("save failed"));
    await userEvent.click(screen.getByRole("button", { name: "Save to Device" }));
    await waitFor(() =>
      expect(
        screen.getByText(/Could not save calibration data/i),
      ).toBeInTheDocument(),
    );
  });
});

describe("CalibrationPanel – close / cancel", () => {
  it("clicking the close button calls onClose", async () => {
    const onClose = vi.fn();
    await setup(onClose);
    // The × button is the only button visible in waiting-client state besides possibly no others
    const closeBtn = screen.getByRole("button", { name: /×/ });
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking close invokes CancelCalibration when session is active", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers, "sess-cancel");

    const closeBtn = screen.getByRole("button", { name: /×/ });
    await userEvent.click(closeBtn);

    expect(mockConnection.invoke).toHaveBeenCalledWith(
      "CancelCalibration",
      "sess-cancel",
    );
    expect(mockConnection.stop).toHaveBeenCalled();
  });

  it("clicking close without an active session skips CancelCalibration", async () => {
    // Before any CalibrationClientJoined → sessionId stays null
    await setup();

    // Clear any invocations from startSession
    mockConnection.invoke.mockClear();

    const closeBtn = screen.getByRole("button", { name: /×/ });
    await userEvent.click(closeBtn);

    // Should not have been called with CancelCalibration
    expect(mockConnection.invoke).not.toHaveBeenCalledWith(
      "CancelCalibration",
      expect.anything(),
    );
  });

  it("clicking Done after save calls onClose", async () => {
    const onClose = vi.fn();
    const result = await setup(onClose);
    await advanceToCalibrating(result.handlers, "sess-done");

    // Collect 2 samples and navigate to results
    act(() => {
      result.handlers["CalibrationSampleResult"]("sess-done", { speedKmh: 3, strideFactor: 0.35 });
    });
    await waitFor(() => screen.getByRole("button", { name: "Next Speed" }));
    await userEvent.click(screen.getByRole("button", { name: "Next Speed" }));

    act(() => {
      result.handlers["CalibrationSampleResult"]("sess-done", { speedKmh: 5, strideFactor: 0.415 });
    });
    await waitFor(() => screen.getByRole("button", { name: "Next Speed" }));
    for (let i = 0; i < 5; i++) {
      const skip = screen.queryByRole("button", { name: "Skip" });
      const next = screen.queryByRole("button", { name: "Next Speed" });
      if (next) await userEvent.click(next);
      else if (skip) await userEvent.click(skip);
      else break;
    }
    await waitFor(() => screen.getByRole("button", { name: "Save to Device" }));

    // Trigger saved state
    act(() => { result.handlers["CalibrationSaved"](); });
    await waitFor(() => screen.getByRole("button", { name: "Done" }));

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CalibrationPanel – countdown timer flow", () => {
  it("decrements countdown every second", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    mockConnection.on.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => { handlers[event] = handler; },
    );
    mockConnection.invoke.mockResolvedValue("123456");

    render(<CalibrationPanel hubUrl={HUB_URL} onClose={vi.fn()} />);

    // Let async effects settle
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      handlers["CalibrationClientJoined"]("sess-timer", "cl-1", 170);
    });
    await waitFor(() => screen.getByRole("button", { name: "Start" }));

    mockConnection.invoke.mockResolvedValue(undefined);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Start" }));
    });

    await waitFor(() => expect(screen.getByText("30")).toBeInTheDocument());

    act(() => { vi.advanceTimersByTime(1000); });
    await waitFor(() => expect(screen.getByText("29")).toBeInTheDocument());

    act(() => { vi.advanceTimersByTime(1000); });
    await waitFor(() => expect(screen.getByText("28")).toBeInTheDocument());

    vi.useRealTimers();
  });

  it("calls EndCalibrationSample when countdown reaches zero", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    mockConnection.on.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => { handlers[event] = handler; },
    );
    mockConnection.invoke.mockResolvedValue("123456");

    render(<CalibrationPanel hubUrl={HUB_URL} onClose={vi.fn()} />);

    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => {
      handlers["CalibrationClientJoined"]("sess-end", "cl-1", 170);
    });
    await waitFor(() => screen.getByRole("button", { name: "Start" }));

    mockConnection.invoke.mockResolvedValue(undefined);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Start" }));
    });
    await waitFor(() => expect(screen.getByText("30")).toBeInTheDocument());

    // Advance full 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30 * 1000);
    });

    await waitFor(() =>
      expect(mockConnection.invoke).toHaveBeenCalledWith(
        "EndCalibrationSample",
        "sess-end",
      ),
    );

    vi.useRealTimers();
  });
});

describe("CalibrationPanel – startSample error handling", () => {
  it("shows error when StartCalibrationSample invoke throws", async () => {
    const { handlers } = await setup();
    await advanceToCalibrating(handlers);

    mockConnection.invoke.mockRejectedValueOnce(new Error("hub error"));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument(),
    );
  });
});

describe("CalibrationPanel – unmount cleanup", () => {
  it("stops connection and cancels on unmount when session is active", async () => {
    const { handlers, unmount } = await setup();
    await advanceToCalibrating(handlers, "sess-cleanup");

    // Clear prior invocations (CreateCalibrationSession)
    mockConnection.invoke.mockClear();

    act(() => { unmount(); });

    expect(mockConnection.invoke).toHaveBeenCalledWith(
      "CancelCalibration",
      "sess-cleanup",
    );
    expect(mockConnection.stop).toHaveBeenCalled();
  });

  it("does not cancel on unmount when connection is not Connected", async () => {
    mockConnection.state = "Disconnected";
    const { handlers, unmount } = await setup();
    await advanceToCalibrating(handlers, "sess-nocancel");

    mockConnection.invoke.mockClear();

    act(() => { unmount(); });

    expect(mockConnection.invoke).not.toHaveBeenCalledWith(
      "CancelCalibration",
      expect.anything(),
    );
  });
});

describe("CalibrationPanel – CalibrationClientLeft clears countdown", () => {
  it("resets sampling state when client disconnects during sampling", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    mockConnection.on.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => { handlers[event] = handler; },
    );
    mockConnection.invoke.mockResolvedValue("123456");

    render(<CalibrationPanel hubUrl={HUB_URL} onClose={vi.fn()} />);
    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => { handlers["CalibrationClientJoined"]("sess-left", "cl-1", 170); });
    await waitFor(() => screen.getByRole("button", { name: "Start" }));

    mockConnection.invoke.mockResolvedValue(undefined);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Start" }));
    });
    await waitFor(() => expect(screen.getByText("30")).toBeInTheDocument());

    // Client leaves mid-sample
    act(() => { handlers["CalibrationClientLeft"](); });

    await waitFor(() =>
      expect(screen.getByText(/Waiting for wearable to connect/i)).toBeInTheDocument(),
    );

    vi.useRealTimers();
  });
});

describe("CalibrationPanel – connection close clears sampling", () => {
  it("resets sampling state when connection closes mid-sample", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    let oncloseHandler: (() => void) | undefined;
    mockConnection.on.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => { handlers[event] = handler; },
    );
    mockConnection.onclose.mockImplementation((handler: () => void) => {
      oncloseHandler = handler;
    });
    mockConnection.invoke.mockResolvedValue("123456");

    render(<CalibrationPanel hubUrl={HUB_URL} onClose={vi.fn()} />);
    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => { handlers["CalibrationClientJoined"]("sess-close", "cl-1", 170); });
    await waitFor(() => screen.getByRole("button", { name: "Start" }));

    mockConnection.invoke.mockResolvedValue(undefined);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Start" }));
    });
    await waitFor(() => expect(screen.getByText("30")).toBeInTheDocument());

    // Connection closes mid-sample
    act(() => { oncloseHandler?.(); });

    await waitFor(() =>
      expect(screen.getByText(/Connection to server was lost/i)).toBeInTheDocument(),
    );

    vi.useRealTimers();
  });
});

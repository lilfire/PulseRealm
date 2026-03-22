import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";
import { ConnectionBanner } from "./ConnectionBanner";
import type { ConnectionStatus } from "../hooks/useSessionHub";

// ---------------------------------------------------------------------------
// Timer setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// ConnectionBanner — statuses that never show the banner
// ---------------------------------------------------------------------------

describe("ConnectionBanner — hidden for non-problematic statuses", () => {
  const hiddenStatuses: ConnectionStatus[] = ["connected", "idle", "connecting"];

  for (const status of hiddenStatuses) {
    it(`returns null immediately for status '${status}'`, () => {
      const { container } = render(
        <ConnectionBanner status={status} />,
      );
      // Advance past the 2 second delay to confirm nothing appears even then
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(container.firstChild).toBeNull();
    });
  }

  it("does not render any content for 'connected' without waiting", () => {
    const { container } = render(<ConnectionBanner status="connected" />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ConnectionBanner — delay before becoming visible
// ---------------------------------------------------------------------------

describe("ConnectionBanner — 2-second show delay", () => {
  it("does not render anything immediately for 'disconnected'", () => {
    const { container } = render(<ConnectionBanner status="disconnected" />);
    expect(container.firstChild).toBeNull();
  });

  it("does not render anything immediately for 'reconnecting'", () => {
    const { container } = render(<ConnectionBanner status="reconnecting" />);
    expect(container.firstChild).toBeNull();
  });

  it("remains hidden just before the 2-second threshold for 'disconnected'", () => {
    const { container } = render(<ConnectionBanner status="disconnected" />);
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(container.firstChild).toBeNull();
  });

  it("becomes visible at exactly 2000 ms for 'disconnected'", () => {
    const { container } = render(<ConnectionBanner status="disconnected" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("becomes visible at exactly 2000 ms for 'reconnecting'", () => {
    const { container } = render(<ConnectionBanner status="reconnecting" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.firstChild).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ConnectionBanner — reconnecting content
// ---------------------------------------------------------------------------

describe("ConnectionBanner — 'reconnecting' status content", () => {
  it("shows 'Reconnecting to server...' text after the delay", () => {
    render(<ConnectionBanner status="reconnecting" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Reconnecting to server...")).toBeInTheDocument();
  });

  it("does not show 'Connection lost.' text when reconnecting", () => {
    render(<ConnectionBanner status="reconnecting" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText(/Connection lost/)).not.toBeInTheDocument();
  });

  it("does not render a Retry button when reconnecting", () => {
    render(<ConnectionBanner status="reconnecting" onRetry={vi.fn()} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("renders the animated pulse dot span when reconnecting", () => {
    const { container } = render(<ConnectionBanner status="reconnecting" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // The pulse dot is a <span> inside the banner
    expect(container.querySelector("span")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ConnectionBanner — disconnected content
// ---------------------------------------------------------------------------

describe("ConnectionBanner — 'disconnected' status content", () => {
  it("shows 'Connection lost.' text after the delay", () => {
    render(<ConnectionBanner status="disconnected" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText(/Connection lost/)).toBeInTheDocument();
  });

  it("does not show 'Reconnecting to server...' text when disconnected", () => {
    render(<ConnectionBanner status="disconnected" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText("Reconnecting to server...")).not.toBeInTheDocument();
  });

  it("renders a Retry button when onRetry is provided", () => {
    render(<ConnectionBanner status="disconnected" onRetry={vi.fn()} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("does not render a Retry button when onRetry is not provided", () => {
    render(<ConnectionBanner status="disconnected" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("calls onRetry when the Retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<ConnectionBanner status="disconnected" onRetry={onRetry} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ConnectionBanner — hiding the banner when status recovers
// ---------------------------------------------------------------------------

describe("ConnectionBanner — banner hides when status recovers", () => {
  it("hides the banner when status changes from 'disconnected' to 'connected' after appearing", () => {
    const { rerender, container } = render(
      <ConnectionBanner status="disconnected" />,
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // Banner is now visible
    expect(container.firstChild).not.toBeNull();

    rerender(<ConnectionBanner status="connected" />);
    expect(container.firstChild).toBeNull();
  });

  it("cancels the pending show timer when status changes to 'connected' before 2s", () => {
    const { rerender, container } = render(
      <ConnectionBanner status="disconnected" />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender(<ConnectionBanner status="connected" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // Timer was cancelled — banner must never appear
    expect(container.firstChild).toBeNull();
  });

  it("hides the banner when status changes from 'reconnecting' to 'connected' after appearing", () => {
    const { rerender, container } = render(
      <ConnectionBanner status="reconnecting" />,
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.firstChild).not.toBeNull();

    rerender(<ConnectionBanner status="connected" />);
    expect(container.firstChild).toBeNull();
  });
});

import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";
import { Toast, createToast } from "./Toast";
import type { ToastMessage } from "./Toast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(
  id: number,
  text: string,
  type: "error" | "info" = "error",
): ToastMessage {
  return { id, text, type };
}

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
// Toast — empty messages
// ---------------------------------------------------------------------------

describe("Toast — empty messages array", () => {
  it("returns null and renders nothing when messages array is empty", () => {
    const { container } = render(
      <Toast messages={[]} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Toast — rendering messages
// ---------------------------------------------------------------------------

describe("Toast — rendering messages", () => {
  it("renders the toast container when there is at least one message", () => {
    const { container } = render(
      <Toast messages={[makeMessage(0, "Hello")]} onDismiss={vi.fn()} />,
    );
    expect(container.querySelector(".toast-container")).toBeInTheDocument();
  });

  it("renders a single message text", () => {
    render(
      <Toast messages={[makeMessage(0, "Something went wrong")]} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders multiple messages at once", () => {
    const messages = [
      makeMessage(0, "Error one", "error"),
      makeMessage(1, "Info two", "info"),
    ];
    render(<Toast messages={messages} onDismiss={vi.fn()} />);
    expect(screen.getByText("Error one")).toBeInTheDocument();
    expect(screen.getByText("Info two")).toBeInTheDocument();
  });

  it("renders an error type item with the toast-error class", () => {
    render(
      <Toast messages={[makeMessage(0, "Oops", "error")]} onDismiss={vi.fn()} />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("toast-error");
  });

  it("renders an info type item with the toast-info class", () => {
    render(
      <Toast messages={[makeMessage(0, "FYI", "info")]} onDismiss={vi.fn()} />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("toast-info");
  });

  it("each toast item has role='alert'", () => {
    const messages = [makeMessage(0, "A"), makeMessage(1, "B")];
    render(<Toast messages={messages} onDismiss={vi.fn()} />);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("does not have the toast-exit class when first rendered", () => {
    render(
      <Toast messages={[makeMessage(0, "Stable")]} onDismiss={vi.fn()} />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.className).not.toContain("toast-exit");
  });
});

// ---------------------------------------------------------------------------
// Toast — auto-dismiss after 5 seconds
// ---------------------------------------------------------------------------

describe("Toast — auto-dismiss timer", () => {
  it("applies toast-exit class after 5 seconds", () => {
    render(
      <Toast messages={[makeMessage(0, "Will exit")]} onDismiss={vi.fn()} />,
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("toast-exit");
  });

  it("calls onDismiss with the correct id 300 ms after the exit animation starts", () => {
    const onDismiss = vi.fn();
    render(
      <Toast messages={[makeMessage(42, "Auto dismiss")]} onDismiss={onDismiss} />,
    );
    act(() => {
      vi.advanceTimersByTime(5300);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(42);
  });

  it("does not call onDismiss before 5 seconds have elapsed", () => {
    const onDismiss = vi.fn();
    render(
      <Toast messages={[makeMessage(0, "Still here")]} onDismiss={onDismiss} />,
    );
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls onDismiss for each message independently", () => {
    const onDismiss = vi.fn();
    const messages = [makeMessage(10, "First"), makeMessage(20, "Second")];
    render(<Toast messages={messages} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(5300);
    });
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onDismiss).toHaveBeenCalledWith(10);
    expect(onDismiss).toHaveBeenCalledWith(20);
  });
});

// ---------------------------------------------------------------------------
// Toast — click to dismiss
// ---------------------------------------------------------------------------

describe("Toast — click-to-dismiss", () => {
  it("applies toast-exit class immediately on click", () => {
    render(
      <Toast messages={[makeMessage(0, "Click me")]} onDismiss={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("alert"));
    expect(screen.getByRole("alert").className).toContain("toast-exit");
  });

  it("calls onDismiss 300 ms after clicking the item", () => {
    const onDismiss = vi.fn();
    render(
      <Toast messages={[makeMessage(7, "Clickable")]} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("alert"));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(7);
  });

  it("clicking calls onDismiss before the 5-second auto-dismiss fires", () => {
    const onDismiss = vi.fn();
    render(
      <Toast messages={[makeMessage(3, "Early click")]} onDismiss={onDismiss} />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByRole("alert"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // onDismiss called exactly once from the click path
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(3);
  });
});

// ---------------------------------------------------------------------------
// createToast helper
// ---------------------------------------------------------------------------

describe("createToast helper", () => {
  it("returns a ToastMessage with the supplied text", () => {
    const msg = createToast("Network error");
    expect(msg.text).toBe("Network error");
  });

  it("defaults to type 'error' when no type argument is provided", () => {
    const msg = createToast("Default type");
    expect(msg.type).toBe("error");
  });

  it("accepts an explicit 'error' type", () => {
    const msg = createToast("Explicit error", "error");
    expect(msg.type).toBe("error");
  });

  it("accepts an explicit 'info' type", () => {
    const msg = createToast("Informational", "info");
    expect(msg.type).toBe("info");
  });

  it("assigns a numeric id to each message", () => {
    const msg = createToast("Has id");
    expect(typeof msg.id).toBe("number");
  });

  it("assigns unique incrementing ids to successive messages", () => {
    const a = createToast("First");
    const b = createToast("Second");
    expect(b.id).toBeGreaterThan(a.id);
  });
});

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ServerConnect } from "./ServerConnect";

const defaultProps = {
  onConnectRemote: vi.fn().mockResolvedValue(true),
  onSwitchToLocal: vi.fn(),
  checking: false,
  error: null,
  connectionMode: "local" as const,
  remoteUrl: "",
  searchPhase: "idle" as const,
  searchProgress: "",
  searchAttempt: 1,
  onRetrySearch: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServerConnect", () => {
  it("renders Local Network and Remote Server mode buttons", () => {
    render(<ServerConnect {...defaultProps} />);
    expect(screen.getByText("Local Network")).toBeInTheDocument();
    expect(screen.getByText("Remote Server")).toBeInTheDocument();
  });

  it("Local mode is active by default when connectionMode is 'local'", () => {
    render(<ServerConnect {...defaultProps} connectionMode="local" />);
    const localBtn = screen.getByText("Local Network");
    expect(localBtn.className).toContain("mode-btn-active");
    const remoteBtn = screen.getByText("Remote Server");
    expect(remoteBtn.className).not.toContain("mode-btn-active");
  });

  it("clicking Remote Server switches to remote mode", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} />);
    await user.click(screen.getByText("Remote Server"));
    expect(screen.getByText("Remote Server").className).toContain("mode-btn-active");
    expect(screen.getByPlaceholderText("pulserealm.example.com")).toBeInTheDocument();
  });

  it("clicking Local Network calls onSwitchToLocal", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} connectionMode="remote" />);
    // Start in remote mode by clicking it first, then go back to local
    await user.click(screen.getByText("Local Network"));
    expect(defaultProps.onSwitchToLocal).toHaveBeenCalledTimes(1);
  });

  it("in local mode with searchPhase 'searching': shows spinner and 'Searching for server...'", () => {
    render(<ServerConnect {...defaultProps} searchPhase="searching" searchProgress="Checking 192.168.1.1..." />);
    expect(screen.getByText("Searching for server...")).toBeInTheDocument();
    expect(screen.getByText("Checking 192.168.1.1...")).toBeInTheDocument();
    expect(document.querySelector(".search-spinner")).toBeInTheDocument();
  });

  it("in local mode with searchPhase 'not_found': shows 'No server found' and retry button", () => {
    render(<ServerConnect {...defaultProps} searchPhase="not_found" />);
    expect(screen.getByText("No server found on the network")).toBeInTheDocument();
    expect(screen.getByText("Retry Search")).toBeInTheDocument();
  });

  it("in local mode with searchPhase 'idle': shows 'Search for Server' button", () => {
    render(<ServerConnect {...defaultProps} searchPhase="idle" />);
    expect(screen.getByText("Search for Server")).toBeInTheDocument();
  });

  it("shows search attempt count when > 1", () => {
    render(<ServerConnect {...defaultProps} searchPhase="searching" searchAttempt={3} />);
    expect(screen.getByText("Attempt 3")).toBeInTheDocument();
  });

  it("shows search attempt count in not_found state when > 1", () => {
    render(<ServerConnect {...defaultProps} searchPhase="not_found" searchAttempt={2} />);
    expect(screen.getByText("Searched 2 times")).toBeInTheDocument();
  });

  it("does not show attempt count when searchAttempt is 1", () => {
    render(<ServerConnect {...defaultProps} searchPhase="searching" searchAttempt={1} />);
    expect(screen.queryByText(/Attempt/)).not.toBeInTheDocument();
  });

  it("in remote mode: shows form with server address input", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} />);
    await user.click(screen.getByText("Remote Server"));
    expect(screen.getByLabelText("Server address")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("pulserealm.example.com")).toBeInTheDocument();
  });

  it("in remote mode: submits form and calls onConnectRemote", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} />);
    await user.click(screen.getByText("Remote Server"));
    const input = screen.getByPlaceholderText("pulserealm.example.com");
    await user.type(input, "pulserealm.example.com");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(defaultProps.onConnectRemote).toHaveBeenCalledWith("pulserealm.example.com");
  });

  it("in remote mode: shows error message when error prop set", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} error="Connection refused" />);
    await user.click(screen.getByText("Remote Server"));
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("in remote mode: shows 'Connecting...' when checking is true", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} checking={true} />);
    await user.click(screen.getByText("Remote Server"));
    expect(screen.getByRole("button", { name: "Connecting..." })).toBeInTheDocument();
  });

  it("in remote mode: disables submit button when checking is true", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} checking={true} remoteUrl="example.com" />);
    await user.click(screen.getByText("Remote Server"));
    const submitBtn = screen.getByRole("button", { name: "Connecting..." });
    expect(submitBtn).toBeDisabled();
  });

  it("in remote mode: disables submit button when no URL entered", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} />);
    await user.click(screen.getByText("Remote Server"));
    const submitBtn = screen.getByRole("button", { name: "Connect" });
    expect(submitBtn).toBeDisabled();
  });

  it("does not call onConnectRemote when URL is empty", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} />);
    await user.click(screen.getByText("Remote Server"));
    fireEvent.submit(document.querySelector("form")!);
    expect(defaultProps.onConnectRemote).not.toHaveBeenCalled();
  });

  it("shows searchProgress text", () => {
    render(<ServerConnect {...defaultProps} searchPhase="searching" searchProgress="Trying subnet 192.168.0.x" />);
    expect(screen.getByText("Trying subnet 192.168.0.x")).toBeInTheDocument();
  });

  it("pre-fills URL input with remoteUrl prop", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} remoteUrl="my.server.com" />);
    await user.click(screen.getByText("Remote Server"));
    expect(screen.getByPlaceholderText("pulserealm.example.com")).toHaveValue("my.server.com");
  });

  it("retry button calls onRetrySearch", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} searchPhase="not_found" />);
    await user.click(screen.getByText("Retry Search"));
    expect(defaultProps.onRetrySearch).toHaveBeenCalledTimes(1);
  });

  it("idle mode: clicking Search for Server calls onRetrySearch", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} searchPhase="idle" />);
    await user.click(screen.getByText("Search for Server"));
    expect(defaultProps.onRetrySearch).toHaveBeenCalledTimes(1);
  });

  it("not_found state has Use Remote Server button that switches mode", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} searchPhase="not_found" />);
    await user.click(screen.getByText("Use Remote Server"));
    expect(screen.getByPlaceholderText("pulserealm.example.com")).toBeInTheDocument();
  });

  it("singular 'time' when searchAttempt is exactly 1 in not_found (edge case shown at attempt=1)", () => {
    // At searchAttempt=1, the count is NOT shown (guarded by > 1)
    render(<ServerConnect {...defaultProps} searchPhase="not_found" searchAttempt={1} />);
    expect(screen.queryByText(/Searched/)).not.toBeInTheDocument();
  });

  it("remote mode: input is disabled when checking is true", async () => {
    const user = userEvent.setup();
    render(<ServerConnect {...defaultProps} checking={true} />);
    await user.click(screen.getByText("Remote Server"));
    expect(screen.getByPlaceholderText("pulserealm.example.com")).toBeDisabled();
  });

  it("renders logo", () => {
    render(<ServerConnect {...defaultProps} />);
    expect(screen.getByAltText("PulseRealm")).toBeInTheDocument();
  });
});

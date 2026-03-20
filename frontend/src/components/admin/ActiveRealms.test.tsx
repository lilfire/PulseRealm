import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi } from "vitest";
import { ActiveRealms } from "./ActiveRealms";

const makeRealm = (overrides?: Record<string, unknown>) => ({
  id: "r1",
  joinCode: "123456",
  hostSecret: "SECRET",
  mode: "competition",
  status: "Lobby",
  createdAt: "2026-01-01T00:00:00Z",
  connectedClients: 2,
  maxClients: 10,
  ...overrides,
});

describe("ActiveRealms", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function setup(overrides?: { realms?: unknown[]; onJoinRealm?: typeof vi.fn }) {
    const realms = overrides?.realms ?? [makeRealm()];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(realms),
    });

    const onLogout = vi.fn();
    const onJoinRealm = overrides?.onJoinRealm ?? vi.fn();
    const onRealmCount = vi.fn();

    const result = render(
      <ActiveRealms
        apiUrl="http://localhost:5062"
        token="test-token"
        onLogout={onLogout}
        onJoinRealm={onJoinRealm}
        onRealmCount={onRealmCount}
      />,
    );

    return { onLogout, onJoinRealm, onRealmCount, ...result };
  }

  it("shows loading initially", () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <ActiveRealms
        apiUrl="http://localhost:5062"
        token="t"
        onLogout={vi.fn()}
      />,
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows 'No active realms' when empty", async () => {
    setup({ realms: [] });
    await waitFor(() => {
      expect(screen.getByText("No active realms")).toBeInTheDocument();
    });
  });

  it("renders realm cards", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText("123456")).toBeInTheDocument();
      expect(screen.getByText("competition")).toBeInTheDocument();
      expect(screen.getByText("Lobby")).toBeInTheDocument();
      expect(screen.getByText("2 / 10 connected")).toBeInTheDocument();
    });
  });

  it("shows Join button when onJoinRealm provided", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText("Join")).toBeInTheDocument();
    });
  });

  it("calls onJoinRealm when Join clicked", async () => {
    const onJoinRealm = vi.fn();
    setup({ onJoinRealm });
    await waitFor(() => {
      expect(screen.getByText("Join")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Join"));
    expect(onJoinRealm).toHaveBeenCalledWith({
      id: "r1",
      joinCode: "123456",
      mode: "competition",
    });
  });

  it("calls endRealm when End clicked", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText("End")).toBeInTheDocument();
    });

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    await act(async () => {
      fireEvent.click(screen.getByText("End"));
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:5062/api/admin/realms/r1/end",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("calls onLogout on 401 from fetchRealms", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    });

    const onLogout = vi.fn();
    render(
      <ActiveRealms
        apiUrl="http://localhost:5062"
        token="bad"
        onLogout={onLogout}
      />,
    );

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled();
    });
  });

  it("calls onLogout on 401 from endRealm", async () => {
    const onLogout = vi.fn();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([makeRealm()]),
    });

    render(
      <ActiveRealms
        apiUrl="http://localhost:5062"
        token="test"
        onLogout={onLogout}
        onJoinRealm={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("End")).toBeInTheDocument();
    });

    // Now mock the endRealm POST to return 401
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await act(async () => {
      fireEvent.click(screen.getByText("End"));
    });

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled();
    });
  });

  it("calls onRealmCount with realm count", async () => {
    const { onRealmCount } = setup({ realms: [makeRealm(), makeRealm({ id: "r2", joinCode: "654321" })] });
    await waitFor(() => {
      expect(onRealmCount).toHaveBeenCalledWith(2);
    });
  });

  describe("HostKeyReveal", () => {
    it("shows Show Host Key button", async () => {
      setup();
      await waitFor(() => {
        expect(screen.getByText("Show Host Key")).toBeInTheDocument();
      });
    });

    it("reveals secret when clicked", async () => {
      setup();
      await waitFor(() => {
        expect(screen.getByText("Show Host Key")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Show Host Key"));
      expect(screen.getByText("SECRET")).toBeInTheDocument();
      expect(screen.getByText("Hide Host Key")).toBeInTheDocument();
    });

    it("hides secret when clicked again", async () => {
      setup();
      await waitFor(() => {
        expect(screen.getByText("Show Host Key")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Show Host Key"));
      fireEvent.click(screen.getByText("Hide Host Key"));
      expect(screen.queryByText("SECRET")).not.toBeInTheDocument();
    });
  });

  it("shows status dot with lobby styling", async () => {
    setup({ realms: [makeRealm({ status: "Lobby" })] });
    await waitFor(() => {
      const dots = document.querySelectorAll(".admin-status-dot-lobby");
      expect(dots.length).toBe(1);
    });
  });

  it("shows status dot with active styling", async () => {
    setup({ realms: [makeRealm({ status: "Started" })] });
    await waitFor(() => {
      const dots = document.querySelectorAll(".admin-status-dot-active");
      expect(dots.length).toBe(1);
    });
  });

  it("handles fetch error gracefully", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network"));
    const onLogout = vi.fn();
    render(
      <ActiveRealms
        apiUrl="http://localhost:5062"
        token="t"
        onLogout={onLogout}
      />,
    );

    await waitFor(() => {
      // Should show no active realms after error
      expect(screen.getByText("No active realms")).toBeInTheDocument();
    });
  });
});

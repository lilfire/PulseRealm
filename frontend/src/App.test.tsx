import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { Mock } from "vitest";
import type { ClientProfile } from "./types/session";

// __APP_VERSION__ is defined in vitest.config.ts via `define`, but we also set
// it here so the module-level const in App.tsx resolves correctly when the
// vitest `define` transform isn't applied to the test environment globals.
(globalThis as unknown as Record<string, unknown>).__APP_VERSION__ = "0.1.0";

// ─── Mock heavy child components ─────────────────────────────────────────────
// We stub every lobby and game-mode component so the tests stay fast and
// focused on App-level routing logic rather than rendering entire sub-trees.

vi.mock("./components/lobbies/CompetitionLobby", () => ({
  CompetitionLobby: (props: { onLeave?: () => void; onStart?: (cfg: unknown) => void }) => (
    <div data-testid="competition-lobby">
      <button onClick={props.onLeave}>Leave</button>
      <button onClick={() => props.onStart?.({ subMode: "race", playerFormat: "individual", teams: [], targetDistanceKm: 5, intervalMinutes: 3, targetZone: 3, durationMinutes: 20 })}>
        Start Competition
      </button>
    </div>
  ),
}));

vi.mock("./components/lobbies/StreetViewLobby", () => ({
  StreetViewLobby: (props: { onLeave?: () => void; onStart?: (loc: unknown) => void }) => (
    <div data-testid="streetview-lobby">
      <button onClick={props.onLeave}>Leave</button>
      <button onClick={() => props.onStart?.({ lat: 48.8584, lng: 2.2945, address: "Paris" })}>
        Start StreetView
      </button>
    </div>
  ),
}));

vi.mock("./components/lobbies/YouTubeTrailLobby", () => ({
  YouTubeTrailLobby: (props: { onLeave?: () => void; onStart?: (v: unknown) => void }) => (
    <div data-testid="youtubetrail-lobby">
      <button onClick={props.onLeave}>Leave</button>
      <button onClick={() => props.onStart?.({ videoId: "abc123", url: "https://youtube.com/watch?v=abc123", title: "Test Video" })}>
        Start YouTubeTrail
      </button>
    </div>
  ),
}));

vi.mock("./components/lobbies/RouteLobby", () => ({
  RouteLobby: (props: { onLeave?: () => void; onStart?: (cfg: unknown) => void }) => (
    <div data-testid="route-lobby">
      <button onClick={props.onLeave}>Leave</button>
      <button onClick={() => props.onStart?.({ routeId: "r1" })}>Start Route</button>
    </div>
  ),
}));

vi.mock("./components/lobbies/DungeonLobby", () => ({
  DungeonLobby: (props: { onLeave?: () => void; onStart?: (cfg: unknown) => void }) => (
    <div data-testid="dungeon-lobby">
      <button onClick={props.onLeave}>Leave</button>
      <button onClick={() => props.onStart?.({ difficulty: "normal", timeframeMinutes: 30 })}>
        Start Dungeon
      </button>
    </div>
  ),
}));

vi.mock("./components/lobbies/DefaultLobby", () => ({
  DefaultLobby: (props: { onLeave?: () => void; onStart?: () => void }) => (
    <div data-testid="default-lobby">
      <button onClick={props.onLeave}>Leave</button>
      <button onClick={props.onStart}>Start Default</button>
    </div>
  ),
}));

vi.mock("./components/modes/CompetitionMode", () => ({
  CompetitionMode: () => <div data-testid="competition-mode">CompetitionMode</div>,
}));

vi.mock("./components/modes/StreetViewMode", () => ({
  StreetViewMode: () => <div data-testid="streetview-mode">StreetViewMode</div>,
}));

vi.mock("./components/modes/YouTubeTrailMode", () => ({
  YouTubeTrailMode: () => <div data-testid="youtubetrail-mode">YouTubeTrailMode</div>,
}));

vi.mock("./components/modes/RouteMode", () => ({
  RouteMode: () => <div data-testid="route-mode">RouteMode</div>,
}));

vi.mock("./components/modes/DungeonMode", () => ({
  DungeonMode: () => <div data-testid="dungeon-mode">DungeonMode</div>,
}));

vi.mock("./components/modes/SocialMode", () => ({
  SocialMode: () => <div data-testid="social-mode">SocialMode</div>,
}));

vi.mock("./components/SessionSummaryScreen", () => ({
  RealmSummaryScreen: (props: { onClose?: () => void }) => (
    <div data-testid="realm-summary-screen">
      <button onClick={props.onClose}>Back to Home</button>
    </div>
  ),
}));

vi.mock("./components/admin/AdminLogin", () => ({
  AdminLogin: (props: { onSuccess?: (token: string) => void; onBack?: () => void }) => (
    <div data-testid="admin-login">
      <button onClick={() => props.onSuccess?.("test-token")}>Login Success</button>
      <button onClick={props.onBack}>Back to Home</button>
    </div>
  ),
}));

vi.mock("./components/admin/AdminDashboard", () => ({
  AdminDashboard: (props: { onLogout?: () => void }) => (
    <div data-testid="admin-dashboard">
      <button onClick={props.onLogout}>Logout</button>
    </div>
  ),
}));

vi.mock("./components/ServerConnect", () => ({
  ServerConnect: () => <div data-testid="server-connect">ServerConnect</div>,
}));

// ─── Mock hooks ───────────────────────────────────────────────────────────────

const mockDisconnect = vi.fn();
const mockConnectRemote = vi.fn();
const mockSwitchToLocal = vi.fn();
const mockSearchForServer = vi.fn();
const mockSetConnectionMode = vi.fn();
const mockSetRemoteUrl = vi.fn();

const baseServerConnection = {
  isConnected: true,
  serverUrl: "http://localhost:5062",
  apiUrl: "http://localhost:5062",
  hubUrl: "http://localhost:5062/hubs/realm",
  serverInfo: {
    name: "PulseRealm",
    version: "1.0.0",
    hostname: "test",
    hubPath: "/hubs/realm",
    apiPath: "/api",
  },
  connectionMode: "local" as const,
  remoteUrl: "",
  checking: false,
  error: null,
  searchPhase: "idle" as const,
  searchProgress: "",
  searchAttempt: 0,
  searchAttemptNum: 0,
  connectRemote: mockConnectRemote,
  switchToLocal: mockSwitchToLocal,
  searchForServer: mockSearchForServer,
  disconnect: mockDisconnect,
  setConnectionMode: mockSetConnectionMode,
  setRemoteUrl: mockSetRemoteUrl,
  connect: vi.fn(),
};

const mockStartRealm = vi.fn();
const mockEndRealm = vi.fn();
const mockNotifyEliminated = vi.fn();

const baseRealmHub = {
  connected: false,
  started: false,
  ended: false,
  realmSummary: null,
  clients: [] as string[],
  clientProfiles: {} as Record<string, ClientProfile>,
  latestData: null,
  realmConfig: null,
  startRealm: mockStartRealm,
  endRealm: mockEndRealm,
  notifyEliminated: mockNotifyEliminated,
};

// These will be mutated per test via `mockReturnValue`.
const mockUseServerConnection = vi.fn(() => ({ ...baseServerConnection }));
const mockUseRealmHub = vi.fn(() => ({ ...baseRealmHub }));

vi.mock("./hooks/useServerConnection", () => ({
  useServerConnection: () => mockUseServerConnection(),
}));

vi.mock("./hooks/useSessionHub", () => ({
  useRealmHub: () => mockUseRealmHub(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockConfigFetch(overrides: Record<string, unknown> = {}) {
  (globalThis.fetch as Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ adminEnabled: false, ...overrides }),
  } as unknown as Response);
}

function mockCreateRealmFetch(mode = "competition") {
  (globalThis.fetch as Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ id: "realm-123", joinCode: "123456", mode }),
  } as unknown as Response);
}

async function renderApp() {
  // Lazy-import App after mocks are in place so module-level code picks up the mocks.
  const { default: App } = await import("./App");
  render(<App />);
  // Wait for the /api/config effect to settle
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
}

// ─── Test suite ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseServerConnection.mockReturnValue({ ...baseServerConnection });
  mockUseRealmHub.mockReturnValue({ ...baseRealmHub });
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.resetModules();
});

// ─── 1. Home screen renders with mode cards ───────────────────────────────────

describe("home screen", () => {
  it("renders home screen when connected and no realm", async () => {
    mockConfigFetch();
    await renderApp();
    expect(screen.getByText("Choose a mode to create a realm")).toBeInTheDocument();
  });

  it("shows all 6 mode cards", async () => {
    mockConfigFetch();
    await renderApp();
    expect(screen.getByRole("button", { name: /Competition/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Street View/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /YouTube Trail/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Route/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dungeon/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Social/i })).toBeInTheDocument();
  });

  it("shows Join a Realm button", async () => {
    mockConfigFetch();
    await renderApp();
    expect(screen.getByRole("button", { name: "Join a Realm" })).toBeInTheDocument();
  });

  it("shows app version in footer", async () => {
    mockConfigFetch();
    await renderApp();
    expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument();
  });

  it("shows server info in footer when serverInfo is present", async () => {
    mockConfigFetch();
    await renderApp();
    expect(screen.getByText(/PulseRealm/)).toBeInTheDocument();
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
  });

  it("shows Change button in footer for server disconnection", async () => {
    mockConfigFetch();
    await renderApp();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });

  it("Change button calls server.disconnect", async () => {
    mockConfigFetch();
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});

// ─── 2. ServerConnect shown when not connected ────────────────────────────────

describe("ServerConnect screen", () => {
  it("renders ServerConnect when not connected and no PRESET_API_URL", async () => {
    // Return empty apiUrl so the /api/config useEffect guard (`if (!apiUrl) return`)
    // short-circuits and fetch is never called.
    mockUseServerConnection.mockReturnValue({
      ...baseServerConnection,
      isConnected: false,
      apiUrl: "",
      hubUrl: "",
    });
    const { default: App } = await import("./App");
    render(<App />);
    expect(screen.getByTestId("server-connect")).toBeInTheDocument();
  });

  it("does not render home screen when not connected", async () => {
    mockUseServerConnection.mockReturnValue({
      ...baseServerConnection,
      isConnected: false,
      apiUrl: "",
      hubUrl: "",
    });
    const { default: App } = await import("./App");
    render(<App />);
    expect(screen.queryByText("Choose a mode to create a realm")).not.toBeInTheDocument();
  });
});

// ─── 3. Join realm UI ─────────────────────────────────────────────────────────

describe("join realm", () => {
  it("clicking Join a Realm shows the join code input", async () => {
    mockConfigFetch();
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Join a Realm" }));
    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
  });

  it("join code input enforces 6-character limit", async () => {
    mockConfigFetch();
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Join a Realm" }));
    const input = screen.getByPlaceholderText("000000");
    expect(input).toHaveAttribute("maxLength", "6");
  });

  it("Watch button is disabled until 6 digits are entered", async () => {
    mockConfigFetch();
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Join a Realm" }));
    expect(screen.getByRole("button", { name: "Watch" })).toBeDisabled();
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "12345" } });
    expect(screen.getByRole("button", { name: "Watch" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "123456" } });
    expect(screen.getByRole("button", { name: "Watch" })).toBeEnabled();
  });

  it("Cancel button hides the join input", async () => {
    mockConfigFetch();
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Join a Realm" }));
    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByPlaceholderText("000000")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join a Realm" })).toBeInTheDocument();
  });

  it("shows error when realm is not found (404)", async () => {
    mockConfigFetch();
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Join a Realm" }));
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "999999" } });

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    await waitFor(() => {
      expect(screen.getByText("Realm not found. Check the code and try again.")).toBeInTheDocument();
    });
  });

  it("shows error when realm has already ended", async () => {
    mockConfigFetch();
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Join a Realm" }));
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "888888" } });

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "r1", joinCode: "888888", mode: 0, status: "Ended" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    await waitFor(() => {
      expect(screen.getByText("This realm has already ended.")).toBeInTheDocument();
    });
  });

  it("shows error on network failure during join", async () => {
    mockConfigFetch();
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Join a Realm" }));
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "777777" } });

    (globalThis.fetch as Mock).mockRejectedValueOnce(new Error("Network error"));

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    await waitFor(() => {
      expect(screen.getByText("Could not connect to server.")).toBeInTheDocument();
    });
  });

  it("shows generic error for non-404 failure responses", async () => {
    mockConfigFetch();
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Join a Realm" }));
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "666666" } });

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to join realm.")).toBeInTheDocument();
    });
  });
});

// ─── 4. Mode card creates a realm ────────────────────────────────────────────

describe("creating realms via mode cards", () => {
  it("clicking Competition card calls POST /api/realm and shows competition lobby", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-c", joinCode: "111111", mode: "competition" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Competition/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:5062/api/realm",
      expect.objectContaining({ method: "POST" })
    ));

    await waitFor(() => {
      expect(screen.getByTestId("competition-lobby")).toBeInTheDocument();
    });
  });

  it("clicking Street View card creates realm and shows streetview lobby", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-sv", joinCode: "222222", mode: "streetview" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Street View/i }));

    await waitFor(() => {
      expect(screen.getByTestId("streetview-lobby")).toBeInTheDocument();
    });
  });

  it("clicking YouTube Trail card creates realm and shows youtubetrail lobby", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-yt", joinCode: "333333", mode: "youtubetrail" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /YouTube Trail/i }));

    await waitFor(() => {
      expect(screen.getByTestId("youtubetrail-lobby")).toBeInTheDocument();
    });
  });

  it("clicking Route card creates realm and shows route lobby", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-r", joinCode: "444444", mode: "route" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /RouteFollow a path/i }));

    await waitFor(() => {
      expect(screen.getByTestId("route-lobby")).toBeInTheDocument();
    });
  });

  it("clicking Dungeon card creates realm and shows dungeon lobby", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-d", joinCode: "555555", mode: "dungeon" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Dungeon/i }));

    await waitFor(() => {
      expect(screen.getByTestId("dungeon-lobby")).toBeInTheDocument();
    });
  });

  it("clicking Social card creates realm and shows default lobby", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-s", joinCode: "666666", mode: "social" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Social/i }));

    await waitFor(() => {
      expect(screen.getByTestId("default-lobby")).toBeInTheDocument();
    });
  });

  it("mode cards are disabled while a realm is being created", async () => {
    mockConfigFetch();
    // Hold the fetch response so the "creating" state stays active long enough to assert
    let resolveCreate!: (v: unknown) => void;
    const createPromise = new Promise((res) => { resolveCreate = res; });

    await renderApp();

    (globalThis.fetch as Mock).mockReturnValueOnce(createPromise);

    const competitionBtn = screen.getByRole("button", { name: /Competition/i });
    fireEvent.click(competitionBtn);

    // While in-flight all 6 mode buttons should be disabled
    expect(competitionBtn).toBeDisabled();
    expect(screen.getByRole("button", { name: /Street View/i })).toBeDisabled();

    // Resolve so cleanup doesn't leave unresolved promises
    resolveCreate({ ok: true, json: async () => ({ id: "r", joinCode: "111111", mode: "competition" }) });
  });

  it("shows error when createRealm fetch fails", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockRejectedValueOnce(new Error("Network down"));

    fireEvent.click(screen.getByRole("button", { name: /Competition/i }));

    await waitFor(() => {
      expect(screen.getByText("Network down")).toBeInTheDocument();
    });
  });

  it("shows error when createRealm returns non-ok response", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Competition/i }));

    await waitFor(() => {
      expect(screen.getByText("Server returned 500")).toBeInTheDocument();
    });
  });
});

// ─── 5. Admin pages ───────────────────────────────────────────────────────────

describe("admin", () => {
  it("does not show gear button when adminEnabled is false", async () => {
    mockConfigFetch({ adminEnabled: false });
    await renderApp();
    expect(screen.queryByTitle("Admin Settings")).not.toBeInTheDocument();
  });

  it("shows gear button when adminEnabled is true", async () => {
    mockConfigFetch({ adminEnabled: true });
    await renderApp();
    await waitFor(() => {
      expect(screen.getByTitle("Admin Settings")).toBeInTheDocument();
    });
  });

  it("clicking gear button navigates to admin-login page", async () => {
    mockConfigFetch({ adminEnabled: true });
    await renderApp();
    await waitFor(() => expect(screen.getByTitle("Admin Settings")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Admin Settings"));
    expect(screen.getByTestId("admin-login")).toBeInTheDocument();
  });

  it("successful login navigates to admin dashboard", async () => {
    mockConfigFetch({ adminEnabled: true });
    await renderApp();
    await waitFor(() => expect(screen.getByTitle("Admin Settings")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Admin Settings"));
    fireEvent.click(screen.getByRole("button", { name: "Login Success" }));
    expect(screen.getByTestId("admin-dashboard")).toBeInTheDocument();
  });

  it("back button on admin login returns to home screen", async () => {
    mockConfigFetch({ adminEnabled: true });
    await renderApp();
    await waitFor(() => expect(screen.getByTitle("Admin Settings")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Admin Settings"));
    expect(screen.getByTestId("admin-login")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(screen.getByText("Choose a mode to create a realm")).toBeInTheDocument();
  });

  it("logout from admin dashboard returns to home screen", async () => {
    mockConfigFetch({ adminEnabled: true });
    await renderApp();
    await waitFor(() => expect(screen.getByTitle("Admin Settings")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Admin Settings"));
    fireEvent.click(screen.getByRole("button", { name: "Login Success" }));
    expect(screen.getByTestId("admin-dashboard")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(screen.getByText("Choose a mode to create a realm")).toBeInTheDocument();
  });
});

// ─── 6. Lobby rendering ───────────────────────────────────────────────────────

describe("lobby routing", () => {
  it("renders CompetitionLobby when realm mode is competition and not started", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-cx", joinCode: "100001", mode: "competition" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Competition/i }));

    await waitFor(() => {
      expect(screen.getByTestId("competition-lobby")).toBeInTheDocument();
    });
  });

  it("renders DefaultLobby for social mode", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-sx", joinCode: "500005", mode: "social" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Social/i }));

    await waitFor(() => {
      expect(screen.getByTestId("default-lobby")).toBeInTheDocument();
    });
  });

  it("Leave button in lobby resets to home screen", async () => {
    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-lv", joinCode: "100002", mode: "competition" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Competition/i }));
    await waitFor(() => expect(screen.getByTestId("competition-lobby")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(screen.getByText("Choose a mode to create a realm")).toBeInTheDocument();
  });
});

// ─── 7. Game mode rendering ───────────────────────────────────────────────────

describe("game mode rendering", () => {
  it("renders CompetitionMode when competition realm is started with config", async () => {
    mockConfigFetch();
    await renderApp();

    // Create realm
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-gm", joinCode: "200002", mode: "competition" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Competition/i }));
    await waitFor(() => expect(screen.getByTestId("competition-lobby")).toBeInTheDocument());

    // Simulate hub reporting started=true after onStart fires
    mockUseRealmHub.mockReturnValue({
      ...baseRealmHub,
      started: true,
      connected: true,
    });

    // Click Start in the stubbed lobby — this calls onStart which sets competitionConfig
    fireEvent.click(screen.getByRole("button", { name: "Start Competition" }));

    await waitFor(() => {
      expect(screen.getByTestId("competition-mode")).toBeInTheDocument();
    });
  });

  it("renders SocialMode when social realm is started", async () => {
    mockConfigFetch();
    // Lazy-import so we get the fresh mocked module
    const { default: App } = await import("./App");
    const { rerender } = render(<App />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-sm", joinCode: "300003", mode: "social" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Social/i }));
    await waitFor(() => expect(screen.getByTestId("default-lobby")).toBeInTheDocument());

    // Update hub mock to reflect realm started, then force a re-render
    mockUseRealmHub.mockReturnValue({ ...baseRealmHub, started: true, connected: true });
    rerender(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("social-mode")).toBeInTheDocument();
    });
  });
});

// ─── 8. Summary screen ────────────────────────────────────────────────────────

describe("summary screen", () => {
  const mockSummary = {
    durationSeconds: 1800,
    totalDistanceMeters: 5000,
    totalSteps: 7000,
    averageHeartRate: 145,
    maxHeartRate: 172,
    averageSpeedKmh: 7.5,
    avgCadenceSpm: 160,
    caloriesBurned: 0,
    timeInZone: {},
    activePeriodSeconds: 1750,
    participantCount: 1,
  };

  it("renders RealmSummaryScreen when ended with realmSummary", async () => {
    mockUseRealmHub.mockReturnValue({
      ...baseRealmHub,
      ended: true,
      realmSummary: mockSummary,
    });

    mockConfigFetch();
    await renderApp();

    // Need a realm in state to reach the ended/summary branch — create one first
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-end", joinCode: "400004", mode: "competition" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Competition/i }));

    await waitFor(() => {
      expect(screen.getByTestId("realm-summary-screen")).toBeInTheDocument();
    });
  });

  it("Back to Home from summary resets to home screen", async () => {
    mockUseRealmHub.mockReturnValue({
      ...baseRealmHub,
      ended: true,
      realmSummary: mockSummary,
    });

    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-bh", joinCode: "400005", mode: "competition" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Competition/i }));
    await waitFor(() => expect(screen.getByTestId("realm-summary-screen")).toBeInTheDocument());

    // After summary is closed the realm hub mock needs to no longer report ended
    mockUseRealmHub.mockReturnValue({ ...baseRealmHub });

    fireEvent.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(screen.getByText("Choose a mode to create a realm")).toBeInTheDocument();
  });

  it("does not show summary screen when ended is true but realmSummary is null", async () => {
    mockUseRealmHub.mockReturnValue({ ...baseRealmHub, ended: true, realmSummary: null });

    mockConfigFetch();
    await renderApp();

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-ns", joinCode: "400006", mode: "competition" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: /Competition/i }));

    await waitFor(() => {
      // Without realmSummary the summary screen is skipped; lobby is shown instead
      expect(screen.queryByTestId("realm-summary-screen")).not.toBeInTheDocument();
      expect(screen.getByTestId("competition-lobby")).toBeInTheDocument();
    });
  });
});

// ─── 9. /api/config fetch behaviour ──────────────────────────────────────────

describe("/api/config fetch", () => {
  it("fetches /api/config on mount using the server apiUrl", async () => {
    mockConfigFetch();
    await renderApp();
    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:5062/api/config");
  });

  it("handles /api/config fetch failure gracefully (no crash)", async () => {
    (globalThis.fetch as Mock).mockRejectedValueOnce(new Error("Network down"));
    // Import fresh module since beforeEach resets modules
    const { default: App } = await import("./App");
    render(<App />);
    // Give React time to run effects
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("Choose a mode to create a realm")).toBeInTheDocument();
  });

  it("sets lobbyDefaults from config.defaults when present", async () => {
    const defaults = {
      competition: { subMode: "race", playerFormat: "individual", targetDistanceKm: 5, intervalMinutes: 3, targetZone: 3, durationMinutes: 20 },
      dungeon: { difficulty: "hard", timeframeMinutes: 45 },
      streetViewLocations: [],
      youTubeVideos: [],
    };
    mockConfigFetch({ adminEnabled: false, defaults });
    await renderApp();
    // No crash; defaults are stored internally and passed to lobby components.
    expect(screen.getByText("Choose a mode to create a realm")).toBeInTheDocument();
  });
});

// ─── 10. Joining a realm as view-only ────────────────────────────────────────

describe("join realm as view-only", () => {
  it("joining a valid realm shows the lobby for that mode", async () => {
    mockConfigFetch();
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Join a Realm" }));
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-view", joinCode: "123456", mode: 0, status: "Active" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    await waitFor(() => {
      expect(screen.getByTestId("competition-lobby")).toBeInTheDocument();
    });
  });

  it("shows error when unknown realm mode is returned", async () => {
    mockConfigFetch();
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Join a Realm" }));
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "555555" } });

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      // mode 99 is not in MODE_FROM_NUMBER, and not a valid string mode
      json: async () => ({ id: "realm-unk", joinCode: "555555", mode: 99, status: "Active" }),
    } as unknown as Response);

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    await waitFor(() => {
      expect(screen.getByText("Unknown realm mode.")).toBeInTheDocument();
    });
  });
});

// ─── 11. Enter join code with keyboard ───────────────────────────────────────

describe("join code input keyboard interaction", () => {
  it("pressing Enter in the join code input triggers join when 6 digits entered", async () => {
    mockConfigFetch();
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole("button", { name: "Join a Realm" }));
    const input = screen.getByPlaceholderText("000000");

    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "realm-kb", joinCode: "123456", mode: 5, status: "Active" }),
    } as unknown as Response);

    await user.type(input, "123456");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("default-lobby")).toBeInTheDocument();
    });
  });
});

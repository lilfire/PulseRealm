import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AdminDashboard } from "./AdminDashboard";

vi.mock("./AdminDashboard.css", () => ({}));

const API_URL = "http://localhost:5062";
const TOKEN = "test-token";

const mockConfig = {
  competitionSubMode: "race",
  competitionPlayerFormat: "individual",
  competitionTargetDistanceKm: 5,
  competitionIntervalMinutes: 3,
  competitionTargetZone: 3,
  competitionDurationMinutes: 20,
  dungeonDifficulty: "normal",
  dungeonTimeframeMinutes: 30,
  streetViewLocations: [],
  youTubeVideos: [],
};

function makeConfigFetch(config = mockConfig) {
  return vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => config,
  } as Response);
}

function setup(fetchMock?: ReturnType<typeof vi.fn>) {
  const onLogout = vi.fn();
  const user = userEvent.setup();
  globalThis.fetch = fetchMock ?? makeConfigFetch();
  render(<AdminDashboard apiUrl={API_URL} token={TOKEN} onLogout={onLogout} />);
  return { onLogout, user };
}

describe("AdminDashboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows 'Loading...' while config is being fetched", async () => {
    let resolveJson!: (v: unknown) => void;
    const jsonPromise = new Promise((res) => { resolveJson = res; });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => jsonPromise,
    } as unknown as Response);

    const onLogout = vi.fn();
    render(<AdminDashboard apiUrl={API_URL} token={TOKEN} onLogout={onLogout} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();

    resolveJson(mockConfig);
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });

  it("renders tabs after config loads", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /competition/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /dungeon/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /street view/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /youtube videos/i })).toBeInTheDocument();
    });
  });

  it("fetches config with Authorization header on mount", async () => {
    const fetchMock = makeConfigFetch();
    setup(fetchMock);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/admin/config`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
          }),
        })
      );
    });
  });

  it("shows error message if config fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
    const onLogout = vi.fn();
    render(<AdminDashboard apiUrl={API_URL} token={TOKEN} onLogout={onLogout} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load config")).toBeInTheDocument();
    });
  });

  it("calls onLogout on 401 response during config fetch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    const onLogout = vi.fn();
    render(<AdminDashboard apiUrl={API_URL} token={TOKEN} onLogout={onLogout} />);

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });

  it("can switch between tabs", async () => {
    const { user } = setup();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /dungeon/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /dungeon/i }));
    expect(screen.getByText(/default difficulty/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /street view places/i }));
    expect(screen.getByRole("button", { name: /\+ add location/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /youtube videos/i }));
    expect(screen.getByRole("button", { name: /\+ add video/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /competition/i }));
    expect(screen.getByText(/default sub-mode/i)).toBeInTheDocument();
  });

  it("calls save endpoint when 'Save Changes' clicked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      } as Response);

    const { user } = setup(fetchMock);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/admin/config`,
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: `Bearer ${TOKEN}`,
          }),
        })
      );
    });
  });

  it("shows 'Saved' message on successful save", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      } as Response);

    const { user } = setup(fetchMock);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  it("shows 'Save failed' message on save error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      } as Response)
      .mockRejectedValueOnce(new Error("Network error"));

    const { user } = setup(fetchMock);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });
  });

  it("shows 'Saving...' while saving is in progress", async () => {
    let resolveSave!: (v: unknown) => void;
    const savePromise = new Promise((res) => { resolveSave = res; });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => savePromise,
      } as unknown as Response);

    const { user } = setup(fetchMock);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("button", { name: /saving\.\.\./i })).toBeDisabled();

    resolveSave(mockConfig);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /saving\.\.\./i })).not.toBeInTheDocument();
    });
  });

  it("logout button calls logout endpoint then onLogout", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

    const { user, onLogout } = setup(fetchMock);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /logout/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/admin/logout`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
          }),
        })
      );
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });

  it("calls onLogout even if logout endpoint throws", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      } as Response)
      .mockRejectedValueOnce(new Error("Network error"));

    const { user, onLogout } = setup(fetchMock);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /logout/i }));

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });

  it("calls onLogout on 401 during save", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      } as Response);

    const { user, onLogout } = setup(fetchMock);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });

  it("error state shows Back to Home button that calls onLogout", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("fail"));
    const onLogout = vi.fn();
    const user = userEvent.setup();
    render(<AdminDashboard apiUrl={API_URL} token={TOKEN} onLogout={onLogout} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load config")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /back to home/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

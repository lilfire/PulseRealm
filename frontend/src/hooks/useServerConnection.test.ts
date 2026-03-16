import { renderHook, act, waitFor } from "@testing-library/react";
import { vi } from "vitest";

// ─── localStorage mock ───────────────────────────────────────────────────────

const lsStore: Record<string, string> = {};

const mockLocalStorage = {
  getItem: vi.fn((key: string) => lsStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { lsStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete lsStore[key]; }),
  clear: () => {
    Object.keys(lsStore).forEach((k) => delete lsStore[k]);
  },
};
Object.defineProperty(window, "localStorage", { value: mockLocalStorage });

// ─── RTCPeerConnection mock ──────────────────────────────────────────────────
// Fires onicegatheringstatechange on the next microtask after setLocalDescription
// so that getLocalIp() resolves quickly with null rather than waiting 3 s.

class MockRTCPeerConnection {
  createDataChannel() {}
  async createOffer() {
    return {};
  }
  async setLocalDescription() {
    // Trigger ICE gathering completion on the next microtask
    await Promise.resolve();
    this.iceGatheringState = "complete";
    this.onicegatheringstatechange?.();
  }
  close() {}
  onicecandidate: ((event: unknown) => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  iceGatheringState = "new";
}
(window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
  MockRTCPeerConnection;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "pulserealm_server_url";
const STORAGE_MODE_KEY = "pulserealm_connection_mode";
const STORAGE_REMOTE_URL_KEY = "pulserealm_remote_url";

function makeDiscoveryResponse(overrides: object = {}): object {
  return {
    name: "PulseRealm",
    version: "1.0.0",
    hostname: "test-host",
    hubPath: "/hubs/realm",
    apiPath: "/api",
    ...overrides,
  };
}

/**
 * Returns a fetch mock that answers /api/discovery with a valid ServerInfo
 * payload and lets every other request fail.
 */
function makeFetchOk(serverUrl: string) {
  return vi.fn((url: string) => {
    if (url.startsWith(serverUrl)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeDiscoveryResponse()),
      } as Response);
    }
    return Promise.reject(new Error("network error"));
  });
}

function makeFetchFail() {
  return vi.fn(() => Promise.reject(new Error("network error")));
}

// Re-bind the default localStorage mock implementations after resetAllMocks.
function bindLsMocks() {
  mockLocalStorage.getItem.mockImplementation((key: string) => lsStore[key] ?? null);
  mockLocalStorage.setItem.mockImplementation((key: string, value: string) => { lsStore[key] = value; });
  mockLocalStorage.removeItem.mockImplementation((key: string) => { delete lsStore[key]; });
}

// Reset state before every test
beforeEach(() => {
  // Clear the backing store so each test starts with a clean localStorage
  mockLocalStorage.clear();
  // resetAllMocks resets both call history AND any mockImplementation overrides
  // set in previous tests (e.g. tests that spy on specific key values).
  vi.resetAllMocks();
  // Re-attach the default implementations after reset.
  bindLsMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useServerConnection – initial state", () => {
  it("defaults to connectionMode 'local' and isConnected false when localStorage is empty", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    expect(result.current.connectionMode).toBe("local");
    expect(result.current.isConnected).toBe(false);
    expect(result.current.serverInfo).toBeNull();
  });

  it("reads connectionMode from localStorage on mount", async () => {
    mockLocalStorage.getItem.mockImplementation((key: string) => {
      if (key === STORAGE_MODE_KEY) return "remote";
      if (key === STORAGE_REMOTE_URL_KEY) return "http://192.168.1.100:5062";
      if (key === STORAGE_KEY) return "http://192.168.1.100:5062";
      return null;
    });

    global.fetch = makeFetchOk("http://192.168.1.100:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    expect(result.current.connectionMode).toBe("remote");
  });
});

describe("useServerConnection – connectRemote", () => {
  it("prepends https:// when no protocol is provided", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("example.com")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeDiscoveryResponse()),
        } as Response);
      }
      return Promise.reject(new Error("network error"));
    });
    global.fetch = fetchMock;

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.connectRemote("example.com:5062");
    });

    // The fetch call for verification should use the https:// prefixed URL
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://example.com:5062"),
      expect.anything()
    );
    expect(ok!).toBe(true);
  });

  it("returns true on successful connection", async () => {
    global.fetch = makeFetchOk("http://192.168.1.50:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.connectRemote("http://192.168.1.50:5062");
    });

    expect(ok!).toBe(true);
    expect(result.current.isConnected).toBe(true);
  });

  it("returns false and sets error on failed connection", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.connectRemote("http://192.168.1.99:5062");
    });

    expect(ok!).toBe(false);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).not.toBeNull();
  });

  it("stores the URL in localStorage on successful connection", async () => {
    global.fetch = makeFetchOk("http://192.168.1.50:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.1.50:5062");
    });

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      "http://192.168.1.50:5062"
    );
  });

  it("sets serverInfo on successful verification", async () => {
    global.fetch = makeFetchOk("http://10.0.0.5:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://10.0.0.5:5062");
    });

    expect(result.current.serverInfo).not.toBeNull();
    expect(result.current.serverInfo?.name).toBe("PulseRealm");
    expect(result.current.serverInfo?.hubPath).toBe("/hubs/realm");
  });
});

describe("useServerConnection – switchToLocal", () => {
  it("clears connection state and removes STORAGE_KEY from localStorage", async () => {
    global.fetch = makeFetchOk("http://192.168.1.50:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    // First establish a connection
    await act(async () => {
      await result.current.connectRemote("http://192.168.1.50:5062");
    });

    expect(result.current.isConnected).toBe(true);

    // Now switch to local — subsequent searches will fail (no server found)
    global.fetch = makeFetchFail();

    await act(async () => {
      result.current.switchToLocal();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.serverInfo).toBeNull();
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("starts a new server search after switching to local", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      result.current.switchToLocal();
    });

    // switchToLocal triggers searchForServer. With a fast-failing mock the scan
    // completes quickly so the phase transitions through "searching" → "not_found".
    // We accept either transition state as proof that a search was started.
    await waitFor(() => {
      expect(["searching", "not_found"]).toContain(result.current.searchPhase);
    });
  });
});

describe("useServerConnection – disconnect", () => {
  it("clears connection state without starting a search", async () => {
    global.fetch = makeFetchOk("http://192.168.1.50:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.1.50:5062");
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.serverInfo).toBeNull();
    expect(result.current.serverUrl).toBe("");
    // searchPhase should return to idle, not "searching"
    expect(result.current.searchPhase).toBe("idle");
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });
});

describe("useServerConnection – searchForServer", () => {
  it("sets searchPhase to 'searching' or later phase while scanning", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      result.current.searchForServer();
    });

    // After calling searchForServer, phase should be "searching" or may have already
    // transitioned to "not_found" if the search completed synchronously
    expect(["searching", "not_found"]).toContain(result.current.searchPhase);
  });

  it("transitions to 'not_found' when no server responds", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await waitFor(
      () => {
        expect(result.current.searchPhase).toBe("not_found");
      },
      { timeout: 15000 }
    );
  }, 20000);

  it("isConnected becomes true when connectRemote discovers a server", async () => {
    const targetUrl = "http://my-server.local:5062";
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith(targetUrl)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeDiscoveryResponse()),
        } as Response);
      }
      return Promise.reject(new Error("network error"));
    });

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote(targetUrl);
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.serverUrl).toBe(targetUrl);
  });
});

describe("useServerConnection – verifyServer via /api/discovery", () => {
  it("hits /api/discovery to verify server", async () => {
    const fetchMock = makeFetchOk("http://10.0.0.1:5062");
    global.fetch = fetchMock;

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://10.0.0.1:5062");
    });

    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.includes("/api/discovery"))).toBe(true);
  });

  it("returns false when discovery response is missing required fields", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ name: "", hubPath: "" }), // invalid payload
      } as Response)
    );

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.connectRemote("http://10.0.0.2:5062");
    });

    expect(ok!).toBe(false);
    expect(result.current.isConnected).toBe(false);
  });
});

describe("useServerConnection – setConnectionMode", () => {
  it("persists connectionMode to localStorage", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    act(() => {
      result.current.setConnectionMode("remote");
    });

    expect(result.current.connectionMode).toBe("remote");
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      STORAGE_MODE_KEY,
      "remote"
    );
  });
});

describe("useServerConnection – hubUrl / apiUrl helpers", () => {
  it("builds hubUrl from serverUrl and serverInfo.hubPath", async () => {
    global.fetch = makeFetchOk("http://192.168.1.10:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.1.10:5062");
    });

    expect(result.current.hubUrl).toBe(
      "http://192.168.1.10:5062/hubs/realm"
    );
    expect(result.current.apiUrl).toBe("http://192.168.1.10:5062");
  });

  it("returns empty strings when serverUrl is empty", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    // Before connecting, disconnect to ensure clean state
    act(() => {
      result.current.disconnect();
    });

    expect(result.current.hubUrl).toBe("");
    expect(result.current.apiUrl).toBe("");
  });
});

describe("useServerConnection – remoteUrl state", () => {
  it("persists remoteUrl to localStorage (even when verification fails)", async () => {
    // The remoteUrl is persisted via setRemoteUrl before verifyServer is called
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("remote-server.example.com:5062");
    });

    // setRemoteUrl stores the protocol-prefixed value
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      STORAGE_REMOTE_URL_KEY,
      "https://remote-server.example.com:5062"
    );
  });

  it("persists remoteUrl to localStorage when connection succeeds", async () => {
    global.fetch = makeFetchOk("http://192.168.5.5:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.5.5:5062");
    });

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      STORAGE_REMOTE_URL_KEY,
      "http://192.168.5.5:5062"
    );
  });
});

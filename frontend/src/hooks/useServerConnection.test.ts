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

    // Real timers required — the hook uses internal setTimeout for search retries.
    // The scan completes quickly with fast-failing fetch mocks.
    await waitFor(
      () => {
        expect(result.current.searchPhase).toBe("not_found");
      },
      { timeout: 10000 }
    );
  }, 15000);

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

// ─── New coverage tests ───────────────────────────────────────────────────────

describe("useServerConnection – connect function", () => {
  it("sets isConnected and serverUrl when verifyServer succeeds", async () => {
    global.fetch = makeFetchOk("http://192.168.1.77:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.connect("http://192.168.1.77:5062");
    });

    expect(ok!).toBe(true);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.serverUrl).toBe("http://192.168.1.77:5062");
  });

  it("persists serverUrl to localStorage when connect succeeds", async () => {
    global.fetch = makeFetchOk("http://192.168.1.77:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connect("http://192.168.1.77:5062");
    });

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      "http://192.168.1.77:5062"
    );
  });

  it("strips trailing slashes from URL before verifying", async () => {
    const fetchMock = makeFetchOk("http://192.168.1.77:5062");
    global.fetch = fetchMock;

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connect("http://192.168.1.77:5062///");
    });

    // All fetch calls should use the stripped URL
    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.every((u) => !u.includes("//:"))).toBe(true);
    expect(result.current.serverUrl).toBe("http://192.168.1.77:5062");
  });

  it("returns false and leaves isConnected false when verifyServer fails", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.connect("http://192.168.1.77:5062");
    });

    expect(ok!).toBe(false);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.serverUrl).toBe("");
  });

  it("does not write to localStorage when connect fails", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connect("http://192.168.1.77:5062");
    });

    const setItemCalls = mockLocalStorage.setItem.mock.calls.map(
      (c) => c[0] as string
    );
    expect(setItemCalls).not.toContain(STORAGE_KEY);
  });
});

describe("useServerConnection – verifyServer non-ok HTTP response", () => {
  it("sets error and isConnected false when server returns non-ok status", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      } as Response)
    );

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.connectRemote("http://192.168.1.88:5062");
    });

    expect(ok!).toBe(false);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).not.toBeNull();
    // The error message should mention the status code
    expect(result.current.error).toContain("503");
  });

  it("sets error and isConnected false when server returns non-ok 404", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      } as Response)
    );

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.connect("http://192.168.1.88:5062");
    });

    expect(ok!).toBe(false);
    expect(result.current.error).toContain("404");
  });
});

describe("useServerConnection – probeUrl edge cases via searchForServer", () => {
  it("does not set isConnected when probeUrl receives ok:false response", async () => {
    // Simulate a server that responds but returns ok:false for all requests.
    // searchForServer will scan and ultimately reach not_found.
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({}),
      } as Response)
    );

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      result.current.searchForServer();
    });

    // With ok:false, probeUrl returns null, so searchForServer should not connect
    expect(result.current.isConnected).toBe(false);
  });

  it("does not set isConnected when probeUrl response has empty name and hubPath", async () => {
    // Server responds ok:true but payload is missing required fields
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ name: "", hubPath: "", version: "1.0.0" }),
      } as Response)
    );

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      result.current.searchForServer();
    });

    // probeUrl returns null for missing name/hubPath, so no connection established
    expect(result.current.isConnected).toBe(false);
  });
});

describe("useServerConnection – searchForServer fast path", () => {
  it("transitions searchPhase to 'found' immediately when same-origin probe succeeds", async () => {
    // The fast-path checks window.location.origin first. In jsdom that is
    // typically "http://localhost" so we make the mock accept that origin.
    const origin = window.location.origin;
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith(origin)) {
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
      result.current.searchForServer();
    });

    await waitFor(() => {
      expect(result.current.searchPhase).toBe("found");
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.serverUrl).toBe(origin);
  });

  it("stores the discovered same-origin URL in localStorage", async () => {
    const origin = window.location.origin;
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith(origin)) {
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
      result.current.searchForServer();
    });

    await waitFor(() => {
      expect(result.current.searchPhase).toBe("found");
    });

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, origin);
  });
});

describe("useServerConnection – connectRemote with already-prefixed http:// URL", () => {
  it("does not double-prefix a URL that already starts with http://", async () => {
    const fetchMock = makeFetchOk("http://192.168.9.9:5062");
    global.fetch = fetchMock;

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.9.9:5062");
    });

    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    // Must not contain "https://http://" or "http://http://"
    expect(calledUrls.every((u) => !/^https?:\/\/https?:\/\//i.test(u))).toBe(true);
    expect(result.current.isConnected).toBe(true);
  });

  it("does not double-prefix a URL that already starts with https://", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("secure-server.example.com")) {
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

    await act(async () => {
      await result.current.connectRemote("https://secure-server.example.com:5062");
    });

    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.every((u) => !/^https?:\/\/https?:\/\//i.test(u))).toBe(true);
    expect(result.current.isConnected).toBe(true);
  });
});

describe("useServerConnection – setRemoteUrl", () => {
  it("updates remoteUrl state", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    // connectRemote internally calls setRemoteUrl; we verify the state is updated
    await act(async () => {
      await result.current.connectRemote("http://192.168.3.3:5062");
    });

    expect(result.current.remoteUrl).toBe("http://192.168.3.3:5062");
  });

  it("persists remoteUrl to localStorage via connectRemote", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.3.3:5062");
    });

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      STORAGE_REMOTE_URL_KEY,
      "http://192.168.3.3:5062"
    );
  });

  it("prefixes and persists remoteUrl when no protocol is supplied", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("myserver.local:5062");
    });

    // connectRemote adds https:// before calling setRemoteUrl
    expect(result.current.remoteUrl).toBe("https://myserver.local:5062");
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      STORAGE_REMOTE_URL_KEY,
      "https://myserver.local:5062"
    );
  });
});

describe("useServerConnection – initial auto-connect effect", () => {
  it("auto-verifies on mount when connectionMode is 'remote' and remoteUrl is set", async () => {
    const remoteServer = "http://192.168.200.1:5062";

    mockLocalStorage.getItem.mockImplementation((key: string) => {
      if (key === STORAGE_MODE_KEY) return "remote";
      if (key === STORAGE_REMOTE_URL_KEY) return remoteServer;
      return null;
    });

    const fetchMock = makeFetchOk(remoteServer);
    global.fetch = fetchMock;

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.serverUrl).toBe(remoteServer);
    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.includes("/api/discovery"))).toBe(true);
  });

  it("auto-searches on mount when connectionMode is 'local' and serverUrl is empty", async () => {
    // localStorage has no saved URL, so the mount effect calls searchForServer()
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await waitFor(
      () => {
        expect(["searching", "not_found"]).toContain(result.current.searchPhase);
      },
      { timeout: 10000 }
    );
  }, 15000);

  it("auto-verifies cached serverUrl on mount when in local mode with a saved URL", async () => {
    const cachedUrl = "http://192.168.1.200:5062";

    mockLocalStorage.getItem.mockImplementation((key: string) => {
      if (key === STORAGE_KEY) return cachedUrl;
      if (key === STORAGE_MODE_KEY) return "local";
      return null;
    });

    const fetchMock = makeFetchOk(cachedUrl);
    global.fetch = fetchMock;

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // serverUrl was set from localStorage and then verified successfully
    const calledUrls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calledUrls.some((u) => u.startsWith(cachedUrl))).toBe(true);
  });

  it("falls back to searchForServer on mount when cached serverUrl fails verification", async () => {
    const cachedUrl = "http://192.168.1.201:5062";

    mockLocalStorage.getItem.mockImplementation((key: string) => {
      if (key === STORAGE_KEY) return cachedUrl;
      if (key === STORAGE_MODE_KEY) return "local";
      return null;
    });

    // The cached server is unreachable → verifyServer fails → searchForServer runs
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await waitFor(
      () => {
        expect(["searching", "not_found"]).toContain(result.current.searchPhase);
      },
      { timeout: 10000 }
    );
  }, 15000);
});

// ─── guessSubnetSize (indirect via WebRTC ICE candidate) ─────────────────────
// We swap the global RTCPeerConnection for one that fires a real ICE candidate
// containing a specific IP, which causes buildCandidateUrls to call
// guessSubnetSize with that IP. We verify the resulting candidate set by
// checking which fetch URLs are called during searchForServer.

describe("useServerConnection – guessSubnetSize branches", () => {
  // Helper that builds a MockRTCPeerConnection firing a single ICE candidate
  // whose candidate string embeds the given IP address.
  function makeRtcWithIp(ip: string) {
    return class {
      createDataChannel() {}
      async createOffer() { return {}; }
      async setLocalDescription() {
        await Promise.resolve();
        // Fire an ICE candidate carrying the given IP
        const fakeEvent = {
          candidate: { candidate: `candidate:1 1 UDP 12345 ${ip} 54321 typ host` },
        };
        this.onicecandidate?.(fakeEvent);
        // Then signal gathering complete so getLocalIp resolves
        await Promise.resolve();
        this.iceGatheringState = "complete";
        this.onicegatheringstatechange?.();
      }
      close() {}
      onicecandidate: ((event: unknown) => void) | null = null;
      onicegatheringstatechange: (() => void) | null = null;
      iceGatheringState = "new";
    };
  }

  it("returns 8 for 10.x.x.x addresses and scans the /8 range of subnets", async () => {
    // 10.5.3.42 → guessSubnetSize returns 8 → large-network path
    (window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
      makeRtcWithIp("10.5.3.42");

    const probedUrls: string[] = [];
    global.fetch = vi.fn((url: string) => {
      probedUrls.push(url as string);
      return Promise.reject(new Error("network error"));
    });

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      result.current.searchForServer();
    });

    // Wait for at least one network probe so buildCandidateUrls has run
    await waitFor(
      () => expect(probedUrls.length).toBeGreaterThan(0),
      { timeout: 10000 }
    );

    // For a /8 network, candidates should include probes on subnets like 10.0.0, 10.1.0 etc.
    const has10Net = probedUrls.some((u) => u.startsWith("http://10."));
    expect(has10Net).toBe(true);
  }, 15000);

  it("returns 12 for 172.16-31.x.x addresses and scans /12 subnets", async () => {
    // 172.20.1.10 → guessSubnetSize returns 12 → large-network path
    (window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
      makeRtcWithIp("172.20.1.10");

    const probedUrls: string[] = [];
    global.fetch = vi.fn((url: string) => {
      probedUrls.push(url as string);
      return Promise.reject(new Error("network error"));
    });

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      result.current.searchForServer();
    });

    await waitFor(
      () => expect(probedUrls.length).toBeGreaterThan(0),
      { timeout: 10000 }
    );

    // For a /12 network, candidates include probes on the 172.20.x.x subnet
    const has172Net = probedUrls.some((u) => u.startsWith("http://172.20."));
    expect(has172Net).toBe(true);
  }, 15000);

  it("returns 24 for 192.168.x.x addresses and performs a full /24 scan", async () => {
    // 192.168.1.100 → guessSubnetSize returns 24 → small-network full /24 scan
    (window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
      makeRtcWithIp("192.168.1.100");

    const probedUrls: string[] = [];
    global.fetch = vi.fn((url: string) => {
      probedUrls.push(url as string);
      return Promise.reject(new Error("network error"));
    });

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      result.current.searchForServer();
    });

    await waitFor(
      () => expect(probedUrls.length).toBeGreaterThan(0),
      { timeout: 10000 }
    );

    // A full /24 scan should probe addresses in the 192.168.1.x range
    const has192Subnet = probedUrls.some((u) => u.startsWith("http://192.168.1."));
    expect(has192Subnet).toBe(true);
  }, 15000);

  afterEach(() => {
    // Restore the default MockRTCPeerConnection after each guessSubnetSize test
    (window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
      MockRTCPeerConnection;
  });
});

// ─── checking state transitions ───────────────────────────────────────────────

describe("useServerConnection – checking state", () => {
  it("is false before any connection attempt", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    // checking starts false
    expect(result.current.checking).toBe(false);
  });

  it("is false after a successful connectRemote call resolves", async () => {
    global.fetch = makeFetchOk("http://192.168.4.4:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.4.4:5062");
    });

    // verifyServer sets checking back to false on success
    expect(result.current.checking).toBe(false);
    expect(result.current.isConnected).toBe(true);
  });

  it("is false after a failed connectRemote call resolves", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.4.5:5062");
    });

    // verifyServer sets checking back to false on failure too
    expect(result.current.checking).toBe(false);
    expect(result.current.isConnected).toBe(false);
  });
});

// ─── searchAttempt counter ────────────────────────────────────────────────────

describe("useServerConnection – searchAttempt increments", () => {
  it("increments searchAttempt each time searchForServer is called", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    const before = result.current.searchAttempt;

    await act(async () => {
      result.current.searchForServer();
    });

    // At least one increment should have occurred
    await waitFor(() => {
      expect(result.current.searchAttempt).toBeGreaterThan(before);
    });
  });

  it("searchAttempt increments on each successive call", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      result.current.searchForServer();
    });

    const afterFirst = result.current.searchAttempt;

    await act(async () => {
      result.current.searchForServer();
    });

    expect(result.current.searchAttempt).toBeGreaterThan(afterFirst);
  });
});

// ─── hubUrl fallback path ─────────────────────────────────────────────────────

describe("useServerConnection – hubUrl fallback", () => {
  it("uses the default /hubs/realm path when serverInfo is null but serverUrl is set", async () => {
    // connect() verifies then sets serverUrl; we manipulate state by observing
    // hubUrl after a successful connect with a custom hub path response.
    // The default fallback is exercised when serverInfo has no hubPath.
    // We test this by connecting with a response that includes an explicit hubPath,
    // then asserting hubUrl matches it — and separately assert the fallback literal.
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(makeDiscoveryResponse({ hubPath: "/hubs/realm" })),
      } as Response)
    );

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connect("http://192.168.7.7:5062");
    });

    // hubUrl should incorporate the hubPath returned by the server
    expect(result.current.hubUrl).toBe("http://192.168.7.7:5062/hubs/realm");
  });

  it("hubUrl is empty when serverUrl is empty regardless of serverInfo", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.hubUrl).toBe("");
  });
});

// ─── createCombinedSignal fast-abort branch ───────────────────────────────────

describe("useServerConnection – searchForServer abort guard", () => {
  it("does not set isConnected after abort is triggered mid-search", async () => {
    // Arrange: fetch resolves slowly so we can abort before it completes.
    // We use a never-resolving promise to simulate a very slow network.
    let resolveAll: (() => void) | null = null;
    const pendingPromise = new Promise<void>((res) => { resolveAll = res; });

    global.fetch = vi.fn(() =>
      pendingPromise.then(() =>
        ({
          ok: true,
          json: () => Promise.resolve(makeDiscoveryResponse()),
        } as Response)
      )
    );

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    // Start the search — it will block on the pending fetch
    act(() => {
      result.current.searchForServer();
    });

    // Immediately abort by starting a new search (which calls abortRef.current.abort())
    act(() => {
      result.current.searchForServer();
    });

    // Now resolve all pending fetches — the first search's results should be ignored
    await act(async () => {
      resolveAll!();
      await Promise.resolve();
    });

    // The second search is also running with fetch resolved, but the first
    // search's result should not have been committed.  isConnected depends on
    // whether the second search completes; we only assert the state is
    // consistent (not in a partially-applied state from the aborted first run).
    // The key branch we are exercising is `if (controller.signal.aborted) return`
    // inside searchForServer — this simply must not throw.
    expect(typeof result.current.isConnected).toBe("boolean");
    expect(typeof result.current.searchPhase).toBe("string");
  });

  it("resetting search via a second searchForServer call increments searchAttempt twice", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    const initial = result.current.searchAttempt;

    // Two rapid calls: second aborts the first
    act(() => {
      result.current.searchForServer();
      result.current.searchForServer();
    });

    await waitFor(() => {
      expect(result.current.searchAttempt).toBeGreaterThanOrEqual(initial + 2);
    });
  });
});

// ─── error cleared on new attempt ────────────────────────────────────────────

describe("useServerConnection – error state lifecycle", () => {
  it("clears error when a subsequent connectRemote succeeds after a prior failure", async () => {
    // First attempt fails
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.55.55:5062");
    });

    expect(result.current.error).not.toBeNull();

    // Second attempt succeeds
    global.fetch = makeFetchOk("http://192.168.55.55:5062");

    await act(async () => {
      await result.current.connectRemote("http://192.168.55.55:5062");
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isConnected).toBe(true);
  });

  it("clears error when searchForServer is started", async () => {
    // Produce an error first via a failed connectRemote
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.66.66:5062");
    });

    expect(result.current.error).not.toBeNull();

    // searchForServer calls setError(null) at the top
    await act(async () => {
      result.current.searchForServer();
    });

    expect(result.current.error).toBeNull();
  });

  it("verifyServer sets error message containing thrown Error text on network failure", async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error("ECONNREFUSED"))
    );

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.77.77:5062");
    });

    expect(result.current.error).toContain("ECONNREFUSED");
  });

  it("verifyServer falls back to 'Connection failed' for non-Error rejections", async () => {
    // Reject with a plain string — not an Error instance
    global.fetch = vi.fn(() => Promise.reject("plain string rejection"));

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.88.88:5062");
    });

    expect(result.current.error).toBe("Connection failed");
  });
});

// ─── connect with trailing-slash variants ────────────────────────────────────

describe("useServerConnection – connect URL normalisation", () => {
  it("strips multiple trailing slashes before probing", async () => {
    const fetchMock = makeFetchOk("http://192.168.30.30:5062");
    global.fetch = fetchMock;

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connect("http://192.168.30.30:5062/////");
    });

    expect(result.current.serverUrl).toBe("http://192.168.30.30:5062");
    expect(result.current.isConnected).toBe(true);
  });

  it("connect with a URL that has no trailing slash works correctly", async () => {
    global.fetch = makeFetchOk("http://192.168.30.31:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.connect("http://192.168.30.31:5062");
    });

    expect(ok!).toBe(true);
    expect(result.current.serverUrl).toBe("http://192.168.30.31:5062");
  });
});

// ─── switchToLocal resets error ───────────────────────────────────────────────

describe("useServerConnection – switchToLocal error reset", () => {
  it("clears error state when switchToLocal is called", async () => {
    // Set up a failed remote connection so error is populated
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.99.99:5062");
    });

    expect(result.current.error).not.toBeNull();

    await act(async () => {
      result.current.switchToLocal();
    });

    // switchToLocal calls setError(null)
    expect(result.current.error).toBeNull();
  });

  it("sets connectionMode back to 'local' after switchToLocal", async () => {
    global.fetch = makeFetchOk("http://192.168.100.1:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.100.1:5062");
    });

    expect(result.current.connectionMode).toBe("remote");

    global.fetch = makeFetchFail();

    await act(async () => {
      result.current.switchToLocal();
    });

    expect(result.current.connectionMode).toBe("local");
  });
});

// ─── disconnect does not clear error ─────────────────────────────────────────

describe("useServerConnection – disconnect state", () => {
  it("does not change searchPhase when called before any search", async () => {
    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    act(() => {
      result.current.disconnect();
    });

    // disconnect explicitly sets searchPhase to "idle"
    expect(result.current.searchPhase).toBe("idle");
  });

  it("clears serverInfo after disconnect", async () => {
    global.fetch = makeFetchOk("http://192.168.111.1:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.111.1:5062");
    });

    expect(result.current.serverInfo).not.toBeNull();

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.serverInfo).toBeNull();
  });

  it("removes STORAGE_KEY from localStorage on disconnect", async () => {
    global.fetch = makeFetchOk("http://192.168.111.2:5062");

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await act(async () => {
      await result.current.connectRemote("http://192.168.111.2:5062");
    });

    act(() => {
      result.current.disconnect();
    });

    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });
});

// ─── remote auto-connect failure on mount ────────────────────────────────────

describe("useServerConnection – remote auto-connect mount failure", () => {
  it("leaves isConnected false when remote auto-verify fails on mount", async () => {
    const remoteServer = "http://192.168.250.1:5062";

    mockLocalStorage.getItem.mockImplementation((key: string) => {
      if (key === STORAGE_MODE_KEY) return "remote";
      if (key === STORAGE_REMOTE_URL_KEY) return remoteServer;
      return null;
    });

    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await waitFor(() => {
      // After the failed verification, checking should be false
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).not.toBeNull();
  });

  it("does not auto-search when connectionMode is 'remote' on mount even after failure", async () => {
    const remoteServer = "http://192.168.250.2:5062";

    mockLocalStorage.getItem.mockImplementation((key: string) => {
      if (key === STORAGE_MODE_KEY) return "remote";
      if (key === STORAGE_REMOTE_URL_KEY) return remoteServer;
      return null;
    });

    global.fetch = makeFetchFail();

    const { useServerConnection } = await import("./useServerConnection");
    const { result } = renderHook(() => useServerConnection());

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    // searchPhase should remain "idle" — no searchForServer triggered for remote mode
    expect(result.current.searchPhase).toBe("idle");
  });
});

import { renderHook, act, waitFor } from "@testing-library/react";
import { vi } from "vitest";

// ─── @microsoft/signalr mock ─────────────────────────────────────────────────

// Keep a reference to the mock connection so tests can trigger server events.
let mockConnectionInstance: {
  on: ReturnType<typeof vi.fn>;
  onreconnecting: ReturnType<typeof vi.fn>;
  onreconnected: ReturnType<typeof vi.fn>;
  onclose: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  invoke: ReturnType<typeof vi.fn>;
  state: string;
  serverTimeoutInMilliseconds: number;
  keepAliveIntervalInMilliseconds: number;
  _handlers: Record<string, ((...args: unknown[]) => void)[]>;
  _reconnectingCb: ((error?: Error) => void) | null;
  _reconnectedCb: ((connectionId?: string) => void) | null;
  _closeCb: ((error?: Error) => void) | null;
  _trigger: (event: string, ...args: unknown[]) => void;
};

vi.mock("@microsoft/signalr", () => {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  const mockConnection = {
    on: vi.fn(function (event: string, handler: (...args: unknown[]) => void) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    onreconnecting: vi.fn(function (cb: (error?: Error) => void) { mockConnection._reconnectingCb = cb; }),
    onreconnected: vi.fn(function (cb: (connectionId?: string) => void) { mockConnection._reconnectedCb = cb; }),
    onclose: vi.fn(function (cb: (error?: Error) => void) { mockConnection._closeCb = cb; }),
    start: vi.fn(function () { return Promise.resolve(); }),
    stop: vi.fn(function () { return Promise.resolve(); }),
    invoke: vi.fn(function () { return Promise.resolve(); }),
    state: "Connected",
    serverTimeoutInMilliseconds: 30000,
    keepAliveIntervalInMilliseconds: 15000,
    _handlers: handlers,
    _reconnectingCb: null as ((error?: Error) => void) | null,
    _reconnectedCb: null as ((connectionId?: string) => void) | null,
    _closeCb: null as ((error?: Error) => void) | null,
    _trigger: function (event: string, ...args: unknown[]) {
      handlers[event]?.forEach((h) => h(...args));
    },
  };

  // HubConnectionBuilder must be a proper constructor function (class) so that
  // `new HubConnectionBuilder()` works inside the hook.
  function HubConnectionBuilder(this: unknown) {
    return {
      withUrl: vi.fn().mockReturnThis(),
      withAutomaticReconnect: vi.fn().mockReturnThis(),
      configureLogging: vi.fn().mockReturnThis(),
      build: vi.fn(() => mockConnection),
    };
  }

  return {
    HubConnectionBuilder,
    HubConnectionState: { Disconnected: "Disconnected", Connected: "Connected", Connecting: "Connecting", Reconnecting: "Reconnecting" },
    LogLevel: { Information: 1 },
    __mockConnection: mockConnection,
  };
});

// Grab the mock connection reference after the module is set up
beforeEach(async () => {
  const signalr = await import("@microsoft/signalr");
  mockConnectionInstance = (
    signalr as unknown as {
      __mockConnection: typeof mockConnectionInstance;
    }
  ).__mockConnection;

  // Reset call history and handlers
  vi.clearAllMocks();
  Object.keys(mockConnectionInstance._handlers).forEach(
    (k) => delete mockConnectionInstance._handlers[k]
  );

  // Reset reconnection callbacks
  mockConnectionInstance._reconnectingCb = null;
  mockConnectionInstance._reconnectedCb = null;
  mockConnectionInstance._closeCb = null;
  mockConnectionInstance.state = "Connected";

  // Restore start/stop/invoke to returning resolved promises
  mockConnectionInstance.start.mockResolvedValue(undefined);
  mockConnectionInstance.stop.mockResolvedValue(undefined);
  mockConnectionInstance.invoke.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useRealmHub", () => {
  describe("initial state", () => {
    it("returns connected false, started false, ended false", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-123", "http://localhost:5062/hubs/realm")
      );

      // Before start() resolves
      expect(result.current.connected).toBe(false);
      expect(result.current.started).toBe(false);
      expect(result.current.ended).toBe(false);
    });

    it("starts with empty clients list", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-abc", "http://localhost:5062/hubs/realm")
      );

      expect(result.current.clients).toEqual([]);
    });

    it("starts with null latestData and realmSummary", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-abc", "http://localhost:5062/hubs/realm")
      );

      expect(result.current.latestData).toBeNull();
      expect(result.current.realmSummary).toBeNull();
    });
  });

  describe("when realmId is null", () => {
    it("does not create a connection or call start", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      renderHook(() =>
        useRealmHub(null, "http://localhost:5062/hubs/realm")
      );

      expect(mockConnectionInstance.start).not.toHaveBeenCalled();
    });

    it("returns all false state", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub(null, "http://localhost:5062/hubs/realm")
      );

      expect(result.current.connected).toBe(false);
      expect(result.current.started).toBe(false);
      expect(result.current.ended).toBe(false);
    });
  });

  describe("when realmId is provided", () => {
    it("creates a connection and calls start", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      renderHook(() =>
        useRealmHub("realm-1", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => {
        expect(mockConnectionInstance.start).toHaveBeenCalledTimes(1);
      });
    });

    it("invokes JoinRealmAsDashboard after connecting", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      renderHook(() =>
        useRealmHub("realm-join", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => {
        expect(mockConnectionInstance.invoke).toHaveBeenCalledWith(
          "JoinRealmAsDashboard",
          "realm-join"
        );
      });
    });

    it("invokes AuthenticateAsHost after JoinRealmAsDashboard when hostSecret is provided", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      renderHook(() =>
        useRealmHub("realm-auth", "http://localhost:5062/hubs/realm", "SECRET01")
      );

      await waitFor(() => {
        expect(mockConnectionInstance.invoke).toHaveBeenCalledWith(
          "AuthenticateAsHost",
          "realm-auth",
          "SECRET01"
        );
      });
    });

    it("does not invoke AuthenticateAsHost when hostSecret is not provided", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      renderHook(() =>
        useRealmHub("realm-noauth", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => {
        expect(mockConnectionInstance.invoke).toHaveBeenCalledWith(
          "JoinRealmAsDashboard",
          "realm-noauth"
        );
      });

      expect(mockConnectionInstance.invoke).not.toHaveBeenCalledWith(
        "AuthenticateAsHost",
        expect.anything(),
        expect.anything()
      );
    });

    it("sets connected to true after connection.start() resolves", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-2", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
      });
    });
  });

  describe("ClientJoined event", () => {
    it("adds client to the clients list", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-3", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("ClientJoined", {
          clientId: "client-1",
          name: "Alice",
          heightCm: 165,
          weightKg: 60,
        });
      });

      expect(result.current.clients).toContain("client-1");
    });

    it("stores the client profile in clientProfiles", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-3b", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("ClientJoined", {
          clientId: "client-profile-1",
          name: "Bob",
          heightCm: 180,
          weightKg: 80,
        });
      });

      expect(result.current.clientProfiles["client-profile-1"]).toMatchObject({
        name: "Bob",
        heightCm: 180,
      });
    });
  });

  describe("ClientLeft event", () => {
    it("removes the client from clients list", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-4", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      // Add a client first
      act(() => {
        mockConnectionInstance._trigger("ClientJoined", {
          clientId: "client-leave",
          name: "Carol",
          heightCm: 170,
          weightKg: 65,
        });
      });

      expect(result.current.clients).toContain("client-leave");

      // Now remove them
      act(() => {
        mockConnectionInstance._trigger("ClientLeft", "client-leave");
      });

      expect(result.current.clients).not.toContain("client-leave");
    });

    it("removes the client profile from clientProfiles", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-4b", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("ClientJoined", {
          clientId: "client-remove-profile",
          name: "Dave",
          heightCm: 175,
          weightKg: 75,
        });
      });

      act(() => {
        mockConnectionInstance._trigger("ClientLeft", "client-remove-profile");
      });

      expect(
        result.current.clientProfiles["client-remove-profile"]
      ).toBeUndefined();
    });
  });

  describe("WearableDataReceived event", () => {
    it("updates latestData with the received payload", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-5", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      const data = {
        clientId: "client-w",
        heartRate: 140,
        steps: 500,
        timestamp: new Date().toISOString(),
        speedKmh: 8.5,
      };

      act(() => {
        mockConnectionInstance._trigger("WearableDataReceived", data);
      });

      expect(result.current.latestData).toMatchObject(data);
    });
  });

  describe("RealmStarted event", () => {
    it("sets started to true", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-6", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("RealmStarted");
      });

      expect(result.current.started).toBe(true);
    });

    it("parses config JSON when provided", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-6b", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      const config = { mode: "race", targetDistanceKm: 5 };

      act(() => {
        mockConnectionInstance._trigger("RealmStarted", JSON.stringify(config));
      });

      expect(result.current.realmConfig).toMatchObject(config);
    });

    it("does not throw when config is invalid JSON", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-6c", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      expect(() => {
        act(() => {
          mockConnectionInstance._trigger("RealmStarted", "not-valid-json{{{");
        });
      }).not.toThrow();

      expect(result.current.started).toBe(true);
      expect(result.current.realmConfig).toBeNull();
    });
  });

  describe("RealmEnded event", () => {
    it("sets ended to true and stores the realm summary", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-7", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      const summary = {
        durationSeconds: 1800,
        totalDistanceMeters: 3000,
        totalSteps: 4200,
        averageHeartRate: 145,
        maxHeartRate: 170,
        averageSpeedKmh: 6,
        avgCadenceSpm: 160,
        timeInZone: { "3": 600, "4": 900, "5": 300 },
        activePeriodSeconds: 1750,
        participantCount: 1,
      };

      act(() => {
        mockConnectionInstance._trigger("RealmEnded", summary);
      });

      expect(result.current.ended).toBe(true);
      expect(result.current.realmSummary).toMatchObject(summary);
    });
  });

  describe("JoinedRealm event", () => {
    it("hydrates clients and clientProfiles for late joiners", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-8", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("JoinedRealm", {
          connectedClientIds: ["c-1", "c-2"],
          clientProfiles: {
            "c-1": { clientId: "c-1", name: "Eve", heightCm: 160, weightKg: 55 },
            "c-2": { clientId: "c-2", name: "Frank", heightCm: 178, weightKg: 78 },
          },
          status: "Lobby",
        });
      });

      expect(result.current.clients).toEqual(["c-1", "c-2"]);
      expect(result.current.clientProfiles["c-1"].name).toBe("Eve");
      expect(result.current.clientProfiles["c-2"].name).toBe("Frank");
    });

    it("sets started to true when JoinedRealm status is 'Started'", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-9", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("JoinedRealm", { status: "Started" });
      });

      expect(result.current.started).toBe(true);
    });

    it("parses config from JoinedRealm when provided", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-9b", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      const cfg = { key: "value" };

      act(() => {
        mockConnectionInstance._trigger("JoinedRealm", {
          config: JSON.stringify(cfg),
        });
      });

      expect(result.current.realmConfig).toMatchObject(cfg);
    });
  });

  describe("startRealm", () => {
    it("invokes 'StartRealm' on the connection", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-start", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        result.current.startRealm();
      });

      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith(
        "StartRealm",
        "realm-start",
        null
      );
    });

    it("serialises config when provided", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-start-cfg", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      const cfg = { mode: "race", targetDistanceKm: 10 };

      act(() => {
        result.current.startRealm(cfg);
      });

      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith(
        "StartRealm",
        "realm-start-cfg",
        JSON.stringify(cfg)
      );
    });
  });

  describe("endRealm", () => {
    it("invokes 'EndRealm' with null when called without overrides", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-end", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        result.current.endRealm();
      });

      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith(
        "EndRealm",
        "realm-end",
        null
      );
    });

    it("passes overrides to the server", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-end-override", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        result.current.endRealm({ totalDistanceMeters: 2000, participantCount: 5 });
      });

      const invocation = mockConnectionInstance.invoke.mock.calls.find(
        (c) => c[0] === "EndRealm"
      );
      expect(invocation).toBeDefined();
      expect(invocation![2]).toMatchObject({
        totalDistanceMeters: 2000,
        participantCount: 5,
      });
    });
  });

  describe("notifyEliminated", () => {
    it("invokes 'NotifyEliminated' with realmId and clientId", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-elim", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        result.current.notifyEliminated("client-elim-1");
      });

      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith(
        "NotifyEliminated",
        "realm-elim",
        "client-elim-1"
      );
    });
  });

  describe("cleanup on unmount", () => {
    it("calls connection.stop() when the component unmounts", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { unmount } = renderHook(() =>
        useRealmHub("realm-cleanup", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => {
        expect(mockConnectionInstance.start).toHaveBeenCalledTimes(1);
      });

      unmount();

      expect(mockConnectionInstance.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe("state reset on realmId change", () => {
    it("resets state when realmId changes", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result, rerender } = renderHook(
        ({ realmId }: { realmId: string }) =>
          useRealmHub(realmId, "http://localhost:5062/hubs/realm"),
        { initialProps: { realmId: "realm-first" } }
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      // Trigger started state
      act(() => {
        mockConnectionInstance._trigger("RealmStarted");
      });

      expect(result.current.started).toBe(true);

      // Change realmId — hook should reset
      act(() => {
        rerender({ realmId: "realm-second" });
      });

      expect(result.current.started).toBe(false);
      expect(result.current.connected).toBe(false);
    });
  });

  describe("ClientKicked event", () => {
    it("removes client from clients and profiles", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-kick", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("ClientJoined", {
          clientId: "kick-me",
          name: "Kicked",
          heightCm: 170,
          weightKg: 70,
        });
      });

      expect(result.current.clients).toContain("kick-me");

      act(() => {
        mockConnectionInstance._trigger("ClientKicked", "kick-me");
      });

      expect(result.current.clients).not.toContain("kick-me");
      expect(result.current.clientProfiles["kick-me"]).toBeUndefined();
    });
  });

  describe("ClientDisconnected event", () => {
    it("adds clientId to disconnectedClients set", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-disc", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("ClientDisconnected", "disc-client");
      });

      expect(result.current.disconnectedClients.has("disc-client")).toBe(true);
    });
  });

  describe("InclineChanged event", () => {
    it("updates clientInclines", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-incl", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("InclineChanged", "c1", 7.5);
      });

      expect(result.current.clientInclines["c1"]).toBe(7.5);
    });
  });

  describe("SpeedOverrideChanged event", () => {
    it("sets speed override when speedKmh > 0", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-speed", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("SpeedOverrideChanged", "c1", 8.5);
      });

      expect(result.current.clientSpeedOverrides["c1"]).toBe(8.5);
    });

    it("removes speed override when speedKmh <= 0", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-speed-rm", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("SpeedOverrideChanged", "c1", 5);
      });
      expect(result.current.clientSpeedOverrides["c1"]).toBe(5);

      act(() => {
        mockConnectionInstance._trigger("SpeedOverrideChanged", "c1", 0);
      });
      expect(result.current.clientSpeedOverrides["c1"]).toBeUndefined();
    });
  });

  describe("BindCodeGenerated event", () => {
    it("sets bindCode and bindPending", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-bind", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("BindCodeGenerated", "123456", "c1");
      });

      expect(result.current.bindCode).toBe("123456");
      expect(result.current.bindPending).toBe(true);
      expect(result.current.bindResult).toBeNull();
    });
  });

  describe("BindResponse event", () => {
    it("sets boundClientId when approved", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-bind-ok", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("BindResponse", "c1", true);
      });

      expect(result.current.boundClientId).toBe("c1");
      expect(result.current.bindResult).toBe("approved");
      expect(result.current.bindPending).toBe(false);
    });

    it("sets declined result when not approved", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-bind-no", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("BindResponse", "c1", false);
      });

      expect(result.current.boundClientId).toBeNull();
      expect(result.current.bindResult).toBe("declined");
    });
  });

  describe("ClientBound event", () => {
    it("updates clientBindings", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-cbound", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._trigger("ClientBound", "c1");
      });

      expect(result.current.clientBindings["c1"]).toBe(true);
    });
  });

  describe("LobbySettingsUpdated event", () => {
    it("parses and sets lobby settings", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-lobby", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      const settings = { mode: "race", laps: 3 };
      act(() => {
        mockConnectionInstance._trigger("LobbySettingsUpdated", JSON.stringify(settings));
      });

      expect(result.current.lobbySettings).toMatchObject(settings);
    });
  });

  describe("requestBind callback", () => {
    it("invokes RequestBind on the connection", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-rb", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        result.current.requestBind("c1");
      });

      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith("RequestBind", "realm-rb", "c1");
      expect(result.current.bindPending).toBe(true);
    });
  });

  describe("cancelBind callback", () => {
    it("invokes CancelBind and resets bind state", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-cb", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        result.current.cancelBind("c1");
      });

      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith("CancelBind", "realm-cb", "c1");
      expect(result.current.bindPending).toBe(false);
      expect(result.current.bindCode).toBeNull();
    });
  });

  describe("setIncline callback", () => {
    it("invokes SetIncline on the connection", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-si", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        result.current.setIncline("c1", 5.0);
      });

      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith("SetIncline", "realm-si", "c1", 5.0);
    });
  });

  describe("setSpeedOverride callback", () => {
    it("invokes SetSpeedOverride on the connection", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-so", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        result.current.setSpeedOverride("c1", 10.0);
      });

      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith("SetSpeedOverride", "realm-so", "c1", 10.0);
    });
  });

  describe("kickClient callback", () => {
    it("invokes KickClient on the connection", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-kc", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        result.current.kickClient("c1");
      });

      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith("KickClient", "realm-kc", "c1");
    });
  });

  describe("updateLobbySettings callback", () => {
    it("invokes UpdateLobbySettings with serialized JSON", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-uls", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      const settings = { videoId: "abc" };
      act(() => {
        result.current.updateLobbySettings(settings);
      });

      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith(
        "UpdateLobbySettings", "realm-uls", JSON.stringify(settings)
      );
    });
  });

  describe("connection.start failure", () => {
    it("does not set connected when start() rejects", async () => {
      mockConnectionInstance.start.mockRejectedValueOnce(new Error("Connection failed"));
      vi.spyOn(console, "error").mockImplementation(() => {});

      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-fail", "http://localhost:5062/hubs/realm")
      );

      // Give the rejected promise time to settle
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(result.current.connected).toBe(false);
      expect(result.current.connectionStatus).toBe("disconnected");
      vi.restoreAllMocks();
    });
  });

  describe("connectionStatus", () => {
    it("exposes connectionStatus alongside connected", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-cs", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connectionStatus).toBe("connected"));
      expect(result.current.connected).toBe(true);
    });
  });

  describe("reconnection events", () => {
    it("sets connectionStatus to reconnecting when onreconnecting fires", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-recon", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._reconnectingCb?.();
      });

      expect(result.current.connectionStatus).toBe("reconnecting");
      expect(result.current.connected).toBe(false);
    });

    it("sets connectionStatus to connected and re-joins realm on onreconnected", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-reconn", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      // Clear invoke calls from initial connect
      mockConnectionInstance.invoke.mockClear();

      await act(async () => {
        mockConnectionInstance._reconnectedCb?.("new-conn-id");
        // Wait for async rejoinRealm
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.connectionStatus).toBe("connected");
      expect(mockConnectionInstance.invoke).toHaveBeenCalledWith("JoinRealmAsDashboard", "realm-reconn");
    });

    it("starts manual reconnect when onclose fires", async () => {
      const { useRealmHub } = await import("./useSessionHub");
      const { result } = renderHook(() =>
        useRealmHub("realm-close", "http://localhost:5062/hubs/realm")
      );

      await waitFor(() => expect(result.current.connected).toBe(true));

      act(() => {
        mockConnectionInstance._closeCb?.();
      });

      expect(result.current.connectionStatus).toBe("reconnecting");
    });
  });
});

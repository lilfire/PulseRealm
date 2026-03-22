import { useCallback, useEffect, useRef, useState } from "react";
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from "@microsoft/signalr";
import type { ClientProfile, RealmSummary, WearableData } from "../types/session";
export type { ClientSummary, RealmSummary } from "../types/session";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

const DEFAULT_HUB_URL = import.meta.env.VITE_HUB_URL ?? "";

export function useRealmHub(realmId: string | null, hubUrl?: string, hostSecret?: string) {
  const connectionRef = useRef<HubConnection | null>(null);
  const bindTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [realmSummary, setRealmSummary] = useState<RealmSummary | null>(null);
  const [clients, setClients] = useState<string[]>([]);
  const [clientProfiles, setClientProfiles] = useState<Record<string, ClientProfile>>({});
  const [latestData, setLatestData] = useState<WearableData | null>(null);
  const [realmConfig, setRealmConfig] = useState<Record<string, unknown> | null>(null);
  const [disconnectedClients, setDisconnectedClients] = useState<Set<string>>(new Set());
  const [lobbySettings, setLobbySettings] = useState<Record<string, unknown> | null>(null);

  // Binding state
  const [boundClientId, setBoundClientId] = useState<string | null>(null);
  const [bindCode, setBindCode] = useState<string | null>(null);
  const [bindPending, setBindPending] = useState(false);
  const [bindResult, setBindResult] = useState<"approved" | "declined" | null>(null);
  const [clientBindings, setClientBindings] = useState<Record<string, boolean>>({});
  const [clientInclines, setClientInclines] = useState<Record<string, number>>({});
  const [clientSpeedOverrides, setClientSpeedOverrides] = useState<Record<string, number>>({});

  const resolvedUrl = hubUrl || DEFAULT_HUB_URL;

  useEffect(() => {
    // Reset all state when realm changes (e.g. after ending a realm).
    // These setState calls batch together and only cause one re-render.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state reset on dep change
    setConnectionStatus("idle");
    setStarted(false);
    setEnded(false);
    setRealmSummary(null);
    setClients([]);
    setClientProfiles({});
    setLatestData(null);
    setRealmConfig(null);
    setDisconnectedClients(new Set());
    setLobbySettings(null);
    setBoundClientId(null);
    setBindCode(null);
    setBindPending(false);
    setBindResult(null);
    setClientBindings({});
    setClientInclines({});

    if (!realmId || !resolvedUrl) return;

    const connection = new HubConnectionBuilder()
      .withUrl(resolvedUrl)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    // Faster detection of silent disconnects (defaults: 30s timeout, 15s keep-alive)
    connection.serverTimeoutInMilliseconds = 15000;
    connection.keepAliveIntervalInMilliseconds = 10000;

    connection.on("ClientJoined", (profile: ClientProfile) => {
      setClients((prev) => prev.includes(profile.clientId) ? prev : [...prev, profile.clientId]);
      setClientProfiles((prev) => ({ ...prev, [profile.clientId]: profile }));
      setDisconnectedClients((prev) => {
        if (!prev.has(profile.clientId)) return prev;
        const next = new Set(prev);
        next.delete(profile.clientId);
        return next;
      });
    });

    connection.on("ClientLeft", (clientId: string) => {
      setClients((prev) => prev.filter((id) => id !== clientId));
      setClientProfiles((prev) => {
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
      setDisconnectedClients((prev) => {
        if (!prev.has(clientId)) return prev;
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    });

    connection.on("ClientKicked", (clientId: string) => {
      setClients((prev) => prev.filter((id) => id !== clientId));
      setClientProfiles((prev) => {
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
      setDisconnectedClients((prev) => {
        if (!prev.has(clientId)) return prev;
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    });

    connection.on("ClientDisconnected", (clientId: string) => {
      setDisconnectedClients((prev) => {
        const next = new Set(prev);
        next.add(clientId);
        return next;
      });
    });

    connection.on("WearableDataReceived", (data: WearableData) => {
      setLatestData(data);
    });

    connection.on("RealmStarted", (config?: string) => {
      setStarted(true);
      if (config) {
        try { setRealmConfig(JSON.parse(config)); } catch (e) { console.error("Failed to parse realm config:", e); }
      }
    });

    connection.on("RealmEnded", (summary: RealmSummary) => {
      setRealmSummary(summary);
      setEnded(true);
    });

    connection.on("JoinedRealm", (state: { status?: string; connectedClientIds?: string[]; clientProfiles?: Record<string, ClientProfile>; config?: string; clientBindings?: string[]; clientInclines?: Record<string, number>; clientSpeedOverrides?: Record<string, number> }) => {
      // Hydrate state for late-joining viewers
      if (state.connectedClientIds?.length) {
        setClients(state.connectedClientIds);
      }
      if (state.clientProfiles && Object.keys(state.clientProfiles).length > 0) {
        setClientProfiles(state.clientProfiles);
      }
      if (state.status === "Started") {
        setStarted(true);
      }
      if (state.config) {
        try { setRealmConfig(JSON.parse(state.config)); } catch (e) { console.error("Failed to parse realm config:", e); }
      }
      if (state.clientBindings?.length) {
        const bindings: Record<string, boolean> = {};
        for (const cid of state.clientBindings) bindings[cid] = true;
        setClientBindings(bindings);
      }
      if (state.clientInclines && Object.keys(state.clientInclines).length > 0) {
        setClientInclines(state.clientInclines);
      }
      if (state.clientSpeedOverrides && Object.keys(state.clientSpeedOverrides).length > 0) {
        setClientSpeedOverrides(state.clientSpeedOverrides);
      }
    });

    connection.on("LobbySettingsUpdated", (settingsJson: string) => {
      try { setLobbySettings(JSON.parse(settingsJson)); } catch (e) { console.error("Failed to parse lobby settings:", e); }
    });

    connection.on("BindCodeGenerated", (code: string, _clientId: string) => {
      setBindCode(code);
      setBindPending(true);
      setBindResult(null);
    });

    connection.on("BindResponse", (clientId: string, approved: boolean) => {
      setBindPending(false);
      if (approved) {
        setBoundClientId(clientId);
        setBindResult("approved");
      } else {
        setBindResult("declined");
      }
      // Auto-clear bind code after a short delay; store ID so cleanup can cancel it
      if (bindTimerRef.current !== undefined) clearTimeout(bindTimerRef.current);
      bindTimerRef.current = setTimeout(() => {
        setBindCode(null);
        setBindResult(null);
        bindTimerRef.current = undefined;
      }, approved ? 1000 : 2000);
    });

    connection.on("ClientBound", (clientId: string) => {
      setClientBindings((prev) => ({ ...prev, [clientId]: true }));
    });

    connection.on("InclineChanged", (clientId: string, inclinePercent: number) => {
      setClientInclines((prev) => ({ ...prev, [clientId]: inclinePercent }));
    });

    connection.on("SpeedOverrideChanged", (clientId: string, speedKmh: number) => {
      setClientSpeedOverrides((prev) => {
        if (speedKmh > 0) return { ...prev, [clientId]: speedKmh };
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
    });

    let active = true;
    let manualReconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let manualReconnectAttempt = 0;
    const MAX_MANUAL_RETRIES = 10;

    async function rejoinRealm() {
      await connection.invoke("JoinRealmAsDashboard", realmId);
      if (hostSecret) await connection.invoke("AuthenticateAsHost", realmId, hostSecret);
    }

    function manualReconnect() {
      if (!active || manualReconnectAttempt >= MAX_MANUAL_RETRIES) {
        if (active) setConnectionStatus("disconnected");
        return;
      }
      manualReconnectAttempt++;
      const delay = Math.min(2000 * Math.pow(1.5, manualReconnectAttempt - 1), 30000);
      manualReconnectTimer = setTimeout(async () => {
        if (!active) return;
        try {
          await connection.start();
          if (!active) return;
          manualReconnectAttempt = 0;
          await rejoinRealm();
          setConnectionStatus("connected");
        } catch {
          if (active) manualReconnect();
        }
      }, delay);
    }

    // SignalR reconnection event handlers
    connection.onreconnecting(() => {
      if (active) setConnectionStatus("reconnecting");
    });

    connection.onreconnected(async () => {
      if (!active) return;
      try {
        await rejoinRealm();
      } catch (err) {
        console.error("Failed to rejoin realm after reconnect:", err);
      }
      setConnectionStatus("connected");
    });

    connection.onclose(() => {
      if (!active) return;
      setConnectionStatus("reconnecting");
      manualReconnectAttempt = 0;
      manualReconnect();
    });

    // Browser network event listeners
    function handleOffline() {
      if (active) setConnectionStatus("reconnecting");
    }
    function handleOnline() {
      if (!active) return;
      if (connection.state === HubConnectionState.Disconnected) {
        manualReconnectAttempt = 0;
        clearTimeout(manualReconnectTimer);
        manualReconnect();
      }
    }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Initial connection
    setConnectionStatus("connecting");
    connection
      .start()
      .then(() => {
        if (!active) return;
        setConnectionStatus("connected");
        return rejoinRealm();
      })
      .catch((err) => {
        if (active) {
          console.error(err);
          setConnectionStatus("disconnected");
        }
      });

    connectionRef.current = connection;

    return () => {
      active = false;
      clearTimeout(manualReconnectTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      // Clear any pending bind-result auto-dismiss timer
      if (bindTimerRef.current !== undefined) {
        clearTimeout(bindTimerRef.current);
        bindTimerRef.current = undefined;
      }
      connection.stop();
    };
  }, [realmId, resolvedUrl, hostSecret]);

  const startRealm = useCallback((config?: object) => {
    const configJson = config ? JSON.stringify(config) : null;
    connectionRef.current?.invoke("StartRealm", realmId, configJson);
  }, [realmId]);

  const notifyEliminated = useCallback((clientId: string) => {
    connectionRef.current?.invoke("NotifyEliminated", realmId, clientId);
  }, [realmId]);

  const kickClient = useCallback((clientId: string) => {
    connectionRef.current?.invoke("KickClient", realmId, clientId);
  }, [realmId]);

  const endRealm = useCallback((overrides?: Partial<RealmSummary>) => {
    connectionRef.current?.invoke("EndRealm", realmId, overrides ?? null);
  }, [realmId]);

  const updateLobbySettings = useCallback((settings: object) => {
    connectionRef.current?.invoke("UpdateLobbySettings", realmId, JSON.stringify(settings));
  }, [realmId]);

  const requestBind = useCallback((clientId: string) => {
    setBindPending(true);
    setBindResult(null);
    connectionRef.current?.invoke("RequestBind", realmId, clientId);
  }, [realmId]);

  const cancelBind = useCallback((clientId: string) => {
    setBindPending(false);
    setBindCode(null);
    setBindResult(null);
    connectionRef.current?.invoke("CancelBind", realmId, clientId);
  }, [realmId]);

  const setIncline = useCallback((clientId: string, percent: number) => {
    connectionRef.current?.invoke("SetIncline", realmId, clientId, percent);
  }, [realmId]);

  const setSpeedOverride = useCallback((clientId: string, speedKmh: number) => {
    connectionRef.current?.invoke("SetSpeedOverride", realmId, clientId, speedKmh);
  }, [realmId]);

  const connected = connectionStatus === "connected";

  // disconnectedClients: available for future use (e.g. greyed-out player indicators)
  return { connected, connectionStatus, started, ended, realmSummary, clients, clientProfiles, latestData, realmConfig, lobbySettings, disconnectedClients, startRealm, endRealm, notifyEliminated, kickClient, updateLobbySettings, boundClientId, bindCode, bindPending, bindResult, clientBindings, clientInclines, clientSpeedOverrides, requestBind, cancelBind, setIncline, setSpeedOverride };
}

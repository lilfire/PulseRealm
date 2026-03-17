import { useCallback, useEffect, useRef, useState } from "react";
import {
  HubConnection,
  HubConnectionBuilder,
  LogLevel,
} from "@microsoft/signalr";
import type { ClientProfile, WearableData } from "../types/session";
import { getMaxHrForAge, estimateCaloriesPerSecond } from "../utils/wearable";

export interface ClientSummary {
  clientId: string;
  name: string;
  steps: number;
  distanceMeters: number;
  averageHeartRate: number;
  maxHeartRate: number;
  avgCadenceSpm: number;
  caloriesBurned: number;
  timeInZone: Record<string, number>;
  averageSpeedKmh: number;
  peakSpeedKmh: number;
  teamName?: string;
  teamColor?: string;
}

export interface RealmSummary {
  durationSeconds: number;
  totalDistanceMeters: number;
  totalSteps: number;
  averageHeartRate: number;
  maxHeartRate: number;
  averageSpeedKmh: number;
  avgCadenceSpm: number;
  caloriesBurned: number;
  peakSpeedKmh: number;
  timeInZone: Record<string, number>;
  activePeriodSeconds: number;
  participantCount: number;
  isTeamFormat?: boolean;
  clientSummaries?: ClientSummary[];
}

const DEFAULT_HUB_URL = import.meta.env.VITE_HUB_URL ?? "";

export function useRealmHub(realmId: string | null, hubUrl?: string) {
  const connectionRef = useRef<HubConnection | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [connected, setConnected] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [realmSummary, setRealmSummary] = useState<RealmSummary | null>(null);
  const [clients, setClients] = useState<string[]>([]);
  const [clientProfiles, setClientProfiles] = useState<Record<string, ClientProfile>>({});
  const [latestData, setLatestData] = useState<WearableData | null>(null);
  const [realmConfig, setRealmConfig] = useState<Record<string, unknown> | null>(null);
  const [disconnectedClients, setDisconnectedClients] = useState<Set<string>>(new Set());

  // Track cumulative stats for the summary
  const statsRef = useRef({
    totalSteps: 0,
    heartRateSum: 0,
    heartRateCount: 0,
    maxHeartRate: 0,
    speedSum: 0,
    speedCount: 0,
    peakSpeedKmh: 0,
    currentHr: 0,
    currentClientId: "",
    lastDataReceivedAt: 0,
    activePeriodSeconds: 0,
    timeInZone: {} as Record<string, number>,
    cadenceSum: 0,
    cadenceCount: 0,
    caloriesBurned: 0,
    prevStepsForCadence: 0,
    prevStepsTimeForCadence: 0,
  });
  const profilesRef = useRef<Record<string, ClientProfile>>({});
  // Keep profilesRef in sync with state so intervals can access profiles without stale closures
  useEffect(() => { profilesRef.current = clientProfiles; }, [clientProfiles]);

  const resolvedUrl = hubUrl || DEFAULT_HUB_URL;

  useEffect(() => {
    // Reset all state when realm changes (e.g. after ending a realm).
    // These setState calls batch together and only cause one re-render.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state reset on dep change
    setConnected(false);
    setStarted(false);
    setEnded(false);
    setRealmSummary(null);
    setClients([]);
    setClientProfiles({});
    setLatestData(null);
    setRealmConfig(null);
    setDisconnectedClients(new Set());
    statsRef.current = { totalSteps: 0, heartRateSum: 0, heartRateCount: 0, maxHeartRate: 0, speedSum: 0, speedCount: 0, peakSpeedKmh: 0, currentHr: 0, currentClientId: "", lastDataReceivedAt: 0, activePeriodSeconds: 0, timeInZone: {}, cadenceSum: 0, cadenceCount: 0, caloriesBurned: 0, prevStepsForCadence: 0, prevStepsTimeForCadence: 0 };

    if (!realmId || !resolvedUrl) return;

    const connection = new HubConnectionBuilder()
      .withUrl(resolvedUrl)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

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

      const s = statsRef.current;
      const now = Date.now();
      s.totalSteps = Math.max(s.totalSteps, data.steps);
      if (data.heartRate > 0) {
        s.heartRateSum += data.heartRate;
        s.heartRateCount++;
        s.maxHeartRate = Math.max(s.maxHeartRate, data.heartRate);
        s.currentHr = data.heartRate;
        s.currentClientId = data.clientId;
      }
      if (data.speedKmh > 0) {
        s.speedSum += data.speedKmh;
        s.speedCount++;
        if (data.speedKmh > s.peakSpeedKmh) s.peakSpeedKmh = data.speedKmh;
      }
      // Cadence tracking from step deltas
      if (s.prevStepsForCadence > 0 && data.steps > s.prevStepsForCadence && s.prevStepsTimeForCadence > 0) {
        const dt = (now - s.prevStepsTimeForCadence) / 1000 / 60; // minutes
        if (dt > 0) {
          const cadence = Math.round((data.steps - s.prevStepsForCadence) / dt);
          if (cadence > 0 && cadence < 300) {
            s.cadenceSum += cadence;
            s.cadenceCount++;
          }
        }
      }
      s.prevStepsForCadence = data.steps;
      s.prevStepsTimeForCadence = now;
      s.lastDataReceivedAt = now;
    });

    connection.on("RealmStarted", (config?: string) => {
      setStarted(true);
      if (config) {
        try { setRealmConfig(JSON.parse(config)); } catch { /* ignore */ }
      }
    });

    connection.on("RealmEnded", (summary: RealmSummary) => {
      // When the realm ends via client leave / auto-end, the server sends a
      // bare summary (only duration + participant count).  Merge locally
      // tracked stats so the summary screen shows real values.
      const s = statsRef.current;
      const merged: RealmSummary = {
        ...summary,
        totalSteps: summary.totalSteps || s.totalSteps,
        averageHeartRate: summary.averageHeartRate || (s.heartRateCount > 0 ? Math.round(s.heartRateSum / s.heartRateCount) : 0),
        maxHeartRate: summary.maxHeartRate || s.maxHeartRate,
        averageSpeedKmh: summary.averageSpeedKmh || (s.speedCount > 0 ? Math.round((s.speedSum / s.speedCount) * 10) / 10 : 0),
        peakSpeedKmh: summary.peakSpeedKmh || Math.round(s.peakSpeedKmh * 10) / 10,
        avgCadenceSpm: summary.avgCadenceSpm || (s.cadenceCount > 0 ? Math.round(s.cadenceSum / s.cadenceCount) : 0),
        caloriesBurned: summary.caloriesBurned || Math.round(s.caloriesBurned),
        timeInZone: Object.keys(summary.timeInZone ?? {}).length > 0 ? summary.timeInZone : { ...s.timeInZone },
        activePeriodSeconds: summary.activePeriodSeconds || s.activePeriodSeconds,
      };
      setRealmSummary(merged);
      setEnded(true);
    });

    // Clear any interval left over from a previous invocation (e.g. StrictMode
    // double-invoke) before starting a fresh one.
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
    }
    // 1-second interval for zone tracking and active period
    tickIntervalRef.current = setInterval(() => {
      const s = statsRef.current;
      const now = Date.now();
      if (s.lastDataReceivedAt > 0 && now - s.lastDataReceivedAt < 5000) {
        s.activePeriodSeconds++;
        if (s.currentHr > 0) {
          const maxHr = getMaxHrForAge(profilesRef.current[s.currentClientId]?.age);
          const pct = s.currentHr / maxHr;
          const zone = pct < 0.57 ? 1 : pct < 0.63 ? 2 : pct < 0.76 ? 3 : pct < 0.89 ? 4 : 5;
          s.timeInZone[zone] = (s.timeInZone[zone] ?? 0) + 1;
        }
        // Accumulate calories
        if (s.currentHr > 0) {
          const profile = profilesRef.current[s.currentClientId];
          if (profile?.weightKg && profile?.age) {
            s.caloriesBurned += estimateCaloriesPerSecond(s.currentHr, profile.weightKg, profile.age);
          }
        }
      }
    }, 1000);

    connection.on("JoinedRealm", (state: { status?: string; connectedClientIds?: string[]; clientProfiles?: Record<string, ClientProfile>; config?: string }) => {
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
        try { setRealmConfig(JSON.parse(state.config)); } catch { /* ignore */ }
      }
    });

    let active = true;

    connection
      .start()
      .then(() => {
        if (!active) return;
        setConnected(true);
        return connection.invoke("JoinRealmAsDashboard", realmId);
      })
      .catch((err) => {
        if (active) console.error(err);
      });

    connectionRef.current = connection;

    return () => {
      active = false;
      if (tickIntervalRef.current !== null) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      connection.stop();
    };
  }, [realmId, resolvedUrl]);

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

  const endRealm = useCallback((totalDistanceMeters: number, overrides?: Partial<RealmSummary>) => {
    const s = statsRef.current;
    const summary: RealmSummary = {
      durationSeconds: 0, // server will fill this
      totalDistanceMeters,
      totalSteps: s.totalSteps,
      averageHeartRate: s.heartRateCount > 0 ? Math.round(s.heartRateSum / s.heartRateCount) : 0,
      maxHeartRate: s.maxHeartRate,
      averageSpeedKmh: s.speedCount > 0 ? Math.round((s.speedSum / s.speedCount) * 10) / 10 : 0,
      peakSpeedKmh: Math.round(s.peakSpeedKmh * 10) / 10,
      avgCadenceSpm: s.cadenceCount > 0 ? Math.round(s.cadenceSum / s.cadenceCount) : 0,
      caloriesBurned: Math.round(s.caloriesBurned),
      timeInZone: { ...s.timeInZone },
      activePeriodSeconds: s.activePeriodSeconds,
      participantCount: clients.length,
      ...overrides,
    };
    connectionRef.current?.invoke("EndRealm", realmId, summary);
  }, [realmId, clients.length]);

  return { connected, started, ended, realmSummary, clients, clientProfiles, latestData, realmConfig, disconnectedClients, startRealm, endRealm, notifyEliminated, kickClient };
}

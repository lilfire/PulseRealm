import { useCallback, useEffect, useRef, useState } from "react";
import {
  HubConnection,
  HubConnectionBuilder,
  LogLevel,
} from "@microsoft/signalr";
import type { ClientProfile, WearableData } from "../types/session";

export interface ClientSummary {
  clientId: string;
  name: string;
  steps: number;
  distanceMeters: number;
  averageHeartRate: number;
  maxHeartRate: number;
  avgCadenceSpm: number;
  timeInZone: Record<string, number>;
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
  timeInZone: Record<string, number>;
  activePeriodSeconds: number;
  participantCount: number;
  isTeamFormat?: boolean;
  clientSummaries?: ClientSummary[];
}

const DEFAULT_HUB_URL = import.meta.env.VITE_HUB_URL ?? "";

/** Named constant for the maximum heart rate used in zone calculations. */
const MAX_HR = 190;

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

  // Track cumulative stats for the summary
  const statsRef = useRef({
    totalSteps: 0,
    heartRateSum: 0,
    heartRateCount: 0,
    maxHeartRate: 0,
    speedSum: 0,
    speedCount: 0,
    currentHr: 0,
    lastDataReceivedAt: 0,
    activePeriodSeconds: 0,
    timeInZone: {} as Record<string, number>,
    cadenceSum: 0,
    cadenceCount: 0,
    prevStepsForCadence: 0,
    prevStepsTimeForCadence: 0,
  });

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
    statsRef.current = { totalSteps: 0, heartRateSum: 0, heartRateCount: 0, maxHeartRate: 0, speedSum: 0, speedCount: 0, currentHr: 0, lastDataReceivedAt: 0, activePeriodSeconds: 0, timeInZone: {}, cadenceSum: 0, cadenceCount: 0, prevStepsForCadence: 0, prevStepsTimeForCadence: 0 };

    if (!realmId || !resolvedUrl) return;

    const connection = new HubConnectionBuilder()
      .withUrl(resolvedUrl)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    connection.on("ClientJoined", (profile: ClientProfile) => {
      setClients((prev) => [...prev, profile.clientId]);
      setClientProfiles((prev) => ({ ...prev, [profile.clientId]: profile }));
    });

    connection.on("ClientLeft", (clientId: string) => {
      setClients((prev) => prev.filter((id) => id !== clientId));
      setClientProfiles((prev) => {
        const next = { ...prev };
        delete next[clientId];
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
      }
      if (data.speedKmh > 0) {
        s.speedSum += data.speedKmh;
        s.speedCount++;
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
      setRealmSummary(summary);
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
          const pct = s.currentHr / MAX_HR;
          const zone = pct < 0.57 ? 1 : pct < 0.63 ? 2 : pct < 0.76 ? 3 : pct < 0.89 ? 4 : 5;
          s.timeInZone[zone] = (s.timeInZone[zone] ?? 0) + 1;
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

  const endRealm = useCallback((totalDistanceMeters: number, overrides?: Partial<RealmSummary>) => {
    const s = statsRef.current;
    const summary: RealmSummary = {
      durationSeconds: 0, // server will fill this
      totalDistanceMeters,
      totalSteps: s.totalSteps,
      averageHeartRate: s.heartRateCount > 0 ? Math.round(s.heartRateSum / s.heartRateCount) : 0,
      maxHeartRate: s.maxHeartRate,
      averageSpeedKmh: s.speedCount > 0 ? Math.round((s.speedSum / s.speedCount) * 10) / 10 : 0,
      avgCadenceSpm: s.cadenceCount > 0 ? Math.round(s.cadenceSum / s.cadenceCount) : 0,
      timeInZone: { ...s.timeInZone },
      activePeriodSeconds: s.activePeriodSeconds,
      participantCount: clients.length,
      ...overrides,
    };
    connectionRef.current?.invoke("EndRealm", realmId, summary);
  }, [realmId, clients.length]);

  return { connected, started, ended, realmSummary, clients, clientProfiles, latestData, realmConfig, startRealm, endRealm, notifyEliminated };
}

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

export function useRealmHub(realmId: string | null, hubUrl?: string) {
  const connectionRef = useRef<HubConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [realmSummary, setRealmSummary] = useState<RealmSummary | null>(null);
  const [clients, setClients] = useState<string[]>([]);
  const [clientProfiles, setClientProfiles] = useState<Record<string, ClientProfile>>({});
  const [latestData, setLatestData] = useState<WearableData | null>(null);

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
    // Reset all state when realm changes (e.g. after ending a realm)
    setConnected(false);
    setStarted(false);
    setEnded(false);
    setRealmSummary(null);
    setClients([]);
    setClientProfiles({});
    setLatestData(null);
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

    connection.on("RealmStarted", () => {
      setStarted(true);
    });

    connection.on("RealmEnded", (summary: RealmSummary) => {
      setRealmSummary(summary);
      setEnded(true);
    });

    // 1-second interval for zone tracking and active period
    const tickId = setInterval(() => {
      const s = statsRef.current;
      const now = Date.now();
      if (s.lastDataReceivedAt > 0 && now - s.lastDataReceivedAt < 5000) {
        s.activePeriodSeconds++;
        if (s.currentHr > 0) {
          const pct = s.currentHr / 190;
          const zone = pct < 0.57 ? 1 : pct < 0.63 ? 2 : pct < 0.76 ? 3 : pct < 0.89 ? 4 : 5;
          s.timeInZone[zone] = (s.timeInZone[zone] ?? 0) + 1;
        }
      }
    }, 1000);

    connection
      .start()
      .then(() => {
        setConnected(true);
        return connection.invoke("JoinRealmAsDashboard", realmId);
      })
      .catch(console.error);

    connectionRef.current = connection;

    return () => {
      clearInterval(tickId);
      connection.stop();
    };
  }, [realmId, resolvedUrl]);

  const startRealm = useCallback(() => {
    connectionRef.current?.invoke("StartRealm", realmId);
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

  return { connected, started, ended, realmSummary, clients, clientProfiles, latestData, startRealm, endRealm, notifyEliminated };
}

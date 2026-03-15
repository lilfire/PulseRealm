import { useCallback, useEffect, useRef, useState } from "react";
import {
  HubConnection,
  HubConnectionBuilder,
  LogLevel,
} from "@microsoft/signalr";
import type { ClientProfile, WearableData } from "../types/session";

export interface RealmSummary {
  durationSeconds: number;
  totalDistanceMeters: number;
  totalSteps: number;
  averageHeartRate: number;
  maxHeartRate: number;
  averageSpeedKmh: number;
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
    statsRef.current = { totalSteps: 0, heartRateSum: 0, heartRateCount: 0, maxHeartRate: 0, speedSum: 0, speedCount: 0 };

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
      s.totalSteps = Math.max(s.totalSteps, data.steps);
      if (data.heartRate > 0) {
        s.heartRateSum += data.heartRate;
        s.heartRateCount++;
        s.maxHeartRate = Math.max(s.maxHeartRate, data.heartRate);
      }
      if (data.speedKmh > 0) {
        s.speedSum += data.speedKmh;
        s.speedCount++;
      }
    });

    connection.on("RealmStarted", () => {
      setStarted(true);
    });

    connection.on("RealmEnded", (summary: RealmSummary) => {
      setRealmSummary(summary);
      setEnded(true);
    });

    connection
      .start()
      .then(() => {
        setConnected(true);
        return connection.invoke("JoinRealmAsDashboard", realmId);
      })
      .catch(console.error);

    connectionRef.current = connection;

    return () => {
      connection.stop();
    };
  }, [realmId, resolvedUrl]);

  const startRealm = useCallback(() => {
    connectionRef.current?.invoke("StartRealm", realmId);
  }, [realmId]);

  const endRealm = useCallback((totalDistanceMeters: number) => {
    const s = statsRef.current;
    const summary = {
      durationSeconds: 0, // server will fill this
      totalDistanceMeters,
      totalSteps: s.totalSteps,
      averageHeartRate: s.heartRateCount > 0 ? Math.round(s.heartRateSum / s.heartRateCount) : 0,
      maxHeartRate: s.maxHeartRate,
      averageSpeedKmh: s.speedCount > 0 ? Math.round((s.speedSum / s.speedCount) * 10) / 10 : 0,
    };
    connectionRef.current?.invoke("EndRealm", realmId, summary);
  }, [realmId]);

  return { connected, started, ended, realmSummary, clients, clientProfiles, latestData, startRealm, endRealm };
}

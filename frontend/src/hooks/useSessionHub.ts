import { useCallback, useEffect, useRef, useState } from "react";
import {
  HubConnection,
  HubConnectionBuilder,
  LogLevel,
} from "@microsoft/signalr";
import type { ClientProfile, WearableData } from "../types/session";

const DEFAULT_HUB_URL = import.meta.env.VITE_HUB_URL ?? "";

export function useSessionHub(sessionId: string | null, hubUrl?: string) {
  const connectionRef = useRef<HubConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [started, setStarted] = useState(false);
  const [clients, setClients] = useState<string[]>([]);
  const [clientProfiles, setClientProfiles] = useState<Record<string, ClientProfile>>({});
  const [latestData, setLatestData] = useState<WearableData | null>(null);

  const resolvedUrl = hubUrl || DEFAULT_HUB_URL;

  useEffect(() => {
    if (!sessionId || !resolvedUrl) return;

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
    });

    connection.on("SessionStarted", () => {
      setStarted(true);
    });

    connection
      .start()
      .then(() => {
        setConnected(true);
        return connection.invoke("JoinSessionAsDashboard", sessionId);
      })
      .catch(console.error);

    connectionRef.current = connection;

    return () => {
      connection.stop();
    };
  }, [sessionId, resolvedUrl]);

  const startSession = useCallback(() => {
    connectionRef.current?.invoke("StartSession", sessionId);
  }, [sessionId]);

  return { connected, started, clients, clientProfiles, latestData, startSession };
}

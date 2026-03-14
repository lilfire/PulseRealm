import { useEffect, useRef, useState } from "react";
import {
  HubConnection,
  HubConnectionBuilder,
  LogLevel,
} from "@microsoft/signalr";
import type { WearableData } from "../types/session";

const DEFAULT_HUB_URL = import.meta.env.VITE_HUB_URL ?? "";

export function useSessionHub(sessionId: string | null, hubUrl?: string) {
  const connectionRef = useRef<HubConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [clients, setClients] = useState<string[]>([]);
  const [latestData, setLatestData] = useState<WearableData | null>(null);

  const resolvedUrl = hubUrl || DEFAULT_HUB_URL;

  useEffect(() => {
    if (!sessionId || !resolvedUrl) return;

    const connection = new HubConnectionBuilder()
      .withUrl(resolvedUrl)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    connection.on("ClientJoined", (clientId: string) => {
      setClients((prev) => [...prev, clientId]);
    });

    connection.on("WearableDataReceived", (data: WearableData) => {
      setLatestData(data);
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

  return { connected, clients, latestData };
}

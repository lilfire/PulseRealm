import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "pulserealm_server_url";

export interface ServerInfo {
  name: string;
  version: string;
  hubPath: string;
  apiPath: string;
}

export function useServerConnection() {
  const [serverUrl, setServerUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || "";
  });
  const [isConnected, setIsConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, if we have a saved URL, verify it's still reachable
  useEffect(() => {
    if (serverUrl) {
      verifyServer(serverUrl);
    }
  }, []);

  async function verifyServer(url: string): Promise<boolean> {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/api/discovery`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error("Server responded with " + res.status);
      const info: ServerInfo = await res.json();
      if (info.name !== "PulseRealm") throw new Error("Not a PulseRealm server");
      setServerInfo(info);
      setIsConnected(true);
      setChecking(false);
      return true;
    } catch (e) {
      setIsConnected(false);
      setServerInfo(null);
      setChecking(false);
      setError(e instanceof Error ? e.message : "Connection failed");
      return false;
    }
  }

  const connect = useCallback(async (url: string) => {
    const cleanUrl = url.replace(/\/+$/, "");
    const ok = await verifyServer(cleanUrl);
    if (ok) {
      setServerUrl(cleanUrl);
      localStorage.setItem(STORAGE_KEY, cleanUrl);
    }
    return ok;
  }, []);

  const disconnect = useCallback(() => {
    setServerUrl("");
    setIsConnected(false);
    setServerInfo(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const apiUrl = serverUrl || "";
  const hubUrl = serverUrl
    ? `${serverUrl}${serverInfo?.hubPath || "/hubs/session"}`
    : "";

  return {
    serverUrl,
    apiUrl,
    hubUrl,
    isConnected,
    serverInfo,
    checking,
    error,
    connect,
    disconnect,
  };
}

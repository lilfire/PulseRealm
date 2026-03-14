import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "pulserealm_server_url";

export interface ServerInfo {
  name: string;
  version: string;
  hubPath: string;
  apiPath: string;
}

export type SearchPhase = "idle" | "searching" | "found" | "not_found";

// Common addresses to probe when searching for a server on the local network
const COMMON_PORTS = [5062, 8080, 5000, 80];

function buildCandidateUrls(): string[] {
  const candidates: string[] = [];
  const hostname = window.location.hostname;

  // If we're served from a non-localhost origin, try same-origin first
  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
    candidates.push(window.location.origin);
  }

  // Always try localhost with common ports
  for (const port of COMMON_PORTS) {
    candidates.push(`http://localhost:${port}`);
    candidates.push(`http://127.0.0.1:${port}`);
  }

  // Try the current hostname with common ports (useful on LAN)
  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
    for (const port of COMMON_PORTS) {
      candidates.push(`http://${hostname}:${port}`);
    }
  }

  // Deduplicate
  return [...new Set(candidates)];
}

export function useServerConnection() {
  const [serverUrl, setServerUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || "";
  });
  const [isConnected, setIsConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("idle");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [searchProgress, setSearchProgress] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // On mount, if we have a saved URL verify it, otherwise auto-search
  useEffect(() => {
    if (serverUrl) {
      verifyServer(serverUrl);
    } else {
      searchForServer();
    }
  }, []);

  async function probeUrl(url: string, signal?: AbortSignal): Promise<ServerInfo | null> {
    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/api/discovery`, {
        signal: signal || AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      const info: ServerInfo = await res.json();
      if (info.name !== "PulseRealm") return null;
      return info;
    } catch {
      return null;
    }
  }

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

  const searchForServer = useCallback(async () => {
    // Cancel any previous search
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearchPhase("searching");
    setError(null);
    setSearchAttempt((prev) => prev + 1);

    const candidates = buildCandidateUrls();

    // Probe all candidates in parallel batches
    for (let i = 0; i < candidates.length; i += 4) {
      if (controller.signal.aborted) return;
      const batch = candidates.slice(i, i + 4);
      setSearchProgress(`Scanning ${batch[0]} ...`);

      const results = await Promise.all(
        batch.map((url) => probeUrl(url, controller.signal).then((info) => (info ? { url, info } : null)))
      );

      const found = results.find((r) => r !== null);
      if (found) {
        if (controller.signal.aborted) return;
        setServerUrl(found.url);
        setServerInfo(found.info);
        setIsConnected(true);
        setSearchPhase("found");
        setSearchProgress("");
        localStorage.setItem(STORAGE_KEY, found.url);
        return;
      }
    }

    if (!controller.signal.aborted) {
      setSearchPhase("not_found");
      setSearchProgress("");
    }
  }, []);

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
    setSearchPhase("idle");
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
    // Search-related
    searchPhase,
    searchAttempt,
    searchProgress,
    searchForServer,
  };
}

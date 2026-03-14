import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "pulserealm_server_url";
const PROBE_TIMEOUT = 1500;
const BATCH_SIZE = 20;
const SERVER_PORT = 5062;

export interface ServerInfo {
  name: string;
  version: string;
  hubPath: string;
  apiPath: string;
}

export type SearchPhase = "idle" | "searching" | "found" | "not_found";

/**
 * Attempt to discover the browser's local IP address using WebRTC.
 * Returns the IP or null if unavailable.
 */
async function getLocalIp(): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 3000);
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("");
      pc.createOffer().then((offer) => pc.setLocalDescription(offer));
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const match = event.candidate.candidate.match(
          /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/
        );
        if (match) {
          const ip = match[1];
          // Skip link-local and loopback
          if (!ip.startsWith("127.") && !ip.startsWith("0.")) {
            clearTimeout(timeout);
            pc.close();
            resolve(ip);
          }
        }
      };
      // If gathering completes without finding a private IP
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          pc.close();
          resolve(null);
        }
      };
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

/**
 * Build the list of candidate URLs to probe.
 * 1. Cached URL from previous successful connection
 * 2. Same-origin (if served from a non-localhost host)
 * 3. Full /24 subnet scan based on detected local IP
 * 4. Localhost fallback
 */
async function buildCandidateUrls(
  onProgress?: (msg: string) => void
): Promise<string[]> {
  const candidates: string[] = [];

  // Cached URL first — most likely to succeed
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    candidates.push(cached);
  }

  const hostname = window.location.hostname;

  // If we're served from a non-localhost origin, try same-origin first
  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
    candidates.push(window.location.origin);
    // Also try the known server port on the same host
    candidates.push(`http://${hostname}:${SERVER_PORT}`);
  }

  // Try to detect local IP and scan the subnet
  onProgress?.("Detecting local network…");
  const localIp = await getLocalIp();

  if (localIp) {
    const subnet = localIp.split(".").slice(0, 3).join(".");
    onProgress?.(`Found local network ${subnet}.0/24`);

    // Common server IPs first (gateway, low IPs, the host itself)
    const priority = [1, 2, 100, 50, 10, 200, 150, 254];
    const lastOctet = parseInt(localIp.split(".")[3], 10);
    for (const oct of priority) {
      if (oct !== lastOctet) {
        candidates.push(`http://${subnet}.${oct}:${SERVER_PORT}`);
      }
    }

    // Then scan the rest of the /24
    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}.${i}`;
      const url = `http://${ip}:${SERVER_PORT}`;
      if (!candidates.includes(url)) {
        candidates.push(url);
      }
    }
  }

  // Localhost fallback
  candidates.push(`http://localhost:${SERVER_PORT}`);
  candidates.push(`http://127.0.0.1:${SERVER_PORT}`);

  // Also try common alternative ports on localhost
  for (const port of [8080, 5000, 80]) {
    candidates.push(`http://localhost:${port}`);
  }

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

  // On mount, try cached URL first — if it fails, fall through to search
  useEffect(() => {
    if (serverUrl) {
      verifyServer(serverUrl).then((ok) => {
        if (!ok) searchForServer();
      });
    } else {
      searchForServer();
    }
  }, []);

  async function probeUrl(
    url: string,
    signal?: AbortSignal
  ): Promise<ServerInfo | null> {
    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/api/discovery`, {
        signal: signal || AbortSignal.timeout(PROBE_TIMEOUT),
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

    const candidates = await buildCandidateUrls((msg) => setSearchProgress(msg));

    if (controller.signal.aborted) return;

    const total = candidates.length;

    // Probe in parallel batches
    for (let i = 0; i < total; i += BATCH_SIZE) {
      if (controller.signal.aborted) return;
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const scanned = Math.min(i + BATCH_SIZE, total);
      setSearchProgress(
        `Scanning network… ${scanned}/${total} addresses`
      );

      const results = await Promise.all(
        batch.map((url) =>
          probeUrl(url, controller.signal).then((info) =>
            info ? { url, info } : null
          )
        )
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

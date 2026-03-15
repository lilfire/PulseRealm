import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "pulserealm_server_url";
const STORAGE_MODE_KEY = "pulserealm_connection_mode";
const STORAGE_REMOTE_URL_KEY = "pulserealm_remote_url";
const PROBE_TIMEOUT = 1500;
const BATCH_SIZE = 20;
const SERVER_PORT = 5062;

export type ConnectionMode = "local" | "remote";

export interface ServerInfo {
  name: string;
  version: string;
  hostname: string;
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
          if (!ip.startsWith("127.") && !ip.startsWith("0.")) {
            clearTimeout(timeout);
            pc.close();
            resolve(ip);
          }
        }
      };
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
 * Detect the subnet size from a local IP. Returns the CIDR prefix length guess
 * based on the private address range:
 *   10.x.x.x     → /8
 *   172.16-31.x.x → /12
 *   192.168.x.x   → /16 or /24
 * We use this to decide how many addresses to scan.
 */
function guessSubnetSize(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts[0] === 10) return 8;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return 12;
  return 24;
}

/**
 * Build candidate URLs to probe for server discovery.
 *
 * On large networks (/8, /16) we can't scan millions of addresses from a browser.
 * Instead we rely on:
 *   1. Cached URL from previous connection
 *   2. Same-origin (if served from a non-localhost host)
 *   3. The discovery HTTP endpoint on port 5063 (lightweight probe)
 *   4. Common gateway/server addresses on the detected subnet
 *   5. Localhost fallback
 */
async function buildCandidateUrls(
  onProgress?: (msg: string) => void
): Promise<string[]> {
  const candidates: string[] = [];

  // Cached URL first
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    candidates.push(cached);
  }

  const hostname = window.location.hostname;

  // Same-origin check — always try the origin we were served from
  if (hostname) {
    candidates.push(window.location.origin);
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      candidates.push(`http://${hostname}:${SERVER_PORT}`);
    }
  }

  // Detect local IP
  onProgress?.("Detecting local network…");
  const localIp = await getLocalIp();

  if (localIp) {
    const parts = localIp.split(".").map(Number);
    const cidr = guessSubnetSize(localIp);
    onProgress?.(`Found local IP ${localIp} (/${cidr} network)`);

    if (cidr >= 24) {
      // Small network — full /24 scan is feasible
      const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;

      // Priority IPs first
      for (const oct of [1, 2, 100, 50, 10, 200, 150, 254]) {
        if (oct !== parts[3]) {
          candidates.push(`http://${subnet}.${oct}:${SERVER_PORT}`);
        }
      }

      // Full /24 scan
      for (let i = 1; i <= 254; i++) {
        const url = `http://${subnet}.${i}:${SERVER_PORT}`;
        if (!candidates.includes(url)) {
          candidates.push(url);
        }
      }
    } else {
      // Large network (/8 or /16) — can't scan millions of IPs.
      // Probe common server addresses across likely subnets.
      onProgress?.(`Large /${cidr} network — scanning common server addresses…`);

      const priorityHosts = [1, 2, 100, 50, 10, 200, 150, 254];

      // Own /24 subnet first (most likely)
      const ownSubnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
      for (const oct of priorityHosts) {
        if (oct !== parts[3]) {
          candidates.push(`http://${ownSubnet}.${oct}:${SERVER_PORT}`);
        }
      }
      // Full own /24
      for (let i = 1; i <= 254; i++) {
        const url = `http://${ownSubnet}.${i}:${SERVER_PORT}`;
        if (!candidates.includes(url)) {
          candidates.push(url);
        }
      }

      // Common subnets within the same /8 or /16
      const nearbySubnets: string[] = [];
      if (cidr <= 8) {
        // /8 network: try x.0.0, x.0.1, x.1.0, x.1.1, x.10.0, x.100.0, etc.
        const base = parts[0];
        for (const b of [0, 1, 2, 10, 50, 100, 200]) {
          for (const c of [0, 1, 2, 10, 100]) {
            const sub = `${base}.${b}.${c}`;
            if (sub !== ownSubnet) {
              nearbySubnets.push(sub);
            }
          }
        }
      } else {
        // /12 or /16: try x.y.0, x.y.1, x.y.2, x.y.10, etc.
        const base = `${parts[0]}.${parts[1]}`;
        for (const c of [0, 1, 2, 10, 50, 100, 200]) {
          const sub = `${base}.${c}`;
          if (sub !== ownSubnet) {
            nearbySubnets.push(sub);
          }
        }
      }

      for (const subnet of nearbySubnets) {
        for (const oct of priorityHosts) {
          candidates.push(`http://${subnet}.${oct}:${SERVER_PORT}`);
        }
      }
    }
  } else {
    // WebRTC IP detection failed — scan common private subnets
    onProgress?.("Scanning common LAN subnets…");
    const commonSubnets = [
      "192.168.1",
      "192.168.0",
      "192.168.2",
      "192.168.10",
      "192.168.50",
      "192.168.100",
      "10.0.0",
      "10.0.1",
      "10.1.0",
      "10.1.1",
      "10.10.0",
      "10.100.0",
      "172.16.0",
      "172.16.1",
    ];
    const priorityHosts = [1, 2, 100, 50, 10, 200, 150, 254];
    for (const subnet of commonSubnets) {
      for (const oct of priorityHosts) {
        candidates.push(`http://${subnet}.${oct}:${SERVER_PORT}`);
      }
    }
  }

  // Localhost fallback
  candidates.push(`http://localhost:${SERVER_PORT}`);
  candidates.push(`http://127.0.0.1:${SERVER_PORT}`);

  for (const port of [8080, 5000, 80]) {
    candidates.push(`http://localhost:${port}`);
  }

  return [...new Set(candidates)];
}

export function useServerConnection() {
  const [connectionMode, setConnectionModeState] = useState<ConnectionMode>(
    () => (localStorage.getItem(STORAGE_MODE_KEY) as ConnectionMode) || "local"
  );
  const [remoteUrl, setRemoteUrlState] = useState<string>(
    () => localStorage.getItem(STORAGE_REMOTE_URL_KEY) || ""
  );
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

  const setConnectionMode = useCallback((mode: ConnectionMode) => {
    setConnectionModeState(mode);
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  }, []);

  const setRemoteUrl = useCallback((url: string) => {
    setRemoteUrlState(url);
    localStorage.setItem(STORAGE_REMOTE_URL_KEY, url);
  }, []);

  useEffect(() => {
    if (connectionMode === "remote" && remoteUrl) {
      verifyServer(remoteUrl).then((ok) => {
        if (ok) {
          setServerUrl(remoteUrl);
          localStorage.setItem(STORAGE_KEY, remoteUrl);
        }
      });
    } else if (serverUrl) {
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
      if (!info.name || !info.hubPath) return null;
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
      if (!info.name || !info.hubPath) throw new Error("Not a PulseRealm server");
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
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearchPhase("searching");
    setError(null);
    setSearchAttempt((prev) => prev + 1);

    const candidates = await buildCandidateUrls((msg) => setSearchProgress(msg));

    if (controller.signal.aborted) return;

    const total = candidates.length;

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

  const connectRemote = useCallback(async (url: string) => {
    let cleanUrl = url.replace(/\/+$/, "");
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = "https://" + cleanUrl;
    }
    setRemoteUrl(cleanUrl);
    setConnectionMode("remote");
    const ok = await verifyServer(cleanUrl);
    if (ok) {
      setServerUrl(cleanUrl);
      localStorage.setItem(STORAGE_KEY, cleanUrl);
    }
    return ok;
  }, []);

  const switchToLocal = useCallback(() => {
    setConnectionMode("local");
    setServerUrl("");
    setIsConnected(false);
    setServerInfo(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
    searchForServer();
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
    ? `${serverUrl}${serverInfo?.hubPath || "/hubs/realm"}`
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
    connectRemote,
    switchToLocal,
    disconnect,
    connectionMode,
    setConnectionMode,
    remoteUrl,
    searchPhase,
    searchAttempt,
    searchProgress,
    searchForServer,
  };
}

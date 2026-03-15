import { useState } from "react";
import type { SearchPhase, ConnectionMode } from "../hooks/useServerConnection";

interface ServerConnectProps {
  onConnectRemote: (url: string) => Promise<boolean>;
  onSwitchToLocal: () => void;
  checking: boolean;
  error: string | null;
  connectionMode: ConnectionMode;
  remoteUrl: string;
  searchPhase: SearchPhase;
  searchProgress: string;
  searchAttempt: number;
  onRetrySearch: () => void;
}

export function ServerConnect({
  onConnectRemote,
  onSwitchToLocal,
  checking,
  error,
  connectionMode,
  remoteUrl,
  searchPhase,
  searchProgress,
  searchAttempt,
  onRetrySearch,
}: ServerConnectProps) {
  const [url, setUrl] = useState(remoteUrl || "https://");
  const [activeMode, setActiveMode] = useState<ConnectionMode>(connectionMode);

  async function handleRemoteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url || checking) return;
    await onConnectRemote(url);
  }

  function switchMode(mode: ConnectionMode) {
    setActiveMode(mode);
    if (mode === "local") {
      onSwitchToLocal();
    }
  }

  return (
    <div className="app">
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>

      {/* Mode toggle */}
      <div className="mode-toggle">
        <button
          className={`mode-btn ${activeMode === "local" ? "mode-btn-active" : ""}`}
          onClick={() => switchMode("local")}
        >
          Local Network
        </button>
        <button
          className={`mode-btn ${activeMode === "remote" ? "mode-btn-active" : ""}`}
          onClick={() => switchMode("remote")}
        >
          Remote Server
        </button>
      </div>

      {/* ── Local mode ── */}
      {activeMode === "local" && (
        <>
          {searchPhase === "searching" && (
            <div className="search-container">
              <div className="search-spinner" />
              <p className="search-status">Searching for server...</p>
              <p className="search-progress">{searchProgress}</p>
              {searchAttempt > 1 && (
                <p className="search-attempt">Attempt {searchAttempt}</p>
              )}
            </div>
          )}

          {searchPhase === "not_found" && (
            <div className="search-container">
              <div className="search-icon-fail">&#x2715;</div>
              <p className="search-status">No server found on the network</p>
              <p className="search-hint">
                Make sure the PulseRealm server is running and on the same
                local network.
              </p>
              <div className="search-actions">
                <button onClick={onRetrySearch} className="btn-retry">
                  Retry Search
                </button>
                <button onClick={() => switchMode("remote")} className="btn-manual">
                  Use Remote Server
                </button>
              </div>
              {searchAttempt > 1 && (
                <p className="search-attempt">
                  Searched {searchAttempt} time{searchAttempt !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}

          {searchPhase === "idle" && (
            <div className="search-container">
              <button onClick={onRetrySearch} className="btn-retry">
                Search for Server
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Remote mode ── */}
      {activeMode === "remote" && (
        <div className="manual-container">
          <p>Enter the address of a remote PulseRealm server.</p>

          <form onSubmit={handleRemoteSubmit} className="manual-form">
            <label>
              Server address
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://pulserealm.example.com"
                disabled={checking}
                className="input-url"
              />
            </label>

            <button
              type="submit"
              disabled={checking || !url}
              className="btn-connect"
            >
              {checking ? "Connecting..." : "Connect"}
            </button>
          </form>

          {error && <p className="error-message">{error}</p>}

          <div className="manual-help">
            <p>
              Use the full URL of a hosted PulseRealm server
              (e.g. <code>https://pulserealm.example.com</code> or{" "}
              <code>http://203.0.113.50:5062</code>).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

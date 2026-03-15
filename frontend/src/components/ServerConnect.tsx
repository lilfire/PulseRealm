import { useState } from "react";
import type { SearchPhase } from "../hooks/useServerConnection";

interface ServerConnectProps {
  onConnect: (url: string) => Promise<boolean>;
  checking: boolean;
  error: string | null;
  searchPhase: SearchPhase;
  searchProgress: string;
  searchAttempt: number;
  onRetrySearch: () => void;
}

export function ServerConnect({
  onConnect,
  checking,
  error,
  searchPhase,
  searchProgress,
  searchAttempt,
  onRetrySearch,
}: ServerConnectProps) {
  const [url, setUrl] = useState("http://");
  const [showManual, setShowManual] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url || checking) return;
    await onConnect(url);
  }

  return (
    <div className="app">
      <div className="brand-header">
        <img src="/logo.png" alt="PulseRealm" className="logo" />
      </div>

      {/* Searching state */}
      {searchPhase === "searching" && (
        <div className="search-container">
          <div className="search-spinner" />
          <p className="search-status">Searching for server…</p>
          <p className="search-progress">{searchProgress}</p>
          {searchAttempt > 1 && (
            <p className="search-attempt">Attempt {searchAttempt}</p>
          )}
        </div>
      )}

      {/* Not found — show retry + manual fallback */}
      {searchPhase === "not_found" && !showManual && (
        <div className="search-container">
          <div className="search-icon-fail">✕</div>
          <p className="search-status">No server found on the network</p>
          <p className="search-hint">
            Make sure the PulseRealm server is running and on the same
            local network.
          </p>
          <div className="search-actions">
            <button onClick={onRetrySearch} className="btn-retry">
              Retry Search
            </button>
            <button onClick={() => setShowManual(true)} className="btn-manual">
              Enter Manually
            </button>
          </div>
          {searchAttempt > 1 && (
            <p className="search-attempt">
              Searched {searchAttempt} time{searchAttempt !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {/* Manual entry — only shown as fallback */}
      {showManual && (
        <div className="manual-container">
          <button
            className="btn-back"
            onClick={() => {
              setShowManual(false);
              onRetrySearch();
            }}
          >
            ← Back to search
          </button>
          <p>Enter the address of a PulseRealm server.</p>

          <form onSubmit={handleSubmit} className="manual-form">
            <label>
              Server address
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://192.168.1.100:5062"
                disabled={checking}
                className="input-url"
              />
            </label>

            <button
              type="submit"
              disabled={checking || !url}
              className="btn-connect"
            >
              {checking ? "Connecting…" : "Connect"}
            </button>
          </form>

          {error && <p className="error-message">{error}</p>}

          <div className="manual-help">
            <p>
              Use the IP address of the machine running PulseRealm server
              (e.g. <code>http://192.168.1.100:5062</code>).
            </p>
          </div>
        </div>
      )}

      {/* Idle — initial state before search starts */}
      {searchPhase === "idle" && !showManual && (
        <div className="search-container">
          <button onClick={onRetrySearch} className="btn-retry">
            Search for Server
          </button>
        </div>
      )}
    </div>
  );
}

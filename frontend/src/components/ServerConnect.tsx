import { useState } from "react";

interface ServerConnectProps {
  onConnect: (url: string) => Promise<boolean>;
  checking: boolean;
  error: string | null;
}

export function ServerConnect({ onConnect, checking, error }: ServerConnectProps) {
  const [url, setUrl] = useState("http://");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url || checking) return;
    await onConnect(url);
  }

  return (
    <div className="app">
      <h1>PulseRealm</h1>
      <p>Connect to a PulseRealm server to get started.</p>

      <form onSubmit={handleSubmit} style={{ marginTop: "1.5rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <label>
            Server address:
            <br />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.100:5062"
              disabled={checking}
              style={{
                padding: "0.5rem",
                fontSize: "1rem",
                borderRadius: "4px",
                border: "2px solid #555",
                width: "100%",
                maxWidth: "400px",
                marginTop: "0.5rem",
                background: "#1a1a1a",
                color: "#fff",
              }}
            />
          </label>
        </div>

        <button type="submit" disabled={checking || !url}>
          {checking ? "Connecting..." : "Connect"}
        </button>
      </form>

      {error && (
        <p style={{ color: "#f87171", marginTop: "1rem" }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: "2rem", color: "#888", fontSize: "0.85rem" }}>
        <p>Enter the address of the PulseRealm server you want to connect to.</p>
        <p style={{ marginTop: "0.5rem" }}>
          If the server is on your local network, use its local IP address
          (e.g. <code>http://192.168.1.100:5062</code>).
        </p>
      </div>
    </div>
  );
}

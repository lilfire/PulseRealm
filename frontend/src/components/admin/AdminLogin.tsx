import React, { useState } from "react";

interface Props {
  apiUrl: string;
  onSuccess: (token: string) => void;
  onBack: () => void;
}

export function AdminLogin({ apiUrl, onSuccess, onBack }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Login failed");
        return;
      }
      const data = await res.json();
      onSuccess(data.token);
    } catch {
      setError("Could not connect to server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-screen">
      <div className="admin-login-card">
        <h2 style={{ margin: "0 0 0.25rem", color: "var(--text-h, #f3f4f6)" }}>Admin Login</h2>
        <p style={{ color: "var(--text, #9ca3af)", fontSize: "0.9rem", margin: "0 0 1.5rem" }}>
          Enter your credentials to access settings
        </p>
        <form onSubmit={handleSubmit} className="fg-col" style={{ display: "flex", flexDirection: "column", "--fg": "1rem" } as React.CSSProperties}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoFocus
            className="admin-input"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="admin-input"
          />
          {error && <p className="error-message" style={{ margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading || !username || !password} className="admin-btn-primary">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <button onClick={onBack} className="admin-btn-back">
          Back to Home
        </button>
      </div>
    </div>
  );
}

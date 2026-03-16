import { useCallback, useEffect, useState } from "react";
import { CompetitionDefaults } from "./CompetitionDefaults";
import { DungeonDefaults } from "./DungeonDefaults";
import { StreetViewEditor, type StreetViewLocationItem } from "./StreetViewEditor";
import { YouTubeEditor, type YouTubeVideoItem } from "./YouTubeEditor";
import "./AdminDashboard.css";

interface AdminConfig {
  competitionSubMode: string;
  competitionPlayerFormat: string;
  competitionTargetDistanceKm: number;
  competitionIntervalMinutes: number;
  competitionTargetZone: number;
  competitionDurationMinutes: number;
  dungeonDifficulty: string;
  dungeonTimeframeMinutes: number;
  streetViewLocations: StreetViewLocationItem[];
  youTubeVideos: YouTubeVideoItem[];
}

interface Props {
  apiUrl: string;
  token: string;
  onLogout: () => void;
}

type Tab = "competition" | "dungeon" | "streetview" | "youtube";

export function AdminDashboard({ apiUrl, token, onLogout }: Props) {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [tab, setTab] = useState<Tab>("competition");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      const data = await res.json();
      setConfig(data);
    } catch {
      setError("Failed to load config");
    }
  }, [apiUrl, token, onLogout]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`${apiUrl}/api/admin/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      const data = await res.json();
      setConfig(data);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch {
      setSaveMsg("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${apiUrl}/api/admin/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore */ }
    onLogout();
  }

  function updateField(field: string, value: string | number) {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  }

  if (error) {
    return (
      <div className="admin-screen">
        <p className="error-message">{error}</p>
        <button onClick={onLogout} className="admin-btn-back">Back to Home</button>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="admin-screen">
        <p style={{ color: "var(--text)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="admin-screen">
      <div className="admin-header">
        <h2 style={{ margin: 0, color: "var(--text-h, #f3f4f6)" }}>Admin Settings</h2>
        <button onClick={handleLogout} className="admin-btn-logout">Logout</button>
      </div>

      <div className="admin-tabs">
        {([
          ["competition", "Competition"],
          ["dungeon", "Dungeon"],
          ["streetview", "Street View Places"],
          ["youtube", "YouTube Videos"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`admin-tab ${tab === key ? "admin-tab-active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="admin-content">
        {tab === "competition" && (
          <CompetitionDefaults
            subMode={config.competitionSubMode}
            playerFormat={config.competitionPlayerFormat}
            targetDistanceKm={config.competitionTargetDistanceKm}
            intervalMinutes={config.competitionIntervalMinutes}
            targetZone={config.competitionTargetZone}
            durationMinutes={config.competitionDurationMinutes}
            onChange={updateField}
          />
        )}

        {tab === "dungeon" && (
          <DungeonDefaults
            difficulty={config.dungeonDifficulty}
            timeframeMinutes={config.dungeonTimeframeMinutes}
            onChange={updateField}
          />
        )}

        {tab === "streetview" && (
          <StreetViewEditor
            locations={config.streetViewLocations}
            onChange={(locs) => setConfig({ ...config, streetViewLocations: locs })}
          />
        )}

        {tab === "youtube" && (
          <YouTubeEditor
            videos={config.youTubeVideos}
            onChange={(vids) => setConfig({ ...config, youTubeVideos: vids })}
          />
        )}
      </div>

      <div className="admin-footer-bar">
        <button onClick={saveConfig} disabled={saving} className="admin-btn-primary">
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {saveMsg && (
          <span style={{ color: saveMsg === "Saved" ? "#22c55e" : "#f87171", fontSize: "0.9rem" }}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}

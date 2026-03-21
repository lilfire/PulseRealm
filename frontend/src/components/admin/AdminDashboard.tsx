import { useCallback, useEffect, useRef, useState } from "react";
import { ActiveRealms } from "./ActiveRealms";
import { CompetitionDefaults } from "./CompetitionDefaults";
import { DungeonDefaults } from "./DungeonDefaults";
import { RouteEditor, type CuratedRouteItem } from "./RouteEditor";
import { StreetViewEditor, type StreetViewLocationItem } from "./StreetViewEditor";
import { ProtectionDefaults } from "./ProtectionDefaults";
import { YouTubeEditor, type YouTubeVideoItem } from "./YouTubeEditor";
import "./AdminDashboard.css";

export interface AdminConfig {
  competitionSubMode: string;
  competitionPlayerFormat: string;
  competitionTargetDistanceKm: number;
  competitionIntervalMinutes: number;
  competitionTargetZone: number;
  competitionDurationMinutes: number;
  dungeonDifficulty: string;
  dungeonTimeframeMinutes: number;
  maxWearableMessagesPerSecond: number;
  maxConcurrentRealms: number;
  streetViewLocations: StreetViewLocationItem[];
  youTubeVideos: YouTubeVideoItem[];
  curatedRoutes: CuratedRouteItem[];
}

interface RealmJoinData {
  id: string;
  joinCode: string;
  mode: string | number;
}

interface Props {
  apiUrl: string;
  token: string;
  onLogout: () => void;
  onJoinRealm?: (realm: RealmJoinData) => void;
}

type Tab = "realms" | "competition" | "dungeon" | "streetview" | "youtube" | "route" | "protection";

const NAV_ITEMS: { key: Tab; label: string; description: string }[] = [
  { key: "realms", label: "Active Realms", description: "Monitor and manage live realms" },
  { key: "competition", label: "Competition", description: "Default settings for competition mode" },
  { key: "dungeon", label: "Dungeon", description: "Default settings for dungeon mode" },
  { key: "streetview", label: "Street View", description: "Manage Street View locations" },
  { key: "youtube", label: "YouTube", description: "Manage YouTube trail videos" },
  { key: "route", label: "Routes", description: "Manage curated routes" },
  { key: "protection", label: "Protection", description: "Rate limits and server protection" },
];

export function AdminDashboard({ apiUrl, token, onLogout, onJoinRealm }: Props) {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [tab, setTab] = useState<Tab>("realms");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [realmCount, setRealmCount] = useState(0);
  const saveMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
    };
  }, []);

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
      if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
      saveMsgTimer.current = setTimeout(() => setSaveMsg(""), 2000);
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

  function updateField<K extends keyof AdminConfig>(field: K, value: AdminConfig[K]) {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  }

  function handleNavClick(key: Tab) {
    setTab(key);
    setSidebarOpen(false);
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

  const currentNav = NAV_ITEMS.find((n) => n.key === tab)!;

  return (
    <div className="admin-layout">
      {/* Mobile overlay */}
      <div
        className={`admin-sidebar-overlay${sidebarOpen ? " admin-sidebar-overlay-visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`admin-sidebar${sidebarOpen ? " admin-sidebar-open" : ""}`}>
        <div className="admin-sidebar-brand">
          <span>Pulse</span>Realm Admin
        </div>
        <nav className="admin-sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => handleNavClick(item.key)}
              className={`admin-nav-item${tab === item.key ? " admin-nav-item-active" : ""}`}
            >
              {item.label}
              {item.key === "realms" && realmCount > 0 && (
                <span className="admin-nav-badge">{realmCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button onClick={handleLogout} className="admin-btn-logout">Logout</button>
        </div>
      </aside>

      {/* Main */}
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
            &#9776;
          </button>
          <div className="admin-topbar-info">
            <h1 className="admin-topbar-title">{currentNav.label}</h1>
            <p className="admin-topbar-desc">{currentNav.description}</p>
          </div>
          <div className="admin-topbar-actions">
            {saveMsg && (
              <span className="admin-save-msg" style={{ color: saveMsg === "Saved" ? "#22c55e" : "#f87171" }}>
                {saveMsg}
              </span>
            )}
            <button onClick={saveConfig} disabled={saving} className="admin-btn-primary">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </header>

        <div className="admin-page-content">
          {tab === "realms" && (
            <ActiveRealms apiUrl={apiUrl} token={token} onLogout={onLogout} onJoinRealm={onJoinRealm} onRealmCount={setRealmCount} />
          )}

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
              serverUrl={apiUrl}
              authToken={token}
            />
          )}

          {tab === "youtube" && (
            <YouTubeEditor
              videos={config.youTubeVideos}
              onChange={(vids) => setConfig({ ...config, youTubeVideos: vids })}
              serverUrl={apiUrl}
              authToken={token}
            />
          )}

          {tab === "route" && (
            <RouteEditor
              routes={config.curatedRoutes}
              onChange={(routes) => setConfig({ ...config, curatedRoutes: routes })}
              serverUrl={apiUrl}
              authToken={token}
            />
          )}

          {tab === "protection" && (
            <ProtectionDefaults
              maxWearableMessagesPerSecond={config.maxWearableMessagesPerSecond}
              maxConcurrentRealms={config.maxConcurrentRealms}
              onChange={updateField}
            />
          )}
        </div>
      </div>
    </div>
  );
}

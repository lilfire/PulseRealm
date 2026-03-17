import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ClientProfile, RealmRole, WearableData } from "../../types/session";
import type { ClientSummary, RealmSummary } from "../../hooks/useSessionHub";
import { CADENCE_WINDOW_MS, IDLE_TIMEOUT_MS, getMaxHrForAge, formatDuration, getStrideFactor, estimateCaloriesPerSecond } from "../../utils/wearable";

interface HrZone {
  zone: number;
  label: string;
  color: string;
}

const HR_ZONES: HrZone[] = [
  { zone: 1, label: "Zone 1", color: "#2dd4bf" }, // teal
  { zone: 2, label: "Zone 2", color: "#22c55e" }, // green
  { zone: 3, label: "Zone 3", color: "#f59e0b" }, // amber
  { zone: 4, label: "Zone 4", color: "#f87171" }, // coral
  { zone: 5, label: "Zone 5", color: "#ef4444" }, // red
];

function getHrZone(bpm: number, maxHr: number): HrZone {
  const pct = bpm / maxHr;
  if (pct < 0.57) return HR_ZONES[0];
  if (pct < 0.63) return HR_ZONES[1];
  if (pct < 0.76) return HR_ZONES[2];
  if (pct < 0.89) return HR_ZONES[3];
  return HR_ZONES[4];
}

// ── Per-client tracker ───────────────────────────────────────────────────────

interface ClientTracker {
  heartRate: number;
  steps: number;
  prevSteps: number;
  cadence: number;
  active: boolean;
  lastDataTime: number;
  stepWindow: { time: number; steps: number }[];
  distanceMeters: number;
  hrSum: number;
  hrCount: number;
  maxHr: number;
  timeInZone: Record<string, number>;
  cadenceSum: number;
  cadenceCount: number;
  caloriesBurned: number;
  speedSum: number;
  speedCount: number;
  peakSpeedKmh: number;
}

function newTracker(): ClientTracker {
  return {
    heartRate: 0,
    steps: 0,
    prevSteps: 0,
    cadence: 0,
    active: false,
    lastDataTime: 0,
    stepWindow: [],
    distanceMeters: 0,
    hrSum: 0,
    hrCount: 0,
    maxHr: 0,
    timeInZone: {},
    cadenceSum: 0,
    cadenceCount: 0,
    caloriesBurned: 0,
    speedSum: 0,
    speedCount: 0,
    peakSpeedKmh: 0,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = ["#FF5C75", "#33DFFF", "#D06ACA", "#22c55e", "#f59e0b", "#818cf8", "#fb923c", "#2dd4bf"];

function avatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
  onEnd: (totalDistanceMeters: number, overrides?: Partial<RealmSummary>) => void;
  role?: RealmRole;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SocialMode({ clients, clientProfiles, latestData, onEnd, role = "host" }: Props) {
  const trackersRef = useRef<Record<string, ClientTracker>>({});
  const totalDistRef = useRef(0);
  const startTimeRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [, forceRender] = useState(0);

  // Sync state tracking
  const [syncZone, setSyncZone] = useState<number | null>(null);
  const syncStartRef = useRef<number | null>(null);
  const [syncDuration, setSyncDuration] = useState(0);

  // Initialize start time
  useEffect(() => { startTimeRef.current = Date.now(); }, []);

  // Timer: elapsed seconds
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Process incoming wearable data
  useEffect(() => {
    if (!latestData) return;
    const { clientId, heartRate, steps } = latestData;
    const trackers = trackersRef.current;

    if (!trackers[clientId]) trackers[clientId] = newTracker();
    const t = trackers[clientId];

    const now = Date.now();
    t.heartRate = heartRate;
    t.active = true;
    t.lastDataTime = now;

    // HR stats per client
    if (heartRate > 0) {
      t.hrSum += heartRate;
      t.hrCount++;
      t.maxHr = Math.max(t.maxHr, heartRate);
    }

    // Steps & distance
    if (t.prevSteps > 0 && steps > t.prevSteps) {
      const delta = steps - t.prevSteps;
      const height = clientProfiles[clientId]?.heightCm ?? 170;
      const dist = delta * height * getStrideFactor(clientProfiles[clientId]);
      totalDistRef.current += dist;
      t.distanceMeters += dist;
    }
    if (steps > 0) t.prevSteps = steps;
    t.steps = steps;

    // Speed tracking
    if (latestData.speedKmh > 0) {
      t.speedSum += latestData.speedKmh;
      t.speedCount++;
      if (latestData.speedKmh > t.peakSpeedKmh) t.peakSpeedKmh = latestData.speedKmh;
    }

    // Cadence (steps per minute over a rolling window)
    t.stepWindow.push({ time: now, steps });
    t.stepWindow = t.stepWindow.filter((e) => now - e.time <= CADENCE_WINDOW_MS);
    if (t.stepWindow.length >= 2) {
      const first = t.stepWindow[0];
      const last = t.stepWindow[t.stepWindow.length - 1];
      const dt = (last.time - first.time) / 1000 / 60; // minutes
      const ds = last.steps - first.steps;
      t.cadence = dt > 0 ? Math.round(ds / dt) : 0;
    }

    forceRender((n) => n + 1);
  }, [latestData, clientProfiles]);

  // Idle detection
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const trackers = trackersRef.current;
      let changed = false;
      for (const cid of Object.keys(trackers)) {
        const wasActive = trackers[cid].active;
        trackers[cid].active = now - trackers[cid].lastDataTime < IDLE_TIMEOUT_MS;
        if (wasActive !== trackers[cid].active) changed = true;
      }
      if (changed) forceRender((n) => n + 1);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // 1-second tick for timeInZone and cadence accumulation
  useEffect(() => {
    const id = setInterval(() => {
      const trackers = trackersRef.current;
      for (const cid of clients) {
        const t = trackers[cid];
        if (!t || !t.active) continue;
        if (t.heartRate > 0) {
          const maxHr = getMaxHrForAge(clientProfiles[cid]?.age);
          const zone = getHrZone(t.heartRate, maxHr).zone;
          t.timeInZone[zone] = (t.timeInZone[zone] ?? 0) + 1;
        }
        if (t.cadence > 0) {
          t.cadenceSum += t.cadence;
          t.cadenceCount++;
        }
        if (t.heartRate > 0) {
          const profile = clientProfiles[cid];
          if (profile?.weightKg && profile?.age) {
            t.caloriesBurned += estimateCaloriesPerSecond(t.heartRate, profile.weightKg, profile.age);
          }
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [clients, clientProfiles]);

  // Sync detection
  useEffect(() => {
    const trackers = trackersRef.current;
    const activeClients = clients.filter((c) => trackers[c]?.active && trackers[c]?.heartRate > 0);

    if (activeClients.length < 2) {
      if (syncZone !== null) {
        setSyncZone(null);
        syncStartRef.current = null;
        setSyncDuration(0);
      }
      return;
    }

    const zones = activeClients.map((c) => getHrZone(trackers[c].heartRate, getMaxHrForAge(clientProfiles[c]?.age)).zone);
    const allSame = zones.every((z) => z === zones[0]);

    if (allSame) {
      const zone = zones[0];
      if (syncZone !== zone) {
        setSyncZone(zone);
        syncStartRef.current = Date.now();
        setSyncDuration(0);
      } else if (syncStartRef.current) {
        setSyncDuration(Math.floor((Date.now() - syncStartRef.current) / 1000));
      }
    } else {
      if (syncZone !== null) {
        setSyncZone(null);
        syncStartRef.current = null;
        setSyncDuration(0);
      }
    }
  }, [latestData, clients, clientProfiles, syncZone]);

  // ── Derived values ───────────────────────────────────────────────────────

  /* eslint-disable react-hooks/refs -- intentional: mutable ref read during render for
     real-time performance. Re-renders are driven by forceRender() state updates. */
  const trackers = trackersRef.current;

  let totalSteps = 0;
  let hrSum = 0;
  let hrCount = 0;
  let totalCalories = 0;
  for (const cid of clients) {
    const t = trackers[cid];
    if (!t) continue;
    totalSteps += t.steps;
    totalCalories += t.caloriesBurned;
    if (t.active && t.heartRate > 0) {
      hrSum += t.heartRate;
      hrCount++;
    }
  }
  const avgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : 0;
  const totalDistKm = totalDistRef.current / 1000;

  const handleEnd = useCallback(() => {
    const trackers = trackersRef.current;
    const now = Date.now();
    const elapsedSecs = Math.floor((now - startTimeRef.current) / 1000);

    // Active period: approximate from client last data times
    const perSecondActive = new Set<number>();
    for (const cid of clients) {
      const t = trackers[cid];
      if (t && t.lastDataTime > 0) {
        const clientActiveSecs = Math.min(
          Math.floor((t.lastDataTime - startTimeRef.current) / 1000),
          elapsedSecs
        );
        for (let s = 0; s <= clientActiveSecs; s++) perSecondActive.add(s);
      }
    }

    const clientSummaries: ClientSummary[] = clients.map((cid) => {
      const t = trackers[cid];
      const name = clientProfiles[cid]?.name ?? cid.slice(0, 8);
      if (!t) return { clientId: cid, name, steps: 0, distanceMeters: 0, averageHeartRate: 0, maxHeartRate: 0, avgCadenceSpm: 0, timeInZone: {}, caloriesBurned: 0, averageSpeedKmh: 0, peakSpeedKmh: 0 };
      return {
        clientId: cid,
        name,
        steps: t.steps,
        distanceMeters: Math.round(t.distanceMeters),
        averageHeartRate: t.hrCount > 0 ? Math.round(t.hrSum / t.hrCount) : 0,
        maxHeartRate: t.maxHr,
        avgCadenceSpm: t.cadenceCount > 0 ? Math.round(t.cadenceSum / t.cadenceCount) : 0,
        timeInZone: { ...t.timeInZone },
        caloriesBurned: Math.round(t.caloriesBurned),
        averageSpeedKmh: t.speedCount > 0 ? Math.round((t.speedSum / t.speedCount) * 10) / 10 : 0,
        peakSpeedKmh: Math.round(t.peakSpeedKmh * 10) / 10,
      };
    });

    let groupSteps = 0;
    let groupHrSum = 0;
    let groupHrCount = 0;
    let groupMaxHr = 0;
    let groupCadenceSum = 0;
    let groupCadenceCount = 0;
    let groupCalories = 0;
    const groupTimeInZone: Record<string, number> = {};
    for (const cs of clientSummaries) {
      groupSteps += cs.steps;
      groupCalories += cs.caloriesBurned;
      if (cs.averageHeartRate > 0) { groupHrSum += cs.averageHeartRate; groupHrCount++; }
      groupMaxHr = Math.max(groupMaxHr, cs.maxHeartRate);
      if (cs.avgCadenceSpm > 0) { groupCadenceSum += cs.avgCadenceSpm; groupCadenceCount++; }
      for (const [zone, secs] of Object.entries(cs.timeInZone)) {
        groupTimeInZone[zone] = (groupTimeInZone[zone] ?? 0) + secs;
      }
    }
    let groupSpeedSum = 0;
    let groupSpeedCount = 0;
    let groupPeakSpeed = 0;
    for (const cs of clientSummaries) {
      if (cs.averageSpeedKmh > 0) { groupSpeedSum += cs.averageSpeedKmh; groupSpeedCount++; }
      groupPeakSpeed = Math.max(groupPeakSpeed, cs.peakSpeedKmh);
    }

    onEnd(Math.round(totalDistRef.current), {
      totalSteps: groupSteps,
      averageHeartRate: groupHrCount > 0 ? Math.round(groupHrSum / groupHrCount) : 0,
      maxHeartRate: groupMaxHr,
      avgCadenceSpm: groupCadenceCount > 0 ? Math.round(groupCadenceSum / groupCadenceCount) : 0,
      timeInZone: groupTimeInZone,
      activePeriodSeconds: perSecondActive.size,
      participantCount: clients.length,
      caloriesBurned: groupCalories,
      averageSpeedKmh: groupSpeedCount > 0 ? Math.round((groupSpeedSum / groupSpeedCount) * 10) / 10 : 0,
      peakSpeedKmh: Math.round(groupPeakSpeed * 10) / 10,
      clientSummaries,
    });
  }, [onEnd, clients, clientProfiles]);

  // ── Render ───────────────────────────────────────────────────────────────

  const isInSync = syncZone !== null;
  const syncColor = isInSync ? HR_ZONES[syncZone - 1].color : undefined;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, left: 0,
      background: "var(--bg)",
      display: "flex", flexDirection: "column",
      fontFamily: "var(--sans)",
      overflow: "hidden",
    }}>
      {/* ── Team totals bar ─────────────────────────────────────── */}
      <div className="fg-row" style={{
        display: "flex", justifyContent: "center", alignItems: "baseline",
        "--fg": "48px", padding: "28px 32px 20px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      } as React.CSSProperties}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 64, fontWeight: 700, lineHeight: 1,
            fontFamily: "var(--mono)", color: "var(--text-h)",
            transition: "all 0.4s ease",
          }}>
            {totalSteps.toLocaleString()}
          </div>
          <div style={{ fontSize: 14, color: "var(--text)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            steps
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 36, fontWeight: 600, lineHeight: 1,
            fontFamily: "var(--mono)", color: "var(--text-h)",
            transition: "all 0.4s ease",
          }}>
            {totalDistKm.toFixed(2)}
          </div>
          <div style={{ fontSize: 14, color: "var(--text)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            km
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 36, fontWeight: 600, lineHeight: 1,
            fontFamily: "var(--mono)", color: avgHr > 0 ? "var(--text-h)" : "var(--text)",
            transition: "all 0.4s ease",
          }}>
            {avgHr > 0 ? avgHr : "—"}
          </div>
          <div style={{ fontSize: 14, color: "var(--text)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            avg bpm
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 36, fontWeight: 600, lineHeight: 1,
            fontFamily: "var(--mono)", color: totalCalories > 0 ? "var(--text-h)" : "var(--text)",
            transition: "all 0.4s ease",
          }}>
            {totalCalories > 0 ? Math.round(totalCalories) : "—"}
          </div>
          <div style={{ fontSize: 14, color: "var(--text)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            kcal
          </div>
        </div>
      </div>

      {/* ── Runner cards grid ───────────────────────────────────── */}
      <div style={{
        flex: 1, overflow: "auto",
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(clients.length, 4)}, 1fr)`,
        gap: 16, padding: "24px 32px",
        alignContent: "stretch",
      }}>
        {clients.map((cid, idx) => {
          const t = trackers[cid];
          const profile = clientProfiles[cid];
          const name = profile?.name ?? cid.slice(0, 8);
          const active = t?.active ?? false;
          const hr = active ? (t?.heartRate ?? 0) : 0;
          const cadence = active ? (t?.cadence ?? 0) : 0;
          const clientMaxHr = getMaxHrForAge(profile?.age);
          const zone = hr > 0 ? getHrZone(hr, clientMaxHr) : null;
          const zoneProgress = hr > 0 ? Math.min(hr / clientMaxHr, 1) : 0;

          return (
            <div key={cid} className="fg-col" style={{
              background: "var(--code-bg)",
              borderRadius: 12,
              padding: "20px 24px",
              display: "flex", flexDirection: "column", "--fg": "14px",
              opacity: active ? 1 : 0.4,
              transition: "opacity 0.6s ease",
              border: "1px solid var(--border)",
            } as React.CSSProperties}>
              {/* Name row */}
              <div className="fg-row" style={{ display: "flex", alignItems: "center", "--fg": "12px" } as React.CSSProperties}>
                {/* Avatar */}
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: active ? avatarColor(idx) : "#555",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 700, color: "#fff",
                  transition: "background 0.6s ease",
                  flexShrink: 0,
                }}>
                  {getInitials(name)}
                </div>
                <div style={{
                  fontSize: 20, fontWeight: 600, color: "var(--text-h)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {name}
                </div>
                {/* Pulse dot */}
                <div style={{
                  marginLeft: "auto",
                  width: 10, height: 10, borderRadius: "50%",
                  background: active ? "#22c55e" : "#555",
                  boxShadow: active ? "0 0 6px #22c55e" : "none",
                  animation: active ? "pulse-dot 1.5s infinite" : "none",
                  transition: "background 0.6s ease",
                  flexShrink: 0,
                }} />
              </div>

              {/* HR */}
              <div className="fg-row" style={{ display: "flex", alignItems: "baseline", "--fg": "8px" } as React.CSSProperties}>
                <span style={{
                  fontSize: 32, fontWeight: 700, fontFamily: "var(--mono)",
                  color: active && hr > 0 ? "var(--text-h)" : "var(--text)",
                  transition: "all 0.4s ease",
                }}>
                  {active && hr > 0 ? hr : "—"}
                </span>
                <span style={{ fontSize: 14, color: "var(--text)" }}>bpm</span>
              </div>

              {/* Zone bar */}
              <div>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  fontSize: 13, color: zone ? zone.color : "var(--text)",
                  fontWeight: 600, marginBottom: 4,
                  transition: "color 0.4s ease",
                }}>
                  <span>{zone ? zone.label : "—"}</span>
                </div>
                <div style={{
                  height: 6, borderRadius: 3,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    width: `${zoneProgress * 100}%`,
                    background: zone ? zone.color : "transparent",
                    transition: "width 0.6s ease, background 0.4s ease",
                  }} />
                </div>
              </div>

              {/* Cadence */}
              <div className="fg-row" style={{ display: "flex", alignItems: "baseline", "--fg": "8px" } as React.CSSProperties}>
                <span style={{
                  fontSize: 24, fontWeight: 600, fontFamily: "var(--mono)",
                  color: active && cadence > 0 ? "var(--text-h)" : "var(--text)",
                  transition: "all 0.4s ease",
                }}>
                  {active && cadence > 0 ? cadence : "—"}
                </span>
                <span style={{ fontSize: 14, color: "var(--text)" }}>spm</span>
              </div>

              {/* Calories */}
              <div className="fg-row" style={{ display: "flex", alignItems: "baseline", "--fg": "8px" } as React.CSSProperties}>
                <span style={{
                  fontSize: 24, fontWeight: 600, fontFamily: "var(--mono)",
                  color: active && (t?.caloriesBurned ?? 0) > 0 ? "var(--text-h)" : "var(--text)",
                  transition: "all 0.4s ease",
                }}>
                  {active && (t?.caloriesBurned ?? 0) > 0 ? Math.round(t!.caloriesBurned) : "—"}
                </span>
                <span style={{ fontSize: 14, color: "var(--text)" }}>kcal</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Moment banner ───────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: "16px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid var(--border)",
        background: isInSync
          ? `${syncColor}18`
          : "transparent",
        transition: "background 0.8s ease",
      }}>
        <div style={{
          fontSize: 15, fontWeight: 600,
          color: isInSync ? syncColor : "transparent",
          transition: "color 0.8s ease",
        }}>
          {isInSync && (
            <>
              All in sync — everyone in Zone {syncZone}
              {syncDuration > 0 && (
                <span style={{ fontWeight: 400, marginLeft: 12, opacity: 0.8 }}>
                  {formatDuration(syncDuration)}
                </span>
              )}
            </>
          )}
        </div>
        <div style={{
          fontSize: 28, fontWeight: 600, fontFamily: "var(--mono)",
          color: "var(--text-h)",
        }}>
          {formatDuration(elapsed)}
        </div>
      </div>

      {/* End button — only visible to host/admin */}
      {role !== "guest" && (
        <button
          onClick={handleEnd}
          style={{
            position: "fixed", top: 12, right: 12,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 16px",
            color: "var(--text)", fontSize: 13,
            cursor: "pointer",
          }}
        >
          End Realm
        </button>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientProfile, CompetitionConfig, RealmRole, WearableData } from "../../types/session";
import type { ClientSummary, RealmSummary } from "../../hooks/useSessionHub";
import { CADENCE_WINDOW_MS, IDLE_TIMEOUT_MS, ZONE_COLORS, getZoneForHr, getZoneBpmRange, getMaxHrForAge, formatDuration, getStrideFactor } from "../../utils/wearable";

// ── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#FF5C75", "#33DFFF", "#D06ACA", "#22c55e", "#f59e0b", "#818cf8", "#fb923c", "#2dd4bf"];

// ── Per-client tracker ────────────────────────────────────────────────────────

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
  // Summary stats
  timeInZone: Record<string, number>;
  cadenceSum: number;
  cadenceCount: number;
  // Sub-mode specific
  points: number;
  finished: boolean;
  finishTime: number | null;
  finishPosition: number | null;
  eliminated: boolean;
  eliminatedPosition: number | null;
}

function newTracker(): ClientTracker {
  return {
    heartRate: 0, steps: 0, prevSteps: 0, cadence: 0,
    active: false, lastDataTime: 0, stepWindow: [],
    distanceMeters: 0, hrSum: 0, hrCount: 0, maxHr: 0,
    timeInZone: {}, cadenceSum: 0, cadenceCount: 0,
    points: 0, finished: false, finishTime: null, finishPosition: null,
    eliminated: false, eliminatedPosition: null,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function avatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  id: string;
  name: string;
  color: string;
  distanceMeters: number;
  distanceKm: number;
  points: number;
  heartRate: number;
  cadence: number;
  active: boolean;
  finished: boolean;
  finishPosition: number | null;
  finishTime: number | null;
  eliminated: boolean;
  eliminatedPosition: number | null;
  inZone?: boolean;
  currentZone?: number;
  kingSeconds?: number;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
  config: CompetitionConfig;
  onEnd: (totalDistanceMeters: number, overrides?: Partial<RealmSummary>) => void;
  onEliminate?: (clientId: string) => void;
  role?: RealmRole;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CompetitionMode({ clients, clientProfiles, latestData, config, onEnd, onEliminate, role = "host" }: Props) {
  const trackersRef = useRef<Record<string, ClientTracker>>({});
  const startTimeRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [, forceRender] = useState(0);
  const rerender = () => forceRender((n) => n + 1);

  // Race state
  const nextPositionRef = useRef(1);
  const [raceWinner, setRaceWinner] = useState<string | null>(null);

  // Elimination state
  const [elimCountdown, setElimCountdown] = useState(config.intervalMinutes * 60);
  const elimTimerRef = useRef(config.intervalMinutes * 60);
  const eliminatedRef = useRef<Set<string>>(new Set());
  const [elimWinner, setElimWinner] = useState<string | null>(null);

  // King state
  const [currentKing, setCurrentKing] = useState<string | null>(null);
  const kingStartRef = useRef<number>(0);
  const [kingStint, setKingStint] = useState(0);
  const kingRef = useRef<string | null>(null);

  // Heartzone state (points ticked per second, tracked in tracker.points)

  // Realm ended flag
  const [realmEnded, setRealmEnded] = useState(false);
  const endedRef = useRef(false);

  // Idle detection: track previous active states to avoid spurious re-renders
  const prevActiveStatesRef = useRef<Record<string, boolean>>({});

  // Stable ref for onEnd so handleEnd doesn't change every render
  const onEndRef = useRef(onEnd);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  const isTeam = config.playerFormat === "team";

  // ── Initialize time refs on mount ─────────────────────────────────────────

  useEffect(() => {
    const now = Date.now();
    startTimeRef.current = now;
    kingStartRef.current = now;
  }, []);

  // ── Helpers (declared before use) ─────────────────────────────────────────

  function getMaxHrForClient(clientId?: string): number {
    const age = clientId ? clientProfiles[clientId]?.age : undefined;
    return getMaxHrForAge(age);
  }

  function getActiveEntities(trackers: Record<string, ClientTracker>): string[] {
    if (isTeam) {
      return config.teams
        .filter((t) => !eliminatedRef.current.has(t.name))
        .map((t) => t.name);
    }
    return clients.filter((cid) => !trackers[cid]?.eliminated);
  }

  function eliminateLowest(trackers: Record<string, ClientTracker>, entities: string[]) {
    if (entities.length <= 1) return;

    let lowestEntity: string | null = null;
    let lowestDist = Infinity;
    let lowestCadence = Infinity;

    for (const entity of entities) {
      let dist: number;
      let cadence: number;
      if (isTeam) {
        const team = config.teams.find((t) => t.name === entity)!;
        dist = team.clientIds.reduce((sum, cid) => sum + (trackers[cid]?.distanceMeters ?? 0), 0);
        cadence = team.clientIds.reduce((sum, cid) => sum + (trackers[cid]?.cadence ?? 0), 0) / team.clientIds.length;
      } else {
        dist = trackers[entity]?.distanceMeters ?? 0;
        cadence = trackers[entity]?.cadence ?? 0;
      }

      if (dist < lowestDist || (dist === lowestDist && cadence < lowestCadence)) {
        lowestDist = dist;
        lowestCadence = cadence;
        lowestEntity = entity;
      } else if (dist === lowestDist && cadence === lowestCadence) {
        // Exactly tied on both — both survive
        lowestEntity = null;
      }
    }

    if (!lowestEntity) return;

    const position = clients.length - eliminatedRef.current.size;

    if (isTeam) {
      eliminatedRef.current.add(lowestEntity);
      const team = config.teams.find((t) => t.name === lowestEntity)!;
      for (const cid of team.clientIds) {
        if (trackers[cid]) {
          trackers[cid].eliminated = true;
          trackers[cid].eliminatedPosition = position;
        }
        onEliminate?.(cid);
      }
      const tk = `__team__${lowestEntity}`;
      if (!trackers[tk]) trackers[tk] = newTracker();
      trackers[tk].eliminated = true;
      trackers[tk].eliminatedPosition = position;
    } else {
      if (trackers[lowestEntity]) {
        trackers[lowestEntity].eliminated = true;
        trackers[lowestEntity].eliminatedPosition = position;
      }
      onEliminate?.(lowestEntity);
    }

    rerender();
  }

  // ── Timer ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const secs = Math.floor((now - startTimeRef.current) / 1000);
      setElapsed(secs);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Process incoming wearable data ─────────────────────────────────────────

  useEffect(() => {
    if (!latestData) return;
    const { clientId, heartRate, steps } = latestData;
    const trackers = trackersRef.current;

    if (!trackers[clientId]) trackers[clientId] = newTracker();
    const t = trackers[clientId];

    if (t.eliminated) return;
    if (t.finished && !isTeam) return;

    const now = Date.now();
    t.heartRate = heartRate;
    t.active = true;
    t.lastDataTime = now;

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
      t.distanceMeters += dist;
    }
    if (steps > 0) t.prevSteps = steps;
    t.steps = steps;

    // Cadence
    t.stepWindow.push({ time: now, steps });
    t.stepWindow = t.stepWindow.filter((e) => now - e.time <= CADENCE_WINDOW_MS);
    if (t.stepWindow.length >= 2) {
      const first = t.stepWindow[0];
      const last = t.stepWindow[t.stepWindow.length - 1];
      const dt = (last.time - first.time) / 1000 / 60;
      const ds = last.steps - first.steps;
      t.cadence = dt > 0 ? Math.round(ds / dt) : 0;
    }

    // Race: check finish (10m tolerance for floating-point accumulation)
    if (config.subMode === "race") {
      if (isTeam) {
        // Team race: aggregated distance across all members
        const team = config.teams.find((tm) => tm.clientIds.includes(clientId));
        if (team) {
          const teamKey = `__team__${team.name}`;
          if (!trackers[teamKey]?.finished) {
            const teamDistKm = team.clientIds.reduce((sum, cid) => sum + (trackers[cid]?.distanceMeters ?? 0), 0) / 1000;
            if (teamDistKm >= config.targetDistanceKm - 0.01) {
              if (!trackers[teamKey]) trackers[teamKey] = newTracker();
              trackers[teamKey].finished = true;
              trackers[teamKey].finishTime = now;
              trackers[teamKey].finishPosition = nextPositionRef.current++;
              if (trackers[teamKey].finishPosition === 1) setRaceWinner(team.name);
            }
          }
        }
      } else if (!t.finished) {
        const distKm = t.distanceMeters / 1000;
        if (distKm >= config.targetDistanceKm - 0.01) {
          t.finished = true;
          t.finishTime = now;
          t.finishPosition = nextPositionRef.current++;
          if (t.finishPosition === 1) setRaceWinner(clientId);
        }
      }
    }

    rerender();
  }, [latestData, clientProfiles, config, isTeam]);

  // ── Idle detection ─────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const trackers = trackersRef.current;
      let changed = false;
      for (const cid of Object.keys(trackers)) {
        const nextActive = now - trackers[cid].lastDataTime < IDLE_TIMEOUT_MS;
        if (nextActive !== prevActiveStatesRef.current[cid]) {
          prevActiveStatesRef.current[cid] = nextActive;
          changed = true;
        }
        trackers[cid].active = nextActive;
      }
      if (changed) rerender();
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // ── Game tick (1s) — heartzone points, king points, elimination, race team finish ──

  useEffect(() => {
    const id = setInterval(() => {
      if (endedRef.current) return;

      const trackers = trackersRef.current;
      const now = Date.now();
      const secs = Math.floor((now - startTimeRef.current) / 1000);

      // Check timed modes for end
      if ((config.subMode === "heartzone" || config.subMode === "king") && secs >= config.durationMinutes * 60) {
        setRealmEnded(true);
        return;
      }

      // Heartzone: award points
      if (config.subMode === "heartzone") {
        for (const cid of clients) {
          const t = trackers[cid];
          if (!t || !t.active || t.heartRate <= 0) continue;
          const maxHr = getMaxHrForClient(cid);
          const zone = getZoneForHr(t.heartRate, maxHr);
          if (zone === config.targetZone) {
            t.points += 1;
          }
        }
      }

      // Track timeInZone and cadence for all active clients
      for (const cid of clients) {
        const t = trackers[cid];
        if (!t || !t.active) continue;
        if (t.heartRate > 0) {
          const maxHr = getMaxHrForClient(cid);
          const zone = getZoneForHr(t.heartRate, maxHr);
          t.timeInZone[zone] = (t.timeInZone[zone] ?? 0) + 1;
        }
        if (t.cadence > 0) {
          t.cadenceSum += t.cadence;
          t.cadenceCount++;
        }
      }

      // King: award points to current leader
      if (config.subMode === "king") {
        let bestEntity: string | null = null;
        let bestDist = -1;

        if (isTeam) {
          for (const team of config.teams) {
            const teamDist = team.clientIds.reduce((sum, cid) => sum + (trackers[cid]?.distanceMeters ?? 0), 0);
            if (teamDist > bestDist) {
              bestDist = teamDist;
              bestEntity = team.name;
            }
          }
        } else {
          for (const cid of clients) {
            const dist = trackers[cid]?.distanceMeters ?? 0;
            if (dist > bestDist) {
              bestDist = dist;
              bestEntity = cid;
            }
          }
        }

        // Tie goes to the defender (current king)
        if (bestDist > 0) {
          const prevKing = kingRef.current;
          if (prevKing && bestEntity !== prevKing) {
            // Check if current king is tied
            const prevDist = isTeam
              ? config.teams.find((t) => t.name === prevKing)?.clientIds.reduce((sum, cid) => sum + (trackers[cid]?.distanceMeters ?? 0), 0) ?? 0
              : trackers[prevKing]?.distanceMeters ?? 0;
            if (prevDist >= bestDist) {
              bestEntity = prevKing; // defender retains
            }
          }

          if (bestEntity !== kingRef.current) {
            kingRef.current = bestEntity;
            kingStartRef.current = now;
            setCurrentKing(bestEntity);
          }

          // Award point to king
          if (isTeam) {
            // Track king points per team - use the first client in team as proxy
            // We'll aggregate when rendering
            const team = config.teams.find((t) => t.name === bestEntity);
            if (team && team.clientIds.length > 0) {
              // Store points on a "team tracker" keyed by team name
              if (!trackers[`__team__${bestEntity}`]) trackers[`__team__${bestEntity}`] = newTracker();
              trackers[`__team__${bestEntity}`].points += 1;
            }
          } else if (bestEntity && trackers[bestEntity]) {
            trackers[bestEntity].points += 1;
          }
        }

        if (kingRef.current) {
          setKingStint(Math.floor((now - kingStartRef.current) / 1000));
        }
      }

      // Elimination: countdown
      if (config.subMode === "elimination") {
        const activeEntities = getActiveEntities(trackers);

        // Last man standing — auto-end
        if (activeEntities.length <= 1 && !endedRef.current) {
          if (activeEntities.length === 1) {
            setElimWinner(activeEntities[0]);
          }
          setRealmEnded(true);
          return;
        }

        elimTimerRef.current -= 1;
        if (elimTimerRef.current < 0) elimTimerRef.current = 0;
        setElimCountdown(elimTimerRef.current);

        if (elimTimerRef.current <= 0) {
          // Perform elimination
          if (activeEntities.length > 1) {
            eliminateLowest(trackers, activeEntities);
          }
          elimTimerRef.current = config.intervalMinutes * 60;
          setElimCountdown(elimTimerRef.current);
        }
      }

      // Race: check finish (1s backup for latestData processing)
      if (config.subMode === "race") {
        if (isTeam) {
          // Team race: aggregated distance vs target
          for (const team of config.teams) {
            const teamKey = `__team__${team.name}`;
            if (trackers[teamKey]?.finished) continue;
            const teamDistKm = team.clientIds.reduce((sum, cid) => sum + (trackers[cid]?.distanceMeters ?? 0), 0) / 1000;
            if (teamDistKm >= config.targetDistanceKm - 0.01) {
              if (!trackers[teamKey]) trackers[teamKey] = newTracker();
              trackers[teamKey].finished = true;
              trackers[teamKey].finishTime = now;
              trackers[teamKey].finishPosition = nextPositionRef.current++;
              if (trackers[teamKey].finishPosition === 1) setRaceWinner(team.name);
            }
          }
        } else {
          // Individual race
          for (const cid of clients) {
            const t = trackers[cid];
            if (!t || t.finished || t.eliminated) continue;
            if (t.distanceMeters / 1000 >= config.targetDistanceKm - 0.01) {
              t.finished = true;
              t.finishTime = now;
              t.finishPosition = nextPositionRef.current++;
              if (t.finishPosition === 1) setRaceWinner(cid);
            }
          }
        }

        // Auto-end if a winner was determined but realm hasn't ended yet
        if (raceWinner && !endedRef.current) {
          setRealmEnded(true);
        }
      }

      rerender();
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- eliminateLowest/getActiveEntities are stable within the same render
  }, [clients, config, isTeam, raceWinner]);

  // ── End handler ────────────────────────────────────────────────────────────

  const handleEnd = useCallback(() => {
    const trackers = trackersRef.current;
    let totalDist = 0;
    let activePeriodSeconds = 0;
    const now = Date.now();
    const elapsedSecs = Math.floor((now - startTimeRef.current) / 1000);

    // Count active period: seconds where at least one client was active
    // Approximate from per-client cadence count (each count = 1 active second)
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
    activePeriodSeconds = perSecondActive.size;

    // Build team lookup for each client
    const clientTeamMap = new Map<string, { name: string; color: string }>();
    if (isTeam) {
      for (const team of config.teams) {
        for (const cid of team.clientIds) {
          clientTeamMap.set(cid, { name: team.name, color: team.color });
        }
      }
    }

    const clientSummaries: ClientSummary[] = clients.map((cid) => {
      const t = trackers[cid];
      const name = clientProfiles[cid]?.name ?? cid.slice(0, 8);
      const team = clientTeamMap.get(cid);
      if (!t) return { clientId: cid, name, steps: 0, distanceMeters: 0, averageHeartRate: 0, maxHeartRate: 0, avgCadenceSpm: 0, timeInZone: {}, teamName: team?.name, teamColor: team?.color };
      totalDist += t.distanceMeters;
      return {
        clientId: cid,
        name,
        steps: t.steps,
        distanceMeters: Math.round(t.distanceMeters),
        averageHeartRate: t.hrCount > 0 ? Math.round(t.hrSum / t.hrCount) : 0,
        maxHeartRate: t.maxHr,
        avgCadenceSpm: t.cadenceCount > 0 ? Math.round(t.cadenceSum / t.cadenceCount) : 0,
        timeInZone: { ...t.timeInZone },
        teamName: team?.name,
        teamColor: team?.color,
      };
    });

    let groupSteps = 0;
    let groupHrSum = 0;
    let groupHrCount = 0;
    let groupMaxHr = 0;
    let groupCadenceSum = 0;
    let groupCadenceCount = 0;
    const groupTimeInZone: Record<string, number> = {};
    for (const cs of clientSummaries) {
      groupSteps += cs.steps;
      if (cs.averageHeartRate > 0) { groupHrSum += cs.averageHeartRate; groupHrCount++; }
      groupMaxHr = Math.max(groupMaxHr, cs.maxHeartRate);
      if (cs.avgCadenceSpm > 0) { groupCadenceSum += cs.avgCadenceSpm; groupCadenceCount++; }
      for (const [zone, secs] of Object.entries(cs.timeInZone)) {
        groupTimeInZone[zone] = (groupTimeInZone[zone] ?? 0) + secs;
      }
    }

    onEndRef.current(Math.round(totalDist), {
      totalSteps: groupSteps,
      averageHeartRate: groupHrCount > 0 ? Math.round(groupHrSum / groupHrCount) : 0,
      maxHeartRate: groupMaxHr,
      avgCadenceSpm: groupCadenceCount > 0 ? Math.round(groupCadenceSum / groupCadenceCount) : 0,
      timeInZone: groupTimeInZone,
      activePeriodSeconds,
      participantCount: clients.length,
      isTeamFormat: isTeam,
      clientSummaries,
    });
  }, [clients, clientProfiles, isTeam, config.teams]);

  // Auto-end race when winner is determined
  useEffect(() => {
    if (config.subMode === "race" && raceWinner && !endedRef.current) {
      endedRef.current = true;
      setRealmEnded(true);
      handleEnd();
    }
  }, [raceWinner, config.subMode, handleEnd]);

  // Auto-end elimination when last man standing
  useEffect(() => {
    if (config.subMode === "elimination" && elimWinner && !endedRef.current) {
      endedRef.current = true;
      setRealmEnded(true);
      handleEnd();
    }
  }, [elimWinner, config.subMode, handleEnd]);

  // Auto-end when realm ends (timed modes: heartzone, king)
  useEffect(() => {
    if (realmEnded && !endedRef.current) {
      endedRef.current = true;
      handleEnd();
    }
  }, [realmEnded, handleEnd]);

  // ── Build leaderboard data ─────────────────────────────────────────────────
  // Trackers are mutated in effects and re-renders are driven by forceRender()
  const trackers = trackersRef.current;

  function buildEntries(): LeaderboardEntry[] {
    if (isTeam) {
      return config.teams.map((team) => {
        const teamDist = team.clientIds.reduce((sum, cid) => sum + (trackers[cid]?.distanceMeters ?? 0), 0);
        const teamPoints = config.subMode === "king"
          ? (trackers[`__team__${team.name}`]?.points ?? 0)
          : team.clientIds.reduce((sum, cid) => sum + (trackers[cid]?.points ?? 0), 0);
        const activeMembers = team.clientIds.filter((cid) => trackers[cid]?.active);
        const avgHr = activeMembers.length > 0
          ? Math.round(activeMembers.reduce((sum, cid) => sum + (trackers[cid]?.heartRate ?? 0), 0) / activeMembers.length)
          : 0;
        const tk = trackers[`__team__${team.name}`];
        return {
          id: team.name,
          name: team.name,
          color: team.color,
          distanceMeters: teamDist,
          distanceKm: teamDist / 1000,
          points: teamPoints,
          heartRate: avgHr,
          cadence: 0,
          active: activeMembers.length > 0,
          finished: tk?.finished ?? false,
          finishPosition: tk?.finishPosition ?? null,
          finishTime: tk?.finishTime ?? null,
          eliminated: tk?.eliminated ?? false,
          eliminatedPosition: tk?.eliminatedPosition ?? null,
        };
      });
    }

    return clients.map((cid, idx) => {
      const t = trackers[cid];
      const profile = clientProfiles[cid];
      const name = profile?.name ?? cid.slice(0, 8);
      const dist = t?.distanceMeters ?? 0;
      const maxHr = getMaxHrForClient(cid);
      const zone = t && t.heartRate > 0 ? getZoneForHr(t.heartRate, maxHr) : 0;
      return {
        id: cid,
        name,
        color: avatarColor(idx),
        distanceMeters: dist,
        distanceKm: dist / 1000,
        points: t?.points ?? 0,
        heartRate: t?.heartRate ?? 0,
        cadence: t?.cadence ?? 0,
        active: t?.active ?? false,
        finished: t?.finished ?? false,
        finishPosition: t?.finishPosition ?? null,
        finishTime: t?.finishTime ?? null,
        eliminated: t?.eliminated ?? false,
        eliminatedPosition: t?.eliminatedPosition ?? null,
        inZone: config.subMode === "heartzone" ? zone === config.targetZone : undefined,
        currentZone: zone > 0 ? zone : undefined,
        kingSeconds: config.subMode === "king" ? (t?.points ?? 0) : undefined,
      };
    });
  }

  const entries = buildEntries();

  // Sort by primary metric
  function sortEntries(arr: LeaderboardEntry[]): LeaderboardEntry[] {
    const active = arr.filter((e) => !e.eliminated);
    const eliminated = arr.filter((e) => e.eliminated).sort((a, b) => (b.eliminatedPosition ?? 0) - (a.eliminatedPosition ?? 0));

    if (config.subMode === "race") {
      // Finished first (by position), then by distance remaining (desc)
      active.sort((a, b) => {
        if (a.finished && !b.finished) return -1;
        if (!a.finished && b.finished) return 1;
        if (a.finished && b.finished) return (a.finishPosition ?? 0) - (b.finishPosition ?? 0);
        return b.distanceMeters - a.distanceMeters;
      });
    } else if (config.subMode === "elimination") {
      active.sort((a, b) => b.distanceMeters - a.distanceMeters);
    } else if (config.subMode === "heartzone" || config.subMode === "king") {
      active.sort((a, b) => b.points - a.points);
    }

    return [...active, ...eliminated];
  }

  const sorted = sortEntries(entries);
  const totalDurationSecs = config.durationMinutes * 60;
  const remainingSecs = Math.max(0, totalDurationSecs - elapsed);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "var(--bg)",
      display: "flex", flexDirection: "column",
      fontFamily: "var(--sans)",
      overflow: "hidden",
    }}>
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "20px 32px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: 1, color: "var(--accent2, #33DFFF)",
          }}>
            {config.subMode === "race" && "Race"}
            {config.subMode === "elimination" && "Elimination"}
            {config.subMode === "heartzone" && "Heart Zone"}
            {config.subMode === "king" && "King of the Hill"}
          </div>
          {isTeam && (
            <div style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 4,
              background: "rgba(255,255,255,0.06)", color: "var(--text)",
            }}>
              TEAM
            </div>
          )}
        </div>

        {/* Timer / countdown */}
        <div style={{ textAlign: "center" }}>
          {config.subMode === "race" && (
            <div style={{ fontSize: 28, fontWeight: 600, fontFamily: "var(--mono)", color: "var(--text-h)" }}>
              {formatDuration(elapsed)}
            </div>
          )}
          {config.subMode === "elimination" && (
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: 40, fontWeight: 700, fontFamily: "var(--mono)",
                color: elimCountdown <= 10 ? "#ef4444" : "var(--text-h)",
                transition: "color 0.3s",
              }}>
                {formatDuration(elimCountdown)}
              </div>
              <div style={{ fontSize: 11, color: "var(--text)", textTransform: "uppercase", letterSpacing: 1 }}>
                until elimination
              </div>
            </div>
          )}
          {(config.subMode === "heartzone" || config.subMode === "king") && (
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: 36, fontWeight: 700, fontFamily: "var(--mono)",
                color: remainingSecs <= 60 ? "#ef4444" : "var(--text-h)",
                transition: "color 0.3s",
              }}>
                {formatDuration(remainingSecs)}
              </div>
              <div style={{ fontSize: 11, color: "var(--text)", textTransform: "uppercase", letterSpacing: 1 }}>
                remaining
              </div>
            </div>
          )}
        </div>

        <div style={{ width: 100 }} /> {/* spacer for balance */}
      </div>

      {/* ── Heartzone target display ─────────────────────────────── */}
      {config.subMode === "heartzone" && (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          padding: "12px 32px",
          background: `${ZONE_COLORS[config.targetZone - 1]}18`,
          borderBottom: "1px solid var(--border)",
          gap: 12,
        }}>
          <div style={{
            fontSize: 15, fontWeight: 600,
            color: ZONE_COLORS[config.targetZone - 1],
          }}>
            Target: Zone {config.targetZone}
          </div>
          <div style={{ fontSize: 13, color: "var(--text)" }}>
            {getZoneBpmRange(config.targetZone, getMaxHrForClient())[0]}–{getZoneBpmRange(config.targetZone, getMaxHrForClient())[1]} bpm
          </div>
        </div>
      )}

      {/* ── King banner ──────────────────────────────────────────── */}
      {config.subMode === "king" && currentKing && (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          padding: "14px 32px",
          background: "rgba(255, 215, 0, 0.08)",
          borderBottom: "1px solid var(--border)",
          gap: 12,
        }}>
          <span style={{ fontSize: 24 }}>&#128081;</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#ffd700" }}>
            {isTeam ? currentKing : (clientProfiles[currentKing]?.name ?? currentKing.slice(0, 8))}
          </span>
          <span style={{ fontSize: 13, color: "var(--text)", fontFamily: "var(--mono)" }}>
            {formatDuration(kingStint)}
          </span>
        </div>
      )}

      {/* ── Winner banner (race) ─────────────────────────────────── */}
      {config.subMode === "race" && raceWinner && (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          padding: "16px 32px",
          background: "rgba(34, 197, 94, 0.12)",
          borderBottom: "1px solid var(--border)",
          gap: 12,
        }}>
          <span style={{ fontSize: 24 }}>&#127942;</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>
            {isTeam ? raceWinner : (clientProfiles[raceWinner]?.name ?? raceWinner.slice(0, 8))} wins!
          </span>
        </div>
      )}

      {/* ── Elimination winner banner ─────────────────────────────── */}
      {config.subMode === "elimination" && elimWinner && (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          padding: "16px 32px",
          background: "rgba(34, 197, 94, 0.12)",
          borderBottom: "1px solid var(--border)",
          gap: 12,
        }}>
          <span style={{ fontSize: 24 }}>&#127942;</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>
            {isTeam ? elimWinner : (clientProfiles[elimWinner]?.name ?? elimWinner.slice(0, 8))} wins!
          </span>
          <span style={{ fontSize: 14, color: "var(--text)" }}>Last one standing</span>
        </div>
      )}

      {/* ── Leaderboard ──────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflow: "auto",
        padding: "20px 32px",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 1100, margin: "0 auto" }}>
          {sorted.map((entry, idx) => {
            const isElimZone = config.subMode === "elimination"
              && !entry.eliminated
              && idx === sorted.filter((e) => !e.eliminated).length - 1
              && sorted.filter((e) => !e.eliminated).length > 1;

            return (
              <div
                key={entry.id}
                style={{
                  display: "flex", alignItems: "center", gap: 20,
                  background: entry.eliminated
                    ? "rgba(255,255,255,0.02)"
                    : isElimZone
                      ? "rgba(239, 68, 68, 0.08)"
                      : "var(--code-bg)",
                  borderRadius: 10,
                  padding: "16px 24px",
                  border: entry.eliminated
                    ? "1px solid rgba(255,255,255,0.04)"
                    : isElimZone
                      ? "1px solid rgba(239, 68, 68, 0.3)"
                      : entry.id === currentKing
                        ? "1px solid rgba(255, 215, 0, 0.4)"
                        : "1px solid var(--border)",
                  opacity: entry.eliminated ? 0.4 : 1,
                  transition: "all 0.5s ease, transform 0.5s ease",
                }}
              >
                {/* Position */}
                <div style={{
                  width: 32, textAlign: "center",
                  fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)",
                  color: entry.finished && entry.finishPosition
                    ? (entry.finishPosition === 1 ? "#ffd700" : entry.finishPosition === 2 ? "#c0c0c0" : "#cd7f32")
                    : entry.eliminated
                      ? "#666"
                      : "var(--text)",
                }}>
                  {entry.finished && entry.finishPosition
                    ? `#${entry.finishPosition}`
                    : entry.eliminated && entry.eliminatedPosition
                      ? `#${entry.eliminatedPosition}`
                      : `${idx + 1}`}
                </div>

                {/* Avatar / color */}
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: entry.eliminated ? "#555" : entry.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: "#fff",
                  flexShrink: 0,
                  transition: "background 0.4s",
                }}>
                  {entry.id === currentKing ? "👑" : getInitials(entry.name)}
                </div>

                {/* Name + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 16, fontWeight: 600,
                    color: entry.eliminated ? "#666" : "var(--text-h)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {entry.name}
                    {entry.finished && (
                      <span style={{ fontSize: 12, color: "#22c55e", marginLeft: 8 }}>FINISHED</span>
                    )}
                    {entry.eliminated && (
                      <span style={{ fontSize: 12, color: "#ef4444", marginLeft: 8 }}>ELIMINATED</span>
                    )}
                  </div>

                  {/* Sub-mode specific info line */}
                  {config.subMode === "race" && !entry.finished && (
                    <div style={{ fontSize: 12, color: "var(--text)", marginTop: 2 }}>
                      {(config.targetDistanceKm - entry.distanceKm).toFixed(2)} km to go
                    </div>
                  )}
                  {config.subMode === "heartzone" && entry.inZone !== undefined && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        background: entry.inZone ? `${ZONE_COLORS[config.targetZone - 1]}30` : "rgba(255,255,255,0.06)",
                        color: entry.inZone ? ZONE_COLORS[config.targetZone - 1] : "#888",
                      }}>
                        {entry.inZone ? "In zone" : "Out of zone"}
                      </span>
                      {entry.heartRate > 0 && (
                        <span style={{ fontSize: 12, color: "var(--text)", marginLeft: 8 }}>
                          {entry.heartRate} bpm
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Race: progress bar */}
                {config.subMode === "race" && (
                  <div style={{ width: 320, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{
                      height: 8, borderRadius: 4,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 4,
                        width: `${Math.min(100, (entry.distanceKm / config.targetDistanceKm) * 100)}%`,
                        background: entry.finished ? "#22c55e" : entry.color,
                        transition: "width 0.6s ease",
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text)", textAlign: "right", fontFamily: "var(--mono)" }}>
                      {entry.distanceKm.toFixed(2)} / {config.targetDistanceKm} km
                    </div>
                  </div>
                )}

                {/* Elimination / general: distance */}
                {config.subMode === "elimination" && (
                  <div style={{ textAlign: "right", minWidth: 80 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text-h)" }}>
                      {entry.distanceKm.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text)" }}>km</div>
                  </div>
                )}

                {/* Heartzone: points */}
                {config.subMode === "heartzone" && (
                  <div style={{ textAlign: "right", minWidth: 80 }}>
                    <div style={{
                      fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)",
                      color: entry.inZone ? ZONE_COLORS[config.targetZone - 1] : "var(--text-h)",
                      transition: "color 0.3s",
                    }}>
                      {entry.points}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text)" }}>pts</div>
                  </div>
                )}

                {/* King: points + king bar */}
                {config.subMode === "king" && (
                  <div style={{ textAlign: "right", minWidth: 100 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text-h)" }}>
                      {entry.points}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text)", marginBottom: 4 }}>pts</div>
                    {elapsed > 0 && (
                      <div style={{
                        height: 4, borderRadius: 2,
                        background: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                        width: 80,
                        marginLeft: "auto",
                      }}>
                        <div style={{
                          height: "100%", borderRadius: 2,
                          width: `${Math.min(100, (entry.points / Math.max(1, elapsed)) * 100)}%`,
                          background: "#ffd700",
                          transition: "width 0.6s ease",
                        }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: "14px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid var(--border)",
      }}>
        <div style={{ fontSize: 13, color: "var(--text)" }}>
          {clients.length} runner{clients.length !== 1 ? "s" : ""}
          {config.subMode === "elimination" && ` · ${sorted.filter((e) => !e.eliminated).length} remaining`}
        </div>
        <div style={{
          fontSize: 24, fontWeight: 600, fontFamily: "var(--mono)",
          color: "var(--text-h)",
        }}>
          {formatDuration(elapsed)}
        </div>
      </div>

      {/* End button */}
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

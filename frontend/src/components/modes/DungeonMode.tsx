import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientProfile, RealmRole, WearableData } from "../../types/session";
import type { DungeonConfig, DungeonDifficulty } from "../lobbies/DungeonLobby";
import type { ClientSummary, RealmSummary } from "../../hooks/useSessionHub";
import { CADENCE_WINDOW_MS, getZoneForHr, getMaxHrForAge, getStrideFactor, estimateCaloriesPerSecond } from "../../utils/wearable";

// ── Types ──────────────────────────────────────────────────────────────────

type RoomType = "empty" | "enemy" | "trap" | "rest" | "treasure" | "boss";

interface Room {
  type: RoomType;
  label: string;
}

interface ClientTracker {
  prevSteps: number;
  heartRate: number;
  stepWindow: { time: number; steps: number }[];
  cadence: number;
  lastStepTime: number;
  restHrBelowSince: number | null;
  restReady: boolean;
  enduranceHrAboveSince: number | null;
  enduranceReady: boolean;
  // Summary tracking
  steps: number;
  hrSum: number;
  hrCount: number;
  maxHr: number;
  distanceMeters: number;
  timeInZone: Record<string, number>;
  cadenceSum: number;
  cadenceCount: number;
  lastDataTime: number;
  caloriesBurned: number;
  speedSum: number;
  speedCount: number;
  peakSpeedKmh: number;
}

interface GameState {
  phase: "corridor" | "room" | "complete";
  currentRoom: number;
  corridorSteps: number;
  corridorTarget: number;
  enemyHp: number;
  enemyMaxHp: number;
  lowCadenceSince: number | null;
  trapSafeSteps: number;
  trapSafeTarget: number;
  trapDamage: number;
  trapDamageLimit: number;
  trapCadenceMin: number;
  trapCadenceMax: number;
  treasureStartTime: number | null;
  treasureDuration: number;
  treasureSteps: number;
  treasureMediumThreshold: number;
  treasureLargeThreshold: number;
  bossPhase: number;
  bossHp: number;
  bossMaxHp: number;
  bossTrapSafe: number;
  bossTrapSafeTarget: number;
  bossTrapDamage: number;
  bossTrapDamageLimit: number;
  bossTrapCadenceMin: number;
  bossTrapCadenceMax: number;
  bossLowCadenceSince: number | null;
  stepReductionBuff: boolean;
  hpReductionBuff: boolean;
  totalPooledSteps: number;
  lastCalorieMilestone: number;
  calorieBurstStored: number;
}

interface Display {
  phase: "corridor" | "room" | "complete";
  currentRoom: number;
  rooms: Room[];
  corridorProgress: number;
  teamCadence: number;
  totalSteps: number;
  enemyHp: number;
  enemyMaxHp: number;
  enemyRegen: boolean;
  trapSafeSteps: number;
  trapSafeTarget: number;
  trapDamage: number;
  trapDamageLimit: number;
  trapCadenceMin: number;
  trapCadenceMax: number;
  trapInWindow: boolean;
  restClients: { name: string; ready: boolean; hr: number; holdSeconds: number; holdTarget: number; hrThreshold: number; idle: boolean }[];
  treasureTimeLeft: number;
  treasureSteps: number;
  treasureMediumThreshold: number;
  treasureLargeThreshold: number;
  bossPhase: number;
  bossHp: number;
  bossMaxHp: number;
  bossTrapSafe: number;
  bossTrapSafeTarget: number;
  bossTrapDamage: number;
  bossTrapDamageLimit: number;
  bossTrapCadenceMin: number;
  bossTrapCadenceMax: number;
  bossInWindow: boolean;
  bossEnduranceClients: { name: string; ready: boolean; hr: number; holdSeconds: number; holdTarget: number; hrThreshold: number }[];
  clientStats: { name: string; cadence: number; hr: number; steps: number; calories: number }[];
  hasBuff: boolean;
  buffDesc: string;
  roomMessage: string;
  teamCalories: number;
  nextCalorieMilestone: number;
  calorieBurstStored: number;
}

// ── Difficulty scaling ─────────────────────────────────────────────────────

interface DifficultyParams {
  corridorTiles: number;
  enemyHp: number;
  trapCadenceMin: number;
  trapCadenceMax: number;
  trapSafeTarget: number;
  trapDamageLimit: number;
  restHrThreshold: number;
  restHoldSeconds: number;
  treasureDuration: number;
  bossHp: number;
  bossTrapCadenceMin: number;
  bossTrapCadenceMax: number;
  bossTrapSafeTarget: number;
  bossTrapDamageLimit: number;
  bossEnduranceSeconds: number;
  bossEnduranceHrThreshold: number;
}

function getDifficultyParams(difficulty: DungeonDifficulty, timeframe: number): DifficultyParams {
  // Base values tuned for 30-minute normal, 1 player (~3000 steps budget).
  // Step-based thresholds scale by timeframe/30.
  // Difficulty applies a multiplier to step thresholds and tightens/loosens cadence windows.
  const tf = timeframe / 30; // 15min=0.5, 30min=1, 45min=1.5, 60min=2

  const diffScale = difficulty === "easy" ? 0.7 : difficulty === "hard" ? 1.4 : 1.0;
  const s = tf * diffScale; // combined scale for step thresholds

  const base = {
    // Step-based (scale with timeframe × difficulty)
    corridorTiles: Math.max(1, Math.round(2 * s)),
    enemyHp: Math.round(250 * s),
    trapSafeTarget: Math.round(120 * s),
    trapDamageLimit: Math.round(80 * s),
    bossHp: Math.round(500 * s),
    bossTrapSafeTarget: Math.round(120 * s),
    bossTrapDamageLimit: Math.round(80 * s),

    // Time-based (scale with timeframe only, not difficulty)
    treasureDuration: Math.round(15 + tf * 5),
    restHoldSeconds: difficulty === "easy" ? 20 : difficulty === "hard" ? 40 : 30,
    bossEnduranceSeconds: difficulty === "easy" ? 30 : difficulty === "hard" ? 60 : 45,

    // Fixed thresholds (not step-based)
    restHrThreshold: 114,
    bossEnduranceHrThreshold: 133,
  };

  // Cadence windows: difficulty only (not timeframe)
  switch (difficulty) {
    case "easy":
      return {
        ...base,
        trapCadenceMin: 70,
        trapCadenceMax: 110,
        bossTrapCadenceMin: 75,
        bossTrapCadenceMax: 105,
      };
    case "hard":
      return {
        ...base,
        trapCadenceMin: 85,
        trapCadenceMax: 95,
        bossTrapCadenceMin: 88,
        bossTrapCadenceMax: 92,
      };
    default: // normal
      return {
        ...base,
        trapCadenceMin: 80,
        trapCadenceMax: 100,
        bossTrapCadenceMin: 85,
        bossTrapCadenceMax: 95,
      };
  }
}

// ── Room generation ────────────────────────────────────────────────────────

function getRoomCount(timeframe: number): number {
  if (timeframe <= 15) return 3;
  if (timeframe <= 30) return 5;
  if (timeframe <= 45) return 7;
  return 9;
}

const ROOM_LABELS: Record<RoomType, string> = {
  empty: "Empty Chamber",
  enemy: "Monster Den",
  trap: "Trap Corridor",
  rest: "Rest Shrine",
  treasure: "Treasure Vault",
  boss: "Boss Lair",
};

function generateDungeon(timeframe: number): Room[] {
  const count = getRoomCount(timeframe);
  const pool: RoomType[] = ["empty", "enemy", "trap", "rest", "treasure"];

  // Guarantee at least one of each key type
  const required: RoomType[] = ["enemy", "trap", "rest"];
  const picked: RoomType[] = [...required];

  while (picked.length < count) {
    picked.push(pool[Math.floor(Math.random() * pool.length)]);
  }

  // Shuffle until no consecutive duplicates and last room before boss is not enemy
  const rooms = shuffleNoConsecutive(picked);

  rooms.push({ type: "boss", label: ROOM_LABELS.boss });
  return rooms;
}

function shuffleNoConsecutive(types: RoomType[]): Room[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    // Fisher-Yates shuffle
    const arr = [...types];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    // Check: no consecutive same type, last is not enemy
    let valid = arr[arr.length - 1] !== "enemy";
    if (valid) {
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] === arr[i - 1]) { valid = false; break; }
      }
    }
    if (valid) {
      return arr.map((type) => ({ type, label: ROOM_LABELS[type] }));
    }
  }

  // Fallback: just return whatever we have
  return types.map((type) => ({ type, label: ROOM_LABELS[type] }));
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  latestData: WearableData | null;
  config: DungeonConfig;
  onEnd: (totalDistanceMeters: number, overrides?: Partial<RealmSummary>) => void;
  role?: RealmRole;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STEPS_PER_TILE = 10;
const TICK_MS = 500;
const ENEMY_REGEN_CADENCE_THRESHOLD = 60;
const REST_IDLE_TIMEOUT_MS = 5000;
const ENEMY_REGEN_DELAY_MS = 5000;
const ENEMY_REGEN_PER_TICK = 5; // 10 HP/sec at 500ms ticks
/** Returns the lowest max HR across all clients in the dungeon (conservative for group challenges). */
function getDungeonMaxHr(clients: string[], clientProfiles: Record<string, import("../../types/session").ClientProfile>): number {
  const maxHrs = clients.map((cid) => getMaxHrForAge(clientProfiles[cid]?.age));
  return maxHrs.length > 0 ? Math.min(...maxHrs) : getMaxHrForAge(undefined);
}

// ── Component ──────────────────────────────────────────────────────────────

export function DungeonMode({ clients, clientProfiles, latestData, config, onEnd, role = "host" }: Props) {
  const params = useRef(getDifficultyParams(config.difficulty, config.timeframe));
  const rooms = useRef<Room[]>([]);
  const gs = useRef<GameState | null>(null);
  const trackers = useRef<Map<string, ClientTracker>>(new Map());
  const [display, setDisplay] = useState<Display | null>(null);
  const [burstNotification, setBurstNotification] = useState<string | null>(null);
  const initRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  // Auto-clear burst notification after 3 seconds
  useEffect(() => {
    if (!burstNotification) return;
    const t = setTimeout(() => setBurstNotification(null), 3000);
    return () => clearTimeout(t);
  }, [burstNotification]);

  // Initialize dungeon on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const p = params.current;
    const generatedRooms = generateDungeon(config.timeframe);
    rooms.current = generatedRooms;

    gs.current = {
      phase: "corridor",
      currentRoom: 0,
      corridorSteps: 0,
      corridorTarget: p.corridorTiles * STEPS_PER_TILE * Math.max(1, clients.length),
      enemyHp: 0,
      enemyMaxHp: 0,
      lowCadenceSince: null,
      trapSafeSteps: 0,
      trapSafeTarget: 0,
      trapDamage: 0,
      trapDamageLimit: 0,
      trapCadenceMin: 0,
      trapCadenceMax: 0,
      treasureStartTime: null,
      treasureDuration: p.treasureDuration * 1000,
      treasureSteps: 0,
      treasureMediumThreshold: 300,
      treasureLargeThreshold: 600,
      bossPhase: 0,
      bossHp: 0,
      bossMaxHp: 0,
      bossTrapSafe: 0,
      bossTrapSafeTarget: 0,
      bossTrapDamage: 0,
      bossTrapDamageLimit: 0,
      bossTrapCadenceMin: 0,
      bossTrapCadenceMax: 0,
      bossLowCadenceSince: null,
      stepReductionBuff: false,
      hpReductionBuff: false,
      totalPooledSteps: 0,
      lastCalorieMilestone: 0,
      calorieBurstStored: 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only init
  }, []);

  // Scale pooled-step thresholds by number of active clients.
  // Base values are tuned for 1 player; more players = proportionally higher targets.
  const playerScale = useCallback((): number => {
    const count = clients.length > 0 ? clients.length : Math.max(1, trackers.current.size);
    return count;
  }, [clients]);

  // Get or create tracker for a client
  const getTracker = useCallback((clientId: string): ClientTracker => {
    let t = trackers.current.get(clientId);
    if (!t) {
      t = {
        prevSteps: -1,
        heartRate: 0,
        stepWindow: [],
        cadence: 0,
        lastStepTime: Date.now(),
        restHrBelowSince: null,
        restReady: false,
        enduranceHrAboveSince: null,
        enduranceReady: false,
        steps: 0,
        hrSum: 0,
        hrCount: 0,
        maxHr: 0,
        distanceMeters: 0,
        timeInZone: {},
        cadenceSum: 0,
        cadenceCount: 0,
        lastDataTime: 0,
        caloriesBurned: 0,
        speedSum: 0,
        speedCount: 0,
        peakSpeedKmh: 0,
      };
      trackers.current.set(clientId, t);
    }
    return t;
  }, []);

  const initBossPhase = useCallback((phase: number) => {
    const g = gs.current!;
    const p = params.current;
    const scale = playerScale();
    g.bossPhase = phase;

    if (phase === 0) {
      let hp = p.bossHp * scale;
      if (g.hpReductionBuff) {
        hp = Math.round(hp * 0.8);
        g.hpReductionBuff = false;
      }
      g.bossMaxHp = hp;
      g.bossHp = hp;
      g.bossLowCadenceSince = null;
    } else if (phase === 1) {
      g.bossTrapSafe = 0;
      g.bossTrapSafeTarget = Math.round(p.bossTrapSafeTarget * scale * (g.stepReductionBuff ? 0.9 : 1));
      g.stepReductionBuff = false;
      g.bossTrapDamage = 0;
      g.bossTrapDamageLimit = Math.round(p.bossTrapDamageLimit * scale);
      g.bossTrapCadenceMin = p.bossTrapCadenceMin;
      g.bossTrapCadenceMax = p.bossTrapCadenceMax;
    } else if (phase === 2) {
      for (const t of trackers.current.values()) {
        t.enduranceHrAboveSince = null;
        t.enduranceReady = false;
      }
    }
  }, [playerScale]);

  // Enter a room: initialize room-specific state
  const enterRoom = useCallback(() => {
    const g = gs.current!;
    const p = params.current;
    const room = rooms.current[g.currentRoom];
    const scale = playerScale();
    g.phase = "room";

    switch (room.type) {
      case "empty":
        // Immediately cleared in next tick
        break;
      case "enemy": {
        let hp = p.enemyHp * scale;
        if (g.hpReductionBuff) {
          hp = Math.round(hp * 0.8);
          g.hpReductionBuff = false;
        }
        g.enemyMaxHp = hp;
        g.enemyHp = hp;
        g.lowCadenceSince = null;
        if (g.calorieBurstStored > 0) {
          const burstDmg = Math.round(hp * 0.15);
          g.enemyHp = Math.max(0, g.enemyHp - burstDmg);
          g.calorieBurstStored--;
          setBurstNotification(`Stored Calorie Burst! ${burstDmg} damage to enemy!`);
        }
        break;
      }
      case "trap":
        g.trapSafeSteps = 0;
        g.trapSafeTarget = Math.round(p.trapSafeTarget * scale * (g.stepReductionBuff ? 0.9 : 1));
        g.stepReductionBuff = false;
        g.trapDamage = 0;
        g.trapDamageLimit = Math.round(p.trapDamageLimit * scale);
        g.trapCadenceMin = p.trapCadenceMin;
        g.trapCadenceMax = p.trapCadenceMax;
        break;
      case "rest":
        for (const t of trackers.current.values()) {
          t.restHrBelowSince = null;
          t.restReady = false;
        }
        break;
      case "treasure": {
        const s = playerScale();
        g.treasureStartTime = Date.now();
        g.treasureSteps = 0;
        g.treasureMediumThreshold = 300 * s;
        g.treasureLargeThreshold = 600 * s;
        break;
      }
      case "boss":
        g.bossPhase = 0;
        initBossPhase(0);
        if (g.calorieBurstStored > 0) {
          const burstDmg = Math.round(g.bossMaxHp * 0.15);
          g.bossHp = Math.max(0, g.bossHp - burstDmg);
          g.calorieBurstStored--;
          setBurstNotification(`Stored Calorie Burst! ${burstDmg} damage to boss!`);
        }
        break;
    }
  }, [playerScale, initBossPhase]);

  // Advance to the next room (back to corridor, or complete)
  const advanceRoom = useCallback(() => {
    const g = gs.current!;
    g.currentRoom++;

    if (g.currentRoom >= rooms.current.length) {
      g.phase = "complete";
      return;
    }

    g.phase = "corridor";
    g.corridorSteps = 0;
    const scale = playerScale();
    let target = params.current.corridorTiles * STEPS_PER_TILE * scale;
    target = g.stepReductionBuff ? Math.round(target * 0.9) : Math.round(target);
    if (g.calorieBurstStored > 0) {
      const skip = Math.round(target * 0.25);
      target -= skip;
      g.calorieBurstStored--;
      setBurstNotification(`Stored Calorie Burst! Skipped ${skip} corridor steps!`);
    }
    g.corridorTarget = target;
  }, [playerScale]);

  // Process incoming wearable data
  useEffect(() => {
    if (!latestData || !gs.current) return;

    const g = gs.current;
    if (g.phase === "complete") return;

    const t = getTracker(latestData.clientId);
    t.heartRate = latestData.heartRate;

    const now = Date.now();
    const prevDataTime = t.lastDataTime;
    t.lastDataTime = now;

    // Track heart-rate summary metrics on every data point
    if (latestData.heartRate > 0) {
      t.hrSum += latestData.heartRate;
      t.hrCount++;
      t.maxHr = Math.max(t.maxHr, latestData.heartRate);
      const zone = getZoneForHr(latestData.heartRate);
      t.timeInZone[zone] = (t.timeInZone[zone] ?? 0) + 1;
    }

    // Accumulate calories based on time delta between data events
    const profile = clientProfiles[latestData.clientId];
    if (profile?.weightKg && profile?.age) {
      const timeDelta = prevDataTime > 0 ? Math.min((now - prevDataTime) / 1000, 5) : 1;
      t.caloriesBurned += estimateCaloriesPerSecond(latestData.heartRate, profile.weightKg, profile.age) * timeDelta;
    }

    // First data point for this client — just record baseline
    if (t.prevSteps < 0) {
      t.prevSteps = latestData.steps;
      t.stepWindow.push({ time: now, steps: latestData.steps });
      return;
    }

    const stepDelta = Math.max(0, latestData.steps - t.prevSteps);
    t.prevSteps = latestData.steps;
    if (stepDelta > 0) t.lastStepTime = now;

    // Update cadence window
    t.stepWindow.push({ time: now, steps: latestData.steps });
    t.stepWindow = t.stepWindow.filter((e) => now - e.time <= CADENCE_WINDOW_MS);

    if (t.stepWindow.length >= 2) {
      const oldest = t.stepWindow[0];
      const newest = t.stepWindow[t.stepWindow.length - 1];
      const dt = (newest.time - oldest.time) / 1000;
      const ds = newest.steps - oldest.steps;
      t.cadence = dt > 0 ? (ds / dt) * 60 : 0;
    }

    // Track per-player step/distance/cadence summary
    t.steps += stepDelta;
    if (stepDelta > 0) {
      const height = clientProfiles[latestData.clientId]?.heightCm ?? 170;
      t.distanceMeters += stepDelta * height * getStrideFactor(clientProfiles[latestData.clientId]);
    }
    // Speed tracking
    if (latestData.speedKmh > 0) {
      t.speedSum += latestData.speedKmh;
      t.speedCount++;
      if (latestData.speedKmh > t.peakSpeedKmh) t.peakSpeedKmh = latestData.speedKmh;
    }
    if (t.cadence > 0) {
      t.cadenceSum += t.cadence;
      t.cadenceCount++;
    }

    g.totalPooledSteps += stepDelta;

    if (stepDelta === 0) return;

    if (g.phase === "corridor") {
      g.corridorSteps += stepDelta;
    } else if (g.phase === "room") {
      const room = rooms.current[g.currentRoom];
      // Inline room step processing to avoid hoisting issues
      switch (room.type) {
        case "enemy":
          g.enemyHp = Math.max(0, g.enemyHp - stepDelta);
          break;
        case "trap": {
          const inWindow = t.cadence >= g.trapCadenceMin && t.cadence <= g.trapCadenceMax;
          if (inWindow) {
            g.trapSafeSteps += stepDelta;
          } else {
            g.trapDamage += stepDelta;
          }
          break;
        }
        case "rest":
          // Steps ignored in rest rooms
          break;
        case "treasure":
          g.treasureSteps += stepDelta;
          break;
        case "boss":
          if (g.bossPhase === 0) {
            g.bossHp = Math.max(0, g.bossHp - stepDelta);
          } else if (g.bossPhase === 1) {
            const inWindow = t.cadence >= g.bossTrapCadenceMin && t.cadence <= g.bossTrapCadenceMax;
            if (inWindow) {
              g.bossTrapSafe += stepDelta;
            } else {
              g.bossTrapDamage += stepDelta;
            }
          }
          // Phase 2: steps are counted but don't affect completion
          break;
      }
    }
  }, [latestData, getTracker, clientProfiles]);

  const getTeamCadence = useCallback((): number => {
    let total = 0;
    for (const t of trackers.current.values()) {
      total += t.cadence;
    }
    return total;
  }, []);

  const updateDisplay = useCallback(() => {
    const g = gs.current!;
    const room = rooms.current[g.currentRoom] ?? rooms.current[rooms.current.length - 1];
    const p = params.current;
    const teamCadence = getTeamCadence();
    const now = Date.now();

    const activeClients = clients.length > 0 ? clients : [...trackers.current.keys()];

    const restClients = activeClients.map((cid) => {
      const t = getTracker(cid);
      const profile = clientProfiles[cid];
      let holdSeconds = 0;
      if (t.restReady) {
        holdSeconds = p.restHoldSeconds;
      } else if (t.restHrBelowSince !== null) {
        holdSeconds = Math.min(p.restHoldSeconds, (now - t.restHrBelowSince) / 1000);
      }
      return {
        name: profile?.name || cid,
        ready: t.restReady,
        hr: t.heartRate,
        holdSeconds: Math.round(holdSeconds * 10) / 10,
        holdTarget: p.restHoldSeconds,
        hrThreshold: p.restHrThreshold,
        idle: !t.restReady && now - t.lastStepTime > REST_IDLE_TIMEOUT_MS,
      };
    });

    const enduranceClients = activeClients.map((cid) => {
      const t = getTracker(cid);
      const profile = clientProfiles[cid];
      let holdSeconds = 0;
      if (t.enduranceReady) {
        holdSeconds = p.bossEnduranceSeconds;
      } else if (t.enduranceHrAboveSince !== null) {
        holdSeconds = Math.min(p.bossEnduranceSeconds, (now - t.enduranceHrAboveSince) / 1000);
      }
      return {
        name: profile?.name || cid,
        ready: t.enduranceReady,
        hr: t.heartRate,
        holdSeconds: Math.round(holdSeconds * 10) / 10,
        holdTarget: p.bossEnduranceSeconds,
        hrThreshold: Math.round(getDungeonMaxHr(clients, clientProfiles) * 0.7),
      };
    });

    const clientStats = activeClients.map((cid) => {
      const t = getTracker(cid);
      const profile = clientProfiles[cid];
      return { name: profile?.name || cid, cadence: Math.round(t.cadence), hr: t.heartRate, steps: t.prevSteps, calories: Math.round(t.caloriesBurned) };
    });

    const treasureTimeLeft =
      g.treasureStartTime !== null
        ? Math.max(0, g.treasureDuration - (now - g.treasureStartTime))
        : g.treasureDuration;

    const hasBuff = g.stepReductionBuff || g.hpReductionBuff || g.calorieBurstStored > 0;
    const buffParts: string[] = [];
    if (g.stepReductionBuff) buffParts.push("Step threshold -10%");
    if (g.hpReductionBuff) buffParts.push("Enemy HP -20%");
    if (g.calorieBurstStored > 0) buffParts.push("Calorie Burst x" + g.calorieBurstStored);

    let roomMessage = "";
    if (g.phase === "room") {
      switch (room.type) {
        case "empty":
          roomMessage = "An empty chamber... moving on.";
          break;
        case "enemy":
          roomMessage = g.enemyHp > 0
            ? (g.lowCadenceSince !== null ? "Keep moving! The enemy is regenerating!" : "Attack! Every step deals damage!")
            : "Enemy defeated!";
          break;
        case "trap":
          roomMessage = `Keep cadence between ${g.trapCadenceMin}–${g.trapCadenceMax} spm`;
          break;
        case "rest":
          roomMessage = `Lower HR below ${p.restHrThreshold} bpm for ${p.restHoldSeconds}s — keep walking!`;
          break;
        case "treasure":
          roomMessage = "Collect as many steps as you can!";
          break;
        case "boss":
          if (g.bossPhase === 0) roomMessage = g.bossHp > 0 ? "Strike! Every step damages the boss!" : "Boss staggered!";
          else if (g.bossPhase === 1) roomMessage = `Keep cadence ${g.bossTrapCadenceMin}–${g.bossTrapCadenceMax} spm`;
          else roomMessage = `Raise HR above ${Math.round(getDungeonMaxHr(clients, clientProfiles) * 0.7)} bpm!`;
          break;
      }
    } else if (g.phase === "corridor") {
      roomMessage = "Walk to reach the next room...";
    } else if (g.phase === "complete") {
      roomMessage = "Dungeon cleared!";
    }

    let trapInWindow = false;
    if (room.type === "trap") {
      trapInWindow = teamCadence >= g.trapCadenceMin && teamCadence <= g.trapCadenceMax;
    }

    let bossInWindow = false;
    if (room.type === "boss" && g.bossPhase === 1) {
      bossInWindow = teamCadence >= g.bossTrapCadenceMin && teamCadence <= g.bossTrapCadenceMax;
    }

    setDisplay({
      phase: g.phase,
      currentRoom: g.currentRoom,
      rooms: rooms.current,
      corridorProgress: g.corridorTarget > 0 ? Math.min(1, g.corridorSteps / g.corridorTarget) : 0,
      teamCadence: Math.round(teamCadence),
      totalSteps: g.totalPooledSteps,
      enemyHp: g.enemyHp,
      enemyMaxHp: g.enemyMaxHp,
      enemyRegen: g.lowCadenceSince !== null && Date.now() - g.lowCadenceSince > ENEMY_REGEN_DELAY_MS,
      trapSafeSteps: g.trapSafeSteps,
      trapSafeTarget: g.trapSafeTarget,
      trapDamage: g.trapDamage,
      trapDamageLimit: g.trapDamageLimit,
      trapCadenceMin: g.trapCadenceMin,
      trapCadenceMax: g.trapCadenceMax,
      trapInWindow,
      restClients,
      treasureTimeLeft: Math.round(treasureTimeLeft / 1000),
      treasureSteps: g.treasureSteps,
      treasureMediumThreshold: g.treasureMediumThreshold,
      treasureLargeThreshold: g.treasureLargeThreshold,
      bossPhase: g.bossPhase,
      bossHp: g.bossHp,
      bossMaxHp: g.bossMaxHp,
      bossTrapSafe: g.bossTrapSafe,
      bossTrapSafeTarget: g.bossTrapSafeTarget,
      bossTrapDamage: g.bossTrapDamage,
      bossTrapDamageLimit: g.bossTrapDamageLimit,
      bossTrapCadenceMin: g.bossTrapCadenceMin,
      bossTrapCadenceMax: g.bossTrapCadenceMax,
      bossInWindow,
      bossEnduranceClients: enduranceClients,
      clientStats,
      hasBuff,
      buffDesc: buffParts.join(" + "),
      roomMessage,
      teamCalories: Math.round([...trackers.current.values()].reduce((sum, t) => sum + t.caloriesBurned, 0)),
      nextCalorieMilestone: g.lastCalorieMilestone + 100,
      calorieBurstStored: g.calorieBurstStored,
    });
  }, [clients, clientProfiles, getTracker, getTeamCadence]);

  // Game tick: check conditions, transitions, regen
  useEffect(() => {
    const timer = setInterval(() => {
      const g = gs.current;
      if (!g || g.phase === "complete") return;

      const now = Date.now();
      const p = params.current;

      // Corridor → room transition
      if (g.phase === "corridor" && g.corridorSteps >= g.corridorTarget) {
        enterRoom();
      }

      // Room logic
      if (g.phase === "room") {
        const room = rooms.current[g.currentRoom];

        switch (room.type) {
          case "empty":
            advanceRoom();
            break;

          case "enemy": {
            if (g.enemyHp <= 0) {
              advanceRoom();
              break;
            }
            // Regen check: team cadence below threshold
            const teamCadence = getTeamCadence();
            if (teamCadence < ENEMY_REGEN_CADENCE_THRESHOLD) {
              if (g.lowCadenceSince === null) {
                g.lowCadenceSince = now;
              } else if (now - g.lowCadenceSince > ENEMY_REGEN_DELAY_MS) {
                g.enemyHp = Math.min(g.enemyMaxHp, g.enemyHp + ENEMY_REGEN_PER_TICK);
              }
            } else {
              g.lowCadenceSince = null;
            }
            break;
          }

          case "trap":
            if (g.trapSafeSteps >= g.trapSafeTarget) {
              advanceRoom();
              break;
            }
            if (g.trapDamage >= g.trapDamageLimit) {
              // Reset the room
              g.trapSafeSteps = 0;
              g.trapDamage = 0;
            }
            break;

          case "rest": {
            const activeClients = clients.length > 0 ? clients : [...trackers.current.keys()];
            let allReady = activeClients.length > 0;
            for (const cid of activeClients) {
              const t = getTracker(cid);
              if (t.restReady) continue;

              // Must keep walking — idle for >5s resets hold timer
              const idle = now - t.lastStepTime > REST_IDLE_TIMEOUT_MS;
              if (idle) {
                t.restHrBelowSince = null;
              } else if (t.heartRate > 0 && t.heartRate < p.restHrThreshold) {
                if (t.restHrBelowSince === null) {
                  t.restHrBelowSince = now;
                } else if (now - t.restHrBelowSince >= p.restHoldSeconds * 1000) {
                  t.restReady = true;
                }
              } else {
                t.restHrBelowSince = null;
              }
              if (!t.restReady) allReady = false;
            }
            if (allReady && activeClients.length > 0) {
              advanceRoom();
            }
            break;
          }

          case "treasure": {
            if (g.treasureStartTime === null) break;
            const elapsed = now - g.treasureStartTime;
            if (elapsed >= g.treasureDuration) {
              // Award buffs based on step count (thresholds scaled by player count)
              const steps = g.treasureSteps;
              if (steps >= g.treasureLargeThreshold) {
                g.stepReductionBuff = true;
                g.hpReductionBuff = true;
              } else if (steps >= g.treasureMediumThreshold) {
                g.hpReductionBuff = true;
              } else {
                g.stepReductionBuff = true;
              }
              advanceRoom();
            }
            break;
          }

          case "boss": {
            if (g.bossPhase === 0) {
              if (g.bossHp <= 0) {
                initBossPhase(1);
                break;
              }
              const teamCadence = getTeamCadence();
              if (teamCadence < ENEMY_REGEN_CADENCE_THRESHOLD) {
                if (g.bossLowCadenceSince === null) {
                  g.bossLowCadenceSince = now;
                } else if (now - g.bossLowCadenceSince > ENEMY_REGEN_DELAY_MS) {
                  g.bossHp = Math.min(g.bossMaxHp, g.bossHp + ENEMY_REGEN_PER_TICK);
                }
              } else {
                g.bossLowCadenceSince = null;
              }
            } else if (g.bossPhase === 1) {
              if (g.bossTrapSafe >= g.bossTrapSafeTarget) {
                initBossPhase(2);
                break;
              }
              if (g.bossTrapDamage >= g.bossTrapDamageLimit) {
                g.bossTrapSafe = 0;
                g.bossTrapDamage = 0;
              }
            } else if (g.bossPhase === 2) {
              const activeClients = clients.length > 0 ? clients : [...trackers.current.keys()];
              let allReady = activeClients.length > 0;
              for (const cid of activeClients) {
                const t = getTracker(cid);
                if (t.enduranceReady) continue;
                const hrThreshold = getDungeonMaxHr(clients, clientProfiles) * 0.7;
                if (t.heartRate >= hrThreshold) {
                  if (t.enduranceHrAboveSince === null) {
                    t.enduranceHrAboveSince = now;
                  } else if (now - t.enduranceHrAboveSince >= p.bossEnduranceSeconds * 1000) {
                    t.enduranceReady = true;
                  }
                } else {
                  t.enduranceHrAboveSince = null;
                }
                if (!t.enduranceReady) allReady = false;
              }
              if (allReady && activeClients.length > 0) {
                advanceRoom();
              }
            }
            break;
          }
        }
      }

      // Calorie burst milestone check
      const teamCalories = [...trackers.current.values()].reduce((sum, t) => sum + t.caloriesBurned, 0);
      if (teamCalories >= g.lastCalorieMilestone + 100) {
        g.lastCalorieMilestone += 100;
        const room = g.phase === "room" ? rooms.current[g.currentRoom] : null;

        if (g.phase === "room" && room?.type === "enemy" && g.enemyHp > 0) {
          const burstDmg = Math.round(g.enemyMaxHp * 0.15);
          g.enemyHp = Math.max(0, g.enemyHp - burstDmg);
          setBurstNotification(`Calorie Burst! ${burstDmg} damage to enemy!`);
        } else if (g.phase === "room" && room?.type === "boss" && g.bossPhase === 0 && g.bossHp > 0) {
          const burstDmg = Math.round(g.bossMaxHp * 0.15);
          g.bossHp = Math.max(0, g.bossHp - burstDmg);
          setBurstNotification(`Calorie Burst! ${burstDmg} damage to boss!`);
        } else if (g.phase === "corridor" && g.corridorSteps < g.corridorTarget) {
          const skip = Math.round((g.corridorTarget - g.corridorSteps) * 0.25);
          g.corridorSteps += skip;
          setBurstNotification(`Calorie Burst! Skipped ${skip} corridor steps!`);
        } else {
          g.calorieBurstStored++;
          setBurstNotification(`Calorie Burst stored! (x${g.calorieBurstStored}) — will activate on next enemy or corridor`);
        }
      }

      // Update display
      updateDisplay();
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [clients, enterRoom, advanceRoom, getTracker, initBossPhase, getTeamCadence, updateDisplay]);

  const handleEnd = useCallback(() => {
    const allTrackers = trackers.current;

    const clientSummaries: ClientSummary[] = clients.map((cid) => {
      const t = allTrackers.get(cid);
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
    let totalDist = 0;
    let groupCalories = 0;
    const groupTimeInZone: Record<string, number> = {};
    for (const cs of clientSummaries) {
      groupSteps += cs.steps;
      totalDist += cs.distanceMeters;
      if (cs.averageHeartRate > 0) { groupHrSum += cs.averageHeartRate; groupHrCount++; }
      groupMaxHr = Math.max(groupMaxHr, cs.maxHeartRate);
      if (cs.avgCadenceSpm > 0) { groupCadenceSum += cs.avgCadenceSpm; groupCadenceCount++; }
      groupCalories += cs.caloriesBurned;
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

    // Approximate active period from tracker data
    const startTime = startTimeRef.current;
    const perSecondActive = new Set<number>();
    const elapsedSecs = Math.floor((Date.now() - startTime) / 1000);
    for (const cid of clients) {
      const t = allTrackers.get(cid);
      if (t && t.lastDataTime > 0) {
        const clientActiveSecs = Math.min(
          Math.floor((t.lastDataTime - startTime) / 1000),
          elapsedSecs
        );
        for (let s = 0; s <= clientActiveSecs; s++) perSecondActive.add(s);
      }
    }

    onEnd(Math.round(totalDist), {
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

  if (!display) return null;

  const currentRoomObj = display.rooms[display.currentRoom];

  return (
    <div style={{
      position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 100,
      background: "#0d0d0d", color: "#e0e0e0", display: "flex", flexDirection: "column",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.75rem 1rem", background: "rgba(0,0,0,0.5)", borderBottom: "1px solid #222",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.3rem" }}>&#128081;</span>
          <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>Dungeon</span>
          <span style={{ color: "#888", fontSize: "0.85rem" }}>
            {display.phase === "complete"
              ? "Complete"
              : `Room ${display.currentRoom + 1} / ${display.rooms.length}`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.8rem", color: "#FF5C75", background: "rgba(255,92,117,0.1)", padding: "0.2rem 0.6rem", borderRadius: "4px" }}>
            {display.teamCalories} / {display.nextCalorieMilestone} kcal
          </span>
          {display.hasBuff && (
            <span style={{ fontSize: "0.8rem", color: "#fbbf24", background: "rgba(251,191,36,0.1)", padding: "0.2rem 0.6rem", borderRadius: "4px" }}>
              {display.buffDesc}
            </span>
          )}
          {role !== "guest" && (
            <button
              onClick={() => onEnd(0)}
              style={{
                background: "rgba(255,61,90,0.15)", color: "#ff3d5a", border: "1px solid rgba(255,61,90,0.3)",
                borderRadius: "6px", padding: "0.4rem 0.8rem", fontSize: "0.85rem", cursor: "pointer",
              }}
            >
              End Realm
            </button>
          )}
        </div>
      </div>

      {/* Calorie burst notification */}
      {burstNotification && (
        <div style={{
          position: "absolute", top: "4.5rem", left: "50%", transform: "translateX(-50%)",
          zIndex: 200, padding: "0.6rem 1.5rem", borderRadius: "8px",
          background: "rgba(255,92,117,0.15)", border: "1px solid #FF5C75",
          boxShadow: "0 0 20px rgba(255,92,117,0.3)", color: "#FF5C75",
          fontWeight: 700, fontSize: "1rem", textAlign: "center",
          animation: "fadeIn 0.3s ease-out",
        }}>
          🔥 {burstNotification}
        </div>
      )}

      {/* Room progress bar */}
      <div style={{ display: "flex", padding: "0.5rem 1rem", gap: "3px", background: "#111" }}>
        {display.rooms.map((room, i) => {
          const isCurrent = i === display.currentRoom;
          const isCleared = i < display.currentRoom;
          let bg = "#1a1a1a";
          let border = "1px solid #333";
          if (isCleared) { bg = "rgba(34,197,94,0.2)"; border = "1px solid #22c55e"; }
          if (isCurrent) { bg = "rgba(51,223,255,0.15)"; border = "1px solid #33DFFF"; }

          return (
            <div key={i} style={{
              flex: 1, padding: "0.3rem 0", textAlign: "center", borderRadius: "4px",
              background: bg, border, fontSize: "0.65rem", color: isCurrent ? "#33DFFF" : isCleared ? "#22c55e" : "#555",
              transition: "all 0.3s",
            }}>
              {roomIcon(room.type)}
            </div>
          );
        })}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", overflow: "auto" }}>
        {display.phase === "complete" && <CompleteView display={display} onEnd={handleEnd} role={role} />}
        {display.phase === "corridor" && <CorridorView display={display} />}
        {display.phase === "room" && currentRoomObj && (
          <RoomView display={display} roomType={currentRoomObj.type} roomLabel={currentRoomObj.label} />
        )}
      </div>

      {/* Bottom stats */}
      <div style={{
        padding: "0.75rem 1rem", background: "rgba(0,0,0,0.5)", borderTop: "1px solid #222",
        display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: "0.5rem",
      }}>
        {display.clientStats.length === 0 ? (
          <span style={{ color: "#555" }}>Waiting for player data...</span>
        ) : display.clientStats.map((cs, i) => (
          <div key={i} style={{
            textAlign: "center", padding: "0.3rem 0.8rem", background: "#1a1a1a",
            borderRadius: "6px", border: "1px solid #2a2a2a", minWidth: "120px",
          }}>
            <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.15rem" }}>{cs.name}</div>
            <div style={{ fontSize: "0.75rem", color: "#888" }}>
              {cs.cadence} spm &middot; {cs.hr} bpm{cs.calories > 0 ? ` · ${cs.calories} kcal` : ""}
            </div>
          </div>
        ))}
        <div style={{ textAlign: "center", padding: "0.3rem 0.8rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#888" }}>Team cadence</div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#33DFFF" }}>{display.teamCadence} spm</div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-views ──────────────────────────────────────────────────────────────

function roomIcon(type: RoomType): string {
  switch (type) {
    case "empty": return "\u25CB";
    case "enemy": return "\u2694";
    case "trap": return "\u26A0";
    case "rest": return "\u2665";
    case "treasure": return "\u2605";
    case "boss": return "\u2620";
  }
}

function CorridorView({ display }: { display: Display }) {
  const pct = Math.round(display.corridorProgress * 100);
  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: "500px" }}>
      <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>&#128694;</div>
      <div style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "1rem" }}>{display.roomMessage}</div>
      <div style={{
        width: "100%", height: "24px", background: "#1a1a1a", borderRadius: "12px",
        border: "1px solid #333", overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #1a6b4a, #22c55e)",
          borderRadius: "12px", transition: "width 0.3s",
        }} />
      </div>
      <div style={{ color: "#888", fontSize: "0.85rem", marginTop: "0.5rem" }}>{pct}%</div>
    </div>
  );
}

function CompleteView({ display, onEnd, role = "host" }: { display: Display; onEnd: () => void; role?: RealmRole }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>&#127942;</div>
      <div style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "0.5rem", color: "#22c55e" }}>
        Dungeon Complete!
      </div>
      <div style={{ color: "#888", fontSize: "1rem", marginBottom: "1.5rem" }}>
        {display.totalSteps} total steps pooled
      </div>
      {role !== "guest" && (
        <button
          onClick={onEnd}
          style={{
            padding: "0.8rem 2rem", fontSize: "1.1rem", borderRadius: "8px", cursor: "pointer",
            background: "rgba(34,197,94,0.2)", color: "#22c55e", border: "1px solid #22c55e",
          }}
        >
          Finish
        </button>
      )}
    </div>
  );
}

function RoomView({ display, roomType, roomLabel }: { display: Display; roomType: RoomType; roomLabel: string }) {
  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: "500px" }}>
      <div style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>{roomIcon(roomType)}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.3rem" }}>{roomLabel}</div>
      <div style={{ color: "#aaa", fontSize: "0.9rem", marginBottom: "1.5rem" }}>{display.roomMessage}</div>

      {roomType === "enemy" && <EnemyRoom display={display} />}
      {roomType === "trap" && <TrapRoom display={display} />}
      {roomType === "rest" && <RestRoom display={display} />}
      {roomType === "treasure" && <TreasureRoom display={display} />}
      {roomType === "boss" && <BossRoom display={display} />}
    </div>
  );
}

function HpBar({ current, max, color, label }: { current: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
        <span>{label}</span>
        <span>{current} / {max}</span>
      </div>
      <div style={{ width: "100%", height: "20px", background: "#1a1a1a", borderRadius: "10px", border: "1px solid #333", overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: color,
          borderRadius: "10px", transition: "width 0.3s",
        }} />
      </div>
    </div>
  );
}

function EnemyRoom({ display }: { display: Display }) {
  return (
    <div>
      <HpBar current={display.enemyHp} max={display.enemyMaxHp} color="#ef4444" label="Enemy HP" />
      {display.enemyRegen && (
        <div style={{ color: "#fbbf24", fontSize: "0.85rem", marginTop: "0.5rem" }}>
          Enemy is regenerating! Speed up!
        </div>
      )}
    </div>
  );
}

function TrapRoom({ display }: { display: Display }) {
  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <div style={{
          display: "inline-block", padding: "0.3rem 1rem", borderRadius: "20px", fontSize: "1.5rem", fontWeight: 700,
          background: display.trapInWindow ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          color: display.trapInWindow ? "#22c55e" : "#ef4444",
          border: `2px solid ${display.trapInWindow ? "#22c55e" : "#ef4444"}`,
        }}>
          {display.teamCadence} spm
        </div>
        <div style={{ color: "#888", fontSize: "0.8rem", marginTop: "0.3rem" }}>
          Target: {display.trapCadenceMin}–{display.trapCadenceMax} spm
        </div>
      </div>
      <HpBar current={display.trapSafeSteps} max={display.trapSafeTarget} color="#22c55e" label="Safe Steps" />
      <HpBar current={display.trapDamage} max={display.trapDamageLimit} color="#ef4444" label="Trap Damage (resets room)" />
    </div>
  );
}

function RestRoom({ display }: { display: Display }) {
  return (
    <div>
      {display.restClients.map((c, i) => {
        const belowThreshold = c.hr > 0 && c.hr < c.hrThreshold;
        const overBy = c.hr - c.hrThreshold;
        const holdPct = c.holdTarget > 0 ? Math.min(100, (c.holdSeconds / c.holdTarget) * 100) : 0;
        const countdown = Math.max(0, c.holdTarget - c.holdSeconds);

        return (
          <div key={i} style={{
            padding: "0.6rem 0.75rem", margin: "0.4rem 0", borderRadius: "8px",
            background: c.ready ? "rgba(34,197,94,0.1)" : c.idle ? "rgba(251,191,36,0.08)" : "#1a1a1a",
            border: `1px solid ${c.ready ? "#22c55e" : c.idle ? "#fbbf24" : belowThreshold ? "#3b82f6" : "#333"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <span style={{
                fontSize: "1.1rem", fontWeight: 700,
                color: c.ready ? "#22c55e" : c.idle ? "#fbbf24" : belowThreshold ? "#3b82f6" : c.hr > 0 ? "#ef4444" : "#555",
              }}>
                {c.hr > 0 ? `${c.hr} bpm` : "No data"}
              </span>
            </div>

            {c.ready ? (
              <div style={{ color: "#22c55e", fontSize: "0.85rem", fontWeight: 600 }}>Ready</div>
            ) : c.idle ? (
              <div style={{ color: "#fbbf24", fontSize: "0.85rem", fontWeight: 600 }}>
                Keep walking! Timer paused.
              </div>
            ) : c.hr > 0 ? (
              <>
                {/* Hold progress bar */}
                <div style={{
                  width: "100%", height: "6px", background: "#333", borderRadius: "3px",
                  overflow: "hidden", marginBottom: "0.3rem",
                }}>
                  <div style={{
                    width: `${holdPct}%`,
                    height: "100%",
                    background: belowThreshold ? "#3b82f6" : "#ef4444",
                    borderRadius: "3px",
                    transition: "width 0.4s",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                  {belowThreshold ? (
                    <>
                      <span style={{ color: "#3b82f6" }}>Holding... {countdown.toFixed(1)}s left</span>
                      <span style={{ color: "#888" }}>{c.holdSeconds.toFixed(1)}s / {c.holdTarget}s</span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: "#ef4444" }}>Too high (+{overBy} bpm)</span>
                      <span style={{ color: "#888" }}>need &lt; {c.hrThreshold} bpm</span>
                    </>
                  )}
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TreasureRoom({ display }: { display: Display }) {
  const med = display.treasureMediumThreshold;
  const lrg = display.treasureLargeThreshold;
  const tier = display.treasureSteps >= lrg ? "large" : display.treasureSteps >= med ? "medium" : "small";
  const tierColor = tier === "large" ? "#fbbf24" : tier === "medium" ? "#a78bfa" : "#888";

  return (
    <div>
      <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.25rem" }}>
        {display.treasureTimeLeft}s
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        {display.treasureSteps} steps
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
        {[
          { label: `< ${med}: Small`, active: tier === "small" },
          { label: `${med}–${lrg}: Medium`, active: tier === "medium" },
          { label: `> ${lrg}: Large`, active: tier === "large" },
        ].map((t, i) => (
          <span key={i} style={{
            padding: "0.2rem 0.5rem", borderRadius: "4px",
            background: t.active ? `${tierColor}22` : "#1a1a1a",
            color: t.active ? tierColor : "#555",
            border: `1px solid ${t.active ? tierColor : "#333"}`,
          }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BossRoom({ display }: { display: Display }) {
  const phases = ["Damage", "Precision", "Endurance"];

  return (
    <div>
      {/* Phase indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {phases.map((label, i) => {
          const isActive = i === display.bossPhase;
          const isCleared = i < display.bossPhase;
          return (
            <span key={i} style={{
              padding: "0.3rem 0.8rem", borderRadius: "20px", fontSize: "0.8rem", fontWeight: 600,
              background: isActive ? "rgba(239,68,68,0.15)" : isCleared ? "rgba(34,197,94,0.1)" : "#1a1a1a",
              color: isActive ? "#ef4444" : isCleared ? "#22c55e" : "#555",
              border: `1px solid ${isActive ? "#ef4444" : isCleared ? "#22c55e" : "#333"}`,
            }}>
              {isCleared ? "\u2713 " : ""}{label}
            </span>
          );
        })}
      </div>

      {/* Phase content */}
      {display.bossPhase === 0 && (
        <HpBar current={display.bossHp} max={display.bossMaxHp} color="#ef4444" label="Boss HP" />
      )}
      {display.bossPhase === 1 && (
        <div>
          <div style={{ marginBottom: "1rem" }}>
            <div style={{
              display: "inline-block", padding: "0.3rem 1rem", borderRadius: "20px", fontSize: "1.5rem", fontWeight: 700,
              background: display.bossInWindow ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              color: display.bossInWindow ? "#22c55e" : "#ef4444",
              border: `2px solid ${display.bossInWindow ? "#22c55e" : "#ef4444"}`,
            }}>
              {display.teamCadence} spm
            </div>
            <div style={{ color: "#888", fontSize: "0.8rem", marginTop: "0.3rem" }}>
              Target: {display.bossTrapCadenceMin}–{display.bossTrapCadenceMax} spm
            </div>
          </div>
          <HpBar current={display.bossTrapSafe} max={display.bossTrapSafeTarget} color="#22c55e" label="Safe Steps" />
          <HpBar current={display.bossTrapDamage} max={display.bossTrapDamageLimit} color="#ef4444" label="Trap Damage (resets phase)" />
        </div>
      )}
      {display.bossPhase === 2 && (
        <div>
          {display.bossEnduranceClients.map((c, i) => {
            const aboveThreshold = c.hr >= c.hrThreshold;
            const underBy = c.hrThreshold - c.hr;
            const holdPct = c.holdTarget > 0 ? Math.min(100, (c.holdSeconds / c.holdTarget) * 100) : 0;
            const countdown = Math.max(0, c.holdTarget - c.holdSeconds);

            return (
              <div key={i} style={{
                padding: "0.6rem 0.75rem", margin: "0.4rem 0", borderRadius: "8px",
                background: c.ready ? "rgba(34,197,94,0.1)" : "#1a1a1a",
                border: `1px solid ${c.ready ? "#22c55e" : aboveThreshold ? "#f97316" : "#333"}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span style={{
                    fontSize: "1.1rem", fontWeight: 700,
                    color: c.ready ? "#22c55e" : aboveThreshold ? "#f97316" : c.hr > 0 ? "#3b82f6" : "#555",
                  }}>
                    {c.hr > 0 ? `${c.hr} bpm` : "No data"}
                  </span>
                </div>

                {c.ready ? (
                  <div style={{ color: "#22c55e", fontSize: "0.85rem", fontWeight: 600 }}>Ready</div>
                ) : c.hr > 0 ? (
                  <>
                    <div style={{
                      width: "100%", height: "6px", background: "#333", borderRadius: "3px",
                      overflow: "hidden", marginBottom: "0.3rem",
                    }}>
                      <div style={{
                        width: `${holdPct}%`,
                        height: "100%",
                        background: aboveThreshold ? "#f97316" : "#3b82f6",
                        borderRadius: "3px",
                        transition: "width 0.4s",
                      }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                      {aboveThreshold ? (
                        <>
                          <span style={{ color: "#f97316" }}>Sustaining... {countdown.toFixed(1)}s left</span>
                          <span style={{ color: "#888" }}>{c.holdSeconds.toFixed(1)}s / {c.holdTarget}s</span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: "#3b82f6" }}>Too low ({underBy > 0 ? `-${underBy}` : "0"} bpm)</span>
                          <span style={{ color: "#888" }}>need {c.hrThreshold}+ bpm</span>
                        </>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

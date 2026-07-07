import { invoke } from "@tauri-apps/api/core";

export type PetMode = "idle" | "walk" | "sleep" | "react";

export type PetIdentity = {
  id: string;
  name: string;
};

export type PetCareMemory = {
  mood: number;
  energy: number;
  affection: number;
  lastInteractionAt: number;
  progression: PetProgressionState;
};

export type PetSettings = {
  lowDistractionMode: boolean;
  aiProvider: AiProviderId;
  alwaysOnTop: boolean;
  autostartRequested: boolean;
  motionLevel: PetMotionLevel;
  petVisible: boolean;
  talkFrequency: PetTalkFrequency;
};

export const AI_PROVIDERS = ["rule", "ollama", "openai"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export const PET_MOTION_LEVELS = ["calm", "normal", "playful"] as const;
export type PetMotionLevel = (typeof PET_MOTION_LEVELS)[number];

export const PET_TALK_FREQUENCIES = ["quiet", "normal", "chatty"] as const;
export type PetTalkFrequency = (typeof PET_TALK_FREQUENCIES)[number];

export const FOCUS_REMINDER_INTERVALS = [15, 25, 45] as const;
export type FocusReminderIntervalMinutes = (typeof FOCUS_REMINDER_INTERVALS)[number];

export type FocusTimerState = {
  running: boolean;
  startedAt: number;
  accumulatedMs: number;
  reminderIntervalMinutes: FocusReminderIntervalMinutes;
  lastReminderElapsedMs: number;
  lastReminderAt: number;
  completedSessions: number;
};

export type RewardReason = "interaction" | "focus" | "ball" | "chat";
export type RewardItemId = "focus-star" | "play-spark";
export type RewardInventory = Record<RewardItemId, number>;

export type PetProgressionState = {
  schemaVersion: 1;
  xp: number;
  level: number;
  rewardItems: RewardInventory;
  rewardHistory: Partial<Record<RewardReason, number>>;
};

export type PetRewardResult = {
  state: PetState;
  granted: boolean;
  leveledUp: boolean;
  item?: RewardItemId;
  xpGained: number;
};

export type PetState = {
  id: string;
  name: string;
  mode: PetMode;
  modeStartedAt: number;
  x: number;
  y: number;
  vx: number;
  mood: number;
  energy: number;
  affection: number;
  lastInteractionAt: number;
  lastAutoTalkAt: number;
  petMemories: Record<string, PetCareMemory>;
  settings: PetSettings;
  focusTimer: FocusTimerState;
  progression: PetProgressionState;
};

const LEGACY_STORAGE_KEY = "pixel-pet.state.v1";
const WALL_TIME_MINIMUM = 1_000_000_000_000;
const VALID_MODES = new Set<PetMode>(["idle", "walk", "sleep", "react"]);
const DEFAULT_PET: PetIdentity = {
  id: "cyber-cat-001",
  name: "NekoByte",
};
const DEFAULT_SETTINGS: PetSettings = {
  lowDistractionMode: false,
  aiProvider: "rule",
  alwaysOnTop: false,
  autostartRequested: false,
  motionLevel: "calm",
  petVisible: true,
  talkFrequency: "quiet",
};
const DEFAULT_FOCUS_TIMER: FocusTimerState = {
  running: false,
  startedAt: 0,
  accumulatedMs: 0,
  reminderIntervalMinutes: 25,
  lastReminderElapsedMs: 0,
  lastReminderAt: 0,
  completedSessions: 0,
};
const DEFAULT_REWARD_ITEMS: RewardInventory = {
  "focus-star": 0,
  "play-spark": 0,
};
const DEFAULT_PROGRESSION: PetProgressionState = {
  schemaVersion: 1,
  xp: 0,
  level: 1,
  rewardItems: { ...DEFAULT_REWARD_ITEMS },
  rewardHistory: {},
};
const rewardConfigs: Record<RewardReason, { xp: number; affection: number; cooldownMs: number; item?: RewardItemId }> = {
  interaction: { xp: 1, affection: 1, cooldownMs: 60_000 },
  focus: { xp: 15, affection: 3, cooldownMs: 0, item: "focus-star" },
  ball: { xp: 4, affection: 1, cooldownMs: 3_000, item: "play-spark" },
  chat: { xp: 2, affection: 1, cooldownMs: 30_000 },
};

export function createInitialState(identity: PetIdentity = DEFAULT_PET): PetState {
  const now = Date.now();
  return {
    id: identity.id,
    name: identity.name,
    mode: "idle",
    modeStartedAt: now,
    x: 146,
    y: 94,
    vx: 18,
    mood: 72,
    energy: 80,
    affection: 20,
    lastInteractionAt: now,
    lastAutoTalkAt: now,
    petMemories: {},
    settings: { ...DEFAULT_SETTINGS },
    focusTimer: { ...DEFAULT_FOCUS_TIMER },
    progression: cloneProgression(DEFAULT_PROGRESSION),
  };
}

export async function loadState(): Promise<PetState | null> {
  const desktopState = normalizeState(await loadDesktopState());
  if (desktopState) return desktopState;

  const legacyState = loadLegacyState();
  if (legacyState) {
    await saveState(legacyState);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return legacyState;
  }

  return null;
}

async function loadDesktopState(): Promise<unknown | null> {
  try {
    return await invoke<unknown | null>("load_pet_state");
  } catch {
    return null;
  }
}

function loadLegacyState(): PetState | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveState(state: PetState): Promise<void> {
  try {
    await invoke("save_pet_state", { state });
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(state));
  }
}

function normalizeState(raw: unknown): PetState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const candidate = raw as Partial<PetState>;
  const base = createInitialState();
  const now = Date.now();
  const mode = typeof candidate.mode === "string" && VALID_MODES.has(candidate.mode as PetMode) ? candidate.mode : base.mode;

  return {
    id: stringOr(candidate.id, base.id),
    name: stringOr(candidate.name, base.name),
    mode,
    modeStartedAt: wallTimeOr(candidate.modeStartedAt, now),
    x: finiteNumberOr(candidate.x, base.x),
    y: finiteNumberOr(candidate.y, base.y),
    vx: finiteNumberOr(candidate.vx, base.vx),
    mood: clamp(finiteNumberOr(candidate.mood, base.mood), 0, 100),
    energy: clamp(finiteNumberOr(candidate.energy, base.energy), 0, 100),
    affection: clamp(finiteNumberOr(candidate.affection, base.affection), 0, 100),
    lastInteractionAt: wallTimeOr(candidate.lastInteractionAt, now),
    lastAutoTalkAt: wallTimeOr(candidate.lastAutoTalkAt, now),
    petMemories: normalizePetMemories(candidate.petMemories),
    settings: normalizeSettings(candidate.settings),
    focusTimer: normalizeFocusTimer(candidate.focusTimer),
    progression: normalizeProgression(candidate.progression),
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function wallTimeOr(value: unknown, fallback: number): number {
  const candidate = finiteNumberOr(value, fallback);
  return candidate >= WALL_TIME_MINIMUM ? candidate : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizePetMemories(raw: unknown): Record<string, PetCareMemory> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const memories: Record<string, PetCareMemory> = {};
  for (const [petId, value] of Object.entries(raw)) {
    if (typeof petId !== "string" || petId.trim().length === 0) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const candidate = value as Partial<PetCareMemory>;
    const now = Date.now();
    memories[petId] = {
      mood: clamp(finiteNumberOr(candidate.mood, 72), 0, 100),
      energy: clamp(finiteNumberOr(candidate.energy, 80), 0, 100),
      affection: clamp(finiteNumberOr(candidate.affection, 20), 0, 100),
      lastInteractionAt: wallTimeOr(candidate.lastInteractionAt, now),
      progression: normalizeProgression(candidate.progression),
    };
  }

  return memories;
}

function normalizeSettings(raw: unknown): PetSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };

  const candidate = raw as Partial<PetSettings>;
  return {
    lowDistractionMode:
      typeof candidate.lowDistractionMode === "boolean" ? candidate.lowDistractionMode : DEFAULT_SETTINGS.lowDistractionMode,
    aiProvider: normalizeAiProvider(candidate.aiProvider),
    alwaysOnTop: typeof candidate.alwaysOnTop === "boolean" ? candidate.alwaysOnTop : DEFAULT_SETTINGS.alwaysOnTop,
    autostartRequested: DEFAULT_SETTINGS.autostartRequested,
    motionLevel: normalizeMotionLevel(candidate.motionLevel),
    petVisible: typeof candidate.petVisible === "boolean" ? candidate.petVisible : DEFAULT_SETTINGS.petVisible,
    talkFrequency: normalizeTalkFrequency(candidate.talkFrequency),
  };
}

function normalizeAiProvider(value: unknown): AiProviderId {
  return typeof value === "string" && AI_PROVIDERS.includes(value as AiProviderId)
    ? (value as AiProviderId)
    : DEFAULT_SETTINGS.aiProvider;
}

function normalizeMotionLevel(value: unknown): PetMotionLevel {
  return typeof value === "string" && PET_MOTION_LEVELS.includes(value as PetMotionLevel)
    ? (value as PetMotionLevel)
    : DEFAULT_SETTINGS.motionLevel;
}

function normalizeTalkFrequency(value: unknown): PetTalkFrequency {
  return typeof value === "string" && PET_TALK_FREQUENCIES.includes(value as PetTalkFrequency)
    ? (value as PetTalkFrequency)
    : DEFAULT_SETTINGS.talkFrequency;
}

function normalizeFocusTimer(raw: unknown): FocusTimerState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_FOCUS_TIMER };

  const candidate = raw as Partial<FocusTimerState>;
  return {
    running: typeof candidate.running === "boolean" ? candidate.running : DEFAULT_FOCUS_TIMER.running,
    startedAt: finiteNumberOr(candidate.startedAt, 0),
    accumulatedMs: Math.max(0, finiteNumberOr(candidate.accumulatedMs, DEFAULT_FOCUS_TIMER.accumulatedMs)),
    reminderIntervalMinutes: normalizeReminderInterval(candidate.reminderIntervalMinutes),
    lastReminderElapsedMs: Math.max(0, finiteNumberOr(candidate.lastReminderElapsedMs, 0)),
    lastReminderAt: finiteNumberOr(candidate.lastReminderAt, 0),
    completedSessions: Math.max(0, Math.floor(finiteNumberOr(candidate.completedSessions, 0))),
  };
}

function normalizeReminderInterval(value: unknown): FocusReminderIntervalMinutes {
  return typeof value === "number" && FOCUS_REMINDER_INTERVALS.includes(value as FocusReminderIntervalMinutes)
    ? (value as FocusReminderIntervalMinutes)
    : DEFAULT_FOCUS_TIMER.reminderIntervalMinutes;
}

function normalizeProgression(raw: unknown): PetProgressionState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return cloneProgression(DEFAULT_PROGRESSION);

  const candidate = raw as Partial<PetProgressionState>;
  const xp = Math.max(0, Math.floor(finiteNumberOr(candidate.xp, DEFAULT_PROGRESSION.xp)));
  return {
    schemaVersion: 1,
    xp,
    level: levelForXp(xp),
    rewardItems: normalizeRewardItems(candidate.rewardItems),
    rewardHistory: normalizeRewardHistory(candidate.rewardHistory),
  };
}

function normalizeRewardItems(raw: unknown): RewardInventory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_REWARD_ITEMS };

  const candidate = raw as Partial<Record<RewardItemId, unknown>>;
  return {
    "focus-star": Math.max(0, Math.floor(finiteNumberOr(candidate["focus-star"], 0))),
    "play-spark": Math.max(0, Math.floor(finiteNumberOr(candidate["play-spark"], 0))),
  };
}

function normalizeRewardHistory(raw: unknown): Partial<Record<RewardReason, number>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const candidate = raw as Partial<Record<RewardReason, unknown>>;
  const history: Partial<Record<RewardReason, number>> = {};
  for (const reason of Object.keys(rewardConfigs) as RewardReason[]) {
    const value = finiteNumberOr(candidate[reason], 0);
    if (value > 0) history[reason] = value;
  }
  return history;
}

export function switchPetState(state: PetState, identity: PetIdentity): PetState {
  if (state.id === identity.id) {
    return { ...state, name: identity.name };
  }

  const now = Date.now();
  const memories = {
    ...state.petMemories,
    [state.id]: careMemoryFromState(state),
  };
  const nextCare = memories[identity.id] ?? careMemoryFromState(createInitialState(identity));

  return {
    ...state,
    id: identity.id,
    name: identity.name,
    mode: "react",
    modeStartedAt: now,
    mood: nextCare.mood,
    energy: nextCare.energy,
    affection: nextCare.affection,
    lastInteractionAt: nextCare.lastInteractionAt,
    progression: cloneProgression(nextCare.progression),
    petMemories: memories,
  };
}

function careMemoryFromState(state: PetState): PetCareMemory {
  return {
    mood: state.mood,
    energy: state.energy,
    affection: state.affection,
    lastInteractionAt: state.lastInteractionAt,
    progression: cloneProgression(state.progression),
  };
}

export function grantPetReward(state: PetState, reason: RewardReason, now = Date.now()): PetRewardResult {
  const config = rewardConfigs[reason];
  const lastRewardAt = state.progression.rewardHistory[reason] ?? 0;
  if (now - lastRewardAt < config.cooldownMs) {
    return { state, granted: false, leveledUp: false, xpGained: 0 };
  }

  const currentLevel = state.progression.level;
  const xp = state.progression.xp + config.xp;
  const level = levelForXp(xp);
  const rewardItems = { ...state.progression.rewardItems };
  if (config.item) rewardItems[config.item] += 1;

  const nextState = {
    ...state,
    affection: clamp(state.affection + config.affection, 0, 100),
    progression: {
      schemaVersion: 1 as const,
      xp,
      level,
      rewardItems,
      rewardHistory: {
        ...state.progression.rewardHistory,
        [reason]: now,
      },
    },
  };

  return {
    state: nextState,
    granted: true,
    leveledUp: level > currentLevel,
    item: config.item,
    xpGained: config.xp,
  };
}

export function rewardItemLabel(item: RewardItemId): string {
  return item === "focus-star" ? "focus star" : "play spark";
}

function cloneProgression(progression: PetProgressionState): PetProgressionState {
  return {
    schemaVersion: 1,
    xp: progression.xp,
    level: progression.level,
    rewardItems: { ...progression.rewardItems },
    rewardHistory: { ...progression.rewardHistory },
  };
}

function levelForXp(xp: number) {
  return Math.max(1, Math.floor(xp / 50) + 1);
}

export function stepPetState(state: PetState, dt: number): PetState {
  const now = Date.now();
  const next = { ...state };
  const modeAge = now - next.modeStartedAt;
  const lowDistraction = next.settings.lowDistractionMode;
  const protectedFocus = next.focusTimer.running || lowDistraction;
  const motionMultiplier =
    next.settings.motionLevel === "calm" ? 0.55 : next.settings.motionLevel === "playful" ? 1.35 : 1;

  next.energy = Math.max(0, Math.min(100, next.energy - dt * (protectedFocus ? 0.05 : 0.18)));
  next.mood = Math.max(0, Math.min(100, next.mood - dt * (protectedFocus ? 0 : 0.04)));

  if (next.mode === "walk") {
    const direction = next.vx < 0 ? -1 : 1;
    const speed = (lowDistraction ? Math.min(Math.abs(next.vx), 8) : Math.abs(next.vx)) * motionMultiplier;
    next.x += direction * speed * dt;
    if (next.x < 76 || next.x > 226) {
      next.vx *= -1;
    }
    if (modeAge > (lowDistraction ? 2_500 : 5_000)) switchMode(next, "idle");
  }

  if (next.mode === "sleep") {
    next.energy = Math.min(100, next.energy + dt * 1.2);
    if (next.energy > 72 && modeAge > 8_000) switchMode(next, "idle");
  }

  if (next.mode === "react" && modeAge > 1_000) {
    switchMode(next, "idle");
  }

  if (next.mode === "idle") {
    if (next.energy < 20) {
      switchMode(next, "sleep");
    } else if (Math.random() < dt * (lowDistraction ? 0.025 : 0.12) * motionMultiplier) {
      const speed = (lowDistraction ? 8 : 18) * motionMultiplier;
      next.vx = Math.random() > 0.5 ? speed : -speed;
      switchMode(next, "walk");
    }
  }

  return next;
}

function switchMode(state: PetState, mode: PetMode) {
  state.mode = mode;
  state.modeStartedAt = Date.now();
}

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
};

const LEGACY_STORAGE_KEY = "pixel-pet.state.v1";
const VALID_MODES = new Set<PetMode>(["idle", "walk", "sleep", "react"]);
const DEFAULT_PET: PetIdentity = {
  id: "cyber-cat-001",
  name: "NekoByte",
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
    lastAutoTalkAt: 0,
    petMemories: {},
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
  const mode = typeof candidate.mode === "string" && VALID_MODES.has(candidate.mode as PetMode) ? candidate.mode : base.mode;

  return {
    id: stringOr(candidate.id, base.id),
    name: stringOr(candidate.name, base.name),
    mode,
    modeStartedAt: finiteNumberOr(candidate.modeStartedAt, Date.now()),
    x: finiteNumberOr(candidate.x, base.x),
    y: finiteNumberOr(candidate.y, base.y),
    vx: finiteNumberOr(candidate.vx, base.vx),
    mood: clamp(finiteNumberOr(candidate.mood, base.mood), 0, 100),
    energy: clamp(finiteNumberOr(candidate.energy, base.energy), 0, 100),
    affection: clamp(finiteNumberOr(candidate.affection, base.affection), 0, 100),
    lastInteractionAt: finiteNumberOr(candidate.lastInteractionAt, Date.now()),
    lastAutoTalkAt: finiteNumberOr(candidate.lastAutoTalkAt, 0),
    petMemories: normalizePetMemories(candidate.petMemories),
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
    memories[petId] = {
      mood: clamp(finiteNumberOr(candidate.mood, 72), 0, 100),
      energy: clamp(finiteNumberOr(candidate.energy, 80), 0, 100),
      affection: clamp(finiteNumberOr(candidate.affection, 20), 0, 100),
      lastInteractionAt: finiteNumberOr(candidate.lastInteractionAt, Date.now()),
    };
  }

  return memories;
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
    petMemories: memories,
  };
}

function careMemoryFromState(state: PetState): PetCareMemory {
  return {
    mood: state.mood,
    energy: state.energy,
    affection: state.affection,
    lastInteractionAt: state.lastInteractionAt,
  };
}

export function stepPetState(state: PetState, dt: number): PetState {
  const now = Date.now();
  const next = { ...state };
  const modeAge = now - next.modeStartedAt;

  next.energy = Math.max(0, Math.min(100, next.energy - dt * 0.18));
  next.mood = Math.max(0, Math.min(100, next.mood - dt * 0.04));

  if (next.mode === "walk") {
    next.x += next.vx * dt;
    if (next.x < 76 || next.x > 226) {
      next.vx *= -1;
    }
    if (modeAge > 5_000) switchMode(next, "idle");
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
    } else if (Math.random() < dt * 0.12) {
      next.vx = Math.random() > 0.5 ? 18 : -18;
      switchMode(next, "walk");
    }
  }

  return next;
}

function switchMode(state: PetState, mode: PetMode) {
  state.mode = mode;
  state.modeStartedAt = Date.now();
}

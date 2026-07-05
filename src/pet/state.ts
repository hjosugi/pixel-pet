export type PetMode = "idle" | "walk" | "sleep" | "react";

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
};

const STORAGE_KEY = "pixel-pet.state.v1";

export function createInitialState(): PetState {
  return {
    id: "cyber-cat-001",
    name: "NekoByte",
    mode: "idle",
    modeStartedAt: Date.now(),
    x: 146,
    y: 94,
    vx: 18,
    mood: 72,
    energy: 80,
    affection: 20,
    lastInteractionAt: Date.now(),
    lastAutoTalkAt: 0,
  };
}

export function loadState(): PetState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...createInitialState(), ...JSON.parse(raw) } as PetState;
  } catch {
    return null;
  }
}

export function saveState(state: PetState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

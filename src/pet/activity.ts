import { grantPetReward, type PetRewardResult, type PetState } from "./state";

// Activity layer: let the outside world drive the pet.
//
// The pet is normally self-contained (idle / walk / sleep / react). This module
// lets a host process report what the user is actually doing so the pet can be
// an ambient work companion instead of a passive toy. It never calls an LLM and
// never runs on the animation loop; it only reacts to explicit, normalized
// events dispatched as a `pixel-pet:activity` browser CustomEvent.
//
// This mirrors the pattern used by pixel-agents (raw hook payload ->
// normalizeHookEvent -> canonical event -> state store), reduced to a single
// resident pet.

export const ACTIVITY_KINDS = ["start", "working", "waiting", "done", "error"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityEvent = {
  kind: ActivityKind;
  source: string;
  label: string | null;
};

export type ActivityReaction = {
  state: PetState;
  say: string | null;
  reward: PetRewardResult | null;
  changed: boolean;
};

const ACTIVITY_FIELD_MAX = 40;

// Per-kind spacing so a chatty host (many "working" events) cannot spam the pet.
const activityCooldownMs: Record<ActivityKind, number> = {
  start: 4_000,
  working: 45_000,
  waiting: 20_000,
  done: 6_000,
  error: 20_000,
};

// Built-in lines keep the pack schema unchanged. Packs can add pack-specific
// activity lines in a later pass; these are the calm defaults.
const activityLines: Record<ActivityKind, string[]> = {
  start: ["一緒にやろう。", "起動したね。", "いこう。"],
  working: ["いい流れ。", "見てるよ。", "その調子。"],
  waiting: ["きみの番かも。", "入力待ちみたい。", "確認どうぞ。"],
  done: ["できたね！", "ナイス、完了。", "おつかれさま。"],
  error: ["深呼吸しよ。", "落ち着いていこう。", "一歩ずつ。"],
};

const lastActivityAt = new Map<ActivityKind, number>();

export function normalizeActivityEvent(raw: unknown): ActivityEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const candidate = raw as { kind?: unknown; source?: unknown; label?: unknown };
  if (typeof candidate.kind !== "string" || !ACTIVITY_KINDS.includes(candidate.kind as ActivityKind)) return null;

  return {
    kind: candidate.kind as ActivityKind,
    source: trimmedField(candidate.source, "host"),
    label: trimmedField(candidate.label, "") || null,
  };
}

export function reactToActivity(pet: PetState, event: ActivityEvent, now = Date.now()): ActivityReaction {
  const unchanged: ActivityReaction = { state: pet, say: null, reward: null, changed: false };

  const lastAt = lastActivityAt.get(event.kind) ?? 0;
  if (now - lastAt < activityCooldownMs[event.kind]) return unchanged;
  lastActivityAt.set(event.kind, now);

  let next: PetState = { ...pet, mode: "react", modeStartedAt: now };
  let reward: PetRewardResult | null = null;

  switch (event.kind) {
    case "start":
      next.mood = clamp(next.mood + 2);
      break;
    case "working":
      next.mood = clamp(next.mood + 1);
      break;
    case "waiting":
      next.mood = clamp(next.mood + 1);
      next.lastInteractionAt = now;
      break;
    case "done": {
      next.mood = clamp(next.mood + 4);
      const result = grantPetReward(next, "activity", now);
      next = result.state;
      reward = result.granted ? result : null;
      break;
    }
    case "error":
      // No punishment for failures. The pet just offers a calm nudge.
      next.mood = clamp(next.mood + 1);
      break;
  }

  return { state: next, say: pickLine(event, now), reward, changed: true };
}

// Exposed so tests / hosts can reset the throttle between independent runs.
export function resetActivityThrottle() {
  lastActivityAt.clear();
}

function pickLine(event: ActivityEvent, now: number): string {
  const pool = activityLines[event.kind];
  const seed = Math.floor(now / 1000 + event.kind.length * 7 + (event.label?.length ?? 0)) % pool.length;
  return pool[seed];
}

function trimmedField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, ACTIVITY_FIELD_MAX) : fallback;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

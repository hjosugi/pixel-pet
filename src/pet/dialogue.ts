import type { PetState } from "./state";
import { DEFAULT_PET_PACK_ID, getPetPack, PET_DIALOGUE_MAX_CHARS, type DialogueTrigger } from "./packs";

export { PET_DIALOGUE_MAX_CHARS };
export type DialogueReason = DialogueTrigger;

const triggerCooldownMs: Record<DialogueTrigger, number> = {
  click: 800,
  idle: 60_000,
  sleep: 5 * 60_000,
  focus: 30_000,
  lateNight: 5 * 60_000,
  lowEnergy: 5 * 60_000,
};

const fallbackDialogue: Record<DialogueTrigger, string[]> = {
  click: ["ここにいるよ。"],
  idle: ["少しずつ進めよ。"],
  sleep: ["少し休もう。"],
  focus: ["ここで休憩。"],
  lateNight: ["保存して休もう。"],
  lowEnergy: ["水を一口。"],
};

const lastSpokenAt = new Map<string, number>();

export function chooseLine(pet: PetState, reason: DialogueReason): string | null {
  const now = Date.now();
  const cooldownKey = `${pet.id}:${reason}`;
  const lastSpoken = lastSpokenAt.get(cooldownKey) ?? 0;
  if (now - lastSpoken < triggerCooldownMs[reason]) return null;

  const pool = dialoguePool(pet.id, reason);
  const seed = Math.floor((now / 1000 + pet.mood + pet.energy + pet.affection + reason.length * 7) % pool.length);
  lastSpokenAt.set(cooldownKey, now);
  return limitLine(pool[seed]);
}

function dialoguePool(petId: string, reason: DialogueTrigger) {
  return getPetPack(petId)?.dialogue[reason] ?? getPetPack(DEFAULT_PET_PACK_ID)?.dialogue[reason] ?? fallbackDialogue[reason];
}

function limitLine(line: string) {
  if (line.length <= PET_DIALOGUE_MAX_CHARS) return line;
  return `${line.slice(0, PET_DIALOGUE_MAX_CHARS - 3)}...`;
}

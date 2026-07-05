import { switchPetState, type PetProgressionState, type PetState, type RewardInventory } from "./state";
import type { PetPack } from "./packs";

const CAPSULE_SCHEMA = "dev.local.pixel-pet.capsule";
const CAPSULE_SCHEMA_VERSION = 1;
const MAX_NAME_LENGTH = 32;
const MAX_OWNER_NOTE_LENGTH = 160;

export type PetCapsule = {
  schema: typeof CAPSULE_SCHEMA;
  schemaVersion: typeof CAPSULE_SCHEMA_VERSION;
  compatibility: {
    minAppVersion: string;
    features: string[];
    future: Record<string, never>;
  };
  signature: CapsuleSignature;
  exportedAt: string;
  pet: {
    id: string;
    packId: string;
    name: string;
    seed: string;
    traits: {
      mood: number;
      energy: number;
      affection: number;
      level: number;
      xp: number;
      rewardItems: RewardInventory;
    };
    ownerNote: string;
    progression: Pick<PetProgressionState, "schemaVersion" | "xp" | "level" | "rewardItems">;
  };
};

export type CapsuleSignature = {
  status: "unsigned" | "signed";
  algorithm: "ed25519" | null;
  publicKeyId: string | null;
  value: string | null;
  signedFields: string[];
};

export type PetCapsuleImportResult = {
  state: PetState;
  trust: "unsigned" | "unverified-signed";
};

export function createPetCapsule(state: PetState, ownerNote: string): PetCapsule {
  return {
    schema: CAPSULE_SCHEMA,
    schemaVersion: CAPSULE_SCHEMA_VERSION,
    compatibility: {
      minAppVersion: "0.1.0",
      features: ["progression-v1", "pack-id-v1"],
      future: {},
    },
    signature: {
      status: "unsigned",
      algorithm: null,
      publicKeyId: null,
      value: null,
      signedFields: ["schema", "schemaVersion", "compatibility", "exportedAt", "pet"],
    },
    exportedAt: new Date().toISOString(),
    pet: {
      id: state.id,
      packId: state.id,
      name: state.name,
      seed: capsuleSeed(state),
      traits: {
        mood: Math.round(state.mood),
        energy: Math.round(state.energy),
        affection: Math.round(state.affection),
        level: state.progression.level,
        xp: state.progression.xp,
        rewardItems: { ...state.progression.rewardItems },
      },
      ownerNote: ownerNote.trim().slice(0, MAX_OWNER_NOTE_LENGTH),
      progression: {
        schemaVersion: 1,
        xp: state.progression.xp,
        level: state.progression.level,
        rewardItems: { ...state.progression.rewardItems },
      },
    },
  };
}

export function serializePetCapsule(capsule: PetCapsule) {
  return `${JSON.stringify(capsule, null, 2)}\n`;
}

export function importPetCapsule(raw: string, currentState: PetState, packs: PetPack[]): PetCapsuleImportResult | null {
  const capsule = parseCapsule(raw);
  if (!capsule) return null;

  const pack = packs.find((candidate) => candidate.id === capsule.pet.packId);
  if (!pack) return null;

  const name = stringField(capsule.pet.name, pack.name).slice(0, MAX_NAME_LENGTH);
  const imported = switchPetState(currentState, { id: pack.id, name });
  return {
    state: {
      ...imported,
      mood: clampNumber(capsule.pet.traits.mood, 0, 100, 72),
      energy: clampNumber(capsule.pet.traits.energy, 0, 100, 80),
      affection: clampNumber(capsule.pet.traits.affection, 0, 100, 20),
      mode: "react",
      modeStartedAt: Date.now(),
      progression: {
        ...capsule.pet.progression,
        rewardHistory: {},
      },
    },
    trust: capsule.signature.status === "signed" ? "unverified-signed" : "unsigned",
  };
}

function parseCapsule(raw: string): PetCapsule | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const candidate = parsed as Partial<PetCapsule>;
  if (candidate.schema !== CAPSULE_SCHEMA || candidate.schemaVersion !== CAPSULE_SCHEMA_VERSION) return null;
  if (!candidate.pet || typeof candidate.pet !== "object" || Array.isArray(candidate.pet)) return null;

  const pet = candidate.pet as Partial<PetCapsule["pet"]>;
  const packId = stringField(pet.packId, "");
  const name = stringField(pet.name, "");
  const seed = stringField(pet.seed, "");
  const traits = normalizeTraits(pet.traits);
  const progression = normalizeProgression(pet.progression);
  if (!packId || !name || !seed || !traits || !progression) return null;

  return {
    schema: CAPSULE_SCHEMA,
    schemaVersion: CAPSULE_SCHEMA_VERSION,
    compatibility: {
      minAppVersion: stringField(candidate.compatibility?.minAppVersion, "0.1.0"),
      features: Array.isArray(candidate.compatibility?.features)
        ? candidate.compatibility.features.filter((feature): feature is string => typeof feature === "string")
        : [],
      future: {},
    },
    signature: normalizeSignature(candidate.signature),
    exportedAt: stringField(candidate.exportedAt, new Date().toISOString()),
    pet: {
      id: stringField(pet.id, packId),
      packId,
      name: name.slice(0, MAX_NAME_LENGTH),
      seed,
      traits,
      ownerNote: stringField(pet.ownerNote, "").slice(0, MAX_OWNER_NOTE_LENGTH),
      progression,
    },
  };
}

function normalizeSignature(raw: unknown): CapsuleSignature {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return unsignedSignature();
  }

  const candidate = raw as Partial<CapsuleSignature>;
  const status = candidate.status === "signed" ? "signed" : "unsigned";
  return {
    status,
    algorithm: candidate.algorithm === "ed25519" ? "ed25519" : null,
    publicKeyId: stringField(candidate.publicKeyId, "") || null,
    value: stringField(candidate.value, "") || null,
    signedFields: Array.isArray(candidate.signedFields)
      ? candidate.signedFields.filter((field): field is string => typeof field === "string")
      : unsignedSignature().signedFields,
  };
}

function unsignedSignature(): CapsuleSignature {
  return {
    status: "unsigned",
    algorithm: null,
    publicKeyId: null,
    value: null,
    signedFields: ["schema", "schemaVersion", "compatibility", "exportedAt", "pet"],
  };
}

function normalizeTraits(raw: unknown): PetCapsule["pet"]["traits"] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as Partial<PetCapsule["pet"]["traits"]>;
  return {
    mood: clampNumber(candidate.mood, 0, 100, 72),
    energy: clampNumber(candidate.energy, 0, 100, 80),
    affection: clampNumber(candidate.affection, 0, 100, 20),
    level: Math.max(1, Math.floor(numberField(candidate.level, 1))),
    xp: Math.max(0, Math.floor(numberField(candidate.xp, 0))),
    rewardItems: normalizeRewardItems(candidate.rewardItems),
  };
}

function normalizeProgression(raw: unknown): PetProgressionState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as Partial<PetCapsule["pet"]["progression"]>;
  if (candidate.schemaVersion !== 1) return null;

  const xp = Math.max(0, Math.floor(numberField(candidate.xp, 0)));
  return {
    schemaVersion: 1,
    xp,
    level: Math.max(1, Math.floor(numberField(candidate.level, Math.floor(xp / 50) + 1))),
    rewardItems: normalizeRewardItems(candidate.rewardItems),
    rewardHistory: {},
  };
}

function normalizeRewardItems(raw: unknown): RewardInventory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { "focus-star": 0, "play-spark": 0 };
  const candidate = raw as Partial<Record<keyof RewardInventory, unknown>>;
  return {
    "focus-star": Math.max(0, Math.floor(numberField(candidate["focus-star"], 0))),
    "play-spark": Math.max(0, Math.floor(numberField(candidate["play-spark"], 0))),
  };
}

function capsuleSeed(state: PetState) {
  const source = `${state.id}:${state.name}:${state.progression.xp}:${state.affection}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `pp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stringField(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function numberField(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return Math.max(min, Math.min(max, numberField(value, fallback)));
}

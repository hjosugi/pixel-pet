import { describe, expect, it } from "vitest";
import { createPetCapsule, importPetCapsule, serializePetCapsule } from "../src/pet/capsule";
import type { PetPack } from "../src/pet/packs";
import { createInitialState, grantPetReward } from "../src/pet/state";

// importPetCapsule only reads id/name from packs, so a minimal stub is enough.
const packs = [{ id: "cyber-cat-001", name: "NekoByte" } as unknown as PetPack];

function seededState() {
  let state = createInitialState();
  for (let i = 0; i < 3; i += 1) state = grantPetReward(state, "focus", 1_000).state;
  return { ...state, mood: 90, affection: 40 };
}

describe("capsule round trip", () => {
  it("preserves progression and traits through export/import", () => {
    const state = seededState();
    const capsule = createPetCapsule(state, "hello");
    const result = importPetCapsule(serializePetCapsule(capsule), createInitialState(), packs);

    expect(result).not.toBeNull();
    expect(result?.trust).toBe("unsigned");
    expect(result?.state.progression.xp).toBe(state.progression.xp);
    expect(result?.state.progression.level).toBe(state.progression.level);
    expect(result?.state.mood).toBe(Math.round(state.mood));
  });

  it("labels a signed capsule as unverified", () => {
    const capsule = createPetCapsule(seededState(), "");
    const signed = { ...capsule, signature: { ...capsule.signature, status: "signed" as const } };
    const result = importPetCapsule(JSON.stringify(signed), createInitialState(), packs);
    expect(result?.trust).toBe("unverified-signed");
  });
});

describe("capsule import rejects bad input", () => {
  it("rejects non-JSON and wrong schema", () => {
    expect(importPetCapsule("{not json", createInitialState(), packs)).toBeNull();
    expect(importPetCapsule(JSON.stringify({ schema: "other" }), createInitialState(), packs)).toBeNull();
  });

  it("rejects an unknown pack id", () => {
    const capsule = createPetCapsule(seededState(), "");
    const foreign = { ...capsule, pet: { ...capsule.pet, packId: "does-not-exist" } };
    expect(importPetCapsule(JSON.stringify(foreign), createInitialState(), packs)).toBeNull();
  });

  it("rejects an unsupported progression schema version", () => {
    const capsule = createPetCapsule(seededState(), "");
    const bad = {
      ...capsule,
      pet: { ...capsule.pet, progression: { ...capsule.pet.progression, schemaVersion: 2 } },
    };
    expect(importPetCapsule(JSON.stringify(bad), createInitialState(), packs)).toBeNull();
  });

  it("clamps out-of-range traits instead of trusting them", () => {
    const capsule = createPetCapsule(seededState(), "");
    const wild = {
      ...capsule,
      pet: { ...capsule.pet, traits: { ...capsule.pet.traits, mood: 9999, energy: -50 } },
    };
    const result = importPetCapsule(JSON.stringify(wild), createInitialState(), packs);
    expect(result?.state.mood).toBeLessThanOrEqual(100);
    expect(result?.state.energy).toBeGreaterThanOrEqual(0);
  });
});

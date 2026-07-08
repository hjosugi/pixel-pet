import { describe, expect, it } from "vitest";
import { chooseLine, PET_DIALOGUE_MAX_CHARS } from "../src/pet/dialogue";
import { createInitialState } from "../src/pet/state";

describe("chooseLine", () => {
  it("returns a bounded line for a bundled pet, then respects the cooldown", () => {
    const pet = createInitialState();
    const first = chooseLine(pet, "click");
    expect(first).toBeTruthy();
    expect((first ?? "").length).toBeLessThanOrEqual(PET_DIALOGUE_MAX_CHARS);

    // Same trigger again immediately is on cooldown.
    expect(chooseLine(pet, "click")).toBeNull();

    // A different trigger has its own cooldown budget.
    expect(chooseLine(pet, "idle")).toBeTruthy();
  });
});

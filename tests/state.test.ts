import { describe, expect, it } from "vitest";
import { createInitialState, grantPetReward, stepPetState, switchPetState } from "../src/pet/state";

// Reward cooldowns compare against wall-clock time, so tests use a realistic
// epoch base rather than tiny numbers (which would look "on cooldown" vs 0).
const T = 1_700_000_000_000;

describe("createInitialState", () => {
  it("starts calm at level 1 in idle", () => {
    const state = createInitialState();
    expect(state.mode).toBe("idle");
    expect(state.progression.level).toBe(1);
    expect(state.progression.xp).toBe(0);
    expect(state.settings.aiProvider).toBe("rule");
  });
});

describe("grantPetReward", () => {
  it("grants xp and affection for an interaction", () => {
    const state = createInitialState();
    const result = grantPetReward(state, "interaction", T);
    expect(result.granted).toBe(true);
    expect(result.state.progression.xp).toBe(1);
    expect(result.state.affection).toBe(state.affection + 1);
  });

  it("enforces the per-reason cooldown", () => {
    const state = createInitialState();
    const first = grantPetReward(state, "interaction", T);
    const blocked = grantPetReward(first.state, "interaction", T + 2_000);
    expect(blocked.granted).toBe(false);
    expect(blocked.state.progression.xp).toBe(1);

    const later = grantPetReward(first.state, "interaction", T + 70_000);
    expect(later.granted).toBe(true);
    expect(later.state.progression.xp).toBe(2);
  });

  it("grants the activity reward with no item and levels up past 50 xp", () => {
    let state = createInitialState();
    const activity = grantPetReward(state, "activity", T);
    expect(activity.granted).toBe(true);
    expect(activity.item).toBeUndefined();
    expect(activity.state.progression.xp).toBe(3);

    // focus has no cooldown, so it is a convenient way to cross a level boundary.
    let leveled = false;
    state = createInitialState();
    for (let i = 0; i < 4; i += 1) {
      const reward = grantPetReward(state, "focus", T);
      state = reward.state;
      leveled = leveled || reward.leveledUp;
    }
    expect(state.progression.xp).toBe(60);
    expect(state.progression.level).toBe(2);
    expect(leveled).toBe(true);
  });
});

describe("switchPetState", () => {
  it("only renames when the id is unchanged", () => {
    const state = createInitialState();
    const renamed = switchPetState(state, { id: state.id, name: "Renamed" });
    expect(renamed.id).toBe(state.id);
    expect(renamed.name).toBe("Renamed");
    expect(renamed.mode).toBe(state.mode);
  });

  it("remembers the previous pet and reacts when switching", () => {
    const state = createInitialState();
    const switched = switchPetState(state, { id: "cyber-penguin-001", name: "Peng" });
    expect(switched.id).toBe("cyber-penguin-001");
    expect(switched.mode).toBe("react");
    expect(switched.petMemories[state.id]).toBeDefined();

    const back = switchPetState(switched, { id: state.id, name: state.name });
    expect(back.id).toBe(state.id);
    expect(back.petMemories["cyber-penguin-001"]).toBeDefined();
  });
});

describe("stepPetState", () => {
  it("drains energy over time when unprotected", () => {
    const state = { ...createInitialState(), energy: 50, mode: "idle" as const };
    const next = stepPetState(state, 1);
    expect(next.energy).toBeLessThan(50);
  });

  it("leaves the react mode after its window elapses", () => {
    const state = { ...createInitialState(), mode: "react" as const, modeStartedAt: Date.now() - 2_000 };
    const next = stepPetState(state, 0.001);
    expect(next.mode).not.toBe("react");
  });

  it("falls asleep from idle when energy is depleted", () => {
    const state = { ...createInitialState(), mode: "idle" as const, energy: 10 };
    const next = stepPetState(state, 1);
    expect(next.mode).toBe("sleep");
  });

  it("recovers energy while sleeping", () => {
    const state = { ...createInitialState(), mode: "sleep" as const, energy: 50, modeStartedAt: Date.now() };
    const next = stepPetState(state, 1);
    expect(next.energy).toBeGreaterThan(50);
  });
});

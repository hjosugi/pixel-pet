import { beforeEach, describe, expect, it } from "vitest";
import { normalizeActivityEvent, reactToActivity, resetActivityThrottle } from "../src/pet/activity";
import { createInitialState } from "../src/pet/state";

// Per-kind throttle and reward cooldowns compare against wall-clock time.
const T = 1_700_000_000_000;

beforeEach(() => resetActivityThrottle());

describe("normalizeActivityEvent", () => {
  it("accepts a known kind and defaults the source", () => {
    const event = normalizeActivityEvent({ kind: "working" });
    expect(event).toEqual({ kind: "working", source: "host", label: null });
  });

  it("trims and caps source and label", () => {
    const event = normalizeActivityEvent({ kind: "done", source: "  claude-code  ", label: "x".repeat(100) });
    expect(event?.source).toBe("claude-code");
    expect(event?.label?.length).toBe(40);
  });

  it("rejects unknown kinds and non-objects", () => {
    expect(normalizeActivityEvent({ kind: "explode" })).toBeNull();
    expect(normalizeActivityEvent("nope")).toBeNull();
    expect(normalizeActivityEvent(null)).toBeNull();
    expect(normalizeActivityEvent(["done"])).toBeNull();
  });
});

describe("reactToActivity", () => {
  it("reacts and grants a reward on done", () => {
    const state = createInitialState();
    const reaction = reactToActivity(state, { kind: "done", source: "host", label: null }, T);
    expect(reaction.changed).toBe(true);
    expect(reaction.state.mode).toBe("react");
    expect(reaction.reward?.granted).toBe(true);
    expect(reaction.state.progression.xp).toBe(3);
    expect(reaction.say).toBeTruthy();
  });

  it("throttles repeated events of the same kind", () => {
    const state = createInitialState();
    const first = reactToActivity(state, { kind: "done", source: "host", label: null }, T);
    const blocked = reactToActivity(first.state, { kind: "done", source: "host", label: null }, T + 2_000);
    expect(blocked.changed).toBe(false);
    expect(blocked.state).toBe(first.state);

    const later = reactToActivity(first.state, { kind: "done", source: "host", label: null }, T + 9_000);
    expect(later.changed).toBe(true);
  });

  it("never punishes on error", () => {
    const state = createInitialState();
    const reaction = reactToActivity(state, { kind: "error", source: "host", label: null }, T);
    expect(reaction.changed).toBe(true);
    expect(reaction.reward).toBeNull();
    expect(reaction.state.mood).toBeGreaterThanOrEqual(state.mood);
  });
});

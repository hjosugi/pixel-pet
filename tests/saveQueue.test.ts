import { describe, expect, it } from "vitest";
import { createLatestSaveQueue } from "../src/pet/saveQueue";

describe("createLatestSaveQueue", () => {
  it("serializes writes and coalesces pending snapshots to the latest value", async () => {
    const writes: number[] = [];
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });

    const save = createLatestSaveQueue<number>(async (value) => {
      writes.push(value);
      if (value === 1) await firstWriteBlocked;
    });

    const first = save(1);
    const second = save(2);
    const third = save(3);

    expect(writes).toEqual([1]);
    releaseFirstWrite?.();
    await Promise.all([first, second, third]);
    expect(writes).toEqual([1, 3]);
  });

  it("starts a fresh drain after the previous one completes", async () => {
    const writes: string[] = [];
    const save = createLatestSaveQueue<string>(async (value) => {
      writes.push(value);
    });

    await save("first");
    await save("second");
    expect(writes).toEqual(["first", "second"]);
  });

  it("continues to the newest snapshot after an earlier write fails", async () => {
    const writes: number[] = [];
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteBlocked = new Promise<void>((_, reject) => {
      releaseFirstWrite = () => reject(new Error("disk busy"));
    });
    const save = createLatestSaveQueue<number>(async (value) => {
      writes.push(value);
      if (value === 1) await firstWriteBlocked;
    });

    const first = save(1);
    const latest = save(2);
    releaseFirstWrite?.();

    await expect(first).rejects.toThrow("disk busy");
    await expect(latest).rejects.toThrow("disk busy");
    expect(writes).toEqual([1, 2]);

    await expect(save(3)).resolves.toBeUndefined();
    expect(writes).toEqual([1, 2, 3]);
  });
});

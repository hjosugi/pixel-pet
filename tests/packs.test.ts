import { describe, expect, it } from "vitest";
import { assemblePetPack, getPetPack, listPetPacks } from "../src/pet/packs";
import catManifest from "../assets/pets/cyber-cat/manifest.json";
import catMetadata from "../assets/pets/cyber-cat/spritesheet.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const manifest = catManifest as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const metadata = catMetadata as any;

describe("bundled pack registry", () => {
  it("loads the built-in packs", () => {
    expect(listPetPacks().length).toBeGreaterThanOrEqual(3);
    expect(getPetPack("cyber-cat-001")).toBeDefined();
  });
});

describe("assemblePetPack", () => {
  it("assembles a valid pack with all four animations", () => {
    const pack = assemblePetPack({ ...manifest, id: "community-x", name: "X" }, metadata, "blob:x");
    expect(pack).not.toBeNull();
    expect(pack?.spriteUrl).toBe("blob:x");
    expect(Object.keys(pack?.animations ?? {}).sort()).toEqual(["idle", "react", "sleep", "walk"]);
  });

  it("rejects a frame-size mismatch", () => {
    const pack = assemblePetPack({ ...manifest, size: { base: 999, scale: 1 } }, metadata, "blob:x");
    expect(pack).toBeNull();
  });

  it("rejects a missing sprite url or metadata", () => {
    expect(assemblePetPack(manifest, metadata, undefined)).toBeNull();
    expect(assemblePetPack(manifest, undefined, "blob:x")).toBeNull();
  });
});

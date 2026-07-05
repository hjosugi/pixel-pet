import type { PetMode } from "./state";

export const PET_DIALOGUE_MAX_CHARS = 44;
export const DIALOGUE_TRIGGERS = ["click", "idle", "sleep", "focus", "lateNight", "lowEnergy"] as const;
export type DialogueTrigger = (typeof DIALOGUE_TRIGGERS)[number];

export type AnimationSpec = {
  row: number;
  fps: number;
  frames: number[];
  loop: boolean;
};

export type PetPack = {
  id: string;
  name: string;
  spriteUrl: string;
  frameSize: number;
  scale: number;
  animations: Record<PetMode, AnimationSpec>;
  dialogue: Record<DialogueTrigger, string[]>;
};

type PetManifest = {
  id?: unknown;
  name?: unknown;
  size?: {
    base?: unknown;
    scale?: unknown;
  };
  assets?: {
    spritesheet?: unknown;
    metadata?: unknown;
  };
  animations?: Partial<Record<PetMode, { fps?: unknown; loop?: unknown }>>;
  personality?: {
    dialogue?: Partial<Record<DialogueTrigger, unknown>>;
  };
};

type SpritesheetMetadata = {
  frame?: {
    width?: unknown;
    height?: unknown;
  };
  layout?: {
    columns?: unknown;
    rows?: unknown;
  };
  animations?: Partial<Record<PetMode, { row?: unknown; frames?: unknown; fps?: unknown; loop?: unknown }>>;
};

export const DEFAULT_PET_PACK_ID = "cyber-cat-001";

const PET_MODES: PetMode[] = ["idle", "walk", "sleep", "react"];
const manifestModules = import.meta.glob<PetManifest>("../../assets/pets/*/manifest.json", {
  eager: true,
  import: "default",
});
const metadataModules = import.meta.glob<SpritesheetMetadata>("../../assets/pets/*/*.json", {
  eager: true,
  import: "default",
});
const spriteModules = import.meta.glob<string>("../../assets/pets/*/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const PET_PACKS = loadPetPacks();

export function getPetPack(id: string): PetPack | undefined {
  return PET_PACKS[id];
}

export function listPetPacks(): PetPack[] {
  return Object.values(PET_PACKS);
}

function loadPetPacks(): Record<string, PetPack> {
  const packs: Record<string, PetPack> = {};

  for (const [manifestPath, manifest] of Object.entries(manifestModules)) {
    const pack = buildPetPack(manifestPath, manifest);
    if (pack) packs[pack.id] = pack;
  }

  return packs;
}

function buildPetPack(manifestPath: string, manifest: PetManifest): PetPack | null {
  const dir = manifestPath.slice(0, manifestPath.lastIndexOf("/"));
  const id = stringValue(manifest.id);
  const name = stringValue(manifest.name);
  const frameSize = positiveInteger(manifest.size?.base);
  const scale = positiveInteger(manifest.size?.scale);
  const metadataFile = stringValue(manifest.assets?.metadata) ?? "spritesheet.json";
  const spritesheetFile = stringValue(manifest.assets?.spritesheet) ?? "spritesheet.png";
  const metadata = metadataModules[`${dir}/${metadataFile}`];
  const spriteUrl = spriteModules[`${dir}/${spritesheetFile}`];

  if (!id || !name || !frameSize || !scale || !metadata || !spriteUrl) return null;
  if (metadata.frame?.width !== frameSize || metadata.frame?.height !== frameSize) return null;

  const columns = positiveInteger(metadata.layout?.columns);
  const rows = positiveInteger(metadata.layout?.rows);
  if (!columns || !rows) return null;

  const animations = buildAnimations(manifest, metadata, columns, rows);
  if (!animations) return null;
  const dialogue = buildDialogue(manifest);
  if (!dialogue) return null;

  return {
    id,
    name,
    spriteUrl,
    frameSize,
    scale,
    animations,
    dialogue,
  };
}

function buildAnimations(
  manifest: PetManifest,
  metadata: SpritesheetMetadata,
  columns: number,
  rows: number,
): Record<PetMode, AnimationSpec> | null {
  const animations = {} as Record<PetMode, AnimationSpec>;

  for (const mode of PET_MODES) {
    const sheetAnimation = metadata.animations?.[mode];
    const manifestAnimation = manifest.animations?.[mode];
    if (!sheetAnimation || !manifestAnimation) return null;

    const row = zeroBasedIndex(sheetAnimation.row, rows);
    const frames = frameList(sheetAnimation.frames, columns);
    const fps = positiveNumber(sheetAnimation.fps);
    const loop = booleanValue(sheetAnimation.loop);
    if (row === null || !frames || !fps || loop === null) return null;
    if (manifestAnimation.fps !== fps || manifestAnimation.loop !== loop) return null;

    animations[mode] = { row, frames, fps, loop };
  }

  return animations;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 60 ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function zeroBasedIndex(value: unknown, upperBound: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < upperBound ? value : null;
}

function frameList(value: unknown, columns: number): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const frames = value.filter((frame): frame is number => Number.isInteger(frame) && frame >= 0 && frame < columns);
  return frames.length === value.length ? frames : null;
}

function buildDialogue(manifest: PetManifest): Record<DialogueTrigger, string[]> | null {
  if (!manifest.personality?.dialogue || typeof manifest.personality.dialogue !== "object") return null;

  const dialogue = {} as Record<DialogueTrigger, string[]>;
  for (const trigger of DIALOGUE_TRIGGERS) {
    const lines = manifest.personality.dialogue[trigger];
    if (!Array.isArray(lines) || lines.length === 0) return null;

    const normalized = lines.filter(
      (line): line is string => typeof line === "string" && line.trim().length > 0 && line.length <= PET_DIALOGUE_MAX_CHARS,
    );
    if (normalized.length !== lines.length) return null;
    dialogue[trigger] = normalized;
  }

  return dialogue;
}

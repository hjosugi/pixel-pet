import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PETS_DIR = join(ROOT, "assets", "pets");
const REQUIRED_MODES = ["idle", "walk", "sleep", "react"];
const DIALOGUE_TRIGGERS = ["click", "idle", "sleep", "focus", "lateNight", "lowEnergy"];
const DIALOGUE_MAX_CHARS = 44;
const SUPPORTED_FRAME_SIZES = new Set([32, 48]);

const errors = [];

function addError(packName, message) {
  errors.push(`${packName}: ${message}`);
}

function readJson(path, packName, label) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      addError(packName, `${label} must be a JSON object`);
      return null;
    }
    return parsed;
  } catch (error) {
    addError(packName, `${label} is not readable JSON: ${error.message}`);
    return null;
  }
}

function stringField(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function positiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function positiveFps(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 60 ? value : null;
}

function zeroBasedIndex(value, upperBound) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < upperBound ? value : null;
}

function booleanField(value) {
  return typeof value === "boolean" ? value : null;
}

function readPngSize(path, packName) {
  let buffer;
  try {
    buffer = readFileSync(path);
  } catch (error) {
    addError(packName, `spritesheet is not readable: ${error.message}`);
    return null;
  }

  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    addError(packName, "spritesheet must be a PNG file");
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function validateManifest(packName, manifest) {
  const id = stringField(manifest.id);
  const name = stringField(manifest.name);
  const frameSize = positiveInteger(manifest.size?.base);
  const scale = positiveInteger(manifest.size?.scale);
  const spritesheet = stringField(manifest.assets?.spritesheet);
  const metadata = stringField(manifest.assets?.metadata);

  if (!id) addError(packName, "manifest.id is required");
  if (!name) addError(packName, "manifest.name is required");
  if (!frameSize || !SUPPORTED_FRAME_SIZES.has(frameSize)) {
    addError(packName, "manifest.size.base must be 32 or 48");
  }
  if (!scale) addError(packName, "manifest.size.scale must be a positive integer");
  if (!spritesheet) addError(packName, "manifest.assets.spritesheet is required");
  if (!metadata) addError(packName, "manifest.assets.metadata is required");

  for (const mode of REQUIRED_MODES) {
    const animation = manifest.animations?.[mode];
    if (!animation || typeof animation !== "object" || Array.isArray(animation)) {
      addError(packName, `manifest.animations.${mode} is required`);
      continue;
    }
    if (!positiveFps(animation.fps)) addError(packName, `manifest.animations.${mode}.fps must be 1..60`);
    if (booleanField(animation.loop) === null) addError(packName, `manifest.animations.${mode}.loop must be boolean`);
  }

  validateDialogue(packName, manifest);

  return { id, name, frameSize, scale, spritesheet, metadata };
}

function validateDialogue(packName, manifest) {
  const dialogue = manifest.personality?.dialogue;
  if (!dialogue || typeof dialogue !== "object" || Array.isArray(dialogue)) {
    addError(packName, "manifest.personality.dialogue is required");
    return;
  }

  for (const trigger of DIALOGUE_TRIGGERS) {
    const lines = dialogue[trigger];
    if (!Array.isArray(lines) || lines.length === 0) {
      addError(packName, `manifest.personality.dialogue.${trigger} must be a non-empty array`);
      continue;
    }

    for (const line of lines) {
      if (typeof line !== "string" || line.trim().length === 0) {
        addError(packName, `manifest.personality.dialogue.${trigger} must contain only non-empty strings`);
      } else if (line.length > DIALOGUE_MAX_CHARS) {
        addError(packName, `manifest.personality.dialogue.${trigger} line exceeds ${DIALOGUE_MAX_CHARS} chars`);
      }
    }
  }
}

function validateMetadata(packName, manifest, metadata, pngSize) {
  const frameWidth = positiveInteger(metadata.frame?.width);
  const frameHeight = positiveInteger(metadata.frame?.height);
  const columns = positiveInteger(metadata.layout?.columns);
  const rows = positiveInteger(metadata.layout?.rows);

  if (frameWidth !== manifest.frameSize || frameHeight !== manifest.frameSize) {
    addError(packName, "spritesheet.json frame width/height must match manifest.size.base");
  }
  if (!columns) addError(packName, "spritesheet.json layout.columns must be a positive integer");
  if (!rows || rows < REQUIRED_MODES.length) {
    addError(packName, `spritesheet.json layout.rows must be at least ${REQUIRED_MODES.length}`);
  }

  if (pngSize && columns && rows && manifest.frameSize) {
    const expectedWidth = columns * manifest.frameSize;
    const expectedHeight = rows * manifest.frameSize;
    if (pngSize.width !== expectedWidth || pngSize.height !== expectedHeight) {
      addError(packName, `spritesheet.png must be ${expectedWidth}x${expectedHeight}, got ${pngSize.width}x${pngSize.height}`);
    }
  }

  for (const mode of REQUIRED_MODES) {
    const sheetAnimation = metadata.animations?.[mode];
    const manifestAnimation = manifest.raw.animations?.[mode];
    if (!sheetAnimation || typeof sheetAnimation !== "object" || Array.isArray(sheetAnimation)) {
      addError(packName, `spritesheet.json animations.${mode} is required`);
      continue;
    }

    const row = rows ? zeroBasedIndex(sheetAnimation.row, rows) : null;
    const frames = Array.isArray(sheetAnimation.frames) ? sheetAnimation.frames : null;
    const fps = positiveFps(sheetAnimation.fps);
    const loop = booleanField(sheetAnimation.loop);

    if (row === null) {
      addError(packName, `spritesheet.json animations.${mode}.row must be within layout.rows`);
    }
    if (!frames || frames.length === 0) {
      addError(packName, `spritesheet.json animations.${mode}.frames must be a non-empty array`);
    } else if (!columns || frames.some((frame) => !Number.isInteger(frame) || frame < 0 || frame >= columns)) {
      addError(packName, `spritesheet.json animations.${mode}.frames must reference columns in range`);
    }
    if (!fps) addError(packName, `spritesheet.json animations.${mode}.fps must be 1..60`);
    if (loop === null) addError(packName, `spritesheet.json animations.${mode}.loop must be boolean`);

    if (manifestAnimation && (manifestAnimation.fps !== sheetAnimation.fps || manifestAnimation.loop !== sheetAnimation.loop)) {
      addError(packName, `manifest and spritesheet.json disagree on ${mode} fps/loop`);
    }
  }
}

function validatePack(packDir) {
  const packName = basename(packDir);
  const manifestPath = join(packDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    addError(packName, "manifest.json is required");
    return;
  }

  const rawManifest = readJson(manifestPath, packName, "manifest.json");
  if (!rawManifest) return;

  const manifest = { ...validateManifest(packName, rawManifest), raw: rawManifest };
  if (!manifest.spritesheet || !manifest.metadata || !manifest.frameSize) return;

  const metadataPath = join(packDir, manifest.metadata);
  const spritesheetPath = join(packDir, manifest.spritesheet);
  if (!existsSync(metadataPath)) addError(packName, `${manifest.metadata} is required`);
  if (!existsSync(spritesheetPath)) addError(packName, `${manifest.spritesheet} is required`);
  if (!existsSync(metadataPath) || !existsSync(spritesheetPath)) return;

  const metadata = readJson(metadataPath, packName, manifest.metadata);
  const pngSize = readPngSize(spritesheetPath, packName);
  if (!metadata) return;

  validateMetadata(packName, manifest, metadata, pngSize);
}

const packDirs = readdirSync(PETS_DIR)
  .map((name) => join(PETS_DIR, name))
  .filter((path) => statSync(path).isDirectory())
  .sort();

for (const packDir of packDirs) {
  validatePack(packDir);
}

if (errors.length > 0) {
  console.error("Pet pack validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${packDirs.length} pet packs.`);

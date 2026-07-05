import { getCurrentWindow } from "@tauri-apps/api/window";
import "./style.css";
import { createInitialState, loadState, saveState, stepPetState, switchPetState, type PetState } from "./pet/state";
import { chooseLine } from "./pet/dialogue";
import { listPetPacks, type PetPack } from "./pet/packs";
import { PixelPetRenderer } from "./pet/renderer";

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
const speech = document.querySelector<HTMLDivElement>("#speech");
const stateLabel = document.querySelector<HTMLSpanElement>("#state-label");
const dragRegion = document.querySelector<HTMLDivElement>("#drag-region");
const petSelector = document.querySelector<HTMLDivElement>("#pet-selector");
const focusToggle = document.querySelector<HTMLButtonElement>("#focus-toggle");
const app = document.querySelector<HTMLDivElement>("#app");

if (!canvas || !speech || !stateLabel || !petSelector || !focusToggle || !app) {
  throw new Error("Pixel Pet boot failed: required DOM nodes were not found.");
}

const petCanvas = canvas;
const speechBubble = speech;
const statusText = stateLabel;
const selector = petSelector;
const focusButton = focusToggle;
const appRoot = app;
const appWindow = getCurrentWindow();
const renderer = new PixelPetRenderer(petCanvas);
const petPacks = listPetPacks();
let pet = createInitialState();
let lastTick = performance.now();
let lastSavedAt = 0;
let lastReadoutAt = 0;
let schedulerTimer: number | undefined;
let speechTimer: number | undefined;

const frameBudgetMs = {
  idle: 1000 / 10,
  walk: 1000 / 10,
  sleep: 1000 / 4,
  react: 1000 / 12,
} as const;

const hiddenMaintenanceIntervalMs = 5_000;
const regularAutoTalkIntervalMs = 90_000;
const lowDistractionAutoTalkIntervalMs = 15 * 60_000;
const debugTimingEnabled =
  new URLSearchParams(window.location.search).get("debugTiming") === "1" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";
const timingReadout = debugTimingEnabled ? createTimingReadout() : null;

function createTimingReadout() {
  const readout = document.createElement("div");
  readout.id = "perf-readout";
  readout.textContent = "boot";
  appRoot.append(readout);
  return readout;
}

function packOrder(pack: PetPack) {
  if (pack.id === "cyber-cat-001") return 0;
  if (pack.id === "cyber-penguin-001") return 1;
  if (pack.id === "kofun-friend-001") return 2;
  return 10;
}

function orderedPetPacks() {
  return [...petPacks].sort((a, b) => packOrder(a) - packOrder(b) || a.name.localeCompare(b.name));
}

function isLowDistractionActive() {
  return pet.settings.lowDistractionMode;
}

function clampSpeechText(text: string) {
  if (!isLowDistractionActive() || text.length <= 44) return text;
  return `${text.slice(0, 41)}...`;
}

function speechDuration(durationMs: number) {
  return isLowDistractionActive() ? Math.min(durationMs, 1600) : durationMs;
}

function say(text: string, durationMs = 2600) {
  speechBubble.textContent = clampSpeechText(text);
  speechBubble.classList.add("visible");
  window.clearTimeout(speechTimer);
  speechTimer = window.setTimeout(() => speechBubble.classList.remove("visible"), speechDuration(durationMs));
}

function react(reason: "click" | "idle" | "focus") {
  pet.lastInteractionAt = Date.now();
  pet.mood = Math.min(100, pet.mood + 4);
  pet.energy = Math.max(0, pet.energy - 1);
  pet.mode = "react";
  pet.modeStartedAt = Date.now();
  say(chooseLine(pet, reason));
}

petCanvas.addEventListener("click", () => react("click"));

focusButton.addEventListener("click", () => {
  setLowDistractionMode(!pet.settings.lowDistractionMode);
});

function renderPetSelector() {
  selector.replaceChildren();

  for (const pack of orderedPetPacks()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pet-choice";
    button.textContent = pack.name;
    button.title = `Switch to ${pack.name}`;
    button.dataset.petId = pack.id;
    button.setAttribute("aria-pressed", String(pack.id === pet.id));
    button.addEventListener("click", () => selectPet(pack));
    selector.append(button);
  }
}

function selectPet(pack: PetPack) {
  pet = switchPetState(pet, { id: pack.id, name: pack.name });
  renderer.draw(pet, performance.now());
  updateStatus();
  renderPetSelector();
  say(`${pack.name} online.`, 1600);
  void saveState(pet);
}

function setLowDistractionMode(enabled: boolean, silent = false) {
  pet = {
    ...pet,
    settings: {
      ...pet.settings,
      lowDistractionMode: enabled,
    },
  };
  if (enabled && pet.mode === "walk") {
    pet.mode = "idle";
    pet.modeStartedAt = Date.now();
  }

  applyLowDistractionUi();
  updateStatus();
  scheduleTick();
  void saveState(pet);
  if (!silent) say(enabled ? "quiet mode." : "normal mode.", 1300);
}

window.addEventListener("pixel-pet:focus-mode", (event) => {
  const enabled = Boolean((event as CustomEvent<{ enabled?: unknown }>).detail?.enabled);
  setLowDistractionMode(enabled);
});

dragRegion?.addEventListener("mousedown", async (event) => {
  if (event.buttons !== 1) return;
  try {
    await appWindow.startDragging();
  } catch {
    // In a normal browser preview this is expected. Tauri handles it in desktop mode.
  }
});

function targetFrameIntervalMs() {
  return document.hidden ? hiddenMaintenanceIntervalMs : frameBudgetMs[pet.mode];
}

function scheduleTick() {
  window.clearTimeout(schedulerTimer);
  schedulerTimer = window.setTimeout(() => window.requestAnimationFrame(tick), targetFrameIntervalMs());
}

function updateTimingReadout(now: number, dt: number, rendered: boolean) {
  if (!timingReadout || now - lastReadoutAt < 500) return;

  lastReadoutAt = now;
  const targetFps = 1000 / targetFrameIntervalMs();
  const observedFps = dt > 0 ? 1 / dt : 0;
  timingReadout.textContent = `${rendered ? "draw" : "idle"} ${observedFps.toFixed(1)}fps / target ${targetFps.toFixed(1)} / ${pet.mode}`;
}

function updateStatus() {
  const modeLabel = isLowDistractionActive() ? "quiet" : pet.mode;
  statusText.textContent = `${pet.name} / ${modeLabel} / mood ${Math.round(pet.mood)}`;
}

function tick(now: number) {
  const dt = Math.min(5, (now - lastTick) / 1000);
  const rendered = !document.hidden;
  lastTick = now;

  pet = stepPetState(pet, dt);
  if (rendered) renderer.draw(pet, now);
  updateStatus();

  const autoTalkIntervalMs = isLowDistractionActive() ? lowDistractionAutoTalkIntervalMs : regularAutoTalkIntervalMs;
  if (rendered && now - pet.lastAutoTalkAt > autoTalkIntervalMs && pet.mode !== "sleep") {
    pet.lastAutoTalkAt = now;
    say(chooseLine(pet, "idle"), 2200);
  }

  if (now - lastSavedAt > 5_000) {
    lastSavedAt = now;
    void saveState(pet);
  }

  updateTimingReadout(now, dt, rendered);
  scheduleTick();
}

function normalizeLoadedPetState(state: PetState): PetState {
  const activePack = petPacks.find((pack) => pack.id === state.id);
  if (activePack) {
    return { ...state, name: activePack.name };
  }

  const fallbackPack = orderedPetPacks()[0];
  return fallbackPack ? switchPetState(state, { id: fallbackPack.id, name: fallbackPack.name }) : state;
}

function applyLowDistractionUi() {
  const enabled = isLowDistractionActive();
  appRoot.classList.toggle("low-distraction", enabled);
  focusButton.setAttribute("aria-pressed", String(enabled));
}

async function boot() {
  pet = normalizeLoadedPetState((await loadState()) ?? pet);
  applyLowDistractionUi();
  renderer.draw(pet, performance.now());
  updateStatus();
  renderPetSelector();
  say("pixel-pet online.", 1800);
  scheduleTick();
}

void boot();

document.addEventListener("visibilitychange", () => {
  lastTick = performance.now();
  scheduleTick();
});

window.addEventListener("beforeunload", () => void saveState(pet));

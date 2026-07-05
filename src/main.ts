import { getCurrentWindow } from "@tauri-apps/api/window";
import "./style.css";
import { createInitialState, loadState, saveState, stepPetState } from "./pet/state";
import { chooseLine } from "./pet/dialogue";
import { PixelPetRenderer } from "./pet/renderer";

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
const speech = document.querySelector<HTMLDivElement>("#speech");
const stateLabel = document.querySelector<HTMLSpanElement>("#state-label");
const dragRegion = document.querySelector<HTMLDivElement>("#drag-region");
const app = document.querySelector<HTMLDivElement>("#app");

if (!canvas || !speech || !stateLabel || !app) {
  throw new Error("Pixel Pet boot failed: required DOM nodes were not found.");
}

const petCanvas = canvas;
const speechBubble = speech;
const statusText = stateLabel;
const appRoot = app;
const appWindow = getCurrentWindow();
const renderer = new PixelPetRenderer(petCanvas);
let pet = loadState() ?? createInitialState();
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

function say(text: string, durationMs = 2600) {
  speechBubble.textContent = text;
  speechBubble.classList.add("visible");
  window.clearTimeout(speechTimer);
  speechTimer = window.setTimeout(() => speechBubble.classList.remove("visible"), durationMs);
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

function tick(now: number) {
  const dt = Math.min(5, (now - lastTick) / 1000);
  const rendered = !document.hidden;
  lastTick = now;

  pet = stepPetState(pet, dt);
  if (rendered) renderer.draw(pet, now);
  statusText.textContent = `${pet.mode} / mood ${Math.round(pet.mood)}`;

  if (rendered && now - pet.lastAutoTalkAt > 90_000 && pet.mode !== "sleep") {
    pet.lastAutoTalkAt = now;
    say(chooseLine(pet, "idle"), 2200);
  }

  if (now - lastSavedAt > 5_000) {
    lastSavedAt = now;
    saveState(pet);
  }

  updateTimingReadout(now, dt, rendered);
  scheduleTick();
}

say("pixel-pet online.", 1800);
scheduleTick();

document.addEventListener("visibilitychange", () => {
  lastTick = performance.now();
  scheduleTick();
});

window.addEventListener("beforeunload", () => saveState(pet));

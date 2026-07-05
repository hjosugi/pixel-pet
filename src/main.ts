import { getCurrentWindow } from "@tauri-apps/api/window";
import "./style.css";
import { createInitialState, loadState, saveState, stepPetState } from "./pet/state";
import { chooseLine } from "./pet/dialogue";
import { PixelPetRenderer } from "./pet/renderer";

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
const speech = document.querySelector<HTMLDivElement>("#speech");
const stateLabel = document.querySelector<HTMLSpanElement>("#state-label");
const dragRegion = document.querySelector<HTMLDivElement>("#drag-region");

if (!canvas || !speech || !stateLabel) {
  throw new Error("Pixel Pet boot failed: required DOM nodes were not found.");
}

const petCanvas = canvas;
const speechBubble = speech;
const statusText = stateLabel;
const appWindow = getCurrentWindow();
const renderer = new PixelPetRenderer(petCanvas);
let pet = loadState() ?? createInitialState();
let lastFrame = performance.now();
let lastSavedAt = 0;
let speechTimer: number | undefined;

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

function tick(now: number) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  pet = stepPetState(pet, dt);
  renderer.draw(pet, now);
  statusText.textContent = `${pet.mode} / mood ${Math.round(pet.mood)}`;

  if (now - pet.lastAutoTalkAt > 90_000 && pet.mode !== "sleep") {
    pet.lastAutoTalkAt = now;
    say(chooseLine(pet, "idle"), 2200);
  }

  if (now - lastSavedAt > 5_000) {
    lastSavedAt = now;
    saveState(pet);
  }

  window.requestAnimationFrame(tick);
}

say("pixel-pet online.", 1800);
window.requestAnimationFrame(tick);

window.addEventListener("beforeunload", () => saveState(pet));

import { getCurrentWindow } from "@tauri-apps/api/window";
import "./style.css";
import {
  AI_PROVIDERS,
  FOCUS_REMINDER_INTERVALS,
  createInitialState,
  loadState,
  saveState,
  stepPetState,
  switchPetState,
  type AiProviderId,
  type FocusReminderIntervalMinutes,
  type PetState,
} from "./pet/state";
import { AI_HISTORY_LIMIT, askPetAi, type AiChatMessage } from "./pet/ai";
import { PET_DIALOGUE_MAX_CHARS, chooseLine, type DialogueReason } from "./pet/dialogue";
import { getPetPack, listPetPacks, type PetPack } from "./pet/packs";
import { PixelPetRenderer } from "./pet/renderer";

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
const speech = document.querySelector<HTMLDivElement>("#speech");
const stateLabel = document.querySelector<HTMLSpanElement>("#state-label");
const dragRegion = document.querySelector<HTMLDivElement>("#drag-region");
const petSelector = document.querySelector<HTMLDivElement>("#pet-selector");
const focusToggle = document.querySelector<HTMLButtonElement>("#focus-toggle");
const focusTimerToggle = document.querySelector<HTMLButtonElement>("#focus-timer-toggle");
const focusInterval = document.querySelector<HTMLSelectElement>("#focus-interval");
const focusClock = document.querySelector<HTMLSpanElement>("#focus-clock");
const chatPanel = document.querySelector<HTMLFormElement>("#chat-panel");
const chatInput = document.querySelector<HTMLInputElement>("#chat-input");
const chatSend = document.querySelector<HTMLButtonElement>("#chat-send");
const aiProvider = document.querySelector<HTMLSelectElement>("#ai-provider");
const app = document.querySelector<HTMLDivElement>("#app");

if (
  !canvas ||
  !speech ||
  !stateLabel ||
  !petSelector ||
  !focusToggle ||
  !focusTimerToggle ||
  !focusInterval ||
  !focusClock ||
  !chatPanel ||
  !chatInput ||
  !chatSend ||
  !aiProvider ||
  !app
) {
  throw new Error("Pixel Pet boot failed: required DOM nodes were not found.");
}

const petCanvas = canvas;
const speechBubble = speech;
const statusText = stateLabel;
const selector = petSelector;
const focusButton = focusToggle;
const focusTimerButton = focusTimerToggle;
const focusIntervalSelect = focusInterval;
const focusClockLabel = focusClock;
const chatForm = chatPanel;
const chatTextInput = chatInput;
const chatSendButton = chatSend;
const aiProviderSelect = aiProvider;
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
let aiInFlight = false;
let openAiApiKey: string | null = null;
let chatHistory: AiChatMessage[] = [];

const frameBudgetMs = {
  idle: 1000 / 10,
  walk: 1000 / 10,
  sleep: 1000 / 4,
  react: 1000 / 12,
} as const;

const hiddenMaintenanceIntervalMs = 5_000;
const regularAutoTalkIntervalMs = 90_000;
const lowDistractionAutoTalkIntervalMs = 15 * 60_000;
const reminderSpamGuardMs = 60_000;
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
  if (text.length <= PET_DIALOGUE_MAX_CHARS) return text;
  return `${text.slice(0, PET_DIALOGUE_MAX_CHARS - 3)}...`;
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

function sayPetLine(reason: DialogueReason, durationMs = 2200) {
  const line = chooseLine(pet, reason);
  if (!line) return false;
  say(line, durationMs);
  return true;
}

function focusElapsedMs(now = Date.now()) {
  const timer = pet.focusTimer;
  return timer.accumulatedMs + (timer.running ? Math.max(0, now - timer.startedAt) : 0);
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function react(reason: DialogueReason) {
  pet.lastInteractionAt = Date.now();
  pet.mood = Math.min(100, pet.mood + 4);
  pet.energy = Math.max(0, pet.energy - 1);
  pet.mode = "react";
  pet.modeStartedAt = Date.now();
  sayPetLine(reason);
}

petCanvas.addEventListener("click", () => react("click"));

focusButton.addEventListener("click", () => {
  setLowDistractionMode(!pet.settings.lowDistractionMode);
});

focusTimerButton.addEventListener("click", () => {
  setFocusTimerRunning(!pet.focusTimer.running);
});

focusIntervalSelect.addEventListener("change", () => {
  const minutes = Number(focusIntervalSelect.value);
  if (!isFocusInterval(minutes)) return;
  const elapsed = focusElapsedMs();
  pet = {
    ...pet,
    focusTimer: {
      ...pet.focusTimer,
      reminderIntervalMinutes: minutes,
      lastReminderElapsedMs: elapsed,
      lastReminderAt: Date.now(),
    },
  };
  renderFocusTimer();
  void saveState(pet);
  say(`${minutes}m cycle.`, 1200);
});

aiProviderSelect.addEventListener("change", () => {
  const provider = aiProviderSelect.value;
  if (!isAiProvider(provider)) return;
  pet = {
    ...pet,
    settings: {
      ...pet.settings,
      aiProvider: provider,
    },
  };
  renderAiControls();
  void saveState(pet);
  say(`${provider} chat.`, 1200);
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendChatMessage(chatTextInput.value);
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

function setFocusTimerRunning(running: boolean) {
  const now = Date.now();
  const elapsed = focusElapsedMs(now);
  pet = {
    ...pet,
    focusTimer: {
      ...pet.focusTimer,
      running,
      startedAt: running ? now : 0,
      accumulatedMs: elapsed,
    },
  };

  renderFocusTimer(now);
  void saveState(pet);
  say(running ? "focus started." : "focus paused.", 1400);
}

function isFocusInterval(value: number): value is FocusReminderIntervalMinutes {
  return FOCUS_REMINDER_INTERVALS.includes(value as FocusReminderIntervalMinutes);
}

function renderFocusIntervalOptions() {
  focusIntervalSelect.replaceChildren();
  for (const minutes of FOCUS_REMINDER_INTERVALS) {
    const option = document.createElement("option");
    option.value = String(minutes);
    option.textContent = `${minutes}m`;
    focusIntervalSelect.append(option);
  }
}

function isAiProvider(value: string): value is AiProviderId {
  return AI_PROVIDERS.includes(value as AiProviderId);
}

function renderAiProviderOptions() {
  aiProviderSelect.replaceChildren();
  for (const provider of AI_PROVIDERS) {
    const option = document.createElement("option");
    option.value = provider;
    option.textContent = provider;
    aiProviderSelect.append(option);
  }
}

function renderAiControls() {
  aiProviderSelect.value = pet.settings.aiProvider;
  chatTextInput.disabled = aiInFlight;
  chatSendButton.disabled = aiInFlight;
}

function requestOpenAiApiKey() {
  if (openAiApiKey) return openAiApiKey;
  const value = window.prompt("OpenAI API key (kept in memory only)");
  if (!value?.trim()) return null;
  openAiApiKey = value.trim();
  return openAiApiKey;
}

async function sendChatMessage(rawText: string) {
  const text = rawText.trim();
  if (!text || aiInFlight) return;

  aiInFlight = true;
  chatTextInput.value = "";
  renderAiControls();

  const provider = pet.settings.aiProvider;
  const openAiKey = provider === "openai" ? requestOpenAiApiKey() : null;
  pet = {
    ...pet,
    lastInteractionAt: Date.now(),
    mode: "react",
    modeStartedAt: Date.now(),
  };
  say("...", 1000);

  const requestHistory = chatHistory.slice(-AI_HISTORY_LIMIT);
  const userMessage: AiChatMessage = { role: "user", content: text };
  chatHistory = [...requestHistory, userMessage].slice(-AI_HISTORY_LIMIT);

  try {
    const reply = await askPetAi(provider, text, {
      pet,
      pack: getPetPack(pet.id) ?? null,
      history: requestHistory,
      openAiApiKey: openAiKey ?? undefined,
    });
    const assistantMessage: AiChatMessage = { role: "assistant", content: reply };
    chatHistory = [...chatHistory, assistantMessage].slice(-AI_HISTORY_LIMIT);
    say(reply, 3200);
  } catch {
    if (!sayPetLine("click", 1800)) say("今は短くいこう。", 1800);
  } finally {
    aiInFlight = false;
    renderAiControls();
    void saveState(pet);
  }
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

function renderFocusTimer(now = Date.now()) {
  focusTimerButton.textContent = pet.focusTimer.running ? "stop" : "focus";
  focusTimerButton.setAttribute("aria-pressed", String(pet.focusTimer.running));
  focusIntervalSelect.value = String(pet.focusTimer.reminderIntervalMinutes);
  focusClockLabel.textContent = formatElapsed(focusElapsedMs(now));
}

function updateFocusTimer(rendered: boolean) {
  if (!pet.focusTimer.running || !rendered) return;

  const now = Date.now();
  const elapsed = focusElapsedMs(now);
  const intervalMs = pet.focusTimer.reminderIntervalMinutes * 60_000;
  const dueElapsed = Math.floor(elapsed / intervalMs) * intervalMs;
  if (dueElapsed <= 0 || dueElapsed <= pet.focusTimer.lastReminderElapsedMs) return;
  if (now - pet.focusTimer.lastReminderAt < reminderSpamGuardMs) return;

  const completedDelta = Math.max(1, Math.floor((dueElapsed - pet.focusTimer.lastReminderElapsedMs) / intervalMs));
  pet = {
    ...pet,
    mood: Math.min(100, pet.mood + 3),
    affection: Math.min(100, pet.affection + 2),
    mode: "react",
    modeStartedAt: now,
    focusTimer: {
      ...pet.focusTimer,
      lastReminderElapsedMs: dueElapsed,
      lastReminderAt: now,
      completedSessions: pet.focusTimer.completedSessions + completedDelta,
    },
  };
  sayPetLine("focus", 1800);
}

function ambientDialogueReason(): DialogueReason {
  const hour = new Date().getHours();
  if (pet.energy < 24) return "lowEnergy";
  if (pet.mode === "sleep") return "sleep";
  if (hour >= 22 || hour < 5) return "lateNight";
  return "idle";
}

function tick(now: number) {
  const dt = Math.min(5, (now - lastTick) / 1000);
  const rendered = !document.hidden;
  lastTick = now;

  pet = stepPetState(pet, dt);
  updateFocusTimer(rendered);
  if (rendered) renderer.draw(pet, now);
  updateStatus();
  renderFocusTimer();

  const autoTalkIntervalMs = isLowDistractionActive() ? lowDistractionAutoTalkIntervalMs : regularAutoTalkIntervalMs;
  if (rendered && now - pet.lastAutoTalkAt > autoTalkIntervalMs) {
    pet.lastAutoTalkAt = now;
    sayPetLine(ambientDialogueReason(), 2200);
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
  renderFocusIntervalOptions();
  renderAiProviderOptions();
  renderFocusTimer();
  renderAiControls();
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

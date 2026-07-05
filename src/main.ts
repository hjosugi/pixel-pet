import { getCurrentWindow } from "@tauri-apps/api/window";
import "./style.css";
import {
  AI_PROVIDERS,
  FOCUS_REMINDER_INTERVALS,
  createInitialState,
  loadState,
  saveState,
  grantPetReward,
  rewardItemLabel,
  stepPetState,
  switchPetState,
  type AiProviderId,
  type FocusReminderIntervalMinutes,
  type PetRewardResult,
  type PetState,
} from "./pet/state";
import { AI_HISTORY_LIMIT, askPetAi, type AiChatMessage } from "./pet/ai";
import { createPetCapsule, importPetCapsule, serializePetCapsule } from "./pet/capsule";
import { PET_DIALOGUE_MAX_CHARS, chooseLine, type DialogueReason } from "./pet/dialogue";
import { getPetPack, listPetPacks, type PetPack } from "./pet/packs";
import { PixelPetRenderer, type BallGameView } from "./pet/renderer";

type BallGameState = BallGameView & {
  vx: number;
  vy: number;
  startedAt: number;
  lastCatchAt: number;
};

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
const speech = document.querySelector<HTMLDivElement>("#speech");
const stateLabel = document.querySelector<HTMLSpanElement>("#state-label");
const dragRegion = document.querySelector<HTMLDivElement>("#drag-region");
const petSelector = document.querySelector<HTMLDivElement>("#pet-selector");
const focusToggle = document.querySelector<HTMLButtonElement>("#focus-toggle");
const ballToggle = document.querySelector<HTMLButtonElement>("#ball-toggle");
const focusTimerToggle = document.querySelector<HTMLButtonElement>("#focus-timer-toggle");
const focusInterval = document.querySelector<HTMLSelectElement>("#focus-interval");
const focusClock = document.querySelector<HTMLSpanElement>("#focus-clock");
const chatPanel = document.querySelector<HTMLFormElement>("#chat-panel");
const chatInput = document.querySelector<HTMLInputElement>("#chat-input");
const chatSend = document.querySelector<HTMLButtonElement>("#chat-send");
const aiProvider = document.querySelector<HTMLSelectElement>("#ai-provider");
const capsuleExport = document.querySelector<HTMLButtonElement>("#capsule-export");
const capsuleImport = document.querySelector<HTMLButtonElement>("#capsule-import");
const capsuleFile = document.querySelector<HTMLInputElement>("#capsule-file");
const app = document.querySelector<HTMLDivElement>("#app");

if (
  !canvas ||
  !speech ||
  !stateLabel ||
  !petSelector ||
  !focusToggle ||
  !ballToggle ||
  !focusTimerToggle ||
  !focusInterval ||
  !focusClock ||
  !chatPanel ||
  !chatInput ||
  !chatSend ||
  !aiProvider ||
  !capsuleExport ||
  !capsuleImport ||
  !capsuleFile ||
  !app
) {
  throw new Error("Pixel Pet boot failed: required DOM nodes were not found.");
}

const petCanvas = canvas;
const speechBubble = speech;
const statusText = stateLabel;
const selector = petSelector;
const focusButton = focusToggle;
const ballButton = ballToggle;
const focusTimerButton = focusTimerToggle;
const focusIntervalSelect = focusInterval;
const focusClockLabel = focusClock;
const chatForm = chatPanel;
const chatTextInput = chatInput;
const chatSendButton = chatSend;
const aiProviderSelect = aiProvider;
const capsuleExportButton = capsuleExport;
const capsuleImportButton = capsuleImport;
const capsuleFileInput = capsuleFile;
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
let ballGame = createInactiveBallGame();

const frameBudgetMs = {
  idle: 1000 / 10,
  walk: 1000 / 10,
  sleep: 1000 / 4,
  react: 1000 / 12,
} as const;

const hiddenMaintenanceIntervalMs = 5_000;
const activeBallFrameIntervalMs = 1000 / 20;
const regularAutoTalkIntervalMs = 90_000;
const lowDistractionAutoTalkIntervalMs = 15 * 60_000;
const reminderSpamGuardMs = 60_000;
const ballGameMaxMs = 45_000;
const ballGroundY = 184;
const ballCatchRadius = 58;
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

function createInactiveBallGame(): BallGameState {
  return {
    active: false,
    x: 72,
    y: 96,
    vx: 0,
    vy: 0,
    radius: 7,
    score: 0,
    startedAt: 0,
    lastCatchAt: 0,
  };
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
  pet = grantPetReward(pet, "interaction").state;
  sayPetLine(reason);
}

petCanvas.addEventListener("click", (event) => {
  if (ballGame.active) {
    tossBall(event);
    return;
  }
  react("click");
});

focusButton.addEventListener("click", () => {
  setLowDistractionMode(!pet.settings.lowDistractionMode);
});

ballButton.addEventListener("click", () => {
  if (ballGame.active) {
    stopBallGame();
  } else {
    startBallGame();
  }
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

capsuleExportButton.addEventListener("click", () => {
  exportCurrentPetCapsule();
});

capsuleImportButton.addEventListener("click", () => {
  capsuleFileInput.value = "";
  capsuleFileInput.click();
});

capsuleFileInput.addEventListener("change", () => {
  const file = capsuleFileInput.files?.[0];
  if (!file) return;
  void importSelectedPetCapsule(file);
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
  renderer.draw(pet, performance.now(), ballGame);
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

function startBallGame() {
  const now = Date.now();
  ballGame = {
    active: true,
    x: 70,
    y: 86,
    vx: 118,
    vy: -125,
    radius: 7,
    score: 0,
    startedAt: now,
    lastCatchAt: 0,
  };
  pet = {
    ...pet,
    mode: "react",
    modeStartedAt: now,
  };
  renderBallGameControls();
  scheduleTick();
  say("ball ready.", 1200);
}

function stopBallGame(silent = false) {
  ballGame = createInactiveBallGame();
  pet = {
    ...pet,
    mode: "idle",
    modeStartedAt: Date.now(),
  };
  renderBallGameControls();
  scheduleTick();
  if (!silent) say("nice play.", 1200);
}

function tossBall(event: MouseEvent) {
  const rect = petCanvas.getBoundingClientRect();
  const targetX = ((event.clientX - rect.left) / rect.width) * petCanvas.width;
  const targetY = ((event.clientY - rect.top) / rect.height) * petCanvas.height;
  ballGame.vx = Math.max(-190, Math.min(190, (targetX - ballGame.x) * 1.45));
  ballGame.vy = Math.max(-210, Math.min(-80, -150 + (targetY - ballGame.y) * 0.25));
  pet = {
    ...pet,
    mode: "walk",
    modeStartedAt: Date.now(),
    vx: targetX < pet.x + 64 ? -18 : 18,
  };
}

function renderBallGameControls() {
  ballButton.textContent = ballGame.active ? "stop" : "ball";
  ballButton.setAttribute("aria-pressed", String(ballGame.active));
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
    pet = grantPetReward(pet, "chat").state;
    say(reply, 3200);
  } catch {
    if (!sayPetLine("click", 1800)) say("今は短くいこう。", 1800);
  } finally {
    aiInFlight = false;
    renderAiControls();
    void saveState(pet);
  }
}

function exportCurrentPetCapsule() {
  const ownerNote = window.prompt("Owner note for this capsule", "") ?? "";
  const capsule = createPetCapsule(pet, ownerNote);
  const blob = new Blob([serializePetCapsule(capsule)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pet.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-") || "pixel-pet"}-capsule.json`;
  link.click();
  URL.revokeObjectURL(url);
  say("capsule saved.", 1200);
}

async function importSelectedPetCapsule(file: File) {
  let raw: string;
  try {
    raw = await file.text();
  } catch {
    say("invalid capsule.", 1400);
    return;
  }

  const imported = importPetCapsule(raw, pet, petPacks);
  if (!imported) {
    say("invalid capsule.", 1400);
    return;
  }

  pet = imported;
  updateStatus();
  renderPetSelector();
  renderer.draw(pet, performance.now(), ballGame);
  void saveState(pet);
  say(`${pet.name} imported.`, 1600);
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
  if (ballGame.active && !document.hidden) return activeBallFrameIntervalMs;
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
  const modeLabel = ballGame.active ? `ball ${ballGame.score}` : isLowDistractionActive() ? "quiet" : pet.mode;
  statusText.textContent = `${pet.name} L${pet.progression.level} / ${modeLabel} / ${pet.progression.xp}xp`;
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
  const rewarded = grantPetReward(
    {
      ...pet,
      mood: Math.min(100, pet.mood + 3),
      mode: "react",
      modeStartedAt: now,
      focusTimer: {
        ...pet.focusTimer,
        lastReminderElapsedMs: dueElapsed,
        lastReminderAt: now,
        completedSessions: pet.focusTimer.completedSessions + completedDelta,
      },
    },
    "focus",
    now,
  );
  pet = rewarded.state;
  announceReward(rewarded, true);
  if (!rewarded.leveledUp) sayPetLine("focus", 1800);
}

function announceReward(reward: PetRewardResult, showItem: boolean) {
  if (!reward.granted) return;
  if (reward.leveledUp) {
    say(`level ${reward.state.progression.level}.`, 1200);
  } else if (showItem && reward.item) {
    say(`+${rewardItemLabel(reward.item)}.`, 1200);
  }
}

function updateBallGame(dt: number) {
  if (!ballGame.active) return;

  const now = Date.now();
  if (now - ballGame.startedAt > ballGameMaxMs) {
    stopBallGame(true);
    say("nice play.", 1200);
    return;
  }

  ballGame.vy += 260 * dt;
  ballGame.x += ballGame.vx * dt;
  ballGame.y += ballGame.vy * dt;

  if (ballGame.x < ballGame.radius) {
    ballGame.x = ballGame.radius;
    ballGame.vx = Math.abs(ballGame.vx) * 0.72;
  }
  if (ballGame.x > petCanvas.width - ballGame.radius) {
    ballGame.x = petCanvas.width - ballGame.radius;
    ballGame.vx = -Math.abs(ballGame.vx) * 0.72;
  }
  if (ballGame.y > ballGroundY) {
    ballGame.y = ballGroundY;
    ballGame.vy = -Math.abs(ballGame.vy) * 0.52;
    ballGame.vx *= 0.84;
  }

  const petCenterX = pet.x + 64;
  const petCenterY = pet.y + 58;
  const dx = ballGame.x - petCenterX;
  const dy = ballGame.y - petCenterY;
  const distance = Math.hypot(dx, dy);
  if (distance < ballCatchRadius && now - ballGame.lastCatchAt > 700) {
    ballGame.lastCatchAt = now;
    ballGame.score += 1;
    ballGame.vx = (ballGame.x < petCenterX ? -1 : 1) * 120;
    ballGame.vy = -150;
    const rewarded = grantPetReward(
      {
        ...pet,
        mood: Math.min(100, pet.mood + 2),
        mode: "react",
        modeStartedAt: now,
      },
      "ball",
      now,
    );
    pet = rewarded.state;
    announceReward(rewarded, false);
    if (!rewarded.leveledUp && ballGame.score % 3 === 0) sayPetLine("click", 1200);
  } else if (Math.abs(dx) > 28 && pet.mode !== "react") {
    pet = {
      ...pet,
      mode: "walk",
      modeStartedAt: pet.mode === "walk" ? pet.modeStartedAt : now,
      vx: dx < 0 ? -18 : 18,
    };
  }

  if (now - ballGame.startedAt > 7_000 && Math.abs(ballGame.vx) < 8 && Math.abs(ballGame.vy) < 14) {
    stopBallGame();
  }
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
  updateBallGame(dt);
  updateFocusTimer(rendered);
  if (rendered) renderer.draw(pet, now, ballGame);
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
  renderBallGameControls();
  renderFocusTimer();
  renderAiControls();
  renderer.draw(pet, performance.now(), ballGame);
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

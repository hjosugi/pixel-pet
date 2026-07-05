import { PET_DIALOGUE_MAX_CHARS, chooseLine } from "./dialogue";
import type { AiProviderId, PetState } from "./state";
import type { PetPack } from "./packs";

export const AI_TIMEOUT_MS = 8_000;
export const AI_HISTORY_LIMIT = 6;

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiAdapterContext = {
  pet: PetState;
  pack: PetPack | null;
  history: AiChatMessage[];
  signal: AbortSignal;
  openAiApiKey?: string;
};

type AiAdapter = {
  id: AiProviderId;
  reply(input: string, context: AiAdapterContext): Promise<string>;
};

export class AiAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiAdapterError";
  }
}

const ruleAdapter: AiAdapter = {
  id: "rule",
  async reply(_input, context) {
    return chooseLine(context.pet, "click") ?? chooseLine(context.pet, "idle") ?? "ここにいるよ。";
  },
};

const ollamaAdapter: AiAdapter = {
  id: "ollama",
  async reply(input, context) {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: context.signal,
      body: JSON.stringify({
        model: "llama3.2",
        stream: false,
        messages: [
          { role: "system", content: systemPrompt(context) },
          ...context.history,
          { role: "user", content: input },
        ],
      }),
    });

    if (!response.ok) throw new AiAdapterError(`Ollama request failed: ${response.status}`);
    const data = (await response.json()) as unknown;
    return normalizeReply(readPath(data, ["message", "content"]));
  },
};

const openAiAdapter: AiAdapter = {
  id: "openai",
  async reply(input, context) {
    if (!context.openAiApiKey) throw new AiAdapterError("OpenAI API key is required");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.openAiApiKey}`,
      },
      signal: context.signal,
      body: JSON.stringify({
        model: "gpt-5.5",
        instructions: systemPrompt(context),
        input: [...context.history, { role: "user", content: input }],
      }),
    });

    if (!response.ok) throw new AiAdapterError(`OpenAI request failed: ${response.status}`);
    const data = (await response.json()) as unknown;
    return normalizeReply(readOpenAiText(data));
  },
};

const adapters: Record<AiProviderId, AiAdapter> = {
  rule: ruleAdapter,
  ollama: ollamaAdapter,
  openai: openAiAdapter,
};

export async function askPetAi(
  provider: AiProviderId,
  input: string,
  context: Omit<AiAdapterContext, "signal">,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    return await adapters[provider].reply(input, {
      ...context,
      history: context.history.slice(-AI_HISTORY_LIMIT),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function systemPrompt(context: AiAdapterContext) {
  const petName = context.pet.name;
  const petTone = context.pack?.name ?? "pixel pet";
  return [
    `You are ${petName}, a gentle desktop pet (${petTone}).`,
    `Reply in one short sentence under ${PET_DIALOGUE_MAX_CHARS} characters.`,
    "Do not mention being an AI. Do not ask follow-up questions.",
  ].join(" ");
}

function readPath(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function readOpenAiText(value: unknown) {
  const outputText = readPath(value, ["output_text"]);
  if (typeof outputText === "string") return outputText;

  const output = readPath(value, ["output"]);
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    const content = readPath(item, ["content"]);
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = readPath(part, ["text"]);
      if (typeof text === "string" && text.trim().length > 0) return text;
    }
  }
  return null;
}

function normalizeReply(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) throw new AiAdapterError("Adapter returned no text");
  const line = value.replace(/\s+/g, " ").trim();
  return line.length <= PET_DIALOGUE_MAX_CHARS ? line : `${line.slice(0, PET_DIALOGUE_MAX_CHARS - 3)}...`;
}

export type PetAiContext = {
  petName: string;
  mode: string;
  mood: number;
  energy: number;
  userMessage: string;
};

export type PetAiAdapter = {
  reply(context: PetAiContext): Promise<string>;
};

export class RuleBasedAiAdapter implements PetAiAdapter {
  async reply(context: PetAiContext): Promise<string> {
    if (context.energy < 25) return `${context.petName} is sleepy. 休憩しよ。`;
    if (context.userMessage.includes("疲")) return "今日は小さめに進めよ。";
    if (context.userMessage.includes("集中")) return "25分だけ一緒にやろ。";
    return "うん。となりで見てる。";
  }
}

// Future adapters:
// - OllamaAiAdapter: call local http://localhost:11434/api/chat only when the user opens chat.
// - OpenAiAdapter: call a cloud model only if the user explicitly configures an API key.

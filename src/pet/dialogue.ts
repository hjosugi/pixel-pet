import type { PetState } from "./state";

const clickLines = [
  "ん。まだいるよ。",
  "focus mode? いっしょにやろ。",
  "ログを見る前に、深呼吸。",
  "今日も少しずつ進んでる。",
  "neon tail online.",
];

const idleLines = [
  "画面のすみで見守り中。",
  "水のんだ？",
  "25分だけ、一緒に集中しよ。",
  "無理なら小さく分けよ。",
  "大丈夫。次の一手だけでいい。",
];

const focusLines = [
  "nice focus streak.",
  "ちょっと目を休めよ。",
  "commit 前に一回テストしよ。",
];

export function chooseLine(pet: PetState, reason: "click" | "idle" | "focus"): string {
  const pool = reason === "click" ? clickLines : reason === "focus" ? focusLines : idleLines;
  const seed = Math.floor((Date.now() / 1000 + pet.mood + pet.energy + pet.affection) % pool.length);
  return pool[seed];
}

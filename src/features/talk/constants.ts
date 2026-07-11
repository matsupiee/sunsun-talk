export const RESPONSES = new Map<string, string>([
  ["おはよう", "おはよう！"],
  ["こんにちは", "こんにちは！"],
  ["ありがとう", "どういたしまして！"],
  ["今日こんなことがあってね", "うんとえらいね！"],
]);

export const STICKER_BASE = "/assets/stickerpack@2x";

export const STICKER_IDS = [
  593654934, 593654935, 593654936, 593654937, 593654938, 593654939, 593654940, 593654941,
  593654942, 593654943, 593654944, 593654945, 593654946, 593654947, 593654948, 593654949,
  593654950, 593654951, 593654952, 593654953, 593654954, 593654955, 593654956, 593654957,
];

export const RESPONSE_STICKERS = new Map<string, number>([
  ["おはよう", 593654936],
  ["こんにちは", 593654934],
  ["ありがとう", 593654938],
  ["今日こんなことがあってね", 593654943],
]);

export type PeriodKey = "morning" | "day" | "evening" | "night";

export interface Period {
  key: PeriodKey;
  label: string;
  from: number;
  to: number;
}

export const PERIODS: Period[] = [
  { key: "morning", label: "朝", from: 5, to: 10 },
  { key: "day", label: "昼", from: 11, to: 16 },
  { key: "evening", label: "夕方", from: 17, to: 20 },
  { key: "night", label: "夜", from: 21, to: 4 },
];

export const QUICK_REPLIES = ["おはよう", "こんにちは", "ありがとう", "今日こんなことがあってね"];

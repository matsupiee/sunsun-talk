import { PERIODS, RESPONSES, STICKER_BASE, type Period } from "./constants";

export interface Sticker {
  id: number;
  image: string;
  sound: string;
}

export function getPeriod(date = new Date()): Period {
  const hour = date.getHours();
  return (
    PERIODS.find((period) => {
      if (period.from <= period.to) {
        return hour >= period.from && hour <= period.to;
      }
      return hour >= period.from || hour <= period.to;
    }) ?? PERIODS[1]
  );
}

export function normalize(text: string): string {
  return text.trim().replace(/\s+/g, "");
}

export function buildStickers(ids: number[]): Sticker[] {
  return ids.map((id) => ({
    id,
    image: `${STICKER_BASE}/animation@2x/${id}@2x.png`,
    sound: `${STICKER_BASE}/sound/${id}.m4a`,
  }));
}

export function replyFor(text: string): string {
  const exact = RESPONSES.get(text.trim());
  if (exact) return exact;

  const compact = normalize(text);
  for (const [key, value] of RESPONSES.entries()) {
    if (normalize(key) === compact) return value;
  }

  return "うんうん。";
}

export async function remoteReplyFor(text: string): Promise<string> {
  try {
    const response = await fetch("/api/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error("Reply API unavailable");

    const data = (await response.json()) as { reply?: unknown };
    if (typeof data.reply === "string") {
      return data.reply;
    }
  } catch {
    // The static-only dev server has no API, so keep the app usable there too.
  }

  return replyFor(text);
}

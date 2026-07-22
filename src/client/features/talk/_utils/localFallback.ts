import { RESPONSES } from "./constants";

export function normalize(text: string): string {
  return text.trim().replace(/\s+/g, "");
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

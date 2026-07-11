const replies = new Map<string, string>([
  ["おはよう", "おはよう！"],
  ["こんにちは", "こんにちは！"],
  ["ありがとう", "どういたしまして！"],
  ["今日こんなことがあってね", "うんとえらいね！"],
]);

function normalize(text: string) {
  return text.trim().replace(/\s+/g, "");
}

export function replyFor(text: string) {
  const exact = replies.get(text.trim());
  if (exact) return exact;

  const compact = normalize(text);
  for (const [key, value] of replies.entries()) {
    if (normalize(key) === compact) return value;
  }

  return "うんうん。";
}

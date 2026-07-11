const RESPONSES = new Map([
  ["おはよう", "おはよう！"],
  ["こんにちは", "こんにちは！"],
  ["ありがとう", "どういたしまして！"],
  ["今日こんなことがあってね", "うんとえらいね！"],
]);

const STICKER_BASE = "./assets/stickerpack@2x";
const STICKER_IDS = [
  593654934, 593654935, 593654936, 593654937, 593654938, 593654939, 593654940, 593654941,
  593654942, 593654943, 593654944, 593654945, 593654946, 593654947, 593654948, 593654949,
  593654950, 593654951, 593654952, 593654953, 593654954, 593654955, 593654956, 593654957,
];
const RESPONSE_STICKERS = new Map([
  ["おはよう", 593654936],
  ["こんにちは", 593654934],
  ["ありがとう", 593654938],
  ["今日こんなことがあってね", 593654943],
]);

const PERIODS = [
  { key: "morning", label: "朝", from: 5, to: 10 },
  { key: "day", label: "昼", from: 11, to: 16 },
  { key: "evening", label: "夕方", from: 17, to: 20 },
  { key: "night", label: "夜", from: 21, to: 4 },
];

const app = document.querySelector(".app");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#chatInput");
const messages = document.querySelector("#messages");
const quickReplies = document.querySelector(".quickReplies");
const clipPicker = document.querySelector("#clipPicker");
const video = document.querySelector("#puppetVideo");
const stickerImage = document.querySelector("#stickerPuppet");
const stickerSound = document.querySelector("#stickerSound");
const fallbackPuppet = document.querySelector("#fallbackPuppet");

let clips = [];
let stickers = buildStickers(STICKER_IDS);
let lastClipIndex = -1;
let lastStickerId = 0;
let talkingTimer = 0;
let chainTimer = 0;

function getPeriod(date = new Date()) {
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

function applyPeriod() {
  const period = getPeriod();
  app.dataset.period = period.key;
}

function appendMessage(text, sender) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${sender}`;
  bubble.textContent = text;
  messages.append(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function normalize(text) {
  return text.trim().replace(/\s+/g, "");
}

function buildStickers(ids) {
  return ids.map((id) => ({
    id,
    image: `${STICKER_BASE}/animation@2x/${id}@2x.png`,
    sound: `${STICKER_BASE}/sound/${id}.m4a`,
  }));
}

function replyFor(text) {
  const exact = RESPONSES.get(text.trim());
  if (exact) return exact;

  const compact = normalize(text);
  for (const [key, value] of RESPONSES.entries()) {
    if (normalize(key) === compact) return value;
  }

  return "うんうん。";
}

async function remoteReplyFor(text) {
  try {
    const response = await fetch("/api/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error("Reply API unavailable");

    const data = await response.json();
    if (typeof data.reply === "string") {
      return data.reply;
    }
  } catch {
    // The static-only dev server has no API, so keep the app usable there too.
  }

  return replyFor(text);
}

function stickerForInput(text) {
  const mapped = RESPONSE_STICKERS.get(normalize(text));
  if (mapped) {
    return stickers.find((sticker) => sticker.id === mapped) ?? randomSticker();
  }
  return randomSticker();
}

function randomSticker() {
  if (!stickers.length) return null;
  if (stickers.length === 1) return stickers[0];

  let next = stickers[Math.floor(Math.random() * stickers.length)];
  if (next.id === lastStickerId) {
    const currentIndex = stickers.findIndex((sticker) => sticker.id === next.id);
    next = stickers[(currentIndex + 1) % stickers.length];
  }
  return next;
}

function startTalking(duration = 1300) {
  window.clearTimeout(talkingTimer);
  fallbackPuppet.classList.add("is-talking");
  talkingTimer = window.setTimeout(() => {
    fallbackPuppet.classList.remove("is-talking");
  }, duration);
}

function playSticker(sticker, { sound = true } = {}) {
  if (!sticker) {
    fallbackPuppet.classList.add("is-active");
    startTalking();
    return;
  }

  lastStickerId = sticker.id;
  window.clearTimeout(chainTimer);
  video.pause();
  video.classList.remove("is-active");
  fallbackPuppet.classList.remove("is-active");
  stickerImage.classList.add("is-active");
  stickerImage.classList.remove("is-talking");

  const src = `${sticker.image}?run=${Date.now()}`;
  stickerImage.src = src;
  stickerImage.alt = "パペットステッカー";
  void stickerImage.offsetWidth;
  stickerImage.classList.add("is-talking");

  if (sound) {
    stickerSound.pause();
    stickerSound.volume = 0.58;
    stickerSound.src = sticker.sound;
    stickerSound.currentTime = 0;
    stickerSound.play().catch(() => {});
  }
}

function pickClipIndex() {
  if (clips.length <= 1) return 0;

  let next = Math.floor(Math.random() * clips.length);
  if (next === lastClipIndex) {
    next = (next + 1) % clips.length;
  }
  lastClipIndex = next;
  return next;
}

async function playRandomClip() {
  window.clearTimeout(chainTimer);

  if (!clips.length) {
    video.pause();
    video.classList.remove("is-active");
    playSticker(randomSticker(), { sound: false });
    return;
  }

  const clip = clips[pickClipIndex()];
  stickerImage.classList.remove("is-active");
  fallbackPuppet.classList.remove("is-active");
  video.classList.add("is-active");

  if (video.src !== clip.src) {
    video.src = clip.src;
  }

  try {
    video.currentTime = 0;
    await video.play();
  } catch {
    video.classList.remove("is-active");
    playSticker(randomSticker(), { sound: false });
  }
}

function scheduleNextClip() {
  if (!clips.length) return;
  const delay = 120 + Math.floor(Math.random() * 260);
  chainTimer = window.setTimeout(playRandomClip, delay);
}

async function loadManifestClips() {
  try {
    const response = await fetch("./assets/clips/manifest.json", { cache: "no-store" });
    if (!response.ok) return;

    const manifest = await response.json();
    const items = Array.isArray(manifest.clips) ? manifest.clips : [];
    clips = items
      .filter((item) => item && typeof item.src === "string" && item.src.trim())
      .map((item, index) => ({
        name: item.name || `clip-${index + 1}`,
        src: item.src,
      }));

    if (clips.length) {
      playRandomClip();
    }
  } catch {
    // Opening index.html directly can block fetch(); local file picker still works.
  }
}

async function loadStickerPack() {
  try {
    const response = await fetch(`${STICKER_BASE}/productInfo.meta`, { cache: "no-store" });
    if (!response.ok) return;

    const productInfo = await response.json();
    const ids = Array.isArray(productInfo.stickers)
      ? productInfo.stickers.map((sticker) => sticker.id).filter(Boolean)
      : [];
    if (ids.length) {
      stickers = buildStickers(ids);
    }
  } catch {
    // The hardcoded sticker ids cover direct file opening and local fetch failures.
  }
}

function addPickedClips(fileList) {
  const picked = Array.from(fileList || []).map((file) => ({
    name: file.name,
    src: URL.createObjectURL(file),
  }));

  clips = [...clips, ...picked];
  if (picked.length) {
    playRandomClip();
  }
}

function handleSay(rawText) {
  const text = rawText.trim();
  if (!text) return;

  appendMessage(text, "user");

  window.setTimeout(async () => {
    const response = await remoteReplyFor(text);
    appendMessage(response, "puppet");
    if (clips.length) {
      playRandomClip();
    } else {
      playSticker(stickerForInput(text));
    }
  }, 220);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  handleSay(input.value);
  input.value = "";
  input.focus();
});

quickReplies.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-say]");
  if (!button) return;
  handleSay(button.dataset.say);
});

clipPicker.addEventListener("change", (event) => {
  addPickedClips(event.target.files);
  event.target.value = "";
});

video.addEventListener("ended", scheduleNextClip);
video.addEventListener("error", () => {
  video.classList.remove("is-active");
  playSticker(randomSticker(), { sound: false });
});

stickerImage.addEventListener("error", () => {
  stickerImage.classList.remove("is-active");
  fallbackPuppet.classList.add("is-active");
  startTalking();
});

applyPeriod();
window.setInterval(applyPeriod, 60 * 1000);
loadStickerPack();
loadManifestClips();

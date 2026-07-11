import { useEffect, useRef, useState, type FormEvent, type CSSProperties } from "react";
import {
  QUICK_REPLIES,
  RESPONSE_STICKERS,
  STICKER_BASE,
  STICKER_IDS,
  type PeriodKey,
} from "./constants";
import {
  buildStickers,
  getPeriod,
  normalize,
  remoteReplyFor,
  type Sticker,
} from "./talk";

type Sender = "user" | "puppet";
type PuppetMode = "sticker" | "video" | "fallback";

interface Message {
  id: number;
  text: string;
  sender: Sender;
}

interface Clip {
  name: string;
  src: string;
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

// ---- Design tokens (スンスン・トークUI) --------------------------------------
const INK = "#16130E";
const PAGE_BG = "#FBF4E1";
const PANEL_BG = "#FCF8EE";
const YELLOW = "#F3B01C";
const BLUE = "#3E93D0";
const GOLD = "#C98A00";
const LISTEN_DOT = "#5BB56A";

// The paper-grain texture used across the page and the stage.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Time of day gently tints the stage instead of swapping photo backdrops.
const STAGE_BG: Record<PeriodKey, string> = {
  morning: "#F6C34D",
  day: YELLOW,
  evening: "#EF9270",
  night: "#6E8FCB",
};

const CHIP_DOTS = ["#E8503A", YELLOW, BLUE, LISTEN_DOT];

const INITIAL_STICKER = `${STICKER_BASE}/animation@2x/${STICKER_IDS[0]}@2x.png`;
const DEFAULT_CAPTION = "こんにちは！";

const puppetBodyStyle: CSSProperties = {
  background:
    "radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.92), transparent 0.82rem), radial-gradient(circle at 60% 32%, rgba(255, 255, 255, 0.88), transparent 0.72rem), linear-gradient(160deg, #f8fffc 0%, #efe4c6 74%, #e2cf9f 100%)",
  boxShadow: `inset -22px -22px 44px rgba(22, 19, 14, 0.12), inset 18px 20px 30px rgba(255, 255, 255, 0.72), 0 30px 44px rgba(22, 19, 14, 0.22)`,
  border: `3px solid ${INK}`,
};

export function TalkPage() {
  const [period, setPeriod] = useState<PeriodKey>(() => getPeriod().key);
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, text: DEFAULT_CAPTION, sender: "puppet" },
  ]);
  const [puppetMode, setPuppetMode] = useState<PuppetMode>("sticker");
  const [stickerSrc, setStickerSrc] = useState(INITIAL_STICKER);
  const [stickerAnimationKey, setStickerAnimationKey] = useState(0);
  const [isStickerTalking, setIsStickerTalking] = useState(false);
  const [isFallbackTalking, setIsFallbackTalking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);

  const messageId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stickerRef = useRef<HTMLImageElement>(null);
  const stickerSoundRef = useRef<HTMLAudioElement>(null);

  const clips = useRef<Clip[]>([]);
  const stickers = useRef<Sticker[]>(buildStickers(STICKER_IDS));
  const lastClipIndex = useRef(-1);
  const lastStickerId = useRef(0);
  const talkingTimer = useRef(0);
  const chainTimer = useRef(0);
  const speakingTimer = useRef(0);
  const mutedRef = useRef(false);

  const isStickerMode = puppetMode === "sticker";
  const isVideoMode = puppetMode === "video";

  const stageBg = STAGE_BG[period];

  // The puppet's latest line becomes the caption; user lines fill the transcript.
  const puppetMessages = messages.filter((message) => message.sender === "puppet");
  const caption = puppetMessages.at(-1)?.text ?? DEFAULT_CAPTION;
  const captionKey = puppetMessages.length;
  const myMessages = messages.filter((message) => message.sender === "user");

  function appendMessage(text: string, sender: Sender) {
    setMessages((prev) => [...prev, { id: messageId.current++, text, sender }]);
  }

  function markSpeaking(text: string) {
    window.clearTimeout(speakingTimer.current);
    setSpeaking(true);
    const duration = Math.min(6000, 1400 + text.length * 130);
    speakingTimer.current = window.setTimeout(() => setSpeaking(false), duration);
  }

  function toggleMute() {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      if (next) stickerSoundRef.current?.pause();
      return next;
    });
  }

  function randomSticker(): Sticker | null {
    const list = stickers.current;
    if (!list.length) return null;
    if (list.length === 1) return list[0];

    let next = list[Math.floor(Math.random() * list.length)];
    if (next.id === lastStickerId.current) {
      const currentIndex = list.findIndex((sticker) => sticker.id === next.id);
      next = list[(currentIndex + 1) % list.length];
    }
    return next;
  }

  function stickerForInput(text: string): Sticker | null {
    const mapped = RESPONSE_STICKERS.get(normalize(text));
    if (mapped) {
      return stickers.current.find((sticker) => sticker.id === mapped) ?? randomSticker();
    }
    return randomSticker();
  }

  function startTalking(duration = 1300) {
    window.clearTimeout(talkingTimer.current);
    setIsFallbackTalking(true);
    talkingTimer.current = window.setTimeout(() => {
      setIsFallbackTalking(false);
    }, duration);
  }

  function playSticker(sticker: Sticker | null, { sound = true }: { sound?: boolean } = {}) {
    const stickerImage = stickerRef.current;
    const video = videoRef.current;
    const stickerSound = stickerSoundRef.current;

    if (!sticker || !stickerImage) {
      setPuppetMode("fallback");
      startTalking();
      return;
    }

    lastStickerId.current = sticker.id;
    window.clearTimeout(chainTimer.current);
    video?.pause();

    setPuppetMode("sticker");
    setIsStickerTalking(false);
    setStickerAnimationKey((key) => key + 1);
    stickerImage.src = `${sticker.image}?run=${Date.now()}`;
    setStickerSrc(stickerImage.src);

    // Re-apply a short talking animation for each new sticker.
    window.setTimeout(() => {
      setIsStickerTalking(true);
    }, 0);

    if (sound && !mutedRef.current && stickerSound) {
      stickerSound.pause();
      stickerSound.volume = 0.58;
      stickerSound.src = sticker.sound;
      stickerSound.currentTime = 0;
      stickerSound.play().catch(() => {});
    }
  }

  function pickClipIndex(): number {
    if (clips.current.length <= 1) return 0;

    let next = Math.floor(Math.random() * clips.current.length);
    if (next === lastClipIndex.current) {
      next = (next + 1) % clips.current.length;
    }
    lastClipIndex.current = next;
    return next;
  }

  async function playRandomClip() {
    window.clearTimeout(chainTimer.current);
    const video = videoRef.current;

    if (!clips.current.length || !video) {
      video?.pause();
      playSticker(randomSticker(), { sound: false });
      return;
    }

    const clip = clips.current[pickClipIndex()];
    setPuppetMode("video");
    setIsFallbackTalking(false);

    if (video.src !== clip.src) {
      video.src = clip.src;
    }

    try {
      video.currentTime = 0;
      await video.play();
    } catch {
      setPuppetMode("sticker");
      playSticker(randomSticker(), { sound: false });
    }
  }

  function scheduleNextClip() {
    if (!clips.current.length) return;
    const delay = 120 + Math.floor(Math.random() * 260);
    chainTimer.current = window.setTimeout(playRandomClip, delay);
  }

  function addPickedClips(fileList: FileList | null) {
    const picked: Clip[] = Array.from(fileList ?? []).map((file) => ({
      name: file.name,
      src: URL.createObjectURL(file),
    }));

    clips.current = [...clips.current, ...picked];
    if (picked.length) {
      playRandomClip();
    }
  }

  function handleSay(rawText: string) {
    const text = rawText.trim();
    if (!text) return;

    appendMessage(text, "user");

    window.setTimeout(async () => {
      const response = await remoteReplyFor(text);
      appendMessage(response, "puppet");
      markSpeaking(response);
      if (clips.current.length) {
        playRandomClip();
      } else {
        playSticker(stickerForInput(text));
      }
    }, 220);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = inputRef.current;
    if (!input) return;
    handleSay(input.value);
    input.value = "";
    input.focus();
  }

  // Keep the background period in sync with the clock.
  useEffect(() => {
    const id = window.setInterval(() => setPeriod(getPeriod().key), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-scroll the message log to the latest bubble.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Load the sticker pack manifest and any local clip manifest once on mount.
  useEffect(() => {
    let cancelled = false;

    async function loadStickerPack() {
      try {
        const response = await fetch(`${STICKER_BASE}/productInfo.meta`, { cache: "no-store" });
        if (!response.ok) return;

        const productInfo = (await response.json()) as { stickers?: Array<{ id?: number }> };
        const ids = Array.isArray(productInfo.stickers)
          ? productInfo.stickers.map((sticker) => sticker.id).filter((id): id is number => Boolean(id))
          : [];
        if (ids.length && !cancelled) {
          stickers.current = buildStickers(ids);
        }
      } catch {
        // The hardcoded sticker ids cover direct file opening and local fetch failures.
      }
    }

    async function loadManifestClips() {
      try {
        const response = await fetch('/assets/clips/manifest.json', { cache: 'no-store' });
        if (!response.ok) return;

        const manifest = (await response.json()) as { clips?: Array<{ name?: string; src?: unknown }> };
        const items = Array.isArray(manifest.clips) ? manifest.clips : [];
        const loaded: Clip[] = items
          .filter((item): item is { name?: string; src: string } =>
            Boolean(item && typeof item.src === 'string' && item.src.trim()),
          )
          .map((item, index) => ({
            name: item.name || `clip-${index + 1}`,
            src: item.src,
          }));

        if (cancelled) return;
        clips.current = loaded;
        if (loaded.length) {
          playRandomClip();
        }
      } catch {
        // Opening index.html directly can block fetch(); local file picker still works.
      }
    }

    loadStickerPack();
    loadManifestClips();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main
      className={cn(
        "relative flex min-h-[100svh] w-full flex-col items-center",
        "px-[clamp(14px,4vw,40px)] pt-[clamp(18px,3.4vh,42px)] pb-[clamp(18px,3.4vh,52px)]",
        "max-[680px]:px-0 max-[680px]:pt-[10px] max-[680px]:pb-0",
      )}
      style={{ background: PAGE_BG, color: INK }}
      data-period={period}
    >
      {/* page paper grain */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.05] [mix-blend-mode:multiply]"
        style={{ backgroundImage: GRAIN }}
      />

      {/* title lockup — the header logo stays as the wordmark */}
      <header className="relative z-[1] mb-[clamp(12px,2.2vh,22px)] shrink-0 text-center max-[680px]:mb-[8px]">
        <div
          className="mb-[6px] pl-[0.4em] text-[12px] font-semibold tracking-[0.4em] max-[680px]:hidden"
          style={{ fontFamily: "'Zilla Slab', serif", color: INK }}
        >
          PUPPET SUNSUN
        </div>
        <h1 className="m-0 leading-[0]">
          <img
            className="mx-auto block h-auto w-[clamp(150px,42vw,280px)] max-w-full select-none object-contain [-webkit-user-drag:none] max-[680px]:w-[168px]"
            src="/assets/header_logo.png"
            alt="PUPPET TALK"
            style={{ filter: "brightness(0)" }}
          />
        </h1>
        <p
          className="mx-auto mt-[8px] mb-0 max-w-[340px] text-[13px] font-medium max-[680px]:hidden"
          style={{ color: "#8a7648" }}
        >
          文字で話しかけると、スンスンが動いてお返事するよ♪
        </p>
      </header>

      {/* ============ PHONE FRAME ============ */}
      <section
        className={cn(
          "relative z-[1] flex w-[min(420px,94vw)] min-h-0 max-h-[812px] flex-1 flex-col overflow-hidden",
          "rounded-[46px] border-4 border-[#16130E] shadow-[0_22px_50px_-12px_rgba(0,0,0,0.4)]",
          "max-[680px]:w-full max-[680px]:max-h-none max-[680px]:rounded-none max-[680px]:border-0 max-[680px]:shadow-none",
        )}
        style={{ background: PANEL_BG }}
        aria-label="おしゃべりステージ"
      >
        {/* ===== STAGE ===== */}
        <div
          className="relative flex min-h-[240px] flex-[1.5_1_0] overflow-hidden transition-[background] duration-700"
          style={{ background: stageBg }}
        >
          {/* stage paper grain */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[3] opacity-[0.14] [mix-blend-mode:multiply]"
            style={{ backgroundImage: GRAIN }}
          />

          {/* status pill + mute toggle */}
          <div className="absolute inset-x-[16px] top-[16px] z-[7] flex items-center justify-between">
            <span
              className="inline-flex items-center gap-[7px] rounded-full px-[15px] py-[6px] text-[12.5px] font-bold text-white"
              style={{ background: INK }}
            >
              <span
                className="inline-block h-[8px] w-[8px] rounded-full"
                style={{ background: speaking ? YELLOW : LISTEN_DOT }}
              />
              {speaking ? "おはなし ちゅう♪" : "きいてるよ"}
            </span>
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-full px-[12px] py-[7px] text-[11.5px] font-bold transition-transform duration-150 active:translate-y-px"
              style={{
                border: `2.5px solid ${INK}`,
                background: muted ? PANEL_BG : INK,
                color: muted ? INK : "#fff",
              }}
              aria-pressed={muted}
              title={muted ? "音声をオンにする" : "音声をオフにする"}
            >
              {muted ? "音声 OFF" : "音声 ON"}
            </button>
          </div>

          {/* character */}
          <div className="absolute inset-x-0 bottom-0 z-[1] grid h-[92%] place-items-end justify-items-center">
            <div
              className="grid aspect-square h-full max-w-[96%] place-items-center [transform-origin:50%_100%]"
            >
              <img
                ref={stickerRef}
                key={stickerAnimationKey}
                className={cn(
                  isStickerMode ? "block" : "hidden",
                  "max-h-full w-auto object-contain",
                  "[filter:drop-shadow(0_18px_18px_rgba(22,19,14,0.22))]",
                  "select-none [-webkit-user-drag:none]",
                )}
                src={stickerSrc}
                alt="スンスン ステッカー"
                style={
                  puppetMode === "sticker"
                    ? { animation: isStickerTalking ? "stickerPop 700ms ease both" : "none" }
                    : undefined
                }
                onError={() => {
                  setPuppetMode("fallback");
                  startTalking();
                }}
              />

              <video
                ref={videoRef}
                id="puppetVideo"
                className={cn(
                  isVideoMode ? "block" : "hidden",
                  "h-full w-full object-contain",
                  "[filter:drop-shadow(0_18px_18px_rgba(22,19,14,0.22))]",
                )}
                muted
                playsInline
                preload="metadata"
                aria-label="スンスン 動画"
                onEnded={scheduleNextClip}
                onError={() => {
                  if (videoRef.current) {
                    videoRef.current.pause();
                  }
                  playSticker(randomSticker(), { sound: false });
                }}
              />

              <div
                className={cn(
                  "absolute inset-0 place-items-center",
                  puppetMode === "fallback" ? "grid" : "hidden",
                )}
                aria-hidden="true"
              >
                <div
                  className="relative aspect-[0.9] w-[60%] [border-radius:48%_48%_42%_42%] [transform-origin:50%_80%]"
                  style={{
                    ...puppetBodyStyle,
                    animation: isFallbackTalking
                      ? "puppetFloat 1.4s ease-in-out infinite, talkBounce 420ms ease-in-out infinite"
                      : "puppetFloat 2.4s ease-in-out infinite",
                  }}
                >
                  <span
                    className="absolute left-[34%] top-[38%] aspect-square w-[10%] rounded-full"
                    style={{ background: INK }}
                    aria-hidden="true"
                  />
                  <span
                    className="absolute right-[34%] top-[38%] aspect-square w-[10%] rounded-full"
                    style={{ background: INK }}
                    aria-hidden="true"
                  />
                  <span
                    className="absolute left-1/2 top-[54%] w-[15%] rounded-b-[999px] rounded-t-[0] border-b-[4px]"
                    style={
                      isFallbackTalking
                        ? {
                            height: "10%",
                            borderWidth: "0",
                            background: INK,
                            animation: "mouthTalk 280ms ease-in-out infinite",
                            transform: "translateX(-50%)",
                            transformOrigin: "50% 0",
                          }
                        : {
                            height: "5%",
                            borderColor: INK,
                            animation: "none",
                            transform: "translateX(-50%)",
                            transformOrigin: "50% 0",
                          }
                    }
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* caption bubble (スンスンのお返事) */}
          {/*一旦コメントアウト*/}
          {/*<div className="absolute inset-x-[16px] bottom-[16px] z-[8]">
            <div
              className="absolute -bottom-[8px] left-[42px] h-[18px] w-[18px] rotate-45"
              style={{ background: "#fff", borderRight: `3px solid ${INK}`, borderBottom: `3px solid ${INK}` }}
            />
            <div
              key={captionKey}
              className="relative"
              style={{
                background: "#fff",
                border: `3px solid ${INK}`,
                borderRadius: 24,
                padding: "13px 18px",
                boxShadow: "0 5px 0 rgba(22,19,14,.12)",
                animation: "capnpop .35s ease-out",
              }}
            >
              <div
                className="mb-[3px] text-[11px] font-bold tracking-[0.22em]"
                style={{ fontFamily: "'Zilla Slab', serif", color: GOLD }}
              >
                SUNSUN
              </div>
              <div className="text-[18px] font-bold leading-[1.42]" style={{ color: INK }}>
                {caption}
              </div>
            </div>
          </div>*/}
        </div>

        <audio ref={stickerSoundRef} id="stickerSound" preload="auto" />

        {/* ===== BOTTOM (input area) ===== */}
        <div
          className="flex min-h-[210px] flex-[1_1_0] flex-col"
          style={{ background: PANEL_BG, borderTop: `3px solid ${INK}` }}
        >
          {/* your transcript */}
          <div
            ref={messagesRef}
            id="messages"
            className="flex min-h-0 flex-1 flex-col gap-[9px] overflow-y-auto px-[16px] pt-[16px] pb-[4px] [scrollbar-width:thin]"
          >
            <div className="text-center">
              <span
                className="text-[10.5px] font-semibold uppercase tracking-[0.18em]"
                style={{ fontFamily: "'Zilla Slab', serif", color: "#a48a55" }}
              >
                Your messages
              </span>
            </div>
            {myMessages.length === 0 && (
              <div className="mt-[6px] text-center text-[12.5px] font-medium" style={{ color: "#a48a55" }}>
                スンスンに はなしかけてみてね
              </div>
            )}
            {myMessages.map((message) => (
              <div key={message.id} className="flex justify-end">
                <div
                  className="max-w-[80%] animate-[bubbleIn_240ms_ease_both] text-[14px] font-medium leading-[1.45] text-white"
                  style={{
                    background: BLUE,
                    border: `2.5px solid ${INK}`,
                    borderRadius: "18px 18px 6px 18px",
                    padding: "9px 14px",
                    boxShadow: "0 2px 0 rgba(22,19,14,.18)",
                  }}
                >
                  {message.text}
                </div>
              </div>
            ))}
          </div>

          {/* quick chips */}
          <div
            className="flex shrink-0 gap-[8px] overflow-x-auto px-[16px] pt-[6px] pb-[4px] [scrollbar-width:thin]"
            aria-label="入力候補"
          >
            {QUICK_REPLIES.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => handleSay(label)}
                className="inline-flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-full px-[15px] py-[8px] text-[13px] font-bold transition-transform duration-150 hover:-translate-y-px active:translate-y-px"
                style={{
                  background: "#FFFDF7",
                  color: INK,
                  border: `2.5px solid ${INK}`,
                  boxShadow: "0 2px 0 rgba(22,19,14,.14)",
                }}
              >
                <span
                  className="inline-block h-[8px] w-[8px] rounded-full"
                  style={{ background: CHIP_DOTS[index % CHIP_DOTS.length] }}
                />
                {label}
              </button>
            ))}
          </div>

          {/* input */}
          <form
            className="flex shrink-0 items-center gap-[10px] px-[16px] pt-[8px] pb-[18px]"
            onSubmit={handleSubmit}
          >
            <label
              className="relative grid h-[52px] w-[52px] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full transition-transform duration-150 hover:-translate-y-px active:translate-y-px"
              style={{
                background: "#FFFDF7",
                border: `2.5px solid ${INK}`,
                boxShadow: "0 3px 0 rgba(22,19,14,.2)",
                color: INK,
              }}
              title="ローカル動画を追加"
            >
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                multiple
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => {
                  addPickedClips(event.target.files);
                  event.target.value = "";
                }}
              />
              <svg
                className="pointer-events-none h-[22px] w-[22px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.6]"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="absolute h-px w-px overflow-hidden [clip:rect(0,0,0,0)]">clips</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              placeholder="スンスンに はなしかける…"
              aria-label="スンスンに はなしかける"
              className="h-[52px] min-w-0 flex-1 rounded-full px-[16px] text-[15px] font-medium outline-none placeholder:font-medium placeholder:text-[#9c8a63]"
              style={{ background: "#fff", border: `2.5px solid ${INK}`, color: INK }}
            />
            <button
              className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full text-[22px] transition-transform duration-150 hover:-translate-y-px active:translate-y-px"
              style={{
                background: YELLOW,
                border: `2.5px solid ${INK}`,
                boxShadow: "0 3px 0 rgba(22,19,14,.35)",
                fontFamily: "'Baloo 2', cursive",
                fontWeight: 800,
                color: INK,
              }}
              type="submit"
              title="送信"
              aria-label="送信"
            >
              ↑
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

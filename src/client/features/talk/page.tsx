import { useEffect, useRef, useState, type FormEvent, type CSSProperties } from "react";
import {
  QUICK_REPLIES,
  RESPONSE_STICKERS,
  STICKER_BASE,
  STICKER_IDS,
  type PeriodKey,
} from "./_utils/constants";
import { normalize } from "./_utils/localFallback";
import { getPeriod } from "./_utils/period";
import { buildStickers, type Sticker } from "./_utils/stickers";
import { remoteTalkFor } from "./_utils/talkApi";
import type { TalkHistoryMessage } from "../../../api-contracts/talk";

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

interface ThemeStyle {
  appBg: string;
  backdropBg: string;
  textColor: string;
  accent: string;
  accentDark: string;
  user: string;
  bubble: string;
  bubbleForeground: string;
  panel: string;
  panelStrong: string;
  line: string;
  focusRing: string;
  talkPanelBg: string;
  talkPanelBorder: string;
  talkPanelShadow: string;
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const THEME: Record<PeriodKey, ThemeStyle> = {
  morning: {
    appBg:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 252, 235, 0.32)), url('/assets/backgrounds/morning.png'), linear-gradient(140deg, #ffe3b8 0%, #a9dfff 48%, #dcf7e7 100%)",
    backdropBg:
      "linear-gradient(90deg, rgba(255, 255, 255, 0.46), transparent 36%, transparent 64%, rgba(255, 255, 255, 0.2)), radial-gradient(circle at 50% 106%, rgba(255, 255, 255, 0.84), transparent 22rem)",
    textColor: "#15211d",
    accent: "#e8783f",
    accentDark: "#b84f29",
    user: "#d46035",
    bubble: "#f8fffb",
    bubbleForeground: "#15211d",
    panel: "rgba(255, 255, 255, 0.78)",
    panelStrong: "rgba(255, 255, 255, 0.92)",
    line: "rgba(21, 33, 29, 0.12)",
    focusRing: "rgba(232, 120, 63, 0.16)",
    talkPanelBg: "rgba(255, 255, 255, 0.78)",
    talkPanelBorder: "rgba(255, 255, 255, 0.56)",
    talkPanelShadow: "0 24px 70px rgba(22, 58, 47, 0.16)",
  },
  day: {
    appBg:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(234, 255, 249, 0.28)), url('/assets/backgrounds/day.jpg'), linear-gradient(135deg, #bdeaff 0%, #f7f0c7 54%, #c7efd4 100%)",
    backdropBg:
      "linear-gradient(90deg, rgba(255, 255, 255, 0.46), transparent 36%, transparent 64%, rgba(255, 255, 255, 0.2)), radial-gradient(circle at 50% 106%, rgba(255, 255, 255, 0.84), transparent 22rem)",
    textColor: "#15211d",
    accent: "#1d8f72",
    accentDark: "#0f5f4b",
    user: "#1d8f72",
    bubble: "#f8fffb",
    bubbleForeground: "#15211d",
    panel: "rgba(255, 255, 255, 0.78)",
    panelStrong: "rgba(255, 255, 255, 0.92)",
    line: "rgba(21, 33, 29, 0.12)",
    focusRing: "rgba(29, 143, 114, 0.16)",
    talkPanelBg: "rgba(255, 255, 255, 0.78)",
    talkPanelBorder: "rgba(255, 255, 255, 0.56)",
    talkPanelShadow: "0 24px 70px rgba(22, 58, 47, 0.16)",
  },
  evening: {
    appBg:
      "linear-gradient(180deg, rgba(255, 247, 230, 0.02), rgba(70, 30, 44, 0.16)), url('/assets/backgrounds/evening.png'), linear-gradient(140deg, #ffc08f 0%, #f5a2ba 48%, #88bfd1 100%)",
    backdropBg:
      "linear-gradient(90deg, rgba(255, 255, 255, 0.46), transparent 36%, transparent 64%, rgba(255, 255, 255, 0.2)), radial-gradient(circle at 50% 106%, rgba(255, 255, 255, 0.84), transparent 22rem)",
    textColor: "#15211d",
    accent: "#bd5d80",
    accentDark: "#87405a",
    user: "#a44e70",
    bubble: "#f8fffb",
    bubbleForeground: "#15211d",
    panel: "rgba(255, 255, 255, 0.78)",
    panelStrong: "rgba(255, 255, 255, 0.92)",
    line: "rgba(21, 33, 29, 0.12)",
    focusRing: "rgba(189, 93, 128, 0.16)",
    talkPanelBg: "rgba(255, 255, 255, 0.78)",
    talkPanelBorder: "rgba(255, 255, 255, 0.56)",
    talkPanelShadow: "0 24px 70px rgba(22, 58, 47, 0.16)",
  },
  night: {
    appBg:
      "linear-gradient(180deg, rgba(16, 25, 58, 0.08), rgba(8, 15, 42, 0.38)), url('/assets/backgrounds/night.jpg'), linear-gradient(145deg, #213a72 0%, #735a99 52%, #b7d7dc 100%)",
    backdropBg:
      "linear-gradient(90deg, rgba(9, 14, 36, 0.28), transparent 38%, transparent 64%, rgba(9, 14, 36, 0.22)), radial-gradient(circle at 50% 108%, rgba(255, 255, 255, 0.2), transparent 22rem)",
    textColor: "#f7fbff",
    accent: "#557bd7",
    accentDark: "#304e98",
    user: "#4a66bd",
    bubble: "#f8fffb",
    bubbleForeground: "#14201d",
    panel: "rgba(255, 255, 255, 0.78)",
    panelStrong: "rgba(255, 255, 255, 0.92)",
    line: "rgba(255, 255, 255, 0.2)",
    focusRing: "rgba(85, 123, 215, 0.16)",
    talkPanelBg: "rgba(13, 22, 52, 0.6)",
    talkPanelBorder: "rgba(255, 255, 255, 0.18)",
    talkPanelShadow: "0 24px 70px rgba(3, 7, 20, 0.35)",
  },
};

const INITIAL_STICKER = `${STICKER_BASE}/animation@2x/${STICKER_IDS[0]}@2x.png`;
const puppetBodyStyle: CSSProperties = {
  background:
    "radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.92), transparent 0.82rem), radial-gradient(circle at 60% 32%, rgba(255, 255, 255, 0.88), transparent 0.72rem), linear-gradient(160deg, #f8fffc 0%, #e1efe8 74%, #c0d9cf 100%)",
  boxShadow:
    "inset -28px -28px 52px rgba(32, 80, 66, 0.13), inset 22px 24px 34px rgba(255, 255, 255, 0.72), 0 40px 54px rgba(24, 53, 45, 0.24)",
};

export function TalkPage() {
  const [period, setPeriod] = useState<PeriodKey>(() => getPeriod().key);
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, text: "こんにちは！", sender: "puppet" },
  ]);
  const [puppetMode, setPuppetMode] = useState<PuppetMode>("sticker");
  const [stickerSrc, setStickerSrc] = useState(INITIAL_STICKER);
  const [stickerAnimationKey, setStickerAnimationKey] = useState(0);
  const [isStickerTalking, setIsStickerTalking] = useState(false);
  const [isFallbackTalking, setIsFallbackTalking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"ready" | "thinking" | "speaking">("ready");

  const messageId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stickerRef = useRef<HTMLImageElement>(null);
  const stickerSoundRef = useRef<HTMLAudioElement>(null);
  const generatedVoiceRef = useRef<HTMLAudioElement>(null);

  const clips = useRef<Clip[]>([]);
  const stickers = useRef<Sticker[]>(buildStickers(STICKER_IDS));
  const lastClipIndex = useRef(-1);
  const lastStickerId = useRef(0);
  const talkingTimer = useRef(0);
  const chainTimer = useRef(0);

  const theme = THEME[period];
  const isStickerMode = puppetMode === "sticker";
  const isVideoMode = puppetMode === "video";
  const themeVars = {
    "--ink": "#15211d",
    "--muted": "rgba(21, 33, 29, 0.64)",
    "--panel": theme.panel,
    "--panel-strong": theme.panelStrong,
    "--line": theme.line,
    "--accent": theme.accent,
    "--accent-dark": theme.accentDark,
    "--bubble": theme.bubble,
    "--user": theme.user,
    "--bubble-fg": theme.bubbleForeground,
    "--focus-ring": theme.focusRing,
  } as CSSProperties;

  const talkPanelStyle: CSSProperties = {
    backgroundColor: theme.talkPanelBg,
    borderColor: theme.talkPanelBorder,
    boxShadow: theme.talkPanelShadow,
  };

  function appendMessage(text: string, sender: Sender) {
    setMessages((prev) => [...prev, { id: messageId.current++, text, sender }]);
  }

  function historyForApi(): TalkHistoryMessage[] {
    return messages.slice(-10).map<TalkHistoryMessage>((message) => ({
      role: message.sender === "puppet" ? "assistant" : "user",
      content: message.text,
    }));
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

    if (sound && stickerSound) {
      stickerSound.pause();
      stickerSound.volume = 0.58;
      stickerSound.src = sticker.sound;
      stickerSound.currentTime = 0;
      stickerSound.play().catch(() => {});
    }
  }

  async function playGeneratedVoice(audioUrl: string) {
    const audio = generatedVoiceRef.current;
    const stickerSound = stickerSoundRef.current;
    const video = videoRef.current;

    if (!audio) return false;

    video?.pause();
    stickerSound?.pause();
    window.clearTimeout(chainTimer.current);

    setPuppetMode("sticker");
    setIsStickerTalking(true);
    setVoiceStatus("speaking");

    audio.pause();
    audio.src = audioUrl;
    audio.currentTime = 0;

    try {
      await audio.play();
      return true;
    } catch {
      setVoiceStatus("ready");
      setIsStickerTalking(false);
      return false;
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
    if (!text || isGenerating) return;

    appendMessage(text, "user");
    setIsGenerating(true);
    setVoiceStatus("thinking");
    const history = historyForApi();

    window.setTimeout(async () => {
      try {
        const response = await remoteTalkFor(text, history);
        appendMessage(response.reply, "puppet");

        if (response.audioUrl) {
          playSticker(stickerForInput(text), { sound: false });
          const played = await playGeneratedVoice(response.audioUrl);
          if (!played) playSticker(stickerForInput(text));
        } else if (clips.current.length) {
          setVoiceStatus("ready");
          playRandomClip();
        } else {
          setVoiceStatus("ready");
          playSticker(stickerForInput(text));
        }
      } finally {
        setIsGenerating(false);
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
        "min-h-[100svh] bg-cover bg-center bg-no-repeat transition-[background] duration-700",
        "text-[var(--ink)]",
      )}
      style={{
        ...themeVars,
        backgroundImage: theme.appBg,
        color: theme.textColor,
      }}
      data-period={period}
    >
      <section
        className={cn(
          "relative grid min-h-[620px] h-[100svh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden isolate",
          "p-[clamp(18px,3vw,34px)]",
          "max-[680px]:h-[100svh] max-[680px]:min-h-[100svh] max-[680px]:p-[16px]",
        )}
        aria-label="おしゃべりステージ"
      >
        <div
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{ backgroundImage: theme.backdropBg }}
          aria-hidden="true"
        />

        <header className="mx-auto flex w-full max-w-[1040px] min-w-0 items-start justify-start max-[680px]:items-center">
          <h1 className="m-0 leading-[0]">
            <img
              className="block h-auto w-[clamp(110px,21vw,260px)] max-w-full select-none object-contain [mix-blend-mode:screen] [-webkit-user-drag:none]"
              src="/assets/header_logo.png"
              alt="PUPPET TALK"
            />
          </h1>
        </header>

        <div className="relative self-center justify-self-center grid place-items-center w-[min(42svh,390px)] max-w-[82vw] max-h-full aspect-square mx-auto m-[clamp(4px,2svh,22px)] max-[680px]:w-[min(37svh,84vw)]">
          <img
            ref={stickerRef}
            key={stickerAnimationKey}
            className={cn(
              "w-[min(100%,390px)] max-h-full object-contain",
              "[filter:drop-shadow(0_34px_34px_rgba(24,53,45,0.26))]",
              "[transform-origin:50%_82%] select-none [-webkit-user-drag:none]",
              isStickerMode ? "block" : "hidden",
            )}
            src={stickerSrc}
            alt="パペットステッカー"
            style={
              puppetMode === "sticker"
                ? {
                    animation: isStickerTalking
                      ? "stickerPop 900ms ease both, puppetFloat 2.6s ease-in-out infinite 0.9s"
                      : "puppetFloat 2.6s ease-in-out infinite",
                  }
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
              "w-full h-full object-cover",
              "[border-radius:44%_44%_38%_38%] [filter:drop-shadow(0_38px_44px_rgba(24,53,45,0.26))]",
              "[transform-origin:50%_80%]",
              isVideoMode ? "block animate-[puppetFloat_2.4s_ease-in-out_infinite]" : "hidden",
            )}
            muted
            playsInline
            preload="metadata"
            aria-label="パペット動画"
            onEnded={scheduleNextClip}
            onError={() => {
              if (videoRef.current) {
                videoRef.current.pause();
              }
              playSticker(randomSticker(), { sound: false });
            }}
          />

          <div
            className={cn("absolute inset-0 place-items-center", puppetMode === "fallback" ? "grid" : "hidden")}
            aria-hidden="true"
          >
            <div
              className="relative w-[76%] aspect-[0.9] [border-radius:48%_48%_42%_42%] [transform-origin:50%_80%]"
              style={{
                ...puppetBodyStyle,
                animation: isFallbackTalking
                  ? "puppetFloat 1.4s ease-in-out infinite, talkBounce 420ms ease-in-out infinite"
                  : "puppetFloat 2.4s ease-in-out infinite",
              }}
            >
              <span
                className="absolute top-[38%] left-[34%] w-[10%] aspect-square rounded-full bg-[#15211d] [box-shadow:inset_0_-2px_0_rgba(255,255,255,0.18)]"
                aria-hidden="true"
              />
              <span
                className="absolute top-[38%] right-[34%] w-[10%] aspect-square rounded-full bg-[#15211d] [box-shadow:inset_0_-2px_0_rgba(255,255,255,0.18)]"
                aria-hidden="true"
              />
              <span
                className="absolute left-1/2 top-[54%] w-[15%] rounded-b-[999px] rounded-t-[0] border-b-[4px] border-[#15211d]"
                style={
                  isFallbackTalking
                    ? {
                        height: "10%",
                        borderWidth: "0",
                        background: "#15211d",
                        animation: "mouthTalk 280ms ease-in-out infinite",
                        transform: "translateX(-50%)",
                        transformOrigin: "50% 0",
                      }
                    : {
                        height: "5%",
                        animation: "none",
                        transform: "translateX(-50%)",
                        transformOrigin: "50% 0",
                      }
                }
                aria-hidden="true"
              />
            </div>
            <div
              className="absolute bottom-[9%] w-[56%] h-[10%] rounded-full bg-[rgba(25,43,37,0.16)] blur-[10px]"
              style={{ animation: "shadowPulse 2.4s ease-in-out infinite" }}
              aria-hidden="true"
            />
          </div>
        </div>
        <audio ref={stickerSoundRef} id="stickerSound" preload="auto" />
        <audio
          ref={generatedVoiceRef}
          id="generatedVoice"
          preload="auto"
          onEnded={() => {
            setVoiceStatus("ready");
            setIsStickerTalking(false);
          }}
          onError={() => {
            setVoiceStatus("ready");
            setIsStickerTalking(false);
          }}
        />

        <section
          className={cn(
            "flex flex-col w-full max-w-[720px] min-w-0 min-h-[188px] h-[min(31svh,240px)] mx-auto",
            "rounded-[28px] border border-[rgba(255,255,255,0.56)] bg-[var(--panel)] p-[14px]",
            "[backdrop-filter:blur(22px)]",
            "max-[680px]:h-[min(32svh,232px)] max-[680px]:min-h-[182px] max-[680px]:rounded-[22px] max-[680px]:p-[12px]",
          )}
          style={talkPanelStyle}
          aria-label="会話"
        >
          <div
            ref={messagesRef}
            id="messages"
            className={cn(
              "flex-1 min-w-0 min-h-0 w-full flex flex-col gap-2 overflow-auto px-[2px] pt-[2px] pb-[10px]",
              "[scrollbar-width:thin]",
            )}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "w-fit max-w-[82%] rounded-[18px] px-[14px] py-[10px] font-black leading-[1.45] animate-[bubbleIn_240ms_ease_both]",
                  message.sender === "puppet"
                    ? "rounded-bl-[7px] text-[var(--bubble-fg)] bg-[var(--bubble)]"
                    : "self-end rounded-br-[7px] text-white bg-[var(--user)]",
                  "max-[680px]:max-w-[92%] max-[680px]:text-[0.98rem]",
                )}
              >
                {message.text}
              </div>
            ))}
            {isGenerating && (
              <div
                className={cn(
                  "w-fit max-w-[82%] rounded-[18px] rounded-bl-[7px] px-[14px] py-[10px]",
                  "font-black leading-[1.45] text-[var(--bubble-fg)] bg-[var(--bubble)] opacity-80",
                  "animate-[bubbleIn_240ms_ease_both]",
                )}
              >
                考え中...
              </div>
            )}
          </div>

          <div
            className={cn(
              "w-full min-w-0 flex gap-2 pt-[3px] pb-[12px] overflow-x-auto overflow-y-hidden",
              "[scrollbar-width:thin]",
            )}
            aria-label="入力候補"
          >
            {QUICK_REPLIES.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => handleSay(label)}
                disabled={isGenerating}
                className={cn(
                  "inline-flex items-center justify-center min-h-[38px] px-[13px] rounded-full whitespace-nowrap",
                  "font-black text-[var(--accent-dark)] bg-[rgba(255,255,255,0.72)] transition-[transform,background,color] duration-180",
                  "hover:bg-[var(--accent)] hover:text-white focus-visible:bg-[var(--accent)] focus-visible:text-white focus-visible:outline-none",
                  "hover:-translate-y-px focus-visible:-translate-y-px",
                  "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:bg-[rgba(255,255,255,0.72)] disabled:hover:text-[var(--accent-dark)]",
                  "max-[680px]:min-h-[36px] max-[680px]:px-[11px] max-[680px]:text-[0.88rem]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form className="grid w-full min-w-0 grid-cols-[auto_1fr_auto] gap-2 items-center" onSubmit={handleSubmit}>
            <label
              className={cn(
                "relative inline-grid h-[46px] w-[46px] place-items-center overflow-hidden [grid-template-columns:1fr] rounded-full bg-[var(--panel-strong)] text-[var(--accent-dark)]",
                "transition-[transform,background,color] duration-180 cursor-pointer",
                "hover:bg-[var(--accent)] hover:text-white hover:-translate-y-px",
                "focus-visible:bg-[var(--accent)] focus-visible:text-white focus-visible:outline-none focus-visible:-translate-y-px",
              )}
              title="ローカル動画を追加"
            >
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                multiple
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(event) => {
                  addPickedClips(event.target.files);
                  event.target.value = "";
                }}
              />
              <svg
                className="w-[22px] h-[22px] fill-none stroke-current [stroke-width:2.3] [stroke-linecap:round] [stroke-linejoin:round] pointer-events-none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="absolute w-px h-px overflow-hidden [clip:rect(0,0,0,0)]">clips</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              placeholder="話しかける"
              aria-label="話しかける"
              disabled={isGenerating}
              className={cn(
                "min-w-0 h-[46px] border border-[rgba(21,33,29,0.1)] rounded-full px-[16px] text-[var(--ink)] bg-[var(--panel-strong)]",
                "outline-none transition-[border-color,box-shadow] duration-180",
                "focus:border-[var(--accent)] focus-visible:outline-none",
                "focus-visible:[box-shadow:0_0_0_4px_var(--focus-ring)]",
                "placeholder:text-[var(--muted)]",
                "disabled:opacity-70",
              )}
            />
            <button
              className={cn(
                "inline-grid h-[46px] w-[46px] place-items-center rounded-full bg-[var(--panel-strong)] text-[var(--accent-dark)]",
                "transition-[transform,background,color] duration-180",
                "hover:bg-[var(--accent)] hover:text-white hover:-translate-y-px",
                "focus-visible:bg-[var(--accent)] focus-visible:text-white focus-visible:outline-none focus-visible:-translate-y-px",
              )}
              type="submit"
              disabled={isGenerating}
              title="送信"
              aria-label="送信"
            >
              <svg
                className="w-[22px] h-[22px] fill-none stroke-current [stroke-width:2.3] [stroke-linecap:round] [stroke-linejoin:round] pointer-events-none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m5 12 14-7-4 14-3-6-7-1Z" />
              </svg>
            </button>
          </form>
          <div
            className="mt-[8px] min-h-[18px] px-[4px] text-[0.78rem] font-black text-[var(--muted)]"
            aria-live="polite"
          >
            {voiceStatus === "thinking" && "返答を生成中"}
            {voiceStatus === "speaking" && "音声を再生中"}
          </div>
        </section>
      </section>
    </main>
  );
}

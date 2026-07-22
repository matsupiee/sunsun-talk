import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
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

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
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
const LISTEN_DOT = "#5BB56A";
const RED = "#E8503A";

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

const INITIAL_STICKER = `${STICKER_BASE}/animation@2x/${STICKER_IDS[0]}@2x.png`;
const DEFAULT_CAPTION = "こんにちは！";

const EQ_BARS = [
  { duration: "0.7s", delay: "0s" },
  { duration: "0.55s", delay: "0.12s" },
  { duration: "0.8s", delay: "0.05s" },
  { duration: "0.5s", delay: "0.2s" },
  { duration: "0.75s", delay: "0.08s" },
  { duration: "0.6s", delay: "0.16s" },
  { duration: "0.85s", delay: "0.02s" },
  { duration: "0.5s", delay: "0.22s" },
  { duration: "0.7s", delay: "0.1s" },
  { duration: "0.6s", delay: "0.18s" },
  { duration: "0.8s", delay: "0.06s" },
];

const puppetBodyStyle: CSSProperties = {
  background:
    "radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.92), transparent 0.82rem), radial-gradient(circle at 60% 32%, rgba(255, 255, 255, 0.88), transparent 0.72rem), linear-gradient(160deg, #f8fffc 0%, #efe4c6 74%, #e2cf9f 100%)",
  boxShadow: `inset -22px -22px 44px rgba(22, 19, 14, 0.12), inset 18px 20px 30px rgba(255, 255, 255, 0.72), 0 30px 44px rgba(22, 19, 14, 0.22)`,
  border: `3px solid ${INK}`,
};

function MicrophoneIcon({ color = INK }: { color?: string }) {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="2.75" width="6" height="11.5" rx="3" stroke={color} strokeWidth="2.2" />
      <path
        d="M5.4 10.4a6.6 6.6 0 0 0 13.2 0M12 17.2v3.3M8.2 20.5h7.6"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function SpeakerIcon({ muted, color = INK }: { muted: boolean; color?: string }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9.4v5.2h3.8L13 19V5L7.8 9.4H4Z"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      {muted ? (
        <path
          d="m17.2 9.2 3.6 3.6m0-3.6-3.6 3.6"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="2.2"
        />
      ) : (
        <path
          d="M16.5 8.1a5.1 5.1 0 0 1 0 7.8M18.8 5.8a8.4 8.4 0 0 1 0 12.4"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="2.2"
        />
      )}
    </svg>
  );
}

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [listening, setListening] = useState(false);
  const [heardText, setHeardText] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const messageId = useRef(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stickerRef = useRef<HTMLImageElement>(null);
  const stickerSoundRef = useRef<HTMLAudioElement>(null);
  const generatedVoiceRef = useRef<HTMLAudioElement>(null);
  const recognizerRef = useRef<SpeechRecognitionLike | null>(null);

  const clips = useRef<Clip[]>([]);
  const stickers = useRef<Sticker[]>(buildStickers(STICKER_IDS));
  const lastClipIndex = useRef(-1);
  const lastStickerId = useRef(0);
  const talkingTimer = useRef(0);
  const chainTimer = useRef(0);
  const speakingTimer = useRef(0);
  const mutedRef = useRef(false);
  const listeningRef = useRef(false);
  const transcriptRef = useRef("");
  const finalTranscriptRef = useRef("");
  const voiceErrorRef = useRef<string | null>(null);
  const handleSayRef = useRef<(text: string) => void>(() => {});

  const isStickerMode = puppetMode === "sticker";
  const isVideoMode = puppetMode === "video";

  const stageBg = STAGE_BG[period];

  const latestUserMessage = messages.filter((message) => message.sender === "user").at(-1);

  function appendMessage(text: string, sender: Sender) {
    setMessages((prev) => [...prev, { id: messageId.current++, text, sender }]);
  }

  function historyForApi(): TalkHistoryMessage[] {
    return messages.slice(-10).map<TalkHistoryMessage>((message) => ({
      role: message.sender === "puppet" ? "assistant" : "user",
      content: message.text,
    }));
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
      if (next) {
        stickerSoundRef.current?.pause();
        generatedVoiceRef.current?.pause();
        setSpeaking(false);
      }
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

  async function playGeneratedVoice(audioUrl: string) {
    const audio = generatedVoiceRef.current;
    const stickerSound = stickerSoundRef.current;
    const video = videoRef.current;

    if (!audio || mutedRef.current) return false;

    video?.pause();
    stickerSound?.pause();
    window.clearTimeout(chainTimer.current);
    window.clearTimeout(speakingTimer.current);

    setPuppetMode("sticker");
    setIsStickerTalking(true);
    setSpeaking(true);

    audio.pause();
    audio.src = audioUrl;
    audio.currentTime = 0;

    try {
      await audio.play();
      return true;
    } catch {
      setSpeaking(false);
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

  function handleSay(rawText: string) {
    const text = rawText.trim();
    if (!text || isGenerating) return;

    voiceErrorRef.current = null;
    setVoiceError(null);
    appendMessage(text, "user");
    setIsGenerating(true);
    const history = historyForApi();

    window.setTimeout(async () => {
      try {
        const response = await remoteTalkFor(text, history);
        appendMessage(response.reply, "puppet");

        if (response.audioUrl) {
          playSticker(stickerForInput(text), { sound: false });
          const played = await playGeneratedVoice(response.audioUrl);
          if (!played) {
            markSpeaking(response.reply);
            playSticker(stickerForInput(text));
          }
        } else {
          markSpeaking(response.reply);
          if (clips.current.length) {
            playRandomClip();
          } else {
            playSticker(stickerForInput(text));
          }
        }
      } finally {
        setIsGenerating(false);
      }
    }, 220);
  }

  function setVoiceStatusError(message: string | null) {
    voiceErrorRef.current = message;
    setVoiceError(message);
  }

  function messageForSpeechError(error?: string) {
    if (error === "not-allowed" || error === "service-not-allowed") {
      return "マイクの許可が ひつようです";
    }
    if (error === "no-speech") {
      return "もう一度 はなしかけてね";
    }
    if (error === "audio-capture") {
      return "マイクが 見つからないみたい";
    }
    return "うまく きこえなかったみたい";
  }

  function startListening() {
    if (isGenerating || speaking) return;

    const recognizer = recognizerRef.current;
    if (!recognizer) {
      setVoiceStatusError("このブラウザは 音声入力に 未対応です");
      return;
    }

    generatedVoiceRef.current?.pause();
    stickerSoundRef.current?.pause();
    transcriptRef.current = "";
    finalTranscriptRef.current = "";
    setHeardText("");
    setVoiceStatusError(null);
    setListening(true);
    listeningRef.current = true;

    try {
      recognizer.start();
    } catch {
      listeningRef.current = false;
      setListening(false);
      setVoiceStatusError("マイクを はじめられませんでした");
    }
  }

  function stopListening() {
    const recognizer = recognizerRef.current;
    if (!recognizer) return;

    try {
      recognizer.stop();
    } catch {
      recognizer.abort();
    }
  }

  function toggleListening() {
    if (listening) {
      stopListening();
      return;
    }
    startListening();
  }

  useEffect(() => {
    handleSayRef.current = handleSay;
  });

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechSupported(Boolean(SpeechRecognition));
    if (!SpeechRecognition) return;

    const recognizer = new SpeechRecognition();
    recognizer.lang = "ja-JP";
    recognizer.interimResults = true;
    recognizer.continuous = false;

    recognizer.onresult = (event) => {
      let nextTranscript = "";
      let hasFinal = false;

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        nextTranscript += result[0]?.transcript ?? "";
        hasFinal ||= result.isFinal;
      }

      const trimmed = nextTranscript.trim();
      transcriptRef.current = trimmed;
      if (hasFinal) finalTranscriptRef.current = trimmed;
      setHeardText(trimmed);
    };

    recognizer.onerror = (event) => {
      setVoiceStatusError(messageForSpeechError(event.error));
    };

    recognizer.onend = () => {
      listeningRef.current = false;
      setListening(false);

      const said = (finalTranscriptRef.current || transcriptRef.current).trim();
      finalTranscriptRef.current = "";
      transcriptRef.current = "";

      if (said) {
        setVoiceStatusError(null);
        handleSayRef.current(said);
        return;
      }

      if (!voiceErrorRef.current) {
        setVoiceStatusError("うまく きこえなかったみたい");
      }
    };

    recognizerRef.current = recognizer;

    return () => {
      recognizer.onresult = null;
      recognizer.onerror = null;
      recognizer.onend = null;
      recognizer.abort();
      recognizerRef.current = null;
      listeningRef.current = false;
    };
  }, []);

  // Keep the background period in sync with the clock.
  useEffect(() => {
    const id = window.setInterval(() => setPeriod(getPeriod().key), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

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

  const transcriptDisplay = voiceError ? "" : heardText || (!listening ? latestUserMessage?.text ?? "" : "");
  const voiceBusy = isGenerating || speaking;
  const voiceButtonDisabled = (!speechSupported && !listening) || (!listening && voiceBusy);
  const statusLabel = speaking
    ? "おはなし ちゅう♪"
    : isGenerating
      ? "かんがえ中…"
      : listening
        ? "きいてるよ…"
        : "まってるよ";
  const statusDot = speaking ? YELLOW : isGenerating ? BLUE : listening ? RED : LISTEN_DOT;
  const hintText = voiceError
    ? voiceError
    : isGenerating
      ? "スンスンが かんがえています"
      : speaking
        ? "スンスンが おへんじしています"
        : listening
          ? "きいてるよ、どうぞ〜"
          : speechSupported
            ? "タップして はなしかけてね"
            : "このブラウザは 音声入力に 未対応です";
  const orbBackground = listening ? LISTEN_DOT : voiceBusy || !speechSupported ? "#E4D8B8" : YELLOW;
  const orbIconColor = listening ? "#fff" : INK;
  const waveActive = listening || isGenerating || speaking;
  const waveColor = listening ? LISTEN_DOT : isGenerating ? BLUE : speaking ? YELLOW : "#E4D8B8";
  const orbLabel = listening
    ? "LISTENING... TAP TO STOP"
    : isGenerating
      ? "THINKING..."
      : speaking
        ? "SUNSUN TALKING"
        : "TAP TO TALK";

  return (
    <main
      className={cn(
        "relative flex min-h-[100svh] w-full flex-col items-center",
        "px-[clamp(10px,4vw,24px)] pt-[clamp(12px,3vh,32px)] pb-[clamp(12px,3vh,32px)]",
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
      <header className="relative z-[1] mb-[clamp(10px,2vh,22px)] shrink-0 text-center max-[680px]:mb-[10px]">
        <h1 className="m-0 leading-[0]">
          <img
            className="mx-auto block h-auto w-[clamp(148px,26vw,196px)] max-w-full select-none object-contain [-webkit-user-drag:none] max-[680px]:w-[158px]"
            src="/assets/header_logo.png"
            alt="PUPPET TALK"
            style={{ filter: "brightness(0)" }}
          />
        </h1>
        <p className="m-0 mt-[7px] text-[clamp(22px,4vw,34px)] font-black leading-[1.1]">
          こえだけで おしゃべり
        </p>
      </header>

      {/* ============ APP VIEWPORT ============ */}
      <section
        className={cn(
          "relative z-[1] flex min-h-0 w-full max-w-[392px] flex-1 flex-col overflow-hidden rounded-[46px]",
          "max-h-[812px] max-[440px]:rounded-[34px]",
        )}
        style={{
          background: PANEL_BG,
          border: `4px solid ${INK}`,
          boxShadow: "0 22px 50px -12px rgba(22,19,14,0.4)",
        }}
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

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 z-[4] h-[96px]"
            style={{
              background: `linear-gradient(180deg, ${stageBg} 0%, ${stageBg} 34%, transparent 100%)`,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 top-0 z-[4] w-[150px]"
            style={{
              background: `linear-gradient(270deg, ${stageBg} 0%, ${stageBg} 28%, transparent 100%)`,
            }}
          />

          {speaking && (
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-[42%] z-[2] h-[58px] w-[58px] -translate-x-1/2"
            >
              <span className="absolute inset-0 rounded-full border-[3px] border-white/85 animate-[voiceRing_1.3s_ease-out_infinite]" />
              <span className="absolute inset-0 rounded-full border-[3px] border-white/85 animate-[voiceRing_1.3s_ease-out_infinite_650ms]" />
            </div>
          )}

          {/* status pill + mute toggle */}
          <div className="absolute inset-x-[16px] top-[16px] z-[7] flex items-center justify-between">
            <span
              className="inline-flex items-center gap-[7px] rounded-full px-[15px] py-[6px] text-[12.5px] font-bold text-white"
              style={{ background: INK }}
            >
              <span
                className="inline-block h-[8px] w-[8px] rounded-full"
                style={{ background: statusDot }}
              />
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={toggleMute}
              className="grid h-[36px] w-[36px] place-items-center rounded-full transition-transform duration-150 active:translate-y-px"
              style={{
                border: `2.5px solid ${INK}`,
                background: muted ? PANEL_BG : INK,
                color: muted ? INK : "#fff",
              }}
              aria-pressed={muted}
              aria-label={muted ? "音声をオンにする" : "音声をオフにする"}
              title={muted ? "音声をオンにする" : "音声をオフにする"}
            >
              <SpeakerIcon muted={muted} color={muted ? INK : "#fff"} />
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
                    ? {
                        animation: speaking
                          ? "suntalk 520ms ease-in-out infinite"
                          : isStickerTalking
                            ? "stickerPop 700ms ease both"
                            : "none",
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
        <audio
          ref={generatedVoiceRef}
          id="generatedVoice"
          preload="auto"
          onEnded={() => {
            setSpeaking(false);
            setIsStickerTalking(false);
          }}
          onError={() => {
            setSpeaking(false);
            setIsStickerTalking(false);
          }}
        />

        {/* ===== BOTTOM (voice area) ===== */}
        <div
          className="flex min-h-[258px] flex-[1_1_0] flex-col items-center justify-center gap-[15px] px-[20px] py-[18px]"
          style={{ background: PANEL_BG, borderTop: `3px solid ${INK}` }}
        >
          <div className="flex min-h-[54px] w-full items-center justify-center px-[8px] text-center">
            {transcriptDisplay ? (
              <div
                className="max-w-full animate-[bubbleIn_240ms_ease_both] break-words text-[17px] font-bold leading-[1.45]"
                style={{ color: INK }}
              >
                「{transcriptDisplay}」
              </div>
            ) : (
              <div className="text-[15px] font-medium leading-[1.45]" style={{ color: "#a48a55" }}>
                {hintText}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleListening}
            disabled={voiceButtonDisabled}
            aria-label={listening ? "音声入力を止める" : "音声入力を始める"}
            aria-pressed={listening}
            className={cn(
              "relative h-[132px] w-[132px] shrink-0 p-0 transition-transform duration-150",
              voiceButtonDisabled ? "cursor-not-allowed opacity-70" : "hover:-translate-y-[2px] active:translate-y-px",
            )}
            style={{ background: "none" }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 [animation:orbWob_5s_ease-in-out_infinite]"
              style={{
                background: orbBackground,
                border: `4px solid ${INK}`,
                borderRadius: "48% 52% 55% 45% / 52% 48% 52% 48%",
                boxShadow: "0 6px 0 rgba(22,19,14,.3)",
              }}
            />
            {listening && (
              <span
                aria-hidden="true"
                className="absolute inset-[-11px] rounded-full border-[3px] border-[#5BB56A]/45 animate-[voiceRing_1.15s_ease-out_infinite]"
              />
            )}
            <span className="absolute inset-0 grid place-items-center">
              <MicrophoneIcon color={orbIconColor} />
            </span>
          </button>

          <div className="flex h-[28px] shrink-0 items-end gap-[4px]" aria-hidden="true">
            {EQ_BARS.map((bar, index) => (
              <span
                key={`${bar.duration}-${bar.delay}-${index}`}
                className="w-[5px] rounded-[3px] [transform-origin:50%_100%]"
                style={{
                  height: 26,
                  background: waveColor,
                  animation: `equalizer ${bar.duration} ease-in-out infinite`,
                  animationDelay: bar.delay,
                  animationPlayState: waveActive ? "running" : "paused",
                }}
              />
            ))}
          </div>

          <div
            className="min-h-[14px] text-center text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "#a48a55", fontFamily: "'Zilla Slab', serif" }}
          >
            {orbLabel}
          </div>
        </div>
      </section>
    </main>
  );
}

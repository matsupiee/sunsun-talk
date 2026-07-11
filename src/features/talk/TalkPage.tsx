import { useEffect, useRef, useState, type FormEvent } from "react";
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

interface Message {
  id: number;
  text: string;
  sender: Sender;
}

interface Clip {
  name: string;
  src: string;
}

const INITIAL_STICKER = `${STICKER_BASE}/animation@2x/${STICKER_IDS[0]}@2x.png`;

export function TalkPage() {
  const [period, setPeriod] = useState<PeriodKey>(() => getPeriod().key);
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, text: "こんにちは！", sender: "puppet" },
  ]);

  const messageId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stickerRef = useRef<HTMLImageElement>(null);
  const stickerSoundRef = useRef<HTMLAudioElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);

  const clips = useRef<Clip[]>([]);
  const stickers = useRef<Sticker[]>(buildStickers(STICKER_IDS));
  const lastClipIndex = useRef(-1);
  const lastStickerId = useRef(0);
  const talkingTimer = useRef(0);
  const chainTimer = useRef(0);

  function appendMessage(text: string, sender: Sender) {
    setMessages((prev) => [...prev, { id: messageId.current++, text, sender }]);
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
    fallbackRef.current?.classList.add("is-talking");
    talkingTimer.current = window.setTimeout(() => {
      fallbackRef.current?.classList.remove("is-talking");
    }, duration);
  }

  function playSticker(sticker: Sticker | null, { sound = true }: { sound?: boolean } = {}) {
    const stickerImage = stickerRef.current;
    const video = videoRef.current;
    const fallbackPuppet = fallbackRef.current;
    const stickerSound = stickerSoundRef.current;

    if (!sticker || !stickerImage) {
      fallbackPuppet?.classList.add("is-active");
      startTalking();
      return;
    }

    lastStickerId.current = sticker.id;
    window.clearTimeout(chainTimer.current);
    video?.pause();
    video?.classList.remove("is-active");
    fallbackPuppet?.classList.remove("is-active");
    stickerImage.classList.add("is-active");
    stickerImage.classList.remove("is-talking");

    stickerImage.src = `${sticker.image}?run=${Date.now()}`;
    stickerImage.alt = "パペットステッカー";
    void stickerImage.offsetWidth;
    stickerImage.classList.add("is-talking");

    if (sound && stickerSound) {
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
      video?.classList.remove("is-active");
      playSticker(randomSticker(), { sound: false });
      return;
    }

    const clip = clips.current[pickClipIndex()];
    stickerRef.current?.classList.remove("is-active");
    fallbackRef.current?.classList.remove("is-active");
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
        const response = await fetch("/assets/clips/manifest.json", { cache: "no-store" });
        if (!response.ok) return;

        const manifest = (await response.json()) as { clips?: Array<{ name?: string; src?: unknown }> };
        const items = Array.isArray(manifest.clips) ? manifest.clips : [];
        const loaded: Clip[] = items
          .filter((item): item is { name?: string; src: string } =>
            Boolean(item && typeof item.src === "string" && item.src.trim()),
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
    <main className="app" data-period={period}>
      <section className="stage" aria-label="おしゃべりステージ">
        <div className="backdrop" aria-hidden="true" />

        <header className="mx-auto flex w-full max-w-[1040px] min-w-0 items-start justify-start max-[680px]:items-center">
          <h1 className="m-0 leading-[0]">
            <img
              className="block h-auto w-[clamp(110px,21vw,260px)] max-w-full select-none object-contain mix-blend-screen [-webkit-user-drag:none]"
              src="/assets/header_logo.png"
              alt="PUPPET TALK"
            />
          </h1>
        </header>

        <div className="puppetWrap" aria-live="polite">
          <img
            ref={stickerRef}
            id="stickerPuppet"
            className="stickerPuppet is-active"
            src={INITIAL_STICKER}
            alt="パペットステッカー"
            onError={() => {
              stickerRef.current?.classList.remove("is-active");
              fallbackRef.current?.classList.add("is-active");
              startTalking();
            }}
          />

          <video
            ref={videoRef}
            id="puppetVideo"
            className="puppetVideo"
            muted
            playsInline
            preload="metadata"
            aria-label="パペット動画"
            onEnded={scheduleNextClip}
            onError={() => {
              videoRef.current?.classList.remove("is-active");
              playSticker(randomSticker(), { sound: false });
            }}
          />

          <div ref={fallbackRef} id="fallbackPuppet" className="fallbackPuppet" aria-hidden="true">
            <div className="puppetBody">
              <span className="eye eyeLeft" />
              <span className="eye eyeRight" />
              <span className="mouth" />
            </div>
            <div className="shadow" />
          </div>
        </div>
        <audio ref={stickerSoundRef} id="stickerSound" preload="auto" />

        <section className="talkPanel" aria-label="会話">
          <div ref={messagesRef} id="messages" className="messages">
            {messages.map((message) => (
              <div key={message.id} className={`bubble ${message.sender}`}>
                {message.text}
              </div>
            ))}
          </div>

          <div className="quickReplies" aria-label="入力候補">
            {QUICK_REPLIES.map((label) => (
              <button key={label} type="button" onClick={() => handleSay(label)}>
                {label}
              </button>
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <label className="clipButton" title="ローカル動画を追加">
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                multiple
                onChange={(event) => {
                  addPickedClips(event.target.files);
                  event.target.value = "";
                }}
              />
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>clips</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              placeholder="話しかける"
              aria-label="話しかける"
            />
            <button className="sendButton" type="submit" title="送信" aria-label="送信">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12 14-7-4 14-3-6-7-1Z" />
              </svg>
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

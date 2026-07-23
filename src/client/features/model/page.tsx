import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SunsunModel3D } from "./SunsunModel3D";
import { getPeriod } from "../talk/_utils/period";
import { PERIODS, type PeriodKey } from "../talk/_utils/constants";

const INK = "#16130E";
const PAGE_BG = "#FBF4E1";
const PANEL_BG = "#FCF8EE";
const YELLOW = "#F3B01C";

// "auto" は時計に追従。それ以外は固定の時間帯。
type PeriodChoice = "auto" | PeriodKey;

const PERIOD_LABELS: Record<PeriodChoice, string> = {
  auto: "じどう",
  morning: "朝",
  day: "昼",
  evening: "夕方",
  night: "夜",
};

const PERIOD_CHOICES: PeriodChoice[] = ["auto", ...PERIODS.map((p) => p.key)];

export function ModelPage() {
  const [talking, setTalking] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [choice, setChoice] = useState<PeriodChoice>("auto");
  const [clockPeriod, setClockPeriod] = useState<PeriodKey>(() => getPeriod().key);

  // "auto" のとき時計に合わせて時間帯を更新。
  useEffect(() => {
    const id = window.setInterval(() => setClockPeriod(getPeriod().key), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const period: PeriodKey = choice === "auto" ? clockPeriod : choice;

  return (
    <main
      className="relative flex min-h-[100svh] w-full flex-col items-center px-[clamp(10px,4vw,24px)] py-[clamp(12px,3vh,32px)]"
      style={{ background: PAGE_BG, color: INK }}
    >
      <header className="mb-[clamp(10px,2vh,20px)] shrink-0 text-center">
        <h1 className="m-0 text-[clamp(22px,4vw,34px)] font-black leading-[1.1]">
          スンスン 3Dモデル
        </h1>
        <p className="m-0 mt-[6px] text-[13px] font-medium" style={{ color: "#a48a55" }}>
          ドラッグでぐるぐる回せるよ
        </p>
      </header>

      <section
        className="relative flex w-full max-w-[440px] flex-1 flex-col overflow-hidden rounded-[40px]"
        style={{
          background: PANEL_BG,
          border: `4px solid ${INK}`,
          boxShadow: "0 22px 50px -12px rgba(22,19,14,0.4)",
          maxHeight: "780px",
        }}
      >
        <SunsunModel3D
          talking={talking}
          period={period}
          autoRotate={autoRotate}
          className="min-h-[320px] flex-1"
        />

        {/* コントロール */}
        <div
          className="flex flex-col gap-[12px] px-[18px] py-[16px]"
          style={{ background: PANEL_BG, borderTop: `3px solid ${INK}` }}
        >
          <div className="flex items-center gap-[10px]">
            <button
              type="button"
              onClick={() => setTalking((v) => !v)}
              aria-pressed={talking}
              className="flex-1 rounded-full py-[12px] text-[15px] font-black transition-transform duration-150 active:translate-y-px"
              style={{
                border: `3px solid ${INK}`,
                background: talking ? YELLOW : PANEL_BG,
                color: INK,
                boxShadow: "0 4px 0 rgba(22,19,14,.22)",
              }}
            >
              {talking ? "おしゃべり中♪" : "しゃべってもらう"}
            </button>
            <button
              type="button"
              onClick={() => setAutoRotate((v) => !v)}
              aria-pressed={autoRotate}
              className="rounded-full px-[16px] py-[12px] text-[14px] font-black transition-transform duration-150 active:translate-y-px"
              style={{
                border: `3px solid ${INK}`,
                background: autoRotate ? INK : PANEL_BG,
                color: autoRotate ? "#fff" : INK,
                boxShadow: "0 4px 0 rgba(22,19,14,.22)",
              }}
            >
              じどう回転
            </button>
          </div>

          {/* 時間帯 */}
          <div className="flex items-center gap-[6px]">
            {PERIOD_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChoice(c)}
                aria-pressed={choice === c}
                className="flex-1 rounded-[14px] py-[8px] text-[13px] font-bold transition-transform duration-150 active:translate-y-px"
                style={{
                  border: `2.5px solid ${INK}`,
                  background: choice === c ? INK : PANEL_BG,
                  color: choice === c ? "#fff" : INK,
                }}
              >
                {PERIOD_LABELS[c]}
              </button>
            ))}
          </div>

          <Link
            to="/"
            className="text-center text-[13px] font-bold underline"
            style={{ color: "#a48a55" }}
          >
            ← おしゃべりにもどる
          </Link>
        </div>
      </section>
    </main>
  );
}

// Paper folding — a step-by-step guide kids can follow without an adult.
//
// Three things make origami instructions usable by a child, and all three are
// deliberate here:
//   · one step on screen at a time, with a big picture — not a wall of text;
//   · the moving part of the paper is shaded, because "which bit goes where" is
//     the only thing anyone actually gets stuck on;
//   · the paper you need and how long it takes are known before you start, so
//     nobody gets halfway and then told they needed scissors.

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Lightbulb, RotateCcw, Scissors, Timer } from "lucide-react";
import { FoldDiagram } from "./FoldDiagram";
import {
  BASES,
  HACKS,
  MODELS,
  byDifficulty,
  findFoldable,
  findHack,
  totalSteps,
  type Difficulty,
  type Foldable,
  type Hack,
} from "../lib/origami";

const DIFF_STYLE: Record<Difficulty, { label: string; bg: string; fg: string }> = {
  easy: { label: "🌱 Easy", bg: "rgba(74,222,128,0.16)", fg: "#4ade80" },
  medium: { label: "🌿 Medium", bg: "rgba(251,191,36,0.16)", fg: "#fbbf24" },
  hard: { label: "🌵 Hard", bg: "rgba(251,113,133,0.16)", fg: "#fb7185" },
};

function Pill({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

function Meta({ f }: { f: Foldable }) {
  const d = DIFF_STYLE[f.difficulty];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill bg={d.bg} fg={d.fg}>
        {d.label}
      </Pill>
      <span className="flex items-center gap-1 text-[10.5px] font-bold" style={{ color: "var(--text-faint)" }}>
        <Timer size={11} /> {f.minutes} min
      </span>
      <span className="flex items-center gap-1 text-[10.5px] font-bold" style={{ color: "var(--text-faint)" }}>
        <Scissors size={11} /> {f.paper}
      </span>
      <span className="text-[10.5px] font-bold" style={{ color: "var(--text-faint)" }}>
        {f.steps.length} steps
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------

function PickCard({ f, onPick }: { f: Foldable; onPick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onPick}
      className="flex w-full items-start gap-2.5 rounded-2xl p-2.5 text-left transition hover:brightness-105"
      style={{ background: "var(--surface-strong)" }}
    >
      <span className="text-2xl leading-none">{f.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-extrabold" style={{ color: "var(--text)" }}>
          {f.name}
        </span>
        <span className="mt-0.5 block text-[10.5px] font-semibold leading-snug" style={{ color: "var(--text-faint)" }}>
          {f.blurb}
        </span>
        <span className="mt-1 block">
          <Pill bg={DIFF_STYLE[f.difficulty].bg} fg={DIFF_STYLE[f.difficulty].fg}>
            {DIFF_STYLE[f.difficulty].label.replace(/^\S+\s/, "")} · {f.minutes} min
          </Pill>
        </span>
      </span>
    </motion.button>
  );
}

function HackCard({ h, onOpen }: { h: Hack; onOpen: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onOpen}
      className="flex w-full items-start gap-2.5 rounded-2xl p-2.5 text-left transition hover:brightness-105"
      style={{ background: "var(--surface-strong)" }}
    >
      <span className="text-xl leading-none">{h.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-extrabold" style={{ color: "var(--text)" }}>
          {h.title}
        </span>
        <span className="mt-0.5 block text-[10.5px] font-semibold leading-snug" style={{ color: "var(--text-faint)" }}>
          {h.body.slice(0, 74)}…
        </span>
      </span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

function StepReader({ f, onBack, onOpen }: { f: Foldable; onBack: () => void; onOpen: (id: string) => void }) {
  const [step, setStep] = useState(0);
  const [showTip, setShowTip] = useState(true);

  // A different model means a different first step.
  useEffect(() => {
    setStep(0);
    setShowTip(true);
  }, [f.id]);

  const s = f.steps[Math.min(step, f.steps.length - 1)];
  const last = step >= f.steps.length - 1;

  return (
    <div>
      <div className="flex items-start gap-2">
        <button
          onClick={onBack}
          className="mt-0.5 rounded-full p-1.5 transition hover:brightness-105"
          style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
          aria-label="Back to all folds"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">{f.emoji}</span>
            <h3 className="text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
              {f.name}
            </h3>
          </div>
          <p className="mt-0.5 text-[11px] font-semibold" style={{ color: "var(--text-faint)" }}>
            {f.blurb}
          </p>
          <div className="mt-1.5">
            <Meta f={f} />
          </div>
        </div>
      </div>

      {/* progress dots — a child can count them */}
      <div className="mt-3 flex flex-wrap gap-1">
        {f.steps.map((_, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            aria-label={`Go to step ${i + 1}`}
            className="h-2 flex-1 rounded-full transition"
            style={{
              background: i === step ? "var(--accent-grad)" : i < step ? "var(--accent)" : "var(--surface-strong)",
              opacity: i <= step ? 1 : 0.55,
            }}
          />
        ))}
      </div>

      <motion.div
        key={`${f.id}-${step}`}
        initial={{ opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        className="mt-3 rounded-2xl p-3"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="rounded-xl"
            style={{ background: "var(--surface-strong)", boxShadow: "inset 0 0 0 1px var(--border)" }}
          >
            <FoldDiagram figure={s.figure} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
              Step {step + 1} of {f.steps.length}
            </div>
            <p className="mt-1 text-[13px] font-extrabold leading-snug" style={{ color: "var(--text)" }}>
              {s.text}
            </p>
            {s.ref &&
              (() => {
                const target = findFoldable(s.ref);
                if (!target) return null;
                return (
                  <button
                    onClick={() => onOpen(s.ref!)}
                    className="mt-2 flex w-full items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-[11px] font-extrabold transition hover:brightness-105"
                    style={{ background: "var(--accent-grad)", color: "#fff" }}
                  >
                    <span className="text-sm">{target.emoji}</span>
                    Open {target.name} first
                    <ChevronRight size={12} className="ml-auto" />
                  </button>
                );
              })()}
            {s.tip && (
              <button
                onClick={() => setShowTip((v) => !v)}
                className="mt-2 flex w-full items-start gap-1.5 rounded-xl px-2 py-1.5 text-left"
                style={{ background: "rgba(251,191,36,0.12)" }}
              >
                <Lightbulb size={12} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
                <span className="text-[10.5px] font-bold leading-snug" style={{ color: "var(--text-soft)" }}>
                  {showTip ? s.tip : "Show tip"}
                </span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setStep((i) => Math.max(0, i - 1))}
          disabled={step === 0}
          className="flex items-center gap-1 rounded-full px-3 py-2 text-[11px] font-extrabold disabled:opacity-35"
          style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
        >
          <ChevronLeft size={13} /> Back
        </button>
        {last ? (
          <button
            onClick={onBack}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[12px] font-extrabold text-white shadow-plush"
            style={{ background: "var(--accent-grad)" }}
          >
            🎉 I made it!
          </button>
        ) : (
          <button
            onClick={() => setStep((i) => Math.min(f.steps.length - 1, i + 1))}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[12px] font-extrabold text-white shadow-plush"
            style={{ background: "var(--accent-grad)" }}
          >
            Next step <ChevronRight size={14} />
          </button>
        )}
        <button
          onClick={() => setStep(0)}
          className="rounded-full p-2 transition hover:brightness-105"
          style={{ background: "var(--surface-strong)", color: "var(--text-faint)" }}
          aria-label="Start again from step 1"
          title="Start again"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  );
}

function HackReader({ h, onBack }: { h: Hack; onBack: () => void }) {
  return (
    <div>
      <div className="flex items-start gap-2">
        <button
          onClick={onBack}
          className="mt-0.5 rounded-full p-1.5 transition hover:brightness-105"
          style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
          aria-label="Back to all tricks"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">{h.emoji}</span>
            <h3 className="text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
              {h.title}
            </h3>
          </div>
          <p className="mt-2 text-[12.5px] font-semibold leading-relaxed" style={{ color: "var(--text-soft)" }}>
            {h.body}
          </p>
          <div className="mt-2.5 rounded-xl px-2.5 py-2" style={{ background: "rgba(56,189,248,0.10)" }}>
            <div className="text-[9.5px] font-extrabold uppercase tracking-wide" style={{ color: "#38bdf8" }}>
              Why it matters
            </div>
            <p className="mt-0.5 text-[11.5px] font-semibold leading-snug" style={{ color: "var(--text-soft)" }}>
              {h.why}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

export function PaperFolding() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [hackId, setHackId] = useState<string | null>(null);

  const bases = useMemo(() => byDifficulty(BASES), []);
  const models = useMemo(() => byDifficulty(MODELS), []);

  const reading = openId ? findFoldable(openId) : undefined;
  const hack = hackId ? findHack(hackId) : undefined;

  if (reading) return <StepReader f={reading} onBack={() => setOpenId(null)} onOpen={setOpenId} />;
  if (hack) return <HackReader h={hack} onBack={() => setHackId(null)} />;

  return (
    <div>
      <div
        className="rounded-2xl px-3 py-2.5"
        style={{ background: "linear-gradient(120deg, rgba(244,114,182,0.14), rgba(56,189,248,0.12))" }}
      >
        <div className="text-[12.5px] font-extrabold" style={{ color: "var(--text)" }}>
          📄 Paper folding
        </div>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug" style={{ color: "var(--text-faint)" }}>
          {MODELS.length} things to fold and {BASES.length} starting shapes, plus {HACKS.length} tricks that make
          everything easier. One sheet of paper, no scissors, no glue — {totalSteps()} steps in total.
        </p>
      </div>

      <h4 className="mt-3.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        Characters &amp; things
      </h4>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {models.map((f) => (
          <PickCard key={f.id} f={f} onPick={() => setOpenId(f.id)} />
        ))}
      </div>

      <h4 className="mt-3.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        Starting shapes (bases)
      </h4>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {bases.map((f) => (
          <PickCard key={f.id} f={f} onPick={() => setOpenId(f.id)} />
        ))}
      </div>

      <h4 className="mt-3.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        Hacks &amp; tricks
      </h4>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {HACKS.map((h) => (
          <HackCard key={h.id} h={h} onOpen={() => setHackId(h.id)} />
        ))}
      </div>
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Gamepad2, Loader2, Play, Trash2 } from "lucide-react";
import { Modal } from "./ui";
import {
  fetchGameCatalogue,
  fetchGames,
  installGame,
  uninstallGame,
  type CatalogueEntry,
  type GameDef,
} from "../lib/gamesApi";

type Tab = "play" | "catalogue";

const CATEGORY_ORDER = ["Board", "Words", "Numbers", "Quiz", "Story", "Reflex", "Pack"];

export function GamesModal({
  open,
  onClose,
  onPlay,
}: {
  open: boolean;
  onClose: () => void;
  /** Start playing a game in a fresh chat. */
  onPlay: (game: GameDef) => void;
}) {
  const [tab, setTab] = useState<Tab>("play");
  const [games, setGames] = useState<GameDef[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetchGames().then(setGames);
    void fetchGameCatalogue().then(setCatalogue);
  }, [open]);

  const refresh = async () => {
    setGames(await fetchGames());
    setCatalogue(await fetchGameCatalogue());
  };

  const install = async (id: string) => {
    setBusyId(id);
    await installGame(id);
    await refresh();
    setBusyId(null);
    setTab("play");
  };

  const uninstall = async (id: string) => {
    setBusyId(id);
    await uninstallGame(id);
    await refresh();
    setBusyId(null);
  };

  const sorted = useMemo(
    () =>
      [...games].sort(
        (a, b) =>
          CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
          a.name.localeCompare(b.name),
      ),
    [games],
  );
  const available = useMemo(() => catalogue.filter((c) => !c.installed), [catalogue]);

  return (
    <Modal open={open} onClose={onClose} title="Games Arcade" icon={<span className="text-xl">🎮</span>}>
      <div className="mb-3 flex gap-1.5 rounded-full p-1" style={{ background: "var(--surface)" }}>
        {(
          [
            { id: "play", label: `Play (${games.length})` },
            { id: "catalogue", label: `Get more games${available.length ? ` (${available.length})` : ""}` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
              tab === t.id ? "glass-strong" : ""
            }`}
            style={{ color: tab === t.id ? "var(--text)" : "var(--text-faint)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "play" && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold" style={{ color: "var(--text-faint)" }}>
            Play against Talia! Rules run locally — games are instant, work offline, and can't be cheated.
          </p>
          {sorted.length === 0 && (
            <p className="py-6 text-center text-xs font-bold" style={{ color: "var(--text-faint)" }}>
              Couldn't reach your Talia server 🥺
            </p>
          )}
          {sorted.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 rounded-2xl border px-3 py-2.5"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <span className="text-2xl">{g.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-extrabold" style={{ color: "var(--text)" }}>
                    {g.name}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold"
                    style={{ background: "var(--surface-strong)", color: "var(--text-faint)" }}
                  >
                    {g.ages}
                  </span>
                  {!g.builtin && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold"
                      style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}
                    >
                      pack
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
                  {g.tagline}
                </div>
              </div>
              {!g.builtin && (
                <button
                  onClick={() => void uninstall(g.id)}
                  className="rounded-full p-1.5 transition hover:bg-rose-500/10"
                  style={{ color: "var(--text-faint)" }}
                  aria-label={`Remove ${g.name}`}
                >
                  {busyId === g.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              )}
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  onPlay(g);
                  onClose();
                }}
                className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold text-white shadow-plush"
                style={{ background: "var(--accent-grad)" }}
              >
                <Play size={12} /> Play
              </motion.button>
            </div>
          ))}
        </div>
      )}

      {tab === "catalogue" && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold" style={{ color: "var(--text-faint)" }}>
            Extra game packs — safe data-only downloads (quizzes, word banks, prompt games). One tap to install.
          </p>
          {catalogue.length === 0 && (
            <p className="py-6 text-center text-xs font-bold" style={{ color: "var(--text-faint)" }}>
              Catalogue unavailable offline 🥺
            </p>
          )}
          {catalogue.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-2xl border px-3 py-2.5"
              style={{
                borderColor: c.installed ? "var(--border)" : "var(--accent)",
                background: "var(--surface)",
                opacity: c.installed ? 0.75 : 1,
              }}
            >
              <span className="text-2xl">{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-extrabold" style={{ color: "var(--text)" }}>
                    {c.name}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold"
                    style={{ background: "var(--surface-strong)", color: "var(--text-faint)" }}
                  >
                    {c.ages}
                  </span>
                </div>
                <div className="truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
                  {c.tagline}
                  {c.items ? ` · ${c.items} ${c.engine === "scramble" ? "words" : c.engine === "quiz" ? "questions" : "rounds"}` : ""}
                </div>
              </div>
              {c.installed ? (
                <span className="shrink-0 text-[10px] font-extrabold" style={{ color: "var(--text-faint)" }}>
                  ✓ Installed
                </span>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => void install(c.id)}
                  disabled={busyId === c.id}
                  className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold text-white shadow-plush disabled:opacity-50"
                  style={{ background: "var(--accent-grad)" }}
                >
                  {busyId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  Download
                </motion.button>
              )}
            </div>
          ))}
          <div
            className="mt-1 flex items-center gap-2 rounded-2xl border border-dashed px-3 py-2 text-[10px] font-semibold"
            style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
          >
            <Gamepad2 size={13} className="shrink-0" />
            Packs are validated before install and never run code — just quizzes, words and prompts.
          </div>
        </div>
      )}
    </Modal>
  );
}

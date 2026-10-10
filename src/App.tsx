import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageBubble } from "./components/MessageBubble";
import { Composer } from "./components/Composer";
import { HeaderBar } from "./components/HeaderBar";
import { SessionSidebar } from "./components/SessionSidebar";
import { ModelPickerModal } from "./components/ModelPickerModal";
import { ModelCatalogModal } from "./components/ModelCatalogModal";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { MediaStudio } from "./components/MediaStudio";
import { CreateStudio } from "./components/CreateStudio";
import { BotsSkillsModal } from "./components/BotsSkillsModal";
import { GamesModal } from "./components/GamesModal";
import { UpdateBanner } from "./components/UpdateBanner";
import { LiveWallpaper } from "./components/LiveWallpaper";
import { GameHud } from "./components/GameHud";
import {
  endGame,
  gameAction,
  gameMove,
  startGame,
  type ActiveGame,
  type GameDef,
} from "./lib/gamesApi";
import { fetchBots, type BotDef } from "./lib/botsApi";
import { skillById } from "./lib/skills";
import { MemoryPanel } from "./components/MemoryPanel";
import { DotsPanel } from "./components/DotsPanel";
import { ThemePicker } from "./components/ThemePicker";
import { EmptyState } from "./components/StatusPill";
import { Mascot } from "./components/Mascot";
import {
  fetchModels,
  fetchProviderHealth,
  streamChat,
  type DiscoveredModel,
} from "./lib/api";
import {
  loadSessions,
  loadSettings,
  migrateV1Chat,
  saveSessions,
  saveSettings,
} from "./lib/storage";
import {
  makeId,
} from "./lib/chatStore";
import {
  downloadFile,
  exportAsJson,
  exportAsMarkdown,
  timestampSlug,
} from "./lib/exportChat";
import {
  fetchLessons,
  pullModel,
  recallMemory,
  rememberExchange,
  rememberText,
  runResearch,
  sendLessonFeedback,
  speakText,
} from "./lib/serverApi";
import { armDots } from "./lib/dotsApi";
import { applyTheme, loadTheme, saveTheme } from "./lib/themes";
import { getApiBase, setApiBase, apiUrl } from "./lib/appMode";
import { useOnline } from "./lib/useOnline";
import type { ChatMessage, ChatSession, Settings } from "./types";

function newSession(): ChatSession {
  const now = Date.now();
  return { id: makeId(), title: "New chat", messages: [], createdAt: now, updatedAt: now };
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const existing = loadSessions();
    if (existing.length > 0) return existing;
    const { sessions: migrated } = migrateV1Chat();
    return migrated.length > 0 ? migrated : [newSession()];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    const existing = loadSessions();
    return existing[existing.length - 1]?.id ?? sessions[0]?.id ?? "active";
  });
  const [online, setOnline] = useState(false);
  // Is TALIA'S SERVER answering? Distinct from internet access — the app runs
  // fully offline. When the shell UI (tauri://) misses the server at launch,
  // this flips true the moment it's reachable.
  const [serverUp, setServerUp] = useState<boolean>(() =>
    typeof location === "undefined" ? true : location.origin.startsWith("http"),
  );
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [busy, setBusy] = useState(false);
  // The message currently being streamed — the typing indicator rides on this
  // (during regeneration the streaming message isn't the last one in the list).
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showModels, setShowModels] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showBots, setShowBots] = useState(false);
  const [showGames, setShowGames] = useState(false);
  const [showDots, setShowDots] = useState(false);
  const [bots, setBots] = useState<BotDef[]>([]);
  // Live game session per chat — the Arcade pins a game to the conversation.
  const [gamesByChat, setGamesByChat] = useState<Record<string, ActiveGame>>({});
  const [researchStatus, setResearchStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [themeId, setThemeId] = useState<string>(loadTheme);
  const [showThemes, setShowThemes] = useState(false);
  const [serverAddress, setServerAddress] = useState<string>(getApiBase());
  const [askAddress, setAskAddress] = useState<boolean>(() =>
    // Android clients open a connect panel until they've reached their server;
    // desktop is same-origin so it never sees this.
    Boolean(getApiBase()) || /android/i.test(navigator.userAgent),
  );
  const netOnline = useOnline();

  useEffect(() => {
    applyTheme(themeId);
    saveTheme(themeId);
  }, [themeId]);

  // Bots for persona binding — refetched when the picker closes (cheap, local).
  useEffect(() => {
    if (showBots) return;
    void fetchBots().then(setBots);
  }, [showBots]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? sessions[sessions.length - 1],
    [sessions, activeId],
  );
  const messages = activeSession?.messages ?? [];
  const activeGame = activeSession ? gamesByChat[activeSession.id] ?? null : null;

  const stopFlag = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastRequestId = useRef<string | null>(null);

  // Keep activeId valid
  useEffect(() => {
    if (!sessions.find((s) => s.id === activeId)) {
      setActiveId(sessions[sessions.length - 1]?.id ?? "");
    }
  }, [sessions, activeId]);

  // Persist
  useEffect(() => saveSettings(settings), [settings]);

  // Notices fade on their own — a stuck toast used to hover over the composer
  // until manually clicked.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // Offline Mode lives in localStorage (UI) and in Talia's server store —
  // keep the server side in step so its gates honor the toggle.
  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("/api/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offline: settings.offline }),
      signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, [settings.offline]);

  // Arm Dots with the current provider key. The server keeps it in memory only,
  // so cloud-backed dots can run unattended without the key ever hitting disk.
  useEffect(() => {
    void armDots(settings.provider);
  }, [settings.provider.baseUrl, settings.provider.apiKey]);
  useEffect(() => {
    if (activeSession) saveSessions(sessions);
  }, [sessions, activeSession]);

  // Health polling
  const pollHealth = useCallback(async () => {
    try {
      const { online: o } = await fetchProviderHealth(settings.provider.baseUrl);
      setOnline(o);
    } catch {
      setOnline(false);
    }
  }, [settings.provider.baseUrl]);

  useEffect(() => {
    pollHealth();
    const t = setInterval(pollHealth, 8000);
    return () => clearInterval(t);
  }, [pollHealth]);

  // Self-healing: if the window is stranded on the bundled shell because the
  // sidecar lost the launch race, detect Talia's server the moment it answers
  // and move the whole app to it.
  useEffect(() => {
    if (serverUp) return;
    let alive = true;
    const probe = async () => {
      try {
        const r = await fetch(apiUrl("/api/health"), { signal: AbortSignal.timeout(2500) });
        const j = await r.json().catch(() => null);
        if (alive && j?.ok) {
          setServerUp(true);
          // Reload from the real origin so relative API calls just work.
          location.href = apiUrl("/");
        }
      } catch {
        /* keep probing */
      }
    };
    probe();
    const t = setInterval(probe, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [serverUp]);

  // Model discovery
  const refreshModels = useCallback(async () => {
    setLoadingModels(true);
    const result = await fetchModels(settings.provider.baseUrl);
    setModels(result.models);
    setLoadingModels(false);
    if (result.ok && result.models.length > 0) {
      setSettings((s) => {
        const ids = new Set(result.models.map((m) => m.id));
        if (s.model && ids.has(s.model)) return s;
        const customFirst = s.customModels.find((c) => ids.has(c.id));
        return { ...s, model: customFirst?.id ?? result.models[0].id };
      });
    }
  }, [settings.provider.baseUrl]);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const patchSession = (id: string, patch: Partial<ChatSession>) =>
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s)));

  // --- Games: route chat through the arcade while a game is live ----------
  const gameMoveSend = async (text: string): Promise<boolean> => {
    if (!activeSession || !activeGame || busy) return false;
    // Pure engine games need no model at all; LLM-voiced games fall back to
    // deterministic engine text when no model is picked (server handles it).
    if (!settings.model && activeGame.needsLlm) {
      setNotice("💡 Tip: pick a model for Talia's voice — the game itself works without one ♡");
    }
    const sessionId = activeSession.id;
    const assistantId = makeId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      model: settings.model,
      createdAt: Date.now(),
    };
    const userMsg: ChatMessage = { id: makeId(), role: "user", content: text, createdAt: Date.now() };
    patchSession(sessionId, { messages: [...activeSession.messages, userMsg, assistantMsg] });
    setBusy(true);
    stopFlag.current = false;
    setStreamingId(assistantId);
    const controller = new AbortController();
    abortRef.current = controller;
    lastRequestId.current = assistantId;

    const appendToken = (tok: string) =>
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + tok } : m,
                ),
              }
            : s,
        ),
      );

    try {
      await gameMove(
        activeGame.sessionId,
        text,
        settings.provider,
        settings.model || "",
        {
          onState: (state) =>
            setGamesByChat((prev) => ({
              ...prev,
              [sessionId]: { ...prev[sessionId], state },
            })),
          onToken: (tok) => {
            if (!stopFlag.current) appendToken(tok);
          },
          onEngineReply: (reply) => {
            if (stopFlag.current) return;
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantId ? { ...m, content: reply } : m,
                      ),
                    }
                  : s,
              ),
            );
          },
          onDone: (status) => {
            if (status && status !== "playing") {
              // Round over: the server removed the session. Keep the HUD as a
              // scoreboard but hand normal chatting back to the room.
              setGamesByChat((prev) => ({
                ...prev,
                [sessionId]: { ...prev[sessionId], finished: true },
              }));
              setNotice(status === "won" ? "🏆 You won! Hit “Play again” for a rematch ♡" : "GG! Rematch? 🎮");
            }
          },
          onError: (msg) => {
            if (stopFlag.current) return;
            if (/game-session-gone/i.test(msg)) {
              // Server restarted or session TTL'd out — clear quietly.
              setGamesByChat((prev) => ({
                ...prev,
                [sessionId]: { ...prev[sessionId], finished: true },
              }));
              setNotice("That game session expired — start it again from the Arcade 🎮");
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === assistantId && m.content.trim() === "" ? null : m,
                        ).filter(Boolean) as ChatMessage[],
                      }
                    : s,
                ),
              );
              return;
            }
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantId
                          ? {
                              ...m,
                              content: (m.content ? m.content + "\n\n" : "") + `🎮 Game hiccup: ${msg}\n\nTry again in a moment!`,
                            }
                          : m,
                      ),
                    }
                  : s,
              ),
            );
          },
        },
        controller.signal,
      );
    } finally {
      setBusy(false);
      setStreamingId(null);
      abortRef.current = null;
    }
    return true;
  };

  /**
   * A graphical game's move — Blockcraft's canvas calls this on every tap. It
   * deliberately skips the chat transcript, the busy flag and the model: a kid
   * mining forty blocks shouldn't produce forty message bubbles or block the
   * composer. Resolves with the engine's one-line note for the canvas toast.
   */
  const gameActionSend = async (text: string): Promise<string | void> => {
    if (!activeSession || !activeGame) return;
    const chatId = activeSession.id;
    const r = await gameAction(activeGame.sessionId, text);
    if (!r.ok) {
      setNotice(r.error ?? "Couldn't do that 🥺");
      return;
    }
    setGamesByChat((prev) =>
      prev[chatId] ? { ...prev, [chatId]: { ...prev[chatId], state: r.state ?? {} } } : prev,
    );
    return r.note ?? "";
  };

  const startPlaying = async (game: GameDef) => {
    stop();
    const now = Date.now();
    const s: ChatSession = {
      id: makeId(),
      title: `${game.emoji} ${game.name}`,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
    const r = await startGame(game.id, s.id);
    if (!r.ok || !r.session) {
      setNotice(r.error ?? "Couldn't start the game 🥺");
      return;
    }
    setGamesByChat((prev) => ({ ...prev, [s.id]: r.session! }));
    if (r.intro) {
      const introMsg: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: r.intro,
        model: settings.model,
        createdAt: Date.now(),
      };
      setSessions((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, messages: [introMsg], updatedAt: Date.now() } : x)),
      );
    }
  };

  const endActiveGame = async () => {
    if (!activeGame || !activeSession) return;
    await endGame(activeGame.sessionId);
    setGamesByChat((prev) => {
      const next = { ...prev };
      delete next[activeSession.id];
      return next;
    });
    setNotice("Game ended — the Arcade is always open 🎮");
  };

  // `level` lets the level picker restart on a different level; without it we
  // repeat the level you're on, so "Play again" never quietly drops you back to
  // the first one.
  const playAgain = async (game: ActiveGame, level?: number) => {
    if (!activeSession) return;
    const on = typeof level === "number" ? level : Number(game.state.level);
    const r = await startGame(
      game.gameId,
      activeSession.id,
      Number.isInteger(on) ? { level: on } : undefined,
    );
    if (!r.ok || !r.session) {
      setNotice(r.error ?? "Couldn't restart the game 🥺");
      return;
    }
    setGamesByChat((prev) => ({ ...prev, [activeSession.id]: { ...r.session!, finished: false } }));
    if (r.intro) {
      const introMsg: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: r.intro,
        model: settings.model,
        createdAt: Date.now(),
      };
      setSessions((prev) =>
        prev.map((x) =>
          x.id === activeSession.id ? { ...x, messages: [...x.messages, introMsg], updatedAt: Date.now() } : x,
        ),
      );
    }
    setNotice(
      typeof level === "number"
        ? `${r.session?.state?.levelName ?? "New level"} — good luck! 🍀`
        : "New round — good luck! 🍀",
    );
  };

  // --- Sending -----------------------------------------------------------
  // opts.regenerateOf: id of an assistant message to re-answer (drops it and
  // regenerates from the conversation so far) instead of appending a new turn.
  const send = async (rawText: string, opts: { regenerateOf?: string } = {}): Promise<boolean> => {
    const regen = Boolean(opts.regenerateOf);
    const text = rawText.trim();
    if (busy || !activeSession) return false;
    // While a game is live, chat text is a game move (regeneration would
    // desync the server-authoritative game state, so it's a no-op). Once the
    // round is finished, the HUD stays as a scoreboard and chat is normal.
    if (activeGame && !regen && !activeGame.finished) return gameMoveSend(text);
    if (activeGame && regen && !activeGame.finished) return false;
    if (!regen && !text) return false;
    if (!settings.model) {
      setNotice("Pick a model first — tap the ✨ button up top so Talia knows who she is today ♡");
      return false;
    }

    const sessionId = activeSession.id;
    const userMsg: ChatMessage = { id: makeId(), role: "user", content: text, createdAt: Date.now() };
    const assistantId = makeId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      model: settings.model,
      createdAt: Date.now(),
    };

    // Title new chats from the first message
    const isFirst = !regen && activeSession.messages.length === 0;
    if (isFirst) {
      patchSession(sessionId, {
        title: text.length > 38 ? `${text.slice(0, 36)}…` : text,
      });
    }

    setBusy(true);
    stopFlag.current = false;
    setStreamingId(assistantId);

    // Regen: re-answer IN PLACE. Context is everything *before* the message
    // being regenerated — later turns were written after that answer and
    // would leak into it.
    const regenIdx = regen
      ? activeSession.messages.findIndex((m) => m.id === opts.regenerateOf)
      : -1;
    const currentMessages = regen
      ? activeSession.messages.slice(0, regenIdx >= 0 ? regenIdx : undefined)
      : [...activeSession.messages, userMsg];
    // Display: swap the fresh answer into the old message's slot (append if
    // the target vanished mid-flight, e.g. the session was edited meanwhile).
    const displayMessages = regen
      ? regenIdx >= 0
        ? activeSession.messages.map((m) => (m.id === opts.regenerateOf ? assistantMsg : m))
        : [...activeSession.messages, assistantMsg]
      : [...currentMessages, assistantMsg];
    patchSession(sessionId, { messages: displayMessages });

    // What we ask memory/research about: the typed text, or for a regen the
    // last user message before the regenerated answer.
    const promptText = regen
      ? ([...currentMessages].reverse().find((m) => m.role === "user")?.content ?? "")
      : text;

    // Build system prompt: persona + date + memories + research
    const systemParts: string[] = [settings.systemPrompt, `Today is ${new Date().toDateString()}.`];

    // Bot persona (per-session) replaces Talia's default voice when present.
    if (activeSession.persona?.kind === "bot") {
      const bot = bots.find((b) => b.id === activeSession.persona?.id);
      if (bot?.systemPrompt) systemParts.push(bot.systemPrompt);
    }
    let attachedSources: ChatMessage["sources"] | undefined;

    try {
      // 1) Memory recall (fast, local)
      if (settings.autoRemember && promptText) {
        const hits = await recallMemory(promptText, 8);
        if (hits.length > 0) {
          systemParts.push(
            "Things you remember about the user (use naturally, don't list them back verbatim):\n" +
              hits.map((h) => `- ${h.text}`).join("\n"),
          );
        }
      }

      // 1b) Lessons learned from feedback (self-taught) — respect silently.
      if (promptText) {
        const lessons = await fetchLessons(promptText, 5);
        if (lessons.length > 0) {
          systemParts.push(
            "Lessons you've learned from the user's feedback (respect these silently — never quote this list back):\n" +
              lessons.map((l) => `- ${l.text}`).join("\n"),
          );
        }
      }

      // 2) Research mode (slower, web) — gracefully skipped when offline
      if (settings.ragEnabled && promptText) {
        if (!netOnline) {
          setNotice("🌐 You're offline — answering from my own knowledge instead of the web ♡");
          systemParts.push(
            "The user is currently OFFLINE. Web research is unavailable — answer from your own knowledge and mention you couldn't check the web this time.",
          );
        } else {
          setResearchStatus("Searching the web…");
          const r = await runResearch(promptText, 5);
          if (r.ok && r.sources && r.sources.length > 0) {
            systemParts.push(r.context || "");
            attachedSources = r.sources;
          } else {
            systemParts.push(
              "Web research is unavailable right now — answer from your own knowledge and say you couldn't verify online.",
            );
          }
          setResearchStatus(null);
        }
      }
    } catch {
      setResearchStatus(null);
    }

    const payloadMessages = [
      ...(systemParts.length > 0 ? [{ role: "system" as const, content: systemParts.join("\n\n") }] : []),
      ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    // Custom model presets carry their own temperature — apply it when the
    // selected model matches, so presets actually change generation.
    const customPreset = settings.customModels.find((c) => c.id === settings.model);
    const payloadProvider = {
      ...settings.provider,
      temperature: customPreset?.temperature ?? settings.provider.temperature,
    };

    const controller = new AbortController();
    abortRef.current = controller;
    lastRequestId.current = assistantId;

    let assistantAccumulator = "";
    let sources = attachedSources;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              updatedAt: Date.now(),
              messages: s.messages.map((m) => (m.id === assistantId ? { ...m, sources } : m)),
            }
          : s,
      ),
    );

    try {
      await streamChat(
        payloadProvider,
        settings.model,
        payloadMessages,
        {
          onToken: (tok) => {
            if (stopFlag.current) return;
            assistantAccumulator += tok;
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantId ? { ...m, content: m.content + tok } : m,
                      ),
                    }
                  : s,
              ),
            );
          },
          onDone: () => {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) => (m.id === assistantId && m.content.trim() === "" ? null : m)).filter(Boolean) as ChatMessage[],
                    }
                  : s,
              ),
            );
          },
          onError: (msg, info) => {
            // User pressed stop — don't paint an error over the abort.
            if (stopFlag.current) return;
            const missing = info?.code === "model_not_found";
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantId
                          ? {
                              ...m,
                              content: missing
                                ? `${info?.model ?? "That model"} isn't downloaded on your server yet 🌱`
                                : `Oh no, I couldn't reach your model server 🥺 — ${msg}\n\nDouble-check that it's running, then try again. I'll be right here! 🌸`,
                              error: missing ? { code: "model_not_found", model: info?.model ?? null } : undefined,
                            }
                          : m,
                      ),
                    }
                  : s,
              ),
            );
          },
        },
        controller.signal,
        assistantId,
      );

      // Post-response housekeeping: auto-remember + TTS
      const assistantText = assistantAccumulator.trim();
      if (settings.autoRemember && assistantText && !regen) {
        void rememberExchange(text, assistantText, sessionId)
          .then((r) => {
            if ((r?.saved ?? 0) > 0) setNotice("🧠 Noted — I'll remember that ♡");
          })
          .catch(() => {});
      }
      if (settings.ttsEnabled && assistantText) {
        void speakText(assistantText.slice(0, 1200));
      }
    } finally {
      setBusy(false);
      setStreamingId(null);
      abortRef.current = null;
      setResearchStatus(null);
    }
    return true;
  };

  const stop = () => {
    stopFlag.current = true;
    abortRef.current?.abort();
    if (lastRequestId.current) {
      fetch(apiUrl("/api/stop"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: lastRequestId.current }),
      }).catch(() => {});
    }
    setBusy(false);
  };

  // --- Skills (one-shot expert tasks) -------------------------------------
  const runSkill = async (skillId: string, input: string): Promise<void> => {
    const skill = skillById(skillId);
    if (!skill || busy || !activeSession) return;
    if (!settings.model) {
      setNotice("Pick a model first — tap the ✨ button up top ♡");
      return;
    }
    const sessionId = activeSession.id;
    // Recent conversation as skill context (skills that don't need it ignore it).
    const history = activeSession.messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n")
      .slice(-6000);
    const built = skill.build({ text: input, context: history.trim() || undefined });

    const assistantId = makeId();
    const skillMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      model: settings.model,
      createdAt: Date.now(),
    };
    patchSession(sessionId, { messages: [...activeSession.messages, skillMsg] });
    setBusy(true);
    stopFlag.current = false;
    setStreamingId(assistantId);

    const payloadMessages = [
      ...(built.system ? [{ role: "system" as const, content: built.system }] : []),
      { role: "user" as const, content: built.user },
    ];
    const controller = new AbortController();
    abortRef.current = controller;
    lastRequestId.current = assistantId;

    try {
      await streamChat(settings.provider, settings.model, payloadMessages, {
        onToken: (tok) => {
          if (stopFlag.current) return;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    updatedAt: Date.now(),
                    messages: s.messages.map((m) =>
                      m.id === assistantId ? { ...m, content: m.content + tok } : m,
                    ),
                  }
                : s,
            ),
          );
        },
        onDone: () => {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: s.messages
                      .map((m) => (m.id === assistantId && m.content.trim() === "" ? null : m))
                      .filter(Boolean) as ChatMessage[],
                  }
                : s,
            ),
          );
        },
        onError: (msg, info) => {
          // User pressed stop — don't paint an error over the abort.
          if (stopFlag.current) return;
          const missing = info?.code === "model_not_found";
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content: missing
                              ? `${info?.model ?? "That model"} isn't downloaded on your server yet 🌱`
                              : `The skill hit a snag 🥺 — ${msg}`,
                            error: missing ? { code: "model_not_found", model: info?.model ?? null } : undefined,
                          }
                        : m,
                    ),
                  }
                : s,
            ),
          );
        },
      }, controller.signal, assistantId);
    } finally {
      setBusy(false);
      abortRef.current = null;
      setStreamingId(null);
    }
  };

  // Re-answer an assistant message from the conversation so far.
  // One-click recovery: the provider said the model isn't on disk — pull it
  // (streaming progress into the notice bar), then retry the failed answer.
  const pullModelAndRetry = async (messageId: string, model: string) => {
    const baseUrl = settings.provider?.baseUrl || "http://localhost:11434";
    setNotice(`⬇️ Pulling ${model} — this can take a few minutes…`);
    const r = await pullModel(baseUrl, model, (status, pct) => {
      setNotice(`⬇️ ${model}: ${status}${pct !== null ? ` ${pct}%` : ""}`);
    });
    if (r.ok) {
      setNotice(`✨ ${model} is ready — finishing your answer…`);
      // Clear the error state, then re-run this answer.
      setSessions((prev) =>
        prev.map((s) => ({
          ...s,
          messages: s.messages.map((m) => (m.id === messageId ? { ...m, error: undefined } : m)),
        })),
      );
      regenerateMessage(messageId);
    } else {
      setNotice(`The pull didn't finish 🥺 — ${r.error ?? "try again from Settings → Models"}`);
    }
  };

  const regenerateMessage = (messageId: string) => {
    if (busy) return;
    void send("", { regenerateOf: messageId });
  };

  // --- Bots (session personas) --------------------------------------------
  const newChatWithBot = (bot: BotDef) => {
    stop();
    const now = Date.now();
    const s: ChatSession = {
      id: makeId(),
      title: `${bot.emoji} ${bot.name}`,
      messages: [],
      createdAt: now,
      updatedAt: now,
      persona: { kind: "bot", id: bot.id, name: bot.name, emoji: bot.emoji },
    };
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  };

  const newChat = () => {
    stop();
    const s = newSession();
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  };

  const clearChat = () => {
    if (!activeSession) return;
    stop();
    patchSession(activeSession.id, { messages: [], title: "New chat" });
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.length > 0 ? next : [newSession()];
    });
  };

  const handleExport = (format: "json" | "md") => {
    if (!activeSession || activeSession.messages.length === 0) return;
    const content = format === "json" ? exportAsJson(activeSession.messages) : exportAsMarkdown(activeSession.messages);
    downloadFile(
      `talia-chat-${timestampSlug()}.${format}`,
      content,
      format === "json" ? "application/json" : "text/markdown",
    );
  };

  const uploadChatToMemory = async () => {
    if (!activeSession) return;
    const msgs = activeSession.messages.filter((m) => m.role !== "system");
    let saved = 0;
    for (let i = 0; i + 1 < msgs.length; i += 2) {
      if (msgs[i].role === "user" && msgs[i + 1].role === "assistant") {
        const r = await rememberExchange(msgs[i].content, msgs[i + 1].content, activeSession.id);
        saved += r.saved ?? 0;
      }
    }
    setNotice(saved > 0 ? `Saved ~${saved} memories from this chat 🧠✨` : "This chat was already in my memory ♡");
  };

  const rememberOne = async (m: ChatMessage) => {
    await rememberText(m.content.slice(0, 1000), activeSession?.id ?? null);
    setNotice("Talia will remember that 🧠💗");
  };

  const feedbackOne = async (m: ChatMessage, rating: "up" | "down") => {
    // The user's most recent question gives the lesson its context.
    const idx = activeSession?.messages.findIndex((x) => x.id === m.id) ?? -1;
    const prevUser =
      idx > 0 ? [...activeSession!.messages.slice(0, idx)].reverse().find((x) => x.role === "user") : null;
    try {
      const r = await sendLessonFeedback({
        rating,
        excerpt: (prevUser?.content ?? "").slice(0, 300),
        sessionId: activeSession?.id ?? null,
      });
      setNotice(
        rating === "up"
          ? "Yay — Talia'll keep doing that 🎓"
          : r.lesson
            ? "Got it — Talia learned a lesson from that 🎓"
            : "Noted — give her a tip next time and she'll learn it faster 💗",
      );
    } catch {
      /* offline — the button still gives visual feedback */
    }
  };

  const allModels = useMemo(() => {
    const list: DiscoveredModel[] = models.map((m) => ({ id: m.id }));
    for (const c of settings.customModels) {
      if (!list.some((d) => d.id === c.id)) list.push({ id: c.id });
    }
    return list;
  }, [models, settings.customModels]);

  return (
    <div className="flex h-full">
      {/* Theme wallpaper drifts behind everything, blurred by the glass UI */}
      <LiveWallpaper theme={themeId} />

      <SessionSidebar
        open={sidebarOpen}
        sessions={sessions}
        activeId={activeSession?.id ?? null}
        onSelect={(id) => {
          stop();
          setActiveId(id);
        }}
        onNew={newChat}
        onDelete={deleteSession}
        onOpenMemory={() => setShowMemory(true)}
        onOpenStudio={() => setShowStudio(true)}
        onOpenBots={() => setShowBots(true)}
        onOpenGames={() => setShowGames(true)}
        onOpenDots={() => setShowDots(true)}
        onOpenCreate={() => setShowCreate(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <HeaderBar
          online={online}
          netOnline={netOnline}
          serverReachable={serverUp}
          model={settings.model}
          ragActive={settings.ragEnabled}
          themeId={themeId}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onOpenModels={() => setShowModels(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenStudio={() => setShowStudio(true)}
          onOpenThemes={() => setShowThemes(true)}
          onClear={clearChat}
          onExport={handleExport}
          busy={busy}
        />

        <UpdateBanner />

        {!netOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="glass-pill mx-auto mt-2 flex w-fit items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-bold"
            style={{ color: "var(--warn)" }}
          >
            📴 Offline mode — chatting & memory work, web research is paused
          </motion.div>
        )}

        {askAddress && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-strong mx-auto mt-2 flex w-fit max-w-[92%] flex-wrap items-center gap-2 rounded-full px-4 py-2"
          >
            <span className="text-[11px] font-bold" style={{ color: "var(--text-soft)" }}>
              📱 Connect to your Talia server:
            </span>
            <input
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setApiBase(serverAddress);
                  setNotice("Connecting… 📡");
                  pollHealth();
                  refreshModels();
                }
              }}
              placeholder="http://192.168.1.20:8787"
              className="min-w-0 flex-1 rounded-full border px-3 py-1 font-mono text-[12px] outline-none focus:border-accent"
              style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <button
              onClick={() => {
                setApiBase(serverAddress);
                setNotice("Connecting… 📡");
                pollHealth();
                refreshModels();
              }}
              className="rounded-full px-3 py-1 text-[11px] font-extrabold text-white"
              style={{ background: "var(--accent-grad)" }}
            >
              Connect
            </button>
            <button
              onClick={() => setAskAddress(false)}
              className="rounded-full px-2 py-1 text-[11px] font-bold"
              style={{ color: "var(--text-faint)" }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </motion.div>
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6">
            {messages.length === 0 ? (
              <EmptyState theme={themeId} />
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isStreaming={m.id === streamingId}
                    theme={themeId}
                    onRemember={rememberOne}
                    onFeedback={feedbackOne}
                    onRegenerate={m.role === "assistant" ? (msg) => regenerateMessage(msg.id) : undefined}
                    onPullModel={
                      m.role === "assistant" && m.error?.code === "model_not_found" && m.error.model
                        ? (modelName) => pullModelAndRetry(m.id, modelName)
                        : undefined
                    }
                  />
                ))}
              </AnimatePresence>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        {researchStatus && (
          <div className="mx-auto mb-1 flex max-w-3xl items-center gap-2 px-6">
            <span className="typing-dot h-2 w-2 rounded-full bg-info" />
            <span className="text-xs font-bold text-info">{researchStatus}</span>
          </div>
        )}

        {activeGame && (
          <GameHud
            game={activeGame}
            busy={busy}
            onEnd={() => void endActiveGame()}
            onPlayAgain={() => void playAgain(activeGame)}
            onAction={gameActionSend}
            onPickLevel={activeGame.gameId === "super-hop" ? (n) => void playAgain(activeGame, n) : undefined}
          />
        )}

        <Composer
          onSend={send}
          onStop={stop}
          busy={busy}
          researchEnabled={settings.ragEnabled}
          onToggleResearch={() => setSettings((s) => ({ ...s, ragEnabled: !s.ragEnabled }))}
          placeholder={
            activeGame
              ? activeGame.finished
                ? "Game over — or start a new one from the Arcade 🎮"
                : activeGame.gameId === "blockcraft"
                  ? "Build by tapping — or ask Talia for a design: `blueprint cosy cabin`"
                  : activeGame.gameId === "super-hop"
                    ? "Play with the arrow keys — or type: `go right`, `hop right`"
                    : `Type your move for ${activeGame.emoji} ${activeGame.name}…`
              : undefined
          }
        />

        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={() => setNotice(null)}
              className="pointer-events-auto fixed bottom-24 left-1/2 z-40 -translate-x-1/2 cursor-pointer"
            >
              <div className="glass-strong rounded-full px-5 py-2.5 text-xs font-bold" style={{ color: "var(--text)", borderRadius: 9999 }}>
                {notice}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ModelPickerModal
        open={showModels}
        onClose={() => setShowModels(false)}
        models={allModels}
        current={settings.model}
        onSelect={(id) => setSettings((s) => ({ ...s, model: id }))}
        onRefresh={refreshModels}
        loading={loadingModels}
        baseUrl={settings.provider.baseUrl}
        onOpenCatalog={() => setShowCatalog(true)}
      />
      <ModelCatalogModal
        open={showCatalog}
        onClose={() => setShowCatalog(false)}
        baseUrl={settings.provider.baseUrl}
        onPulled={refreshModels}
      />
      <SettingsDrawer
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onChange={(next) => {
          setSettings(next);
          if (next.provider.baseUrl !== settings.provider.baseUrl) pollHealth();
        }}
        onOpenCatalog={() => {
          setShowSettings(false);
          setShowCatalog(true);
        }}
        onOpenThemes={() => {
          setShowSettings(false);
          setShowThemes(true);
        }}
        themeId={themeId}
      />
      <MediaStudio open={showStudio} onClose={() => setShowStudio(false)} />
      <CreateStudio open={showCreate} onClose={() => setShowCreate(false)} />
      <BotsSkillsModal
        open={showBots}
        onClose={() => setShowBots(false)}
        onSpawnBot={newChatWithBot}
        onRunSkill={(id, input) => void runSkill(id, input)}
        skillBusy={busy}
      />
      <GamesModal
        open={showGames}
        onClose={() => setShowGames(false)}
        onPlay={(g) => void startPlaying(g)}
      />
      <MemoryPanel open={showMemory} onClose={() => setShowMemory(false)} onUpload={uploadChatToMemory} />
      <DotsPanel
        open={showDots}
        onClose={() => setShowDots(false)}
        provider={settings.provider}
        model={settings.model}
        onNotice={setNotice}
      />
      <ThemePicker
        open={showThemes}
        onClose={() => setShowThemes(false)}
        current={themeId}
        onPick={(id) => {
          setThemeId(id);
        }}
      />

      {/* Lagoon waves for the dino theme */}
      <div className="waves-lagoon" aria-hidden>
        <div className="wave w1" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 90'%3E%3Cpath d='M0 60 Q75 30 150 60 T300 60 T450 60 T600 60 T750 60 T900 60 T1050 60 T1200 60 L1200 90 L0 90 Z' fill='rgba(45,212,191,0.35)'/%3E%3C/svg%3E")` }} />
        <div className="wave w2" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 90'%3E%3Cpath d='M0 60 Q75 30 150 60 T300 60 T450 60 T600 60 T750 60 T900 60 T1050 60 T1200 60 L1200 90 L0 90 Z' fill='rgba(56,189,248,0.30)'/%3E%3C/svg%3E")` }} />
        <div className="wave w3" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 90'%3E%3Cpath d='M0 60 Q75 30 150 60 T300 60 T450 60 T600 60 T750 60 T900 60 T1050 60 T1200 60 L1200 90 L0 90 Z' fill='rgba(125,211,252,0.25)'/%3E%3C/svg%3E")` }} />
      </div>

      <div className="pointer-events-none fixed bottom-1 right-2 opacity-40">
        <Mascot size={22} theme={themeId} />
      </div>
    </div>
  );
}

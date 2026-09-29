import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageBubble } from "./components/MessageBubble";
import { Composer } from "./components/Composer";
import { HeaderBar } from "./components/HeaderBar";
import { ModelPickerModal } from "./components/ModelPickerModal";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { EmptyState } from "./components/StatusPill";
import { Mascot } from "./components/Mascot";
import {
  fetchModels,
  fetchProviderHealth,
  streamChat,
  type DiscoveredModel,
} from "./lib/api";
import { loadChat, makeId, saveChat } from "./lib/chatStore";
import { loadSettings, saveSettings } from "./lib/storage";
import { downloadFile, exportAsJson, exportAsMarkdown, timestampSlug } from "./lib/exportChat";
import type { ChatMessage, Settings } from "./types";

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [messages, setMessages] = useState<ChatMessage[]>(loadChat);
  const [online, setOnline] = useState(false);
  const [checking, setChecking] = useState(true);
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const stopFlag = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Persist whenever settings or chat change
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveChat(messages), [messages]);

  // --- Health polling ----------------------------------------------------
  const pollHealth = useCallback(async () => {
    try {
      const { online: o } = await fetchProviderHealth(settings.provider.baseUrl);
      setOnline(o);
    } catch {
      setOnline(false);
    } finally {
      setChecking(false);
    }
  }, [settings.provider.baseUrl]);

  useEffect(() => {
    pollHealth();
    const t = setInterval(pollHealth, 8000);
    return () => clearInterval(t);
  }, [pollHealth]);

  // --- Model discovery ---------------------------------------------------
  const refreshModels = useCallback(async () => {
    setLoadingModels(true);
    const result = await fetchModels(settings.provider.baseUrl);
    const discovered = result.models;
    setModels(discovered);
    setLoadingModels(false);
    if (result.ok && discovered.length > 0) {
      setSettings((s) => {
        const ids = new Set(discovered.map((m) => m.id));
        if (s.model && ids.has(s.model)) return s; // keep current pick
        const customFirst = s.customModels.find((c) => ids.has(c.id));
        return { ...s, model: customFirst?.id ?? discovered[0].id };
      });
    }
  }, [settings.provider.baseUrl]);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  // Auto-scroll to the newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // --- Sending -----------------------------------------------------------
  const [notice, setNotice] = useState<string | null>(null);

  const send = async (text: string): Promise<boolean> => {
    if (busy || !text.trim()) return false;
    if (!settings.model) {
      setNotice("Pick a model first — tap the ✨ button up top so Talia knows who she is today ♡");
      return false;
    }
    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    const assistantId = makeId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      model: settings.model,
      createdAt: Date.now(),
    };

    const history = [...messages, userMsg];
    setMessages([...history, assistantMsg]);
    setNotice(null);
    setBusy(true);
    stopFlag.current = false;

    const payloadMessages = [
      ...(settings.systemPrompt.trim()
        ? [{ role: "system" as const, content: settings.systemPrompt }]
        : []),
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const controller = new AbortController();
    abortRef.current = controller;
    lastRequestId.current = assistantId;

    try {
      await streamChat(
        settings.provider,
        settings.model,
        payloadMessages,
        {
          onToken: (tok) => {
            if (stopFlag.current) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + tok } : m,
              ),
            );
          },
          onDone: () => {
            // Drop the assistant bubble if generation stopped before any text arrived
            setMessages((prev) =>
              prev.some((m) => m.id === assistantId && m.content.trim() === "")
                ? prev.filter((m) => m.id !== assistantId)
                : prev,
            );
          },
          onError: (msg) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: `Oh no, I couldn't reach your model server 🥺 — ${msg}\n\nDouble-check that it's running, then try again. I'll be right here! 🌸`,
                    }
                  : m,
              ),
            );
          },
        },
        controller.signal,
        assistantId,
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
    return true;
  };

  const stop = () => {
    stopFlag.current = true;
    abortRef.current?.abort();
    if (lastRequestId.current) {
      fetch("/api/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: lastRequestId.current }),
      }).catch(() => {});
    }
    setBusy(false);
  };

  const lastRequestId = useRef<string | null>(null);

  const clearChat = () => {
    stop();
    setMessages([]);
  };

  const handleExport = (format: "json" | "md") => {
    if (messages.length === 0) return;
    const content = format === "json" ? exportAsJson(messages) : exportAsMarkdown(messages);
    downloadFile(
      `talia-chat-${timestampSlug()}.${format}`,
      content,
      format === "json" ? "application/json" : "text/markdown",
    );
  };

  // Merge discovered models with user presets for both the picker and quick switcher
  const allModels = useMemo(() => {
    const list: DiscoveredModel[] = models.map((m) => ({ id: m.id }));
    for (const c of settings.customModels) {
      if (!list.some((d) => d.id === c.id)) {
        list.push({ id: c.id });
      }
    }
    return list;
  }, [models, settings.customModels]);

  return (
    <div className="flex h-full flex-col">
      <HeaderBar
        online={online}
        checking={checking}
        model={settings.model}
        onOpenModels={() => setShowModels(true)}
        onOpenSettings={() => setShowSettings(true)}
        onClear={clearChat}
        onExport={handleExport}
        busy={busy}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isStreaming={busy && m.id === messages[messages.length - 1]?.id}
                />
              ))}
            </AnimatePresence>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <Composer onSend={send} onStop={stop} busy={busy} />

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2"
          >
            <div className="rounded-full border border-lavender-200 bg-white/95 px-5 py-2.5 text-xs font-bold text-cocoa-600 shadow-plushlg">
              {notice}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModelPickerModal
        open={showModels}
        onClose={() => setShowModels(false)}
        models={allModels}
        current={settings.model}
        onSelect={(id) => setSettings((s) => ({ ...s, model: id }))}
        onRefresh={refreshModels}
        loading={loadingModels}
      />

      <SettingsDrawer
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onChange={(next) => {
          setSettings(next);
          if (next.provider.baseUrl !== settings.provider.baseUrl) setChecking(true);
        }}
      />

      {/* Little mascot peeking in the corner */}
      <div className="pointer-events-none fixed bottom-1 right-2 opacity-40">
        <Mascot size={22} />
      </div>
    </div>
  );
}

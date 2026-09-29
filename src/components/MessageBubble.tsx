import { motion } from "framer-motion";
import { useState } from "react";
import { Brain, Check, Copy, Volume2 } from "lucide-react";
import type { ChatMessage } from "../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mascot } from "./Mascot";
import { speakText } from "../lib/serverApi";

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot h-2 w-2 rounded-full bg-blush-400" />
      ))}
    </span>
  );
}

export function MessageBubble({
  message,
  isStreaming,
  onRemember,
}: {
  message: ChatMessage;
  isStreaming: boolean;
  onRemember?: (m: ChatMessage) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [remembered, setRemembered] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const speak = async () => {
    if (speaking) return;
    setSpeaking(true);
    await speakText(message.content.slice(0, 1200));
    setTimeout(() => setSpeaking(false), 2500);
  };

  const remember = () => {
    onRemember?.(message);
    setRemembered(true);
    setTimeout(() => setRemembered(false), 1800);
  };

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className={`group flex w-full gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="mt-1 shrink-0">
          <Mascot size={38} thinking={isStreaming} />
        </div>
      )}

      <div className={`flex max-w-[78%] flex-col sm:max-w-[72%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-3xl px-4 py-2.5 text-[15px] shadow-plush ${
            isUser
              ? "rounded-br-lg bg-gradient-to-br from-blush-400 to-blush-500 text-white"
              : "rounded-bl-lg border border-blush-100 bg-white text-cocoa-700"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : message.content ? (
            <div className="prose-talia">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          ) : (
            <TypingDots />
          )}

          {message.media?.kind === "image" && (
            <img src={message.media.url} alt="attachment" className="mt-2 max-h-72 rounded-2xl" />
          )}
          {message.media?.kind === "audio" && (
            <audio controls src={message.media.url} className="mt-2 w-56" />
          )}
          {message.media?.kind === "video" && (
            <video controls src={message.media.url} className="mt-2 max-h-72 rounded-2xl" />
          )}
        </div>

        {message.sources && message.sources.length > 0 && (
          <div className="mt-1 flex max-w-full flex-wrap gap-1">
            {message.sources.map((s) => (
              <a
                key={s.n}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                title={s.title}
                className="max-w-[220px] truncate rounded-full border border-lavender-200 bg-lavender-50 px-2.5 py-0.5 text-[10px] font-bold text-lavender-500 hover:bg-lavender-100"
              >
                [{s.n}] {s.title || s.url}
              </a>
            ))}
          </div>
        )}

        {!isStreaming && (
          <div
            className={`mt-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100 ${
              isUser ? "flex-row-reverse" : ""
            }`}
          >
            <button onClick={copy} className="rounded-full p-1.5 text-cocoa-300 hover:bg-blush-50 hover:text-blush-500" title="Copy">
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
            {!isUser && (
              <>
                <button
                  onClick={speak}
                  className="rounded-full p-1.5 text-cocoa-300 hover:bg-lavender-50 hover:text-lavender-500"
                  title="Speak with local TTS"
                >
                  <Volume2 size={12} className={speaking ? "animate-pulse text-lavender-400" : ""} />
                </button>
                <button
                  onClick={remember}
                  className="rounded-full p-1.5 text-cocoa-300 hover:bg-lavender-50 hover:text-lavender-500"
                  title="Remember this"
                >
                  {remembered ? <Check size={12} className="text-emerald-400" /> : <Brain size={12} />}
                </button>
              </>
            )}
          </div>
        )}

        {isStreaming && message.content && (
          <div className="mt-1 flex items-center gap-1 pl-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-lavender-300" />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

import { motion } from "framer-motion";
import type { ChatMessage } from "../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mascot } from "./Mascot";

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
}: {
  message: ChatMessage;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className={`flex w-full gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="mt-1 shrink-0">
          <Mascot size={38} thinking={isStreaming} />
        </div>
      )}

      <div className={`max-w-[78%] sm:max-w-[72%] ${isUser ? "items-end" : "items-start"}`}>
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
        </div>
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

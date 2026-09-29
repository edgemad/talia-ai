import type { ChatMessage } from "../types";

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function exportAsMarkdown(messages: ChatMessage[]): string {
  const lines = ["# Talia AI — chat export 🌸", ""];
  for (const m of messages) {
    if (m.role === "user") {
      lines.push(`## 🧑 You — ${fmtTime(m.createdAt)}`, "", m.content, "");
    } else if (m.role === "assistant") {
      lines.push(
        `## 🌸 Talia${m.model ? ` (${m.model})` : ""} — ${fmtTime(m.createdAt)}`,
        "",
        m.content,
        "",
      );
    }
  }
  return lines.join("\n");
}

export function exportAsJson(messages: ChatMessage[]): string {
  return JSON.stringify(
    {
      app: "talia-ai",
      version: 1,
      exportedAt: new Date().toISOString(),
      messages,
    },
    null,
    2,
  );
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function timestampSlug(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

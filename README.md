# Talia AI 🌸

**Your cozy little local AI companion.** A pastel-pink, fully local chat app for
Ollama, LM Studio, llama.cpp — any OpenAI-compatible server on your machine.
No cloud. No accounts. Your chats never leave localhost.

![status](https://img.shields.io/badge/vibe-cozy%20%26%20adorable-ffb8c6)

## ✨ Features

- 🌸 **Talia the mascot** — a soft blob friend who bounces while she thinks
- 💬 **Streaming chat** with markdown, code blocks, lists, and bouncy typing dots
- 🟢 **Cute status pill** — “Talia is awake & connected” vs “Ollama offline — check localhost”
- ⚡ **Model switching on the fly** — auto-detects installed models via `/v1/models` or `/api/tags`
- 🧸 **Custom model presets** — pin model IDs, context length, temperature; stored in `localStorage`
- 🎚️ **Generation controls** — temperature & max-tokens sliders, editable system prompt
- ⏹️ **Stop generation**, clear chat, export as **Markdown or JSON**
- 🛡️ **Private by design** — the Express server is a thin local proxy; nothing is sent anywhere else

## 🗺️ Architecture

```
┌─────────────────────────────┐       ┌─────────────────────────────┐
│  React + Vite (port 5183)   │  /api │  Express proxy (port 8787)  │
│  Tailwind · Framer Motion   │ ────► │  /api/health · /api/models  │
│  Lucide icons · react-md    │       │  /api/chat  (SSE stream)    │
└─────────────────────────────┘       └──────────────┬──────────────┘
                                                     │ OpenAI-compatible
                                                     ▼
                                        🦙 Ollama / LM Studio / llama.cpp
                                          http://localhost:11434 (default)
```

```
talia-ai/
├── server/            # Express proxy (SSE pass-through, stop channel)
│   ├── index.mjs
│   ├── provider.mjs   # URL normalization + request builder
│   └── sse.mjs        # chunk normalization
├── src/
│   ├── components/    # Mascot, bubbles, composer, modals, drawer
│   ├── lib/           # api.ts (SSE client), storage, export, constants
│   ├── App.tsx        # state orchestration
│   └── index.css      # pastel theme + markdown styles
└── tests/             # vitest unit tests (16 passing)
```

## 📋 Prerequisites

1. **Node.js ≥ 18** — [nodejs.org](https://nodejs.org)
2. **A local LLM server.** The easiest is [Ollama](https://ollama.com):
   - macOS: `brew install ollama` (or download from the site)
   - Windows/Linux: grab an installer from [ollama.com/download](https://ollama.com/download)

## 📦 Pull a model

```bash
# recommended cute & lightweight picks:
ollama run llama3.2      # ~2 GB — great all-rounder
ollama run phi3:mini     # ~2.3 GB — tiny but clever
ollama run mistral       # ~4.1 GB — fast and chatty
```

## 🚀 Launch

```bash
cd talia-ai
npm install

# Terminal 1 — Talia's server (Express proxy)
npm run server

# Terminal 2 — Talia's face (Vite dev server)
npm run dev
```

Open **http://localhost:5183** and say hi! 🌸

> Pick a model from the sparkle dropdown in the header. Everything auto-saves
> to your browser — settings, presets, and chat history included.

### Using LM Studio / llama.cpp instead

Open **Settings → Local provider** and set the Base URL:

| Server | Base URL |
|---|---|
| Ollama | `http://localhost:11434` |
| LM Studio | `http://localhost:1234` |
| llama.cpp server | `http://localhost:8080` |

## 🧪 Tests

```bash
npm test         # vitest — proxy URL building, SSE normalization, export
npm run typecheck
```

## 🛠️ Troubleshooting

- **🔴 “Ollama offline”** — is `ollama serve` running? (`curl localhost:11434` should respond)
- **No models listed** — pull one: `ollama pull llama3.2`
- **Port already in use** — `PORT=9000 npm run server`, then update the Vite proxy in `vite.config.ts`
- **Repetition loops** — lower the temperature in Settings

## 📄 License

MIT © Talia

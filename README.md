# Talia AI 🌸

**Your cozy little local AI workstation.** Chat, research the live web, generate
images & video, speak aloud — all through local models, all on your machine.
Liquid-glass UI, five switchable vibes, and a baby dragon who soars the lagoon skies.
No cloud required. No accounts. No telemetry. MIT licensed.

![vibe](https://img.shields.io/badge/vibe-cozy%20%26%20adorable-ffb8c6)
![privacy](https://img.shields.io/badge/privacy-100%25%20local-b294ee)
![offline](https://img.shields.io/badge/offline-ready-2dd4bf)

## 🎨 Liquid-glass themes

Hit the 🎨 in the header — every theme swaps the whole palette, glass tint, glow,
and Talia's mascot:

| Theme | Vibe | Mascot |
|---|---|---|
| 🌸 **Sakura** | the original blush & lavender | blob |
| 🌊 **Ocean Glass** | crisp cool blues | blob |
| 🐉 **Dragon Lagoon** | mint skies + golden sun; animated waves lapping the footer | **baby dragon** |
| 🍵 **Matcha** | calm green tea & sunlight | blob |
| 🌙 **Midnight Glass** | true dark mode with violet glow | blob |

Glass everywhere: frosted header, sidebar, bubbles, composer, and modals with a
subtle sheen that sweeps across surfaces. Themes persist in localStorage.

## ✨ What Talia does

| | |
|---|---|
| 💬 **Streaming chat** | Markdown, code blocks, liquid-glass bubbles, stop/continue, regenerate, export MD/JSON |
| 🤖 **Bots & Skills** | Six built-in specialist bots (coder, writer, analyst, tutor, brainstormer, researcher) + create your own; one-tap skills: summarize, review code, translate, explain, action items, draft email |
| 🔌 **Any provider, free first** | Ollama/LM Studio/Jan/llama.cpp locally — plus free-tier cloud APIs (Groq, OpenRouter, Gemini, Mistral) or OpenAI/Claude via one key each |
| 🗂️ **Multi-chat sessions** | Sidebar of conversations, auto-titled, stored on disk — survives restarts |
| 🧠 **Memory across chats** | Talia keeps facts & snippets in a local vector-ish store and recalls them in *any* conversation. Hover any message → 🧠 to pin it |
| 🌐 **Perplexity-style research** | Flip the 🌐 toggle: Talia searches the live web, reads the top pages, and answers with numbered citations |
| 🐬 **Uncensored models, one click** | Built-in catalog (Dolphin family, vision models, coders) with streaming pull progress — no refusals, you're the adult in the room |
| 🎨 **Image · 🗣️ Speech · 🎬 Video** | Media Studio talks to your local Stable Diffusion, Piper TTS, and ComfyUI stacks |
| 📦 **Standalone mode** | `npm run server` alone serves the whole app at `localhost:8787` |

## 📴 Offline & online

Talia adapts to your connection instead of breaking:

- **Chat, memory, sessions, export** — always work, even fully offline. The UI
  shell is cached by a service worker, so `localhost:8787` loads with zero internet.
- **Web research (🌐)** — pauses gracefully offline; Talia tells you and answers
  from her own knowledge instead.
- **Model pulls & catalog** — need internet once; after that you're self-sufficient.
- The status pill shows both facts: internet up? model up? — e.g.
  *"Offline — chats still work, web research paused"* vs *"Model offline — start Ollama"*.

## 📦 Desktop installers

Talia ships as a real native app (Tauri 2) — no terminal required. The Express
API travels inside the app as a self-contained Node SEA sidecar, so the whole
workstation (UI + server + memory) is one tidy bundle:

| Platform | Get it | Notes |
|---|---|---|
| 🍎 macOS (Apple Silicon / Intel) | `Talia AI_<v>_aarch64.dmg` / `_x64.dmg` | drag to Applications; unsigned builds: right-click → Open the first time |
| 🪟 Windows | `Talia AI_<v>_x64-setup.exe` (NSIS, per-user) or `.msi` | no admin needed for the NSIS installer |
| 🐧 Linux | `.AppImage` / `.deb` / `.rpm` | AppImage = download, chmod +x, run |

Download from the [releases page](https://github.com/your-name/talia-ai/releases)
(attach installers by pushing a `v*` tag — CI builds all four platforms), or
build locally:

```bash
npm install
npm run tauri build        # → src-tauri/target/release/bundle/<platform>/
```

Under the hood: the app spawns its bundled `talia-server` sidecar on
`localhost:8787` and opens a webview pointed at it. Your data stays where it
always was — `~/.talia-ai/`. Dev with hot reload: `npm run dev:server` +
`npm run tauri dev`.

## 🚀 Quick start

```bash
# 1. Prereqs: Node.js ≥ 18  +  Ollama (https://ollama.com)
ollama run dolphin-mistral      # uncensored daily driver (4.1 GB)
#    …or any model: llama3.2, qwen2.5-coder, mistral…

# 2. Run Talia
cd talia-ai
npm install
npm run server                  # 🌸 http://localhost:8787 — that's the whole app

# …or classic two-terminal dev mode:
npm run dev                     # Vite UI on http://localhost:5183
```

Open the app → pick a model in the ✨ dropdown → say hi.

**No local model? No problem** — open Settings → Providers and pick a free-tier
cloud API (Groq is the fastest free option; OpenRouter and Gemini have free
models too). Paste the key, done. Everything else stays local.

## 🤖 Bots & Skills

Open **Bots** in the sidebar:

- **Bots** are specialist teammates — 💻 Pixel (pair-programmer), ✍️ Quill
  (editorial), 📊 Sage (structured analyst), 🦉 Owl (tutor), ⚡ Flick
  (brainstormer), 🔎 Scout (cited web research). Pick one and that chat takes on
  their brain. Create your own with a name, emoji, and system prompt — they
  persist server-side and work with any model, free ones included.
- **Skills** are one-tap expert tasks: 📝 Summarize, 🔍 Review code, 🌍 Translate,
  🧸 Explain simply, ✅ Action items, ✉️ Draft email. Skills reuse the current
  chat as context and stream like normal answers.

## 🧠 Memory (cross-chat)

- **Auto**: every exchange is distilled into memory (toggle in Settings → Superpowers).
- **Manual**: hover a message → 🧠, or open **Memory** in the sidebar to teach/search/forget.
- Recall blends semantic similarity (hashed n-gram embeddings — no model download) with
  keyword matches and recency decay, then injects the top hits into the system prompt.
- Everything lives in `~/.talia-ai/*.json`. Delete the file, mind wiped. ✨

## 🌐 Research mode

Toggle the 🌐 in the composer (or Settings → Superpowers). Before answering, Talia:

1. Web-searches your question (SearXNG if you run one, DuckDuckGo otherwise)
2. Fetches & extracts the top ~5 pages
3. Feeds them to your local model with citation instructions
4. Shows numbered source pills under the reply

**Make it *Perplexity-grade***: research quality = model quality. Dolphin Mixtral 8x7B
or Qwen-style 14B+ models synthesize far better than 3B ones.

```bash
# Optional: better search backend
docker run -p 8888:8080 searxng/searxng
TALIA_SEARXNG=http://localhost:8888 npm run server
```

## 🎨 Media Studio (all local & optional)

| Modality | Backend | Start it | Talia setting |
|---|---|---|---|
| 🖼️ Images | Automatic1111 / SD.Next / Forge | `./webui.sh --api` (port 7860) | auto-detected |
| 🗣️ Speech | Piper HTTP (or any TTS that takes `POST {text}` → audio) | see below | `TALIA_TTS_URL` |
| 🎬 Video | ComfyUI (AnimateDiff / SVD workflow) | standard ComfyUI (port 8188) | `TALIA_COMFY_URL` |

```bash
# Piper quick-start (python):
pip install piper-tts
echo 'Welcome home' | piper -m en_US-lessac-medium -f out.wav   # verify locally
# then expose a tiny HTTP wrapper, or point TALIA_TTS_URL at your existing one
TALIA_TTS_URL=http://localhost:5500/api/tts npm run server
```

Or just open **Studio** from the sidebar and hit Create — Talia tells you exactly
which backend to start if it's offline. **Honest note:** local video quality depends
entirely on your ComfyUI workflow + GPU; Talia ships a small default template.

## 🐬 The model catalog

Open Settings → **Browse model catalog**. Curated picks with one-click pulls:

- **Dolphin Mixtral 8x7B** — powerful uncensored generalist (26 GB)
- **Dolphin Mistral 7B / Dolphin 3** — fast uncensored dailies
- **Qwen 2.5 Coder** — best small coding model
- **Llama 3.2 Vision / LLaVA** — paste images into chat
- **Llama 3.2 3B** — tiny machine? start here

*Uncensored means the model won't refuse legal-but-edgy prompts; it doesn't change
your morals or your local laws. Curate your own prompts accordingly.*

## 🗺️ Architecture

```
React + Vite + Tailwind + Framer Motion  ←→  Express (8787)
        │ static build served standalone           │
        │                                          ├─ /api/chat → your LLM (Ollama/LM Studio/llama.cpp, OpenAI-style)
        │  memory recall injected                  ├─ /api/research → SearXNG/DDG → page reader
        │  system prompt                           ├─ /api/memory → JSON store + n-gram embeddings
        └──────────────────────────────────────────┼─ /api/media → A1111 · Piper · ComfyUI
                                                   └─ /api/models → catalog + streaming pull
~/.talia-ai/  ← sessions, memory, settings (portable JSON)
```

| Env var | Default | What |
|---|---|---|
| `PORT` | `8787` | Talia server port |
| `TALIA_DATA_DIR` | `~/.talia-ai` | Where memory/sessions live |
| `TALIA_SEARXNG` | — (DDG fallback) | SearXNG base URL for private search |
| `TALIA_SD_URL` | `127.0.0.1:7860` | Stable Diffusion webui API |
| `TALIA_TTS_URL` | — | TTS endpoint (`POST {text}` → audio) |
| `TALIA_COMFY_URL` | — | ComfyUI base URL for video |

## 🧪 Tests & scripts

```bash
npm test          # 24 tests: embeddings, memory, research, proxy, export
npm run typecheck
npm run build     # emits dist/ + self-contained dist/talia-preview.html
npm run sidecar   # bundle server → standalone SEA binary (self-tested)
npm run icons     # regenerate app icons from the mascot
npm run tauri build  # native installers (macOS dmg / Windows nsis,msi / Linux deb,rpm,appimage)
```

## 🛠️ Troubleshooting

- **🔴 Ollama offline** — `ollama serve` first (or the desktop app running)
- **Research finds nothing** — DDG rate-limits aggressively; run SearXNG for heavy use
- **Memory feels fuzzy** — more specific messages = better recall; pin 🧠 the important stuff
- **Port busy** — `PORT=9000 npm run server`

## 📄 License

MIT © Talia

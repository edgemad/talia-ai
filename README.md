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
| 🔵 **Dots — always-on agents** | Give a dot a goal and a cadence and Talia keeps working on it between conversations: she researches, writes progress reports you can read later, and learns from your 👍/👎 feedback |
| 🎮 **Games Arcade** | Twelve built-in games — Guess My Number, Quick Math, Tic-Tac-Toe, Connect Four, RPS, Hangman, Riddle Run, Simon, Twenty Questions, Story Chain, 🧱 **Blockcraft**: a Minecraft-like voxel world on a canvas where kids tap blocks to mine them, tap the sky to build, and blueprint with Talia, and 🍄 **Super Hop**: a side-scrolling platformer with 60fps canvas physics, coins, critters to stomp, warp pipes and question blocks to hop over, and a castle at the finish — six named worlds to pick from, each one proven finishable by a bot that flies it on every test run |
| ✂️ **Make something** | A kids' drawing pad (pencil, marker, crayon, eraser, shapes and stickers, 20-step undo, PNG export and an offline gallery) and a paper-folding guide with 10 characters, 4 starting bases and 10 tricks — every step drawn as an SVG diagram with the moving flap shaded. No account, no upload, no engine to install |
| 🔌 **Any provider, free first** | Ollama/LM Studio/Jan/llama.cpp locally — plus free-tier cloud APIs (Groq, OpenRouter, Gemini, Mistral) or OpenAI/Claude via one key each |
| 🗂️ **Multi-chat sessions** | Sidebar of conversations, auto-titled, stored on disk — survives restarts |
| 🧠 **Memory across chats** | Talia keeps facts & snippets in a local vector-ish store and recalls them in *any* conversation. Hover any message → 🧠 to pin it |
| 🌐 **Perplexity-style research** | Flip the 🌐 toggle: Talia searches the live web, reads the top pages, and answers with numbered citations |
| 🐬 **Uncensored models, one click** | Built-in catalog (Dolphin family, vision models, coders) with streaming pull progress — no refusals, you're the adult in the room |
| 🎨 **Image · 🗣️ Speech · 🎬 Video** | Media Studio talks to your local Stable Diffusion, Piper TTS, and ComfyUI stacks |
| 📦 **Standalone mode** | `npm run server` alone serves the whole app at `localhost:8787` |
| 🎓 **Self-taught** | Every 👍/👎 on an answer becomes a durable lesson. Talia distills, merges and prunes them on her own clock, injects the relevant ones into future prompts, and graduates her strongest into long-term memory — so she gets better the more you use her |
| 🔄 **Auto-updates** | Desktop rebuilds and swaps itself in the background with a signed installer (public key baked in — nothing unsigned ever runs). Android updates silently through the Play Store. Talia's built-in engine refreshes itself too |
| 🤖 **Android & Play Store** | A real installable Android app (APK + AAB). It's a self-hosted client: the UI runs on your phone, the AI runs on your own machine, and they talk over your LAN. Signed with your Play App Signing keystore, so it can ship to the Play Console |

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

## 🔵 Dots (always-on agents)

Open **Dots** in the sidebar. A *dot* is a persistent, goal-holding agent — Talia's
answer to OpenAI's Dots — that keeps working **between** conversations:

- Give it a **goal** (and optional standing instructions) and a **cadence** (every
  15m up to daily). The server wakes it on that cadence, thinks with your local
  model, and writes a **progress report**.
- When a dot is allowed to *act*, it can pull in **live web research** and cite
  sources; set it to *local knowledge only* and it never touches the network.
- **Feedback = learning**: hover a dot, drop a note and hit 👍/👎. Talia distills
  it into a learning that every future session respects.
- Everything a dot finds is saved to cross-chat **memory**, so your next chat
  already knows it. Reports, activity and learnings live in `~/.talia-ai/dots.json`.

A dot's tools are deliberately small — the model, memory and (optional) web
research. There's no shell or filesystem access, so an always-on loop can never
run away with your machine. Offline Mode is honored: with it on, dots keep
working from the model's own knowledge and simply skip the web. Disable the whole
subsystem with `TALIA_DOTS_DISABLED=1`.

A dot's provider **API key is held in memory only** — it is never written to
`dots.json`. The UI re-arms the key when it connects, so cloud-backed dots keep
working unattended, while keyless local models need nothing at all.

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
| `TALIA_DOTS_DISABLED` | — | Set to `1` to turn off the always-on Dots scheduler |

## 🧪 Tests & scripts

```bash
npm test          # full suite: learning, runtime, memory, research, proxy, export, games
npm run typecheck
npm run build     # emits dist/ + self-contained dist/talia-preview.html
npm run sidecar   # bundle server → standalone SEA binary (self-tested)
npm run icons     # regenerate app icons from the mascot
npm run tauri build  # native installers (macOS dmg / Windows nsis,msi / Linux deb,rpm,appimage)

# Android / Play Store
npm run android:init     # scaffold + patch the project for Play (versionCode, cleartext-LAN)
npm run android:bundle   # signed AAB for the Play Console
npm run android:apk      # sideloadable APK
```

## 🎓 Self-taught (how Talia learns)

Hover any assistant answer and tap 👍 or 👎 (add a note to teach faster). That
feedback flows into a local lessons store:

1. **Distilled** — a note becomes a lesson (`Keep doing: …` / `Avoid: …`); similar
   lessons merge instead of piling up.
2. **Injected** — the relevant lessons are woven into the system prompt of future
   chats *and* Dots, silently.
3. **Graduated** — lessons you reinforce (or that keep proving right) are promoted
   into long-term memory so they survive a memory wipe of the raw store.
4. **Pruned** — stale lessons decay and contradicted ones get overruled by newer
   feedback.

Everything is deterministic and offline — no cloud, no extra model. Open
**Memory** in the sidebar to review, edit or unlearn lessons. Kill switch:
`TALIA_LEARNING_DISABLED=1`.

## 🔄 Auto-update

- **Desktop (Tauri):** the app checks the GitHub releases feed on launch and
  every 4 h, downloads the matching installer, verifies its **minisign
  signature** against the public key baked into the binary, then swaps itself
  and relaunches. Unsigned builds never run.
- **Engine:** Talia's built-in llama.cpp engine self-refreshes in the background
  so you always get the newest CPU/GPU build. Toggle it off in
  **Settings → Updates**, or set `TALIA_ENGINE_AUTOUPDATE=0`.
- **Android / Play Store:** updates are handled by Play itself.

Release signing lives in `.tauri-signing/` (gitignored). To cut a signed
release, set `TAURI_SIGNING_PRIVATE_KEY` in CI — the workflow signs installers
and uploads the `latest.json` the updater consumes.

## 🤖 Android & Play Store

The Android app is a **self-hosted client**: the UI ships in the APK, the AI
runs on your own machine (`npm run server` or the desktop app), and they talk
over your LAN. Point the app at your server's `http://<lan-ip>:8787` in
Settings.

```bash
npm run android:init        # scaffold + patch for Play (versionCode, cleartext-LAN, signing)
npm run android:bundle      # build the signed AAB the Play Console accepts
npm run android:apk         # or a sideloadable APK
```

`scripts/android-play.mjs` derives a monotonic `versionCode` from semver
(Play rejects backwards versions) and writes a network-security config that
allows cleartext **only** to loopback/LAN — the internet stays HTTPS-only.

## 🛠️ Troubleshooting

- **🔴 Ollama offline** — `ollama serve` first (or the desktop app running)
- **Research finds nothing** — DDG rate-limits aggressively; run SearXNG for heavy use
- **Memory feels fuzzy** — more specific messages = better recall; pin 🧠 the important stuff
- **Port busy** — `PORT=9000 npm run server`

## 📄 License

MIT © Talia

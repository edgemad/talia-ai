// Local media generation. Talia talks to whatever creative stack you already
// run — no cloud APIs, no keys:
//
//   Images  → Automatic1111 / SD.Next  (http://127.0.0.1:7860, /sdapi/v1/txt2img)
//           or any OpenAI-compatible /images/generations (e.g. ComfyUI-OAI bridge)
//   Speech  → Piper HTTP server     (TALIA_TTS_URL, POST {text} → audio/wav)
//   Video   → ComfyUI               (TALIA_COMFY_URL, prompt → /history frames → webm)
//
// Every helper degrades gracefully: if the service is offline you get a clear
// message instead of a crash.

import { generateLocalImage, sdStatus } from "./sd.mjs";

const DEFAULTS = {
  image: process.env.TALIA_SD_URL || "http://127.0.0.1:7860",
  tts: process.env.TALIA_TTS_URL || "",
  comfy: process.env.TALIA_COMFY_URL || "",
};

async function j(url, opts = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal });
    const text = await r.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!r.ok) throw new Error(typeof body === "string" ? body.slice(0, 200) : body?.error || r.statusText);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Images -------------------------------------------------------
export async function generateImage(
  { prompt, negative, steps, cfg, width, height, hires, useLocal, modelId, baseUrl: explicitBase },
  baseUrl = DEFAULTS.image,
) {
  // 1) Talia's own built-in engine first (zero setup), unless the user asked
  //    for a specific external backend in the Studio's advanced controls.
  if (useLocal !== false && !explicitBase) {
    const st = await sdStatus();
    if (st.installed && st.models.some((m) => m.downloaded)) {
      const r = await generateLocalImage({ prompt, negative, steps, cfg, width, height, modelId });
      if (r.ok) return r;
      // Local engine failed but exists → surface its error only if there is
      // no external backend to fall back to; otherwise try A1111 below.
      const externalUp = await fetch(`${String(baseUrl).replace(/\/+$/, "")}/sdapi/v1/options`, { signal: AbortSignal.timeout(1500) })
        .then((r) => r.ok)
        .catch(() => false);
      if (!externalUp) return r;
    }
  }

  const base = String(explicitBase || baseUrl).replace(/\/+$/, "");
  // Try Automatic1111 first, fall back to OpenAI-style endpoint
  try {
    const payload = {
      prompt,
      negative_prompt: negative || "lowres, blurry, watermark, jpeg artifacts, bad anatomy",
      steps: Math.min(80, Math.max(8, Number(steps) || 32)),
      cfg_scale: Math.min(14, Math.max(1, Number(cfg) || 7)),
      width: Math.min(1536, Math.max(256, Number(width) || 768)),
      height: Math.min(1536, Math.max(256, Number(height) || 768)),
      sampler_name: "DPM++ 2M Karras",
      batch_size: 1,
      n_iter: 1,
    };
    if (hires) {
      // Hi-res fix: denoise at low res, then upscale+redetail — much crisper
      // edges and faces at 1024px+ than raw 1024px generation.
      payload.enable_hr = true;
      payload.hr_scale = 1.5;
      payload.hr_upscaler = "Latent";
      payload.hr_second_pass_steps = Math.max(10, Math.round(payload.steps * 0.6));
      payload.denoising_strength = 0.45;
    }
    const body = await j(`${base}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (body?.images?.[0]) {
      const b64 = body.images[0];
      return { ok: true, kind: "image", mime: "image/png", dataUrl: `data:image/png;base64,${b64}`, backend: "automatic1111" };
    }
  } catch (err) {
    if (!/abort|fetch/i.test(String(err))) {
      // A1111 answered but with an error → try the OAI-style path anyway
    }
  }

  try {
    const body = await j(`${base}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, n: 1, size: `${width || 768}x${height || 768}` }),
    });
    const item = body?.data?.[0];
    if (item?.b64_json) {
      return { ok: true, kind: "image", mime: "image/png", dataUrl: `data:image/png;base64,${item.b64_json}`, backend: "openai-style" };
    }
    if (item?.url) return { ok: true, kind: "image", mime: "image/png", dataUrl: item.url, backend: "openai-style" };
  } catch (err) {
    return {
      ok: false,
      error: `No image backend at ${base} — install Talia's built-in image engine in Media Studio (zero drivers), or start Automatic1111 (or set TALIA_SD_URL). (${String(err).slice(0, 120)})`,
    };
  }
  return { ok: false, error: "Image backend responded but returned no image." };
}

// ---------- Speech (TTS) --------------------------------------------------
export async function synthesizeSpeech({ text, voice, ttsUrl }, baseUrl = DEFAULTS.tts) {
  const target = ttsUrl || baseUrl;
  if (!target) {
    return { ok: false, error: "No TTS server configured. Run Piper (see README) or set TALIA_TTS_URL." };
  }
  try {
    const r = await fetch(`${target.replace(/\/+$/, "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: voice || undefined }),
    });
    if (!r.ok) throw new Error(`TTS ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type")?.includes("html") ? "audio/wav" : r.headers.get("content-type") || "audio/wav";
    return { ok: true, kind: "audio", mime, dataUrl: `data:${mime};base64,${buf.toString("base64")}`, backend: "piper-compatible" };
  } catch (err) {
    return { ok: false, error: `TTS server unreachable at ${target} (${String(err).slice(0, 120)})` };
  }
}

// ---------- Video (ComfyUI) ----------------------------------------------
const VIDEO_PROMPT_TEMPLATE = {
  "3": { class_type: "KSampler", inputs: { seed: 0, steps: 20, cfg: 7, sampler_name: "euler", scheduler: "simple", denoise: 1 } },
  "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "v2-1_512-ema-pruned.safetensors" } },
  "5": { class_type: "EmptyLatentVideo", inputs: { width: 512, height: 512, length: 48, batch_size: 1 } },
  "6": { class_type: "CLIPTextEncode", inputs: { text: "" } },
  "7": { class_type: "CLIPTextEncode", inputs: { text: "" } },
  "8": { class_type: "VAEDecode", inputs: {} },
  "9": { class_type: "CreateVideo", inputs: { fps: 12 } },
  "10": { class_type: "SaveVideo", inputs: {} },
};

export async function generateVideo(
  { prompt, negative, seconds = 3, width = 512, height = 512, fps = 12 },
  baseUrl = DEFAULTS.comfy,
) {
  if (!baseUrl) {
    return { ok: false, error: "No ComfyUI URL configured. Start ComfyUI (see README) or set TALIA_COMFY_URL." };
  }
  const base = baseUrl.replace(/\/+$/, "");
  const safeFps = Math.min(24, Math.max(6, Math.round(Number(fps) || 12)));
  const p = structuredClone(VIDEO_PROMPT_TEMPLATE);
  p["6"].inputs.text = prompt;
  p["7"].inputs.text = negative || "blurry, low quality, flickering";
  p["9"].inputs.fps = safeFps;
  p["5"].inputs.length = Math.min(192, Math.max(6, Math.round((Number(seconds) || 3) * safeFps)));
  p["5"].inputs.width = Math.min(768, Math.max(256, Number(width) || 512));
  p["5"].inputs.height = Math.min(768, Math.max(256, Number(height) || 512));
  p["3"].inputs.seed = Math.floor(Math.random() * 1e9);
  // Wire edges
  p["6"].inputs.clip = ["4", 1];
  p["7"].inputs.clip = ["4", 1];
  p["3"].inputs.model = ["4", 0];
  p["3"].inputs.positive = ["6", 0];
  p["3"].inputs.negative = ["7", 0];
  p["3"].inputs.latent_image = ["5", 0];
  p["8"].inputs.samples = ["3", 0];
  p["8"].inputs.vae = ["4", 2];
  p["9"].inputs.images = ["8", 0];
  p["10"].inputs.video = ["9", 0];
  p["10"].inputs.filename_prefix = "talia-video";

  try {
    const queued = await j(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: p }),
    });
    const promptId = queued?.prompt_id;
    if (!promptId) return { ok: false, error: "ComfyUI did not accept the video prompt." };

    // Poll history until the job finishes
    for (let i = 0; i < 150; i++) {
      await new Promise((res) => setTimeout(res, 2000));
      const hist = await j(`${base}/history/${promptId}`, {}, 15000);
      const entry = hist?.[promptId];
      if (!entry) continue;
      const outputs = entry.outputs || {};
      for (const nodeOut of Object.values(outputs)) {
        const g = nodeOut.gifs?.[0] || nodeOut.videos?.[0] || nodeOut.images?.find((im) => /\.(webm|mp4|gif)$/i.test(im.filename || ""));
        if (g) {
          const params = new URLSearchParams({ filename: g.filename, subfolder: g.subfolder || "", type: g.type || "output" });
          return {
            ok: true,
            kind: "video",
            mime: g.filename.endsWith(".gif") ? "image/gif" : "video/webm",
            dataUrl: `${base}/view?${params}`,
            backend: "comfyui",
          };
        }
      }
      if (entry.status?.completed) break;
    }
    return { ok: false, error: "ComfyUI timed out rendering the video (try shorter seconds)." };
  } catch (err) {
    return { ok: false, error: `ComfyUI unreachable at ${base} (${String(err).slice(0, 120)})` };
  }
}

// ---------- Health --------------------------------------------------------
export async function mediaHealth() {
  const sd = await sdStatus();
  const builtinImage = sd.installed && sd.models.some((m) => m.downloaded);
  const out = { image: false, builtinImage, tts: !!DEFAULTS.tts, video: false };
  try {
    const r = await fetch(`${DEFAULTS.image.replace(/\/+$/, "")}/sdapi/v1/options`, { signal: AbortSignal.timeout(1500) });
    out.image = r.ok;
  } catch {
    /* offline */
  }
  try {
    if (DEFAULTS.comfy) {
      const r = await fetch(`${DEFAULTS.comfy.replace(/\/+$/, "")}/system_stats`, { signal: AbortSignal.timeout(1500) });
      out.video = r.ok;
    }
  } catch {
    /* offline */
  }
  return out;
}

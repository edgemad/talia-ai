// Inlines the Vite build into one self-contained HTML file (dist/talia-preview.html).
// Handy for sharing a static glimpse of the UI without running any servers.
// Real chatting still needs `npm run server` + `npm run dev`.
import { readFile, writeFile, readdir } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);

const html = await readFile(new URL("index.html", dist), "utf8");
const files = await readdir(new URL("assets/", dist));

const js = files.find((f) => f.endsWith(".js"));
const css = files.find((f) => f.endsWith(".css"));
if (!js || !css) throw new Error("dist/assets missing js or css — run `npm run build` first");

const jsCode = await readFile(new URL(`assets/${js}`, dist), "utf8");
const cssCode = await readFile(new URL(`assets/${css}`, dist), "utf8");
const mascot = await readFile(new URL("../public/mascot.svg", import.meta.url), "utf8");
const dragon = await readFile(new URL("../public/dragon.svg", import.meta.url), "utf8");
const mascotDataUrl = `data:image/svg+xml;base64,${Buffer.from(mascot).toString("base64")}`;
const dragonDataUrl = `data:image/svg+xml;base64,${Buffer.from(dragon).toString("base64")}`;

const out = html
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/, () => `<script type="module">${jsCode}</script>`)
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/, () => `<style>${cssCode}</style>`)
  .replaceAll("/mascot.svg", mascotDataUrl)
  .replaceAll("/dragon.svg", dragonDataUrl)
  .replaceAll("navigator.serviceWorker.register", "(async()=>{})"); // static preview has no SW

await writeFile(new URL("talia-preview.html", dist), out);
console.log(`✨ wrote dist/talia-preview.html (${(out.length / 1024).toFixed(0)} kB)`);

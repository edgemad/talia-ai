// Stamps the service worker with a build-unique cache name.
//
// public/sw.js is copied verbatim into dist/ by Vite, so without this step its
// bytes are identical in every release. The browser only re-installs a service
// worker when its script CHANGES, and only the install handler repopulates the
// shell cache — so an unchanged sw.js meant a release could ship a brand-new
// index.html while the worker went on serving last release's cached shell
// (pointing at a JS file the new bundle had deleted). The user saw the old UI
// no matter how many times they reloaded. Deriving the cache name from the
// built bundle's hash makes sw.js differ on every build, which forces the
// re-install that lets activate() clear the previous cache.
//
// The build hashes assets into dist/assets/index-<hash>.js; that hash is a
// perfectly good build stamp, so we reuse it rather than inventing another.

import { readFile, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
const swPath = new URL("sw.js", dist);

const PLACEHOLDER = "__TALIA_SHELL_CACHE__";
if (!(await readFile(swPath, "utf8")).includes(PLACEHOLDER)) {
  console.log("ℹ️  dist/sw.js has no cache placeholder — nothing to stamp");
  process.exit(0);
}

const assets = await readdir(new URL("assets/", dist));
const js = assets.find((f) => f.endsWith(".js"));
if (!js) throw new Error("dist/assets has no .js bundle — run `vite build` first");

const stamp = js.replace(/\.js$/, "").replace(/^index-/, "") || Date.now().toString(36);
const stamped = `talia-shell-${stamp}`;

const sw = await readFile(swPath, "utf8");
await writeFile(swPath, sw.replace(PLACEHOLDER, stamped));

console.log(`🌸 sw.js cache stamped: ${stamped}`);

#!/usr/bin/env node
// Builds the Talia Express API into a standalone sidecar binary using
// Node's Single Executable Application (SEA) feature.
//
//   node scripts/build-sidecar.mjs                # current platform → build/sidecar/
//   node scripts/build-sidecar.mjs --out <dir>    # custom output dir
//   node scripts/build-sidecar.mjs --tauri        # also stage into src-tauri/binaries
//                                                 #   as talia-server-<rust-triple>[.exe]
//                                                 #   (honors TAURI_ENV_TARGET_TRIPLE
//                                                 #    set by Tauri build hooks)
//
// Requires: esbuild (devDependency). Node SEA must be available — official
// nodejs.org builds have it; some distro/Homebrew builds disable it, so this
// script auto-downloads an official build into .tools/node/ when needed.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.argv.includes("--out")
  ? resolve(process.argv[process.argv.indexOf("--out") + 1])
  : join(root, "build", "sidecar");
const stageTauri = process.argv.includes("--tauri");
const exe = process.platform === "win32" ? "talia-server.exe" : "talia-server";

// Rust target triple: prefer the one Tauri passes to build hooks.
function rustTriple() {
  const env = process.env.TAURI_ENV_TARGET_TRIPLE;
  if (env) return env;
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  if (process.platform === "win32") return `${arch}-pc-windows-msvc`;
  return `${arch}-unknown-linux-gnu`;
}

// Official nodejs.org arch name.
function nodeArch() {
  const a = process.arch;
  if (a === "arm64") return "arm64";
  if (a === "x64") return "x64";
  throw new Error(`unsupported arch for node download: ${a}`);
}

// Find (or fetch) a Node binary with SEA support for building.
// Probe by actually generating a throwaway blob: some builds (Homebrew)
// print help fine but refuse SEA at runtime.
function seaWorks(exe) {
  const dir = mkdtempSync(join(tmpdir(), "talia-sea-probe-"));
  try {
    const entry = join(dir, "e.cjs");
    const blob = join(dir, "e.blob");
    writeFileSync(entry, "process.exit(0);\n");
    const cfg = join(dir, "c.json");
    writeFileSync(cfg, JSON.stringify({ main: entry, output: blob }));
    const p = spawnSync(exe, ["--experimental-sea-config", cfg], { encoding: "utf8" });
    return p.status === 0 && existsSync(blob);
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Node ≥26 integrates the final injection step (`--build-sea`); older
// versions would need postject, whose release line lags new blob formats.
function supportsBuildSea(exe) {
  const p = spawnSync(exe, ["--build-sea"], { encoding: "utf8" });
  return !(p.stderr + p.stdout).includes("bad option");
}

let nodeExe = process.execPath;
// Optional override: use this node binary as the SEA executable base
// (needed to cross-produce another architecture, e.g. x64 macOS from an
// arm64 runner; the binary must be able to run on the build machine).
const seaBaseOverride = process.env.TALIA_SEA_NODE;
if (!seaWorks(nodeExe)) {
    // Official tarballs extract into node-<v>-<plat>-<arch>/bin/node
    const version = process.version; // keep the same Node version family
    const arch = nodeArch();
    const plat = process.platform;
    const dlDir = join(homedir(), ".talia", "tools", `node-${version}-sea`);
    const binRel = plat === "win32" ? "node.exe" : join("bin", "node");
    const innerBin = join(dlDir, `node-${version}-${plat}-${arch}`, binRel);
    const flatBin = join(dlDir, binRel);
    const pick = () => (existsSync(innerBin) ? innerBin : existsSync(flatBin) ? flatBin : null);
    if (!pick()) {
      const ext = plat === "win32" ? "zip" : "tar.gz";
      const url = `https://nodejs.org/dist/${version}/node-${version}-${plat}-${arch}.${ext}`;
      console.log(`🌸 this Node build has SEA disabled — fetching official build: ${url}`);
      const tmp = join(tmpdir(), `talia-node-${version}.part`);
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`download failed: ${res.status} ${res.statusText}`);
        process.exit(1);
      }
      writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      rmSync(dlDir, { recursive: true, force: true });
      mkdirSync(dlDir, { recursive: true });
      spawnSync("tar", [ext === "zip" ? "-xf" : "-xzf", tmp, "-C", dlDir], { stdio: "inherit" });
      rmSync(tmp, { force: true });
    }
    const found = pick();
    if (!found) {
      console.error(`official node extraction failed — no binary in ${dlDir}`);
      process.exit(1);
    }
    nodeExe = found;
}
if (!supportsBuildSea(nodeExe)) {
  console.error(`node ${process.version} lacks --build-sea; Node >= 26 (or TALIA_SEA_NODE pointing at a newer node) is required`);
  process.exit(1);
}
// The SEA executable base defaults to the SEA-capable node we found.
const seaBase = seaBaseOverride || nodeExe;

mkdirSync(outDir, { recursive: true });

// --- 1. Bundle server/index.mjs with esbuild ------------------------------
// format=cjs so the bundle runs as a CommonJS SEA entry (no import.meta).
const bundlePath = join(outDir, "server.cjs");
const esbuildBin = join(
  root,
  "node_modules",
  ".bin",
  `esbuild${process.platform === "win32" ? ".cmd" : ""}`,
);
if (!existsSync(esbuildBin)) {
  console.error("esbuild not found — run `npm install` first.");
  process.exit(1);
}
const esbuild = spawnSync(
  esbuildBin,
  [
    join(root, "server", "index.mjs"),
    "--bundle",
    "--platform=node",
    "--format=cjs",
    `--outfile=${bundlePath}`,
    "--legal-comments=none",
    "--log-level=warning",
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);
if (esbuild.status !== 0) {
  console.error("esbuild bundling failed");
  process.exit(1);
}

// --- 2. Build the SEA blob --------------------------------------------------
const seaConfigPath = join(outDir, "sea-config.json");
const blobPath = join(outDir, "sea-prep.blob");

writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      main: bundlePath,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true,
    },
    null,
    2,
  ),
);

const gen = spawnSync(nodeExe, ["--experimental-sea-config", seaConfigPath], {
  stdio: "inherit",
  cwd: outDir,
});
if (gen.status !== 0) {
  console.error("SEA blob generation failed");
  process.exit(1);
}

// --- 3. Build the single executable ----------------------------------------
// Node ≥26 integrates postject-style injection via `node --build-sea=<config>`
// and writes the executable to ./<output-basename> in the given cwd.
// (postject's release line predates Node ≥26's blob format, so we can't use it.)
const built = spawnSync(seaBase, [`--build-sea=${seaConfigPath}`], {
  stdio: "inherit",
  cwd: outDir,
});
if (built.status !== 0) {
  console.error("node --build-sea failed");
  process.exit(1);
}
const exePath = join(outDir, exe);
rmSync(exePath, { force: true });
renameSync(join(outDir, "sea-prep.blob"), exePath);

// macOS kills unsigned binaries (AMFI SIGKILL a couple of seconds after
// exec). --build-sea doesn't sign, so ad-hoc sign the result.
if (process.platform === "darwin") {
  const sign = spawnSync(
    "codesign",
    ["--sign", "-", "--force", "--timestamp=none", exePath],
    { stdio: "inherit" },
  );
  if (sign.status !== 0) {
    console.error("ad-hoc codesign failed");
    process.exit(1);
  }
}

// --- 4. Self test the binary -----------------------------------------------
// The sandbox/CI environment reaps long-lived daemons, so instead of keeping
// the server running we use its built-in TALIA_SELFTEST mode: boot, hit the
// health endpoint, print SELFTEST OK, exit 0.
const smokePort = 18499;
const smoke = spawnSync(exePath, [], {
  env: { ...process.env, PORT: String(smokePort), TALIA_SELFTEST: "1", TALIA_DIST_DIR: "" },
  timeout: 30_000,
  encoding: "utf8",
});
const smokeOut = `${smoke.stdout || ""}${smoke.stderr || ""}`;
if (smoke.status !== 0 || !smokeOut.includes("SELFTEST OK")) {
  console.error(smokeOut.slice(-1500));
  console.error("sidecar self test failed");
  process.exit(1);
}
console.log("🌸 sidecar self test passed");

const hash = createHash("sha256").update(readFileSync(exePath)).digest("hex").slice(0, 12);
console.log(`🌸 sidecar ready: ${join(outDir, exe)} (${hash})`);

// --- 5. Optionally stage for Tauri externalBin ------------------------------
if (stageTauri) {
  const triple = rustTriple();
  const stagedName = `talia-server-${triple}${process.platform === "win32" ? ".exe" : ""}`;
  const tauriBinDir = join(root, "src-tauri/binaries");
  mkdirSync(tauriBinDir, { recursive: true });
  copyFileSync(exePath, join(tauriBinDir, stagedName));
  console.log(`🌸 staged for tauri: src-tauri/binaries/${stagedName} (triple ${triple})`);
}

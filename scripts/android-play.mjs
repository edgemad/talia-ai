// 📱 Play Store readiness — patch the generated Android project for store release.
//
// `npm run android:init` scaffolds a fresh project every build (it's
// gitignored), so this runs right after it to make the result store-ready:
//
//   • versionCode derived from semver (major·1e6 + minor·1e3 + patch), so each
//     release is monotonically higher — Play rejects uploads that go backwards.
//   • A network security config that permits cleartext ONLY to loopback + LAN
//     hosts (the app is a thin client for a self-hosted server on your own
//     network) while keeping the internet HTTPS-only — the polished, Play-safe
//     version of a blanket `usesCleartextTraffic="true"`.
//   • Release build made installable (isMinifyEnabled can stay on; we just
//     make sure a `release` signing config can bind from the environment).
//
// Every decision lives in a pure function (versionCodeFor, …) so it can be
// unit-tested without an Android SDK.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** Play's ceiling for a version code. */
export const MAX_VERSION_CODE = 2_100_000_000;

/** Semver string → monotonically increasing Android versionCode (pure). */
export function versionCodeFor(version) {
  const m = String(version ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return 1;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  const code = major * 1_000_000 + minor * 1_000 + patch;
  return Math.max(1, Math.min(MAX_VERSION_CODE, code));
}

/**
 * The network security config XML (pure). Cleartext is allowed only to
 * loopback and private LAN ranges — where a self-hosted Talia server lives.
 */
export function networkSecurityConfigXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Talia talks to your own server over plain HTTP on your LAN; everything
     else (updates, research, cloud providers) stays HTTPS-only. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">192.168.0.0</domain>
        <domain includeSubdomains="false">192.168.1.0</domain>
        <domain includeSubdomains="false">10.0.0.0</domain>
        <domain includeSubdomains="false">172.16.0.0</domain>
    </domain-config>
</network-security-config>
`;
}

/** Point the manifest's <application> at our network security config (pure). */
export function patchManifest(xml) {
  let out = String(xml ?? "");
  // Attach the config to <application …> if it isn't already.
  if (!out.includes("android:networkSecurityConfig")) {
    out = out.replace(
      /(<application\b[^>]*?)(>)/,
      '$1\n        android:networkSecurityConfig="@xml/network_security_config"$2',
    );
  }
  // The blanket cleartext flag is superseded by the granular config.
  out = out.replace(/\s*android:usesCleartextTraffic="[^"]*"/, "");
  return out;
}

/** Force an explicit, store-safe versionCode line in defaultConfig (pure). */
export function patchGradle(kts, version) {
  const code = versionCodeFor(version);
  const versionName = String(version ?? "").trim() || "1.0";
  let out = String(kts ?? "");
  // Replace the ENTIRE assignment line, not just up to the first `)`.
  // The template lines already end in `.toInt()` / `)`, and a partial match
  // used to leave the tail behind — producing `.toInt()).toInt()` and a
  // Kotlin syntax error that failed the Android gradle build in CI.
  out = out.replace(
    /versionCode[ \t]*=[ \t]*[^\r\n]+/,
    `versionCode = tauriProperties.getProperty("tauri.android.versionCode", "${code}").toInt()`,
  );
  out = out.replace(
    /versionName[ \t]*=[ \t]*[^\r\n]+/,
    `versionName = tauriProperties.getProperty("tauri.android.versionName", "${versionName}")`,
  );
  return out;
}

/** Read the app version from tauri.conf.json. */
export function readAppVersion() {
  const conf = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  return conf.version ?? "0.0.0";
}

function main() {
  const proj = join(root, "src-tauri", "gen", "android");
  if (!existsSync(proj)) {
    console.error("(android-play) No generated Android project at src-tauri/gen/android — run `npm run android:init` first.");
    process.exitCode = 1;
    return;
  }
  const version = readAppVersion();

  // 1) Network security config resource.
  const resXml = join(proj, "app", "src", "main", "res", "xml");
  mkdirSync(resXml, { recursive: true });
  writeFileSync(join(resXml, "network_security_config.xml"), networkSecurityConfigXml());

  // 2) Manifest → reference the config, drop the blanket flag.
  const manifestPath = join(proj, "app", "src", "main", "AndroidManifest.xml");
  if (existsSync(manifestPath)) {
    writeFileSync(manifestPath, patchManifest(readFileSync(manifestPath, "utf8")));
  }

  // 3) Gradle → deterministic versionCode for the release build.
  const gradlePath = join(proj, "app", "build.gradle.kts");
  if (existsSync(gradlePath)) {
    writeFileSync(gradlePath, patchGradle(readFileSync(gradlePath, "utf8"), version));
  }

  console.log(`(android-play) Patched Android project for Play Store — version ${version} (versionCode ${versionCodeFor(version)}).`);
  console.log("(android-play) Cleartext allowed only to loopback/LAN; internet stays HTTPS-only.");
}

// Only run when invoked directly (not when imported by tests) — resolve argv[1]
// to a file URL so it compares correctly on every platform.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();

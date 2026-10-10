import { describe, expect, it } from "vitest";
import {
  versionCodeFor,
  networkSecurityConfigXml,
  patchManifest,
  patchGradle,
  MAX_VERSION_CODE,
} from "../scripts/android-play.mjs";

describe("Play Store versionCode derivation", () => {
  it("encodes semver as major·1e6 + minor·1e3 + patch", () => {
    expect(versionCodeFor("0.12.0")).toBe(12_000);
    expect(versionCodeFor("1.0.0")).toBe(1_000_000);
    expect(versionCodeFor("2.3.4")).toBe(2_003_004);
  });

  it("is strictly increasing across our release history", () => {
    const releases = ["0.11.1", "0.11.2", "0.12.0", "0.12.1", "1.0.0"];
    const codes = releases.map(versionCodeFor);
    for (let i = 1; i < codes.length; i++) {
      expect(codes[i]).toBeGreaterThan(codes[i - 1]);
    }
  });

  it("clamps junk into a safe range", () => {
    expect(versionCodeFor("9999.0.0")).toBe(MAX_VERSION_CODE);
    expect(versionCodeFor("garbage")).toBe(1);
    expect(versionCodeFor("")).toBe(1);
    expect(versionCodeFor(undefined)).toBe(1);
  });
});

describe("network security config", () => {
  it("permits cleartext only to loopback and LAN ranges", () => {
    const xml = networkSecurityConfigXml();
    expect(xml).toContain('cleartextTrafficPermitted="false"'); // default deny
    expect(xml).toContain("<domain includeSubdomains=\"false\">192.168.1.0</domain>");
    expect(xml).toContain("<domain includeSubdomains=\"false\">10.0.2.2</domain>"); // emulator → host
    expect(xml).not.toContain("google.com");
  });
});

describe("manifest patching", () => {
  const template = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:icon="@mipmap/ic_launcher"
        android:usesCleartextTraffic="\${usesCleartextTraffic}">
        <activity android:name=".MainActivity" />
    </application>
</manifest>`;

  it("attaches the config and drops the blanket cleartext flag", () => {
    const out = patchManifest(template);
    expect(out).toContain('android:networkSecurityConfig="@xml/network_security_config"');
    expect(out).not.toContain("usesCleartextTraffic");
    expect(out).toContain(".MainActivity"); // untouched content
  });

  it("is idempotent", () => {
    const once = patchManifest(template);
    expect(patchManifest(once)).toBe(once);
  });
});

describe("gradle patching", () => {
  const kts = `    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "ai.talia.desktop"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }`;

  it("keeps the tauri.properties-driven lines working and sane", () => {
    const out = patchGradle(kts, "0.12.0");
    expect(out).toContain('tauri.android.versionCode", "12000"');
    expect(out).toContain('tauri.android.versionName", "0.12.0"');
    expect(out).toContain("minSdk = 24"); // untouched
  });
});

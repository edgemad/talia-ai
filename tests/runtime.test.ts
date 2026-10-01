import { describe, expect, it } from "vitest";
import {
  targetFor,
  assetFor,
  isNewer,
  parseVersion,
  GGUF_MODELS,
  modelUrl,
  recommendedBrain,
  deviceLabel,
  quickstartPlan,
} from "../server/runtime.mjs";
import { pickAppAsset } from "../server/updates.mjs";

type Asset = { name: string; browser_download_url?: string };

describe("runtime platform mapping", () => {
  it("maps every shipped desktop platform and rejects unknown ones", () => {
    expect(targetFor("darwin", "arm64")).toMatchObject({ asset: "macos-arm64", accelerator: expect.stringContaining("Metal") });
    expect(targetFor("darwin", "x64")?.asset).toBe("macos-x64");
    expect(targetFor("linux", "x64")?.asset).toBe("ubuntu-x64");
    expect(targetFor("linux", "arm64")?.asset).toBe("ubuntu-arm64");
    expect(targetFor("win32", "x64")?.asset).toBe("win-avx2-x64");
    expect(targetFor("freebsd", "x64")).toBeNull();
    expect(targetFor("win32", "arm64")).toBeNull();
  });
});

describe("release asset selection", () => {
  const assets: Asset[] = [
    { name: "llama-b6720-bin-macos-arm64.zip", browser_download_url: "https://example/z1" },
    { name: "llama-b6720-bin-macos-x64.zip" },
    { name: "llama-b6720-bin-ubuntu-x64.tar.gz" },
    { name: "llama-b6720-bin-ubuntu-arm64.tar.gz" },
    { name: "llama-b6720-bin-win-avx2-x64.zip" },
    { name: "llama-b6720.tar.gz" }, // source, must never match
  ];

  it("picks the zip build for the target, preferring zip over tar.gz", () => {
    expect(assetFor(assets, targetFor("darwin", "arm64")!)?.name).toBe("llama-b6720-bin-macos-arm64.zip");
    expect(assetFor(assets, targetFor("win32", "x64")!)?.name).toBe("llama-b6720-bin-win-avx2-x64.zip");
    expect(assetFor(assets, targetFor("linux", "x64")!)?.name).toBe("llama-b6720-bin-ubuntu-x64.tar.gz");
  });

  it("never picks the source archive or an unrelated target", () => {
    expect(assetFor(assets, { asset: "win-arm64" } as never)).toBeNull();
    expect(assetFor([], targetFor("darwin", "arm64")!)).toBeNull();
  });
});

describe("version comparison", () => {
  it("orders llama.cpp build tags numerically", () => {
    expect(isNewer("b6720", "b800")).toBe(true); // 6720 > 800
    expect(isNewer("b800", "b6720")).toBe(false);
    expect(isNewer("b6720", "b6720")).toBe(false);
    expect(isNewer("b10000", "b9999")).toBe(true);
  });

  it("handles app semver and junk gracefully", () => {
    expect(isNewer("0.4.0", "0.3.1")).toBe(true);
    expect(isNewer("0.3.1", "0.4.0")).toBe(false);
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("garbage", "0.3.1")).toBe(false);
    expect(isNewer("0.4.0", "")).toBe(false);
    expect(parseVersion("b6720")).toEqual([6720, 0, 0]);
  });
});

describe("app update asset picker", () => {
  const assets: Asset[] = [
    { name: "Talia.AI_0.4.0_aarch64.dmg", browser_download_url: "https://example/mac" },
    { name: "Talia.AI_0.4.0_x64.dmg" },
    { name: "Talia.AI_0.4.0_x64-setup.exe" },
    { name: "Talia.AI_0.4.0_amd64.AppImage" },
    { name: "Talia.AI_0.4.0_aarch64.apk" },
  ];

  it("chooses the right installer per platform", () => {
    expect(pickAppAsset(assets, "darwin", "arm64")?.name).toBe("Talia.AI_0.4.0_aarch64.dmg");
    expect(pickAppAsset(assets, "darwin", "x64")?.name).toBe("Talia.AI_0.4.0_x64.dmg");
    expect(pickAppAsset(assets, "win32", "x64")?.name).toBe("Talia.AI_0.4.0_x64-setup.exe");
    expect(pickAppAsset(assets, "linux", "x64")?.name).toBe("Talia.AI_0.4.0_amd64.AppImage");
    expect(pickAppAsset(assets, "android", "arm64")?.name).toBe("Talia.AI_0.4.0_aarch64.apk");
    expect(pickAppAsset([], "darwin", "arm64")).toBeNull();
  });
});

describe("hardware-aware brain picker (ODS-style tiering)", () => {
  it("recommends brighter brains on bigger machines", () => {
    expect(recommendedBrain(16)).toBe("qwen2.5-3b");
    expect(recommendedBrain(8)).toBe("qwen2.5-3b"); // 8 GB is exactly the 3B comfort zone
    expect(recommendedBrain(6)).toBe("qwen2.5-1.5b");
    expect(recommendedBrain(2)).toBe("qwen2.5-0.5b");
    expect(recommendedBrain(1)).toBe("qwen2.5-0.5b"); // never returns nothing
  });

  it("always picks something the RAM constraint allows", () => {
    for (let ram = 1; ram <= 64; ram++) {
      const pick = recommendedBrain(ram);
      expect(GGUF_MODELS.some((m) => m.id === pick)).toBe(true);
    }
  });

  it("describes the device in friendly words", () => {
    expect(deviceLabel("darwin", "arm64", 16)).toContain("Apple Silicon");
    expect(deviceLabel("win32", "x64", 32)).toMatch(/Windows PC · x64 · 32 GB/);
    expect(deviceLabel("linux", "x64", 8)).toMatch(/Linux box/);
  });
});

describe("quickstart planning", () => {
  const base = { installed: true, running: true, models: [{ downloaded: true }] };
  it("needs nothing when everything is ready", () => {
    expect(quickstartPlan(base).steps).toEqual([]);
  });
  it("orders engine, model, start", () => {
    expect(quickstartPlan({ installed: false, running: false, models: [] }).steps).toEqual(["engine", "model", "start"]);
    expect(quickstartPlan({ ...base, running: false }).steps).toEqual(["start"]);
    expect(quickstartPlan({ ...base, models: [{ downloaded: false }] }).steps).toEqual(["model"]);
  });
});

describe("gguf model catalog", () => {
  it("points at real HF repos with matching file names", () => {
    expect(GGUF_MODELS.length).toBeGreaterThanOrEqual(3);
    for (const m of GGUF_MODELS) {
      expect(m.repo).toMatch(/^[^/]+\/[^/]+$/);
      expect(m.file.toLowerCase()).toMatch(/\.gguf$/);
      expect(modelUrl(m)).toContain(`https://huggingface.co/${m.repo}/resolve/main/${m.file}`);
      expect(m.sizeBytes).toBeGreaterThan(100_000_000);
    }
    expect(GGUF_MODELS.some((m) => m.recommended)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { sdTargetFor, sdAssetFor, SD_MODELS, sdModelUrl, recommendedSdModel } from "../server/sd.mjs";

type Asset = { name: string; browser_download_url?: string };

describe("sd platform mapping", () => {
  it("maps every platform upstream ships builds for", () => {
    expect(sdTargetFor("darwin", "arm64")).toMatchObject({ asset: "Darwin-macOS", accelerator: expect.stringContaining("Metal") });
    expect(sdTargetFor("linux", "x64")).toMatchObject({ asset: "Linux-Ubuntu-24.04-x86_64" });
    expect(sdTargetFor("win32", "x64")).toMatchObject({ asset: "win-cpu-x64" });
    expect(sdTargetFor("freebsd", "x64")).toBeNull();
  });

  it("marks platforms without upstream builds as unsupported", () => {
    expect(sdTargetFor("darwin", "x64")?.asset).toBeNull();
    expect(sdTargetFor("linux", "arm64")?.asset).toBeNull();
    expect(sdTargetFor("win32", "arm64")).toBeNull();
  });
});

describe("sd release asset selection", () => {
  const assets: Asset[] = [
    { name: "cudart-sd-bin-win-cu12-x64.zip" }, // never: cudart runtime
    { name: "sd-master-929-3f8527a-bin-Darwin-macOS-26.6.2-arm64.zip" },
    { name: "sd-master-929-3f8527a-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip" },
    { name: "sd-master-929-3f8527a-bin-Linux-Ubuntu-24.04-x86_64-rocm-7.14.0.zip" },
    { name: "sd-master-929-3f8527a-bin-Linux-Ubuntu-24.04-x86_64.zip" },
    { name: "sd-master-929-3f8527a-bin-win-cpu-x64.zip" },
    { name: "sd-master-929-3f8527a-bin-win-cuda12-x64.zip" },
    { name: "stable-diffusion.cpp-source.tar.gz" }, // never: source archive
  ];

  it("picks the plain cpu/metal build, never vulkan/cuda/rocm or source", () => {
    expect(sdAssetFor(assets, sdTargetFor("darwin", "arm64")!)?.name).toBe("sd-master-929-3f8527a-bin-Darwin-macOS-26.6.2-arm64.zip");
    expect(sdAssetFor(assets, sdTargetFor("win32", "x64")!)?.name).toBe("sd-master-929-3f8527a-bin-win-cpu-x64.zip");
    expect(sdAssetFor(assets, sdTargetFor("linux", "x64")!)?.name).toBe("sd-master-929-3f8527a-bin-Linux-Ubuntu-24.04-x86_64.zip");
  });

  it("falls back to vulkan only when nothing plainer exists", () => {
    const vulkanOnly: Asset[] = [{ name: "sd-master-929-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip" }];
    expect(sdAssetFor(vulkanOnly, sdTargetFor("linux", "x64")!)?.name).toContain("vulkan");
    expect(sdAssetFor([], sdTargetFor("linux", "x64")!)).toBeNull();
  });
});

describe("image model catalog", () => {
  it("points at real HF repos with GGUF files and sane sizes", () => {
    expect(SD_MODELS.length).toBeGreaterThanOrEqual(2);
    for (const m of SD_MODELS) {
      expect(m.repo).toMatch(/^[^/]+\/[^/]+$/);
      expect(m.file.toLowerCase()).toMatch(/\.gguf$/);
      expect(sdModelUrl(m)).toBe(`https://huggingface.co/${m.repo}/resolve/main/${m.file}?download=true`);
      expect(m.sizeBytes).toBeGreaterThan(1_000_000_000);
      expect(m.steps.fallback).toBeGreaterThanOrEqual(m.steps.min);
      expect(m.cfg.fallback).toBeGreaterThanOrEqual(m.cfg.min);
    }
    expect(SD_MODELS.some((m) => m.recommended)).toBe(true);
  });

  it("recommends the fast turbo brain on big machines and the compact classic on small ones", () => {
    expect(recommendedSdModel(16)).toBe("sd-turbo");
    expect(recommendedSdModel(8)).toBe("sd-turbo");
    expect(recommendedSdModel(4)).toBe("sd15-q4");
    expect(recommendedSdModel(2)).toBe("sd15-q4");
  });
});

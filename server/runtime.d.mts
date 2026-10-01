export interface RuntimeTarget {
  asset: string;
  label: string;
  accelerator: string;
}

export interface RuntimeAsset {
  name: string;
  browser_download_url?: string;
}

export interface GGUFModel {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  blurb: string;
  repo: string;
  file: string;
  recommended: boolean;
}

export declare const RUNTIME_PORT: number;
export declare const RUNTIME_BASE_URL: string;
export declare const GGUF_MODELS: GGUFModel[];
export declare function targetFor(platform: string, arch: string): RuntimeTarget | null;
export declare function assetFor(assets: RuntimeAsset[], target: RuntimeTarget): RuntimeAsset | null;
export declare function parseVersion(v: string): [number, number, number] | null;
export declare function isNewer(candidate: string, current: string): boolean;
export declare function modelUrl(m: GGUFModel): string;
export declare function modelPath(id: string): string | null;
export declare function latestRuntimeRelease(): Promise<{ tag: string; assets: RuntimeAsset[] }>;
export declare function installRuntime(opts?: {
  force?: boolean;
  onProgress?: (p: Record<string, unknown>) => void;
}): Promise<{ ok: boolean; version?: string; alreadyCurrent?: boolean; error?: string }>;
export declare function downloadModel(id: string, onProgress?: (p: Record<string, unknown>) => void): Promise<{ ok: boolean; alreadyDownloaded?: boolean; error?: string }>;
export declare function deleteModel(id: string): boolean;
export declare function startRuntime(opts?: { modelId?: string }): Promise<{ ok: boolean; alreadyRunning?: boolean; baseUrl?: string; model?: string; error?: string }>;
export declare function stopRuntime(): { ok: boolean };
export declare function runtimeStatus(): Promise<{
  platform: string;
  arch: string;
  supported: boolean;
  targetLabel: string;
  accelerator: string | null;
  installed: boolean;
  version: string | null;
  running: boolean;
  baseUrl: string;
  port: number;
  selectedModel: string | null;
  autoStart: boolean;
  models: (GGUFModel & { downloaded: boolean; bytes: number })[];
  lastExit: { code: number | null; signal: string | null; at: number } | null;
  recentLogs: string[];
}>;
export declare function ensureAutoStart(): Promise<void>;

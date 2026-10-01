export interface SdTarget {
  asset: string | null;
  label: string;
  accelerator: string | null;
}

export interface SdAsset {
  name: string;
  browser_download_url?: string;
}

export interface SdModel {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  blurb: string;
  repo: string;
  file: string;
  recommended: boolean;
  steps: { min: number; max: number; fallback: number };
  cfg: { min: number; max: number; fallback: number };
}

export declare const SD_MODELS: SdModel[];
export declare function sdTargetFor(platform: string, arch: string): SdTarget | null;
export declare function sdAssetFor(assets: SdAsset[], target: SdTarget): SdAsset | null;
export declare function sdModelUrl(m: SdModel): string;
export declare function recommendedSdModel(ramGB: number): string;
export declare function latestSdRelease(): Promise<{ tag: string; assets: SdAsset[] }>;
export declare function installSdRuntime(opts?: {
  force?: boolean;
  onProgress?: (p: Record<string, unknown>) => void;
}): Promise<{ ok: boolean; version?: string; alreadyCurrent?: boolean; error?: string }>;
export declare function sdModelPath(id: string): string | null;
export declare function downloadSdModel(id: string, onProgress?: (p: Record<string, unknown>) => void): Promise<{ ok: boolean; alreadyDownloaded?: boolean; error?: string }>;
export declare function deleteSdModel(id: string): boolean;
export declare function uninstallSdRuntime(): Promise<{ ok: boolean; hadEngine: boolean; hadModels?: boolean; error?: string }>;
export declare function sdStatus(): Promise<{
  platform: string;
  arch: string;
  supported: boolean;
  targetLabel: string;
  accelerator: string | null;
  installed: boolean;
  version: string | null;
  selectedModel: string;
  models: (SdModel & { downloaded: boolean; bytes: number })[];
  busy: boolean;
  recommendedModel: string;
}>;
export declare function generateLocalImage(
  req: {
    prompt: string;
    negative?: string;
    steps?: number;
    cfg?: number;
    width?: number;
    height?: number;
    seed?: number;
    modelId?: string;
  },
  onProgress?: (p: Record<string, unknown>) => void,
): Promise<{
  ok: boolean;
  kind?: "image";
  mime?: string;
  dataUrl?: string;
  backend?: string;
  error?: string;
  needsModel?: string;
}>;

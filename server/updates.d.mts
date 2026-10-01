import type { RuntimeAsset } from "./runtime.mjs";

export interface AppUpdate {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  url: string;
  asset: RuntimeAsset | null;
  assetUrl: string | null;
  notes: string | null;
  error: string | null;
}

export interface RuntimeUpdate {
  current: string | null;
  latest: string | null;
  updateAvailable: boolean;
  error: string | null;
}

export interface UpdatesPayload {
  app: AppUpdate;
  runtime: RuntimeUpdate;
  checkedAt: string;
}

export declare function pickAppAsset(
  assets: RuntimeAsset[],
  platform?: string,
  arch?: string,
): RuntimeAsset | null;
export declare function checkUpdates(opts?: { force?: boolean }): Promise<UpdatesPayload>;

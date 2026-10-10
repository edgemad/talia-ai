// Type declarations for the Play Store patch script (android-play.mjs).
export const MAX_VERSION_CODE: number;
export function versionCodeFor(version: string | undefined | null): number;
export function networkSecurityConfigXml(): string;
export function patchManifest(xml: string): string;
export function patchGradle(kts: string, version: string): string;
export function readAppVersion(): string;

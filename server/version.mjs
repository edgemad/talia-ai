// Bumped together with package.json (see scripts note in updates.mjs).
// The SEA sidecar can't read package.json at runtime, so the version is a
// literal that gets embedded into the binary at build time.
export const APP_VERSION = "0.4.5";

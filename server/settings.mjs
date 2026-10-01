// ✈️ Offline Mode — Talia's airplane switch.
//
// One stored setting (plus a TALIA_OFFLINE=1 env override for kiosks and
// paranoiacs) that keeps the server from touching the internet. Everything
// on this machine keeps working: the built-in chat engine, the image engine,
// memory, games, and any AI server on localhost. What gets a polite refusal:
// update checks, research, cloud providers, and engine/model downloads.
//
// The single source of truth for "may I reach this URL?" is isLocalUrl:
// offline mode allows loopback and dotless/.local LAN names, nothing else.

import { readCollection, writeCollection } from "./store.mjs";

const SETTINGS_KEY = "app-settings";

const envLocked = () => process.env.TALIA_OFFLINE === "1";

/**
 * Is this URL on this machine (or the local network by name)? Internet hosts
 * always carry a dot in the hostname, so dotless names ("mymac:7860") and
 * .local mDNS names are treated as local too.
 */
export function isLocalUrl(url) {
  try {
    const h = new URL(String(url)).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || !h.includes(".") || h.endsWith(".local");
  } catch {
    return false;
  }
}

export async function getSettings() {
  const s = (await readCollection(SETTINGS_KEY, {})) ?? {};
  return { offline: !!s.offline || envLocked(), offlineLocked: envLocked() };
}

export async function isOffline() {
  return (await getSettings()).offline;
}

export async function setOffline(on) {
  if (envLocked()) return getSettings();
  const s = (await readCollection(SETTINGS_KEY, {})) ?? {};
  writeCollection(SETTINGS_KEY, { ...s, offline: !!on });
  return getSettings();
}

/** Friendly refusal for a feature the network would be needed for. */
export function offlineError(what) {
  return `Offline Mode is on — ${what} needs the internet. Turn it off in Settings → Network.`;
}

// Tiny durable JSON store. One file per collection, debounced atomic writes.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const dataDir = process.env.TALIA_DATA_DIR || join(homedir(), ".talia-ai");

const pending = new Map();

async function pathFor(collection) {
  const p = join(dataDir, `${collection}.json`);
  await mkdir(dirname(p), { recursive: true });
  return p;
}

export async function readCollection(collection, fallback) {
  try {
    const raw = await readFile(await pathFor(collection), "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Debounced atomic write (write temp file, then rename). */
export function writeCollection(collection, data) {
  pending.set(collection, data);
  if (pending.size === 1) {
    setTimeout(flush, 250).unref?.();
  }
}

async function flush() {
  const entries = [...pending.entries()];
  pending.clear();
  await Promise.all(
    entries.map(async ([collection, data]) => {
      try {
        const p = await pathFor(collection);
        const tmp = `${p}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(data));
        await rename(tmp, p);
      } catch (err) {
        console.error(`[talia] failed to save ${collection}:`, err.message);
      }
    }),
  );
}

/** Immediate flush (used on shutdown). */
export async function flushNow() {
  clearTimeout(flush._t);
  await flush();
}

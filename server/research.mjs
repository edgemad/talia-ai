// Perplexity-style local research pipeline:
// web search (SearXNG if present, DuckDuckGo HTML fallback) → fetch top pages
// → extract readable text → extractive answer with numbered citations.
//
// The LLM still writes the final prose (the client sends researchContext as a
// system message); this module gets the facts + sources together quickly.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

// ---------- HTML helpers -------------------------------------------------
export function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitle(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).slice(0, 160) : "";
}

/** Keep the texty middle of a page: drop nav/scripts, split into sentences. */
export function readableChunks(html, maxChars = 6000) {
  const text = stripHtml(html);
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).length > maxChars) {
      if (buf) chunks.push(buf.trim());
      buf = s;
      if (chunks.length >= 8) break;
    } else {
      buf += " " + s;
    }
  }
  if (buf && chunks.length < 8) chunks.push(buf.trim());
  return chunks.filter((c) => c.length > 120);
}

// ---------- Web search ---------------------------------------------------
async function fetchWithTimeout(url, ms = 8000, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...extraHeaders },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function searchSearxng(query, count) {
  const base = process.env.TALIA_SEARXNG;
  if (!base) return null;
  const url = `${base.replace(/\/+$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
  const r = await fetchWithTimeout(url, 8000);
  if (!r.ok) return null;
  const body = await r.json();
  return (body?.results || []).slice(0, count).map((x) => ({
    title: x.title || x.url,
    url: x.url,
    snippet: stripHtml(x.content || ""),
  }));
}

export async function searchDuckDuckGo(query, count = 8) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const r = await fetchWithTimeout(url, 9000);
  if (!r.ok) throw new Error(`search failed (${r.status})`);
  const html = await r.text();
  const results = [];
  const re =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,400}?class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && results.length < count) {
    let href = m[1];
    // DDG wraps URLs: //duckduckgo.com/l/?uddg=<encoded>
    const uddg = href.match(/uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (href.startsWith("//")) href = `https:${href}`;
    results.push({
      title: stripHtml(m[2]),
      url: href,
      snippet: stripHtml(m[3]),
    });
  }
  return results;
}

export async function webSearch(query, count = 8) {
  try {
    const viaSearx = await searchSearxng(query, count);
    if (viaSearx && viaSearx.length > 0) return { results: viaSearx, engine: "searxng" };
  } catch {
    /* fall through to DDG */
  }
  const results = await searchDuckDuckGo(query, count);
  return { results, engine: "duckduckgo" };
}

// ---------- Page reading -------------------------------------------------
export async function readPage(url, maxChars = 6000) {
  const r = await fetchWithTimeout(url, 9000);
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("html") && !ct.includes("text")) throw new Error(`unsupported type ${ct}`);
  const html = await r.text();
  return {
    title: extractTitle(html),
    text: readableChunks(html, maxChars).join(" "),
  };
}

// ---------- Full pipeline ------------------------------------------------
/**
 * @returns {{engine, sources: [{n,title,url,snippet,text?}], digest, context}}
 */
export async function research(query, { maxSources = 5, onProgress } = {}) {
  const { results, engine } = await webSearch(query, maxSources * 2);
  if (results.length === 0) {
    return { engine, sources: [], digest: "", context: "" };
  }

  const sources = [];
  for (const r of results) {
    if (sources.length >= maxSources) break;
    onProgress?.(`Reading ${r.title || r.url}…`);
    try {
      const page = await readPage(r.url);
      if (page.text.length > 200) {
        sources.push({ n: sources.length + 1, title: page.title || r.title, url: r.url, snippet: r.snippet, text: page.text });
      }
    } catch {
      // skip unreadable pages
    }
  }

  // Snippet-only fallback if every fetch failed
  if (sources.length === 0) {
    results.slice(0, maxSources).forEach((r, i) => {
      sources.push({ n: i + 1, title: r.title, url: r.url, snippet: r.snippet });
    });
  }

  const digest = sources
    .map((s) => `[${s.n}] ${s.title || s.url}\n${(s.text || s.snippet || "").slice(0, 700)}`)
    .join("\n\n");

  const context =
    `You are helping with live web research. Use ONLY the sources below where possible, ` +
    `and cite them inline like [1], [2]. Today is ${new Date().toDateString()}.\n\nSOURCES:\n${digest}`;

  return { engine, sources: sources.map(({ text, ...s }) => s), digest, context };
}

/** Cheap extractive summary when the LLM is offline: top sentences by query-term hits. */
export function extractiveAnswer(query, sources) {
  const q = new Set(
    query.toLowerCase().split(/\W+/).filter((w) => w.length > 2),
  );
  const picked = [];
  for (const s of sources) {
    const text = s.text || s.snippet || "";
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const words = sentence.toLowerCase().split(/\W+/);
      const hits = words.filter((w) => q.has(w)).length;
      if (hits >= 2) picked.push({ sentence: sentence.trim(), hits, n: s.n });
    }
  }
  picked.sort((a, b) => b.hits - a.hits);
  const seen = new Set();
  const lines = [];
  for (const p of picked) {
    const key = p.sentence.slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${p.sentence} [${p.n}]`);
    if (lines.length >= 6) break;
  }
  return lines.join(" ");
}

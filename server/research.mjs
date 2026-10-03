// Perplexity-style local research pipeline:
// web search (SearXNG if present, DuckDuckGo HTML fallback) → fetch top pages
// → extract readable text → extractive answer with numbered citations.
//
// The LLM still writes the final prose (the client sends researchContext as a
// system message); this module gets the facts + sources together quickly.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/** Decode numeric character references (&#39; / &#x27;) safely. */
const decodeNumericEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const n = parseInt(h, 16);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    })
    .replace(/&#(\d+);/g, (_, d) => {
      const n = parseInt(d, 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    });

// ---------- HTML helpers -------------------------------------------------
export function stripHtml(html) {
  let s = String(html || "");
  // Comments first — some sites carry developer notes in them, and they read
  // like broken instructions to the model ("MUST stay a plain script…").
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // Decode entities BEFORE stripping tags, so escaped markup (&lt;script&gt;)
  // can't resurrect as literal tags after tag-stripping. (&amp; last.)
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  s = decodeNumericEntities(s);
  s = s
    .replace(/<(script|style|svg|noscript|template|iframe|object|embed)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/<[^>]+>/g, " "); // second pass: residue from malformed markup
  return s.replace(/\s+/g, " ").trim();
}

export function extractTitle(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).slice(0, 160) : "";
}

/** Texty main content: drop boilerplate containers, split into blocks,
 *  keep the meaty ones. Returns a single query-agnostic cleaned text. */
export function readableChunks(html, maxChars = 20000) {
  let s = String(html || "");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // Non-content containers: code, widgets, menus.
  s = s.replace(
    /<(script|style|svg|noscript|template|iframe|object|embed|form|select|button)[\s\S]*?<\/\1>/gi,
    " ",
  );
  // Page furniture: header/nav/footer/aside wrappers.
  s = s.replace(/<(header|nav|footer|aside)[\s\S]*?<\/\1>/gi, " ");
  // Decode entities before stripping tags (same rationale as stripHtml).
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  s = decodeNumericEntities(s);
  const blocks = s
    .split(/<\/(?:p|div|li|ul|ol|h[1-6]|tr|td|th|section|article|table|blockquote|dl|dd|dt|figcaption)>/i)
    .map((b) =>
      b
        .replace(/<[^>]+>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  const junky =
    /^(skip to|menu|search|sign in|log in|cart|shop all|view all|see all|close|cookie|subscribe|newsletter|back to top|follow us|share this|my account)/i;
  const meaty = blocks.filter((b) => {
    if (b.length < 40) return false;
    if (junky.test(b)) return false;
    // Menu soup repeats the same words over and over — unique-word ratio
    // separates nav lists from real prose.
    const words = b.split(" ");
    const unique = new Set(words.map((w) => w.toLowerCase()));
    return unique.size / words.length > 0.35;
  });

  const text = (meaty.length > 0 ? meaty : blocks).join("\n");
  if (text.length <= maxChars) return [text];
  const cut = text.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return [lastStop > 200 ? cut.slice(0, lastStop + 1) : cut];
}

/** Best ~maxChars window of `text` for the query: the densest query-term
 *  region, snapped to a sentence start — so the digest shows the part of the
 *  page that answers the question, not whatever happens to be at the top. */
export function queryFocusedExcerpt(text, query, maxChars = 1400) {
  const t = String(text || "");
  if (t.length <= maxChars) return t;
  const terms = [
    ...new Set(
      String(query || "")
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2),
    ),
  ];
  if (terms.length === 0) return t.slice(0, maxChars);
  const lower = t.toLowerCase();
  const step = Math.max(160, Math.floor(maxChars / 4));
  let bestPos = 0;
  let bestHits = -1;
  for (let pos = 0; pos < t.length; pos += step) {
    const win = lower.slice(pos, pos + maxChars);
    let hits = 0;
    for (const term of terms) {
      let idx = win.indexOf(term);
      while (idx !== -1) {
        hits += 1;
        idx = win.indexOf(term, idx + term.length);
      }
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestPos = pos;
    }
  }
  let start = bestPos;
  const prevStop = lower.lastIndexOf(". ", start);
  if (prevStop > 0 && start - prevStop < 200) start = prevStop + 2;
  const end = Math.min(t.length, start + maxChars);
  return `${start > 0 ? "… " : ""}${t.slice(start, end)}${end < t.length ? " …" : ""}`;
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
export async function readPage(url, maxChars = 20000) {
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
    .map((s) => {
      let body = "";
      if (s.snippet) body += `${s.snippet}\n`;
      if (s.text) body += queryFocusedExcerpt(s.text, query, 1400);
      return `[${s.n}] ${s.title || s.url}\n${s.url}\n${body.trim() || "(no readable text)"}`;
    })
    .join("\n\n");

  const context =
    `You are answering with live web research (Perplexity-style). The sources below are ` +
    `already fetched and cleaned — their text IS the page content, not raw HTML.\n` +
    `Rules:\n` +
    `• Answer the question directly in your first sentence, then add the details.\n` +
    `• Ground every factual claim in the sources and cite inline like [1], [2].\n` +
    `• Quote exact dates, discounts and conditions where the sources give them, and note validity windows.\n` +
    `• NEVER describe browsing, loading pages, scripts, tags or page structure — you are not operating a browser.\n` +
    `• NEVER ask permission or offer to "go look something up" — the research is already done.\n` +
    `• If the sources don't answer the question, say that plainly and give the closest facts found.\n` +
    `Today is ${new Date().toDateString()}.\n\nSOURCES:\n${digest}`;

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

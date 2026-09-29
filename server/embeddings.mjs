// Dependency-free text embeddings + lexical search.
//
// We hash character n-grams into a fixed-size bag-of-signatures vector (the
// "hashing trick"). Two texts about the same topic share many n-grams, so
// cosine similarity works — no Python, no ONNX, no 400 MB model download.
// A keyword-overlap score is blended in for exact matches. Good enough for
// personal-memory recall; swap in a real embedder later if you want.

const DIM = 512;
const N = 3; // n-gram size

const STOP = new Set(
  ("a,an,and,are,as,at,be,but,by,for,from,has,have,he,i,in,is,it,its,of,on,or,she,that,the,to,was,were,will,with,you,your,me,my,we,us,this,these,those,do,does,did,so,if,not,no").split(","),
);

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function* ngrams(text, n) {
  let buf = ` ${text} `;
  for (let i = 0; i + n <= buf.length; i++) yield buf.slice(i, i + n);
}

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function tokenize(text) {
  return normalize(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Sparse-ish dense vector: hashed char-trigram bag with L2 norm. */
export function embed(text) {
  const t = normalize(text);
  const vec = new Float32Array(DIM);
  for (const g of ngrams(t, N)) {
    const h = hash32(g);
    const i = h % DIM;
    const sign = (h >>> 31) & 1 ? -1 : 1;
    vec[i] += sign;
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) vec[i] /= norm;
  return Array.from(vec);
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
  return dot;
}

/** Jaccard-style keyword overlap in [0,1]. */
export function keywordScore(queryTokens, docTokens) {
  const q = new Set(queryTokens);
  const d = new Set(docTokens);
  if (q.size === 0 || d.size === 0) return 0;
  let inter = 0;
  for (const w of q) if (d.has(w)) inter++;
  return inter / (q.size + d.size - inter);
}

/** Blend semantic + lexical for the final rank. */
export function relevance(queryText, queryVec, doc) {
  const docTokens = tokenize(doc);
  const sem = cosine(queryVec, embed(doc));
  const lex = keywordScore(tokenize(queryText), docTokens);
  return 0.6 * sem + 0.9 * lex;
}

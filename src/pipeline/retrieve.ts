import type { Chunk } from "./chunk";

const STOPWORDS = new Set(
  "a an and are as at be by can for from how in into is it its of on or that the their them they this to was were what when which why with how does do describe explain predict compare relate use trace".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []).filter(
    (w) => w.length > 2 && !STOPWORDS.has(w),
  );
}

// Light stemming so "enzymes"/"enzyme" and "regulated"/"regulate" match.
function stem(word: string): string {
  return word.replace(/(ies|es|s|ed|ing)$/, "");
}

// Picks a unit's context pack: BM25 ranking of chunks against the unit title
// and objectives, taken in rank order until the token budget is used.
// Embedding search (pgvector) replaces this once an embedding model is chosen.
export function buildContextPack(
  unit: { title: string; objectives: string[] },
  chunks: Chunk[],
  budgetTokens = 12_000,
): Chunk[] {
  const query = [...new Set(tokenize([unit.title, ...unit.objectives].join(" ")).map(stem))];
  const docs = chunks.map((c) => tokenize(c.text).map(stem));
  const avgLen = docs.reduce((n, d) => n + d.length, 0) / Math.max(docs.length, 1);
  const docFreq = new Map<string, number>();
  for (const doc of docs) for (const term of new Set(doc)) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);

  const k1 = 1.2;
  const b = 0.75;
  const scored = chunks.map((chunk, i) => {
    const doc = docs[i];
    const tf = new Map<string, number>();
    for (const term of doc) tf.set(term, (tf.get(term) ?? 0) + 1);
    let score = 0;
    for (const term of query) {
      const f = tf.get(term) ?? 0;
      if (f === 0) continue;
      const n = docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (chunks.length - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.length) / avgLen)));
    }
    return { chunk, score };
  });

  const pack: Chunk[] = [];
  let used = 0;
  for (const { chunk, score } of scored.sort((x, y) => y.score - x.score)) {
    if (score <= 0) break;
    if (used + chunk.tokenCount > budgetTokens) continue;
    pack.push(chunk);
    used += chunk.tokenCount;
  }
  return pack;
}

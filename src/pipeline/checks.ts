import type { Citation } from "@/lib/ai/schemas";
import type { Chunk } from "./chunk";

export type FlagKind = "answer_mismatch" | "not_in_sources" | "source_overlap" | "schema_retry_failed" | "safety";

export interface Flag {
  kind: FlagKind;
  detail: Record<string, unknown>;
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Finds a quote in text ignoring case and whitespace differences, and returns
// its span in the original text.
export function findQuote(text: string, quote: string): [number, number] | null {
  const needle = normalize(quote);
  if (!needle) return null;
  let flat = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const isSpace = /\s/.test(text[i]);
    if (isSpace && (flat.length === 0 || flat.endsWith(" "))) continue;
    flat += isSpace ? " " : text[i].toLowerCase();
    origin.push(i);
  }
  const at = flat.indexOf(needle);
  if (at < 0) return null;
  return [origin[at], origin[at + needle.length - 1] + 1];
}

export interface ResolvedCitation extends Citation {
  quoteStart: number;
  quoteEnd: number;
}

// Grounding: every citation must point at a chunk in the unit's pack and
// quote it exactly (ignoring case and whitespace). Returns the spans found and
// a flag for anything missing or gap-filled.
export function checkGrounding(
  part: { citations: Citation[]; gap_filled: boolean },
  pack: Map<string, Chunk>,
): { resolved: ResolvedCitation[]; flag: Flag | null } {
  const resolved: ResolvedCitation[] = [];
  const problems: string[] = [];

  for (const citation of part.citations) {
    const chunk = pack.get(citation.chunk_id);
    if (!chunk) {
      problems.push(`cites ${citation.chunk_id}, which is not in this unit's sources`);
      continue;
    }
    const span = findQuote(chunk.text, citation.quote);
    if (!span) {
      problems.push(`quote not found in ${citation.chunk_id}: "${citation.quote.slice(0, 80)}"`);
      continue;
    }
    resolved.push({ ...citation, quoteStart: span[0], quoteEnd: span[1] });
  }

  if (part.gap_filled) problems.push("marked gap-filled: not supported by the uploaded sources");
  else if (part.citations.length === 0) problems.push("no citations");

  return { resolved, flag: problems.length ? { kind: "not_in_sources", detail: { problems } } : null };
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g) ?? [];

// Longest run of consecutive words shared between the text and the source.
export function longestSharedRun(text: string, source: string): number {
  const a = words(text);
  const b = words(source);
  let best = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        row[j] = prev[j - 1] + 1;
        if (row[j] > best) best = row[j];
      }
    }
    prev = row;
  }
  return best;
}

// Spec starting rule: 12+ consecutive shared words with any source chunk.
export const OVERLAP_WORD_LIMIT = 12;

export function checkOverlap(text: string, chunks: Chunk[]): Flag | null {
  let worst = { run: 0, chunkId: "" };
  for (const chunk of chunks) {
    const run = longestSharedRun(text, chunk.text);
    if (run > worst.run) worst = { run, chunkId: chunk.id };
  }
  return worst.run >= OVERLAP_WORD_LIMIT
    ? { kind: "source_overlap", detail: { sharedWords: worst.run, chunkId: worst.chunkId } }
    : null;
}

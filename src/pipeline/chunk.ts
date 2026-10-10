import { createHash } from "node:crypto";
import type { ExtractedPage } from "./extract";

export interface Chunk {
  id: string;
  fileId: string;
  filename: string;
  page: number | null;
  text: string;
  tokenCount: number;
}

// Rough token estimate (about 4 characters per token for English prose).
// Good enough for budgeting context packs; exact counts come from API usage.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

// Split on markdown headings and blank lines, then pack paragraphs into
// chunks of at most maxTokens, never crossing a page or heading boundary.
export function chunkPages(
  pages: ExtractedPage[],
  file: { id: string; filename: string },
  maxTokens = 800,
): Chunk[] {
  const chunks: Chunk[] = [];

  for (const { page, text } of pages) {
    const sections = text.split(/\n(?=#{1,6}\s)/);
    for (const section of sections) {
      const paragraphs = section
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .flatMap((p) => splitOversized(p, maxTokens));
      let current: string[] = [];
      const flush = () => {
        if (current.length === 0) return;
        const body = current.join("\n\n");
        chunks.push({
          id: `c_${file.id.slice(0, 8)}_${chunks.length}`,
          fileId: file.id,
          filename: file.filename,
          page,
          text: body,
          tokenCount: estimateTokens(body),
        });
        current = [];
      };
      for (const paragraph of paragraphs) {
        const size = estimateTokens([...current, paragraph].join("\n\n"));
        if (size > maxTokens && current.length > 0) flush();
        current.push(paragraph);
      }
      flush();
    }
  }
  return chunks;
}

// PDF pages often arrive as one long paragraph; fall back to sentence breaks.
function splitOversized(paragraph: string, maxTokens: number): string[] {
  if (estimateTokens(paragraph) <= maxTokens) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [paragraph];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && estimateTokens(current + sentence) > maxTokens) {
      parts.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { chunkPages, sha256, type Chunk } from "./chunk";
import { extractText } from "./extract";

// Every sources folder needs a manifest.json: the rights attestation the spec
// requires before generating, plus a role and license for each file. Files
// not listed are not read.
export const manifestSchema = z.object({
  attestation: z.string().min(20),
  files: z
    .array(
      z.object({
        file: z.string(),
        role: z.enum(["syllabus", "slides", "textbook", "past_exam", "own_notes"]),
        license: z.string().min(2),
      }),
    )
    .min(1),
});
export type Manifest = z.infer<typeof manifestSchema>;

// College Board material may not be used with generative AI.
const BLOCKED = /college\s*board|course\s+and\s+exam\s+description|\bCED\b|released\s+(free[- ]response|FRQ)/i;

export function checkSourceAllowed(filename: string, license: string) {
  if (BLOCKED.test(filename) || BLOCKED.test(license)) {
    throw new Error(`${filename}: College Board material can't be used with generative AI.`);
  }
}

export interface IngestedSources {
  // Chunks the drafting model may see.
  draftable: Chunk[];
  // Every chunk, including past exams, for the overlap check.
  all: Chunk[];
  files: { file: string; role: string; sha256: string; pages: number; chunks: number }[];
}

export async function ingestSources(dir: string): Promise<IngestedSources> {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")));
  const result: IngestedSources = { draftable: [], all: [], files: [] };
  const seen = new Set<string>();

  for (const entry of manifest.files) {
    checkSourceAllowed(entry.file, entry.license);
    const filePath = path.join(dir, entry.file);
    const hash = sha256(await readFile(filePath));
    if (seen.has(hash)) continue; // duplicate upload
    seen.add(hash);

    const pages = await extractText(filePath);
    if (pages.every((p) => !p.text.trim())) {
      throw new Error(`${entry.file}: no text could be extracted (scanned PDF? OCR comes later)`);
    }
    const chunks = chunkPages(pages, { id: hash, filename: entry.file });
    result.all.push(...chunks);
    // Past exams are only compared against, never shown to the drafting model.
    if (entry.role !== "past_exam") result.draftable.push(...chunks);
    result.files.push({ file: entry.file, role: entry.role, sha256: hash, pages: pages.length, chunks: chunks.length });
  }
  return result;
}

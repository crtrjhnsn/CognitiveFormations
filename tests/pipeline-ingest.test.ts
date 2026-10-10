import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chunkPages } from "@/pipeline/chunk";
import { buildContextPack } from "@/pipeline/retrieve";
import { ingestSources } from "@/pipeline/sources";

const file = { id: "abcdef1234567890", filename: "notes.md" };

describe("chunkPages", () => {
  it("splits on headings and keeps chunks under the token cap", () => {
    const text = `# Water\n\nWater is polar.\n\n# Enzymes\n\n${"Enzymes lower activation energy. ".repeat(200)}`;
    const chunks = chunkPages([{ page: null, text }], file, 100);
    expect(chunks[0].text).toContain("Water is polar");
    expect(chunks.some((c) => c.text.includes("Water") && c.text.includes("Enzymes lower"))).toBe(false);
    expect(chunks.every((c) => c.tokenCount <= 100)).toBe(true);
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
  });

  it("keeps page numbers", () => {
    const chunks = chunkPages([{ page: 3, text: "Osmosis moves water." }], file);
    expect(chunks[0].page).toBe(3);
  });
});

describe("buildContextPack", () => {
  const chunks = chunkPages(
    [
      { page: 1, text: "Enzymes speed reactions by lowering activation energy. Temperature and pH change enzyme activity." },
      { page: 2, text: "Natural selection acts on heritable variation in populations." },
      { page: 3, text: "The Hardy-Weinberg equations describe a population that is not evolving." },
    ],
    file,
  );

  it("ranks chunks by the unit's objectives and skips unrelated ones", () => {
    const pack = buildContextPack({ title: "Evolution", objectives: ["Explain natural selection in populations"] }, chunks);
    expect(pack[0].text).toContain("Natural selection");
    expect(pack.some((c) => c.text.includes("Enzymes"))).toBe(false);
  });

  it("respects the token budget", () => {
    const pack = buildContextPack({ title: "Enzymes", objectives: ["enzyme activity, populations, Hardy-Weinberg"] }, chunks, 30);
    expect(pack.reduce((n, c) => n + c.tokenCount, 0)).toBeLessThanOrEqual(30);
  });
});

describe("ingestSources", () => {
  async function folder(manifest: unknown, files: Record<string, string>) {
    const dir = await mkdtemp(path.join(tmpdir(), "sources-"));
    await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    for (const [name, body] of Object.entries(files)) await writeFile(path.join(dir, name), body);
    return dir;
  }
  const attestation = "I wrote these notes and may use them commercially and with AI tools.";

  it("keeps past exams out of the drafting model's sources", async () => {
    const dir = await folder(
      {
        attestation,
        files: [
          { file: "notes.md", role: "own_notes", license: "own work" },
          { file: "exam.txt", role: "past_exam", license: "own work" },
        ],
      },
      { "notes.md": "# Cells\n\nCells are the unit of life.", "exam.txt": "Question 1. Which organelle makes ATP?" },
    );
    const sources = await ingestSources(dir);
    expect(sources.all).toHaveLength(2);
    expect(sources.draftable.map((c) => c.filename)).toEqual(["notes.md"]);
  });

  it("refuses College Board material", async () => {
    const dir = await folder(
      { attestation, files: [{ file: "ap-bio-ced.txt", role: "syllabus", license: "College Board" }] },
      { "ap-bio-ced.txt": "Unit 1" },
    );
    await expect(ingestSources(dir)).rejects.toThrow(/College Board/);
  });

  it("requires a rights attestation", async () => {
    const dir = await folder({ files: [{ file: "notes.md", role: "own_notes", license: "own work" }] }, { "notes.md": "x" });
    await expect(ingestSources(dir)).rejects.toThrow();
  });
});

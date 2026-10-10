import { describe, expect, it } from "vitest";
import type { Chunk } from "@/pipeline/chunk";
import { checkGrounding, checkOverlap, findQuote, longestSharedRun } from "@/pipeline/checks";

const chunk: Chunk = {
  id: "c1",
  fileId: "f",
  filename: "notes.md",
  page: null,
  text: "Water is polar.\nHydrogen   bonds hold neighboring\nwater molecules together.",
  tokenCount: 20,
};
const pack = new Map([[chunk.id, chunk]]);

describe("findQuote", () => {
  it("matches across whitespace and case and returns the original span", () => {
    const span = findQuote(chunk.text, "hydrogen bonds hold neighboring water");
    expect(span).not.toBeNull();
    expect(chunk.text.slice(...span!)).toBe("Hydrogen   bonds hold neighboring\nwater");
  });
  it("returns null for text that isn't there", () => {
    expect(findQuote(chunk.text, "ionic bonds")).toBeNull();
  });
});

describe("checkGrounding", () => {
  it("passes a correctly cited part", () => {
    const { resolved, flag } = checkGrounding({ citations: [{ chunk_id: "c1", quote: "Water is polar" }], gap_filled: false }, pack);
    expect(flag).toBeNull();
    expect(resolved[0].quoteStart).toBe(0);
  });
  it("flags invented quotes, unknown chunks, missing citations and gap-filled parts", () => {
    expect(checkGrounding({ citations: [{ chunk_id: "c1", quote: "made up" }], gap_filled: false }, pack).flag?.kind).toBe("not_in_sources");
    expect(checkGrounding({ citations: [{ chunk_id: "c9", quote: "Water" }], gap_filled: false }, pack).flag?.kind).toBe("not_in_sources");
    expect(checkGrounding({ citations: [], gap_filled: false }, pack).flag?.kind).toBe("not_in_sources");
    expect(checkGrounding({ citations: [], gap_filled: true }, pack).flag?.kind).toBe("not_in_sources");
  });
});

describe("overlap", () => {
  it("measures the longest shared run of words", () => {
    expect(longestSharedRun("so hydrogen bonds hold neighboring water molecules", chunk.text)).toBe(6);
  });
  it("flags 12 or more shared words", () => {
    const source = { ...chunk, text: "one two three four five six seven eight nine ten eleven twelve thirteen" };
    expect(checkOverlap("one two three four five six seven eight nine ten eleven twelve", [source])?.kind).toBe("source_overlap");
    expect(checkOverlap("one two three four five six seven eight nine ten eleven", [source])).toBeNull();
  });
});

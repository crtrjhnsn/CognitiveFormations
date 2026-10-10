import { describe, expect, it } from "vitest";
import { validateMcq, type Mcq } from "@/lib/ai/schemas";

const good: Mcq = {
  kind: "mcq",
  stem: "Which bond holds neighboring water molecules together?",
  choices: ["Hydrogen bond", "Ionic bond", "Peptide bond", "Glycosidic bond"],
  answer_index: 0,
  explanation: "Partial charges on O and H attract neighboring molecules.",
  difficulty: "easy",
  objective_ids: ["u1-o1"],
  citations: [{ chunk_id: "c1", quote_span: [0, 40] }],
  gap_filled: false,
};
const chunks = new Set(["c1"]);

describe("validateMcq", () => {
  it("accepts a valid question", () => {
    expect(validateMcq(good, chunks)).toEqual([]);
  });
  it("rejects the spec's banned patterns", () => {
    const bad = { ...good, choices: ["A", "A", "None of the above"], answer_index: 5, explanation: " " };
    expect(validateMcq(bad, chunks)).toEqual([
      "must have exactly 4 choices",
      "choices must be distinct",
      'no "all/none of the above" choices',
      "answer_index out of range",
      "explanation is empty",
    ]);
  });
  it("rejects citations outside the unit's sources", () => {
    expect(validateMcq({ ...good, citations: [{ chunk_id: "c9", quote_span: [0, 1] }] }, chunks)).toEqual([
      "citation c9 is not in this unit's sources",
    ]);
  });
});

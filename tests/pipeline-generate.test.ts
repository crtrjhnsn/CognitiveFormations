import { describe, expect, it } from "vitest";
import type { Llm, StructuredRequest } from "@/lib/ai/llm";
import type { Guide, Mcq } from "@/lib/ai/schemas";
import { CHECK_MODEL } from "@/lib/ai/models";
import type { Chunk } from "@/pipeline/chunk";
import { generateUnit, type UnitJob } from "@/pipeline/generate-unit";
import { summarize } from "@/pipeline/report";

const chunk: Chunk = {
  id: "c1",
  fileId: "f",
  filename: "notes.md",
  page: null,
  text: "Hydrogen bonds hold neighboring water molecules together. Water is polar.",
  tokenCount: 20,
};
const cite = { citations: [{ chunk_id: "c1", quote: "Water is polar" }], gap_filled: false };

const guide: Guide = {
  big_idea: { text: "Water's polarity shapes life.", ...cite },
  objectives: [{ id: "u1-o1", text: "Explain hydrogen bonding" }],
  key_terms: [
    { term: "Polar", definition: "Uneven charge.", ...cite },
    { term: "Cohesion", definition: "Water sticks to water.", citations: [], gap_filled: true },
  ],
  compare: null,
  diagram: null,
  formula: null,
  worked_example: { prompt: "Why does ice float?", steps: ["Hydrogen bonds space molecules apart."], check: "Less dense.", ...cite },
  exam_traps: [{ trap: "Confusing covalent and hydrogen bonds", fix: "Hydrogen bonds are between molecules.", ...cite }],
  interview: { question: "Why is water a good solvent?", model_answer: "It is polar.", follow_ups: [], ...cite },
  check_yourself: [{ q: "Is water polar?", a: "Yes.", ...cite }],
};

const question = (overrides: Partial<Mcq>): Mcq => ({
  kind: "mcq",
  stem: "Which bond holds neighboring water molecules together?",
  choices: ["Hydrogen bond", "Ionic bond", "Peptide bond", "Glycosidic bond"],
  answer_index: 0,
  explanation: "Partial charges attract.",
  difficulty: "easy",
  objective_ids: ["u1-o1"],
  ...cite,
  ...overrides,
});

// Fake Claude: returns canned output by schema, and records each request.
function fakeLlm(practiceAttempts: Mcq[][], resolvedIndex: (stem: string) => number) {
  const calls: StructuredRequest<never>[] = [];
  let practiceCall = 0;
  const llm: Llm = async (req) => {
    calls.push(req as never);
    const usage = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const shape = Object.keys((req.schema as unknown as { shape: object }).shape);
    let output: unknown;
    if (shape.includes("big_idea")) output = guide;
    else if (shape.includes("questions")) output = { questions: practiceAttempts[Math.min(practiceCall++, practiceAttempts.length - 1)] };
    else output = { working: "...", answer_index: resolvedIndex(req.task) };
    return { output: output as never, usage, servedBy: req.model };
  };
  return { llm, calls };
}

const job: UnitJob = {
  course: { title: "AP® Biology", level: "High school", alignment: "AP® Biology exam", sourceMode: "materials_first" },
  unit: { position: 1, title: "Water", objectives: ["Explain hydrogen bonding"] },
  pack: [chunk],
  allChunks: [chunk],
  questionCount: 2,
};

describe("generateUnit", () => {
  it("drafts, re-solves and flags a unit", async () => {
    const wrongKey = question({ stem: "Which property makes water a good solvent?", choices: ["Polarity", "Mass", "Color", "Charge-free"], answer_index: 2 });
    const { llm, calls } = fakeLlm([[question({}), wrongKey]], (task) => (task.includes("solvent") ? 0 : 0));
    const result = await generateUnit(llm, job);

    // Guide: every section reviewed; the gap-filled key term is flagged.
    expect(result.guide.map((g) => g.section)).toContain("key_terms[1]");
    expect(result.guide.find((g) => g.section === "key_terms[1]")?.flags[0].kind).toBe("not_in_sources");
    expect(result.guide.find((g) => g.section === "big_idea")?.flags).toEqual([]);

    // Practice: the re-solver disagrees with the second key.
    expect(result.practice[0].flags).toEqual([]);
    expect(result.practice[1].flags.map((f) => f.kind)).toEqual(["answer_mismatch"]);

    // Re-solve uses the check model and never sees the answer key.
    const resolves = calls.filter((c) => c.model === CHECK_MODEL);
    expect(resolves).toHaveLength(2);
    expect(resolves.every((c) => !c.task.includes("answer_index") && !c.task.includes("Partial charges"))).toBe(true);

    const summary = summarize([result]);
    expect(summary.items).toBe(result.guide.length + 2);
    expect(summary.flagsByKind.answer_mismatch).toBe(1);
    expect(summary.costUsd).toBeGreaterThan(0);
  });

  it("retries an invalid practice set once with the problems, then flags what's still wrong", async () => {
    const bad = question({ choices: ["A", "B", "None of the above", "D"] });
    const { llm, calls } = fakeLlm([[bad], [bad]], () => 0);
    const result = await generateUnit(llm, job);
    const practiceCalls = calls.filter((c) => c.task.includes("practice questions"));
    expect(practiceCalls).toHaveLength(2);
    expect(practiceCalls[1].task).toContain("none of the above");
    expect(result.practice[0].flags.map((f) => f.kind)).toContain("schema_retry_failed");
  });

  it("drops gap-filled parts in only-my-materials mode", async () => {
    const { llm } = fakeLlm([[question({ gap_filled: true, citations: [] })]], () => 0);
    const result = await generateUnit(llm, { ...job, course: { ...job.course, sourceMode: "materials_only" } });
    expect(result.dropped.map((d) => d.section)).toEqual(["key_terms[1]", "practice[0]"]);
    expect(result.practice).toHaveLength(0);
  });

  it("records a failed step instead of crashing the unit", async () => {
    const llm: Llm = async () => {
      throw new Error("overloaded");
    };
    const result = await generateUnit(llm, job);
    expect(result.failures.map((f) => f.stage)).toEqual(["draft_guide", "draft_practice"]);
  });
});

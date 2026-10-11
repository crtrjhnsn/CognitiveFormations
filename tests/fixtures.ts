import type { Llm, StructuredRequest } from "@/lib/ai/llm";
import type { Guide, Mcq } from "@/lib/ai/schemas";

// Canned Claude output shared by the pipeline and database tests. Every
// citation points at chunk c1 and quotes "Water is polar".
export const cite = { citations: [{ chunk_id: "c1", quote: "Water is polar" }], gap_filled: false };

export const guide: Guide = {
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

export const question = (overrides: Partial<Mcq>): Mcq => ({
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
export function fakeLlm(practiceAttempts: Mcq[][], resolvedIndex: (stem: string) => number) {
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


import { z } from "zod";

// The model cites a short exact quote; code finds its character span in the
// chunk (stored as item_citations.quote_start/quote_end). Asking for the quote
// instead of offsets lets the grounding check verify it.
export const citationSchema = z.object({
  chunk_id: z.string(),
  quote: z.string(),
});
export type Citation = z.infer<typeof citationSchema>;

// Shape every multiple-choice item uses (spec: "Prompts and schemas").
export const mcqSchema = z.object({
  kind: z.literal("mcq"),
  stem: z.string(),
  choices: z.array(z.string()),
  answer_index: z.number().int(),
  explanation: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  objective_ids: z.array(z.string()),
  citations: z.array(citationSchema),
  gap_filled: z.boolean(),
});
export type Mcq = z.infer<typeof mcqSchema>;

export const practiceSetSchema = z.object({ questions: z.array(mcqSchema) });

// One section of a unit guide. Every section carries its own citations and
// gap_filled flag so grounding is checked per section.
const grounded = { citations: z.array(citationSchema), gap_filled: z.boolean() };

// The unit guide template (spec: "Guide"). Diagrams are a structured spec the
// site renders, never generated images. Sections that don't fit a unit (e.g.
// a formula in a unit without one) come back as null.
export const guideSchema = z.object({
  big_idea: z.object({ text: z.string(), ...grounded }),
  objectives: z.array(z.object({ id: z.string(), text: z.string() })),
  key_terms: z.array(z.object({ term: z.string(), definition: z.string(), ...grounded })),
  compare: z
    .object({ title: z.string(), headers: z.array(z.string()), rows: z.array(z.array(z.string())), ...grounded })
    .nullable(),
  diagram: z
    .object({
      type: z.enum(["flow", "cycle", "labeled_structure", "graph"]),
      title: z.string(),
      elements: z.array(z.object({ label: z.string(), detail: z.string() })),
      connections: z.array(z.object({ from: z.string(), to: z.string(), label: z.string() })),
      ...grounded,
    })
    .nullable(),
  formula: z
    .object({ latex: z.string(), interpretation: z.array(z.string()), ...grounded })
    .nullable(),
  worked_example: z.object({ prompt: z.string(), steps: z.array(z.string()), check: z.string(), ...grounded }),
  exam_traps: z.array(z.object({ trap: z.string(), fix: z.string(), ...grounded })),
  interview: z.object({ question: z.string(), model_answer: z.string(), follow_ups: z.array(z.string()), ...grounded }),
  check_yourself: z.array(z.object({ q: z.string(), a: z.string(), ...grounded })),
});
export type Guide = z.infer<typeof guideSchema>;

// Independent answer to a question shown without its key.
export const resolveSchema = z.object({
  working: z.string(),
  answer_index: z.number().int(),
});

const BANNED_CHOICE = /\b(all|none) of the above\b/i;

// Rules the JSON schema can't express. Returns problems; empty means valid.
export function validateMcq(item: Mcq, contextChunkIds: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (item.choices.length !== 4) problems.push("must have exactly 4 choices");
  if (new Set(item.choices.map((c) => c.trim().toLowerCase())).size !== item.choices.length) {
    problems.push("choices must be distinct");
  }
  if (item.choices.some((c) => BANNED_CHOICE.test(c))) problems.push('no "all/none of the above" choices');
  if (item.answer_index < 0 || item.answer_index >= item.choices.length) problems.push("answer_index out of range");
  if (!item.explanation.trim()) problems.push("explanation is empty");
  for (const citation of item.citations) {
    if (!contextChunkIds.has(citation.chunk_id)) problems.push(`citation ${citation.chunk_id} is not in this unit's sources`);
  }
  if (!item.gap_filled && item.citations.length === 0) problems.push("needs a citation or gap_filled: true");
  return problems;
}

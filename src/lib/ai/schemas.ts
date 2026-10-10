import { z } from "zod";

// Shape every multiple-choice item uses (spec: "Prompts and schemas").
export const citationSchema = z.object({
  chunk_id: z.string(),
  quote_span: z.tuple([z.number().int(), z.number().int()]),
});

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

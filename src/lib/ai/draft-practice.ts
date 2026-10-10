import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DRAFT_MODEL } from "./models";
import { practiceSetSchema, validateMcq, type Mcq } from "./schemas";

export interface SourceChunk {
  id: string;
  filename: string;
  page: number | null;
  text: string;
}

export interface UnitContext {
  courseTitle: string;
  level: string;
  unitTitle: string;
  objectives: { id: string; text: string }[];
  chunks: SourceChunk[];
}

const HOUSE_RULES = `You write practice questions for a study guide.
- Write for the stated level.
- Cite chunk ids for every factual claim. Set gap_filled: true on anything the sources don't support.
- Never copy more than one sentence verbatim from a source.
- Never reuse a past exam question's wording or numbers.
- Each question has exactly 4 distinct choices and no "all of the above" or "none of the above".`;

export interface DraftResult {
  questions: Mcq[];
  problems: { index: number; problems: string[] }[];
  usage: { inputTokens: number; outputTokens: number };
}

// One structured-output call that drafts a unit's practice set. The stable
// parts (rules, course and unit context) are marked for prompt caching.
export async function draftPractice(client: Anthropic, ctx: UnitContext, count: number): Promise<DraftResult> {
  const sources = ctx.chunks
    .map((c) => `<chunk id="${c.id}" file="${c.filename}" page="${c.page ?? ""}">\n${c.text}\n</chunk>`)
    .join("\n");
  const objectives = ctx.objectives.map((o) => `${o.id}: ${o.text}`).join("\n");

  const message = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: HOUSE_RULES }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Course: ${ctx.courseTitle} (${ctx.level})\nUnit: ${ctx.unitTitle}\nObjectives:\n${objectives}\n\nSources:\n${sources}`,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: `Write ${count} multiple-choice practice questions, mixing easy, medium and hard.` },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(practiceSetSchema) },
  });

  const questions = message.parsed_output?.questions ?? [];
  const chunkIds = new Set(ctx.chunks.map((c) => c.id));
  const problems = questions
    .map((q, index) => ({ index, problems: validateMcq(q, chunkIds) }))
    .filter((p) => p.problems.length > 0);

  return {
    questions,
    problems,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  };
}

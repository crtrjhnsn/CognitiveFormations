import Anthropic from "@anthropic-ai/sdk";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { draftPractice } from "@/lib/ai/draft-practice";

// Phase 1 building block: drafts one unit's practice set from its context
// pack. Saving items, flags and job steps comes with the owner flow (phase 2).
export const draftUnitPractice = schemaTask({
  id: "draft-unit-practice",
  schema: z.object({
    courseTitle: z.string(),
    level: z.string(),
    unitTitle: z.string(),
    objectives: z.array(z.object({ id: z.string(), text: z.string() })),
    chunks: z.array(z.object({ id: z.string(), filename: z.string(), page: z.number().nullable(), text: z.string() })),
    count: z.number().int().min(1).max(20).default(5),
  }),
  run: async ({ count, ...ctx }) => {
    const result = await draftPractice(new Anthropic(), ctx, count);
    logger.info("Drafted practice set", {
      questions: result.questions.length,
      invalid: result.problems.length,
      ...result.usage,
    });
    return result;
  },
});

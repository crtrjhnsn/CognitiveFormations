import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { claudeLlm, createClient } from "@/lib/ai/llm";
import { generateUnit } from "@/pipeline/generate-unit";

const chunk = z.object({
  id: z.string(),
  fileId: z.string(),
  filename: z.string(),
  page: z.number().nullable(),
  text: z.string(),
  tokenCount: z.number(),
});

// One unit of a generation job. Loading the job from the database and saving
// items, citations and flags comes with the owner flow (phase 2).
export const generateUnitTask = schemaTask({
  id: "generate-unit",
  schema: z.object({
    course: z.object({
      title: z.string(),
      level: z.string(),
      alignment: z.string(),
      sourceMode: z.enum(["materials_first", "materials_only"]),
    }),
    unit: z.object({ position: z.number(), title: z.string(), objectives: z.array(z.string()) }),
    pack: z.array(chunk),
    allChunks: z.array(chunk),
    questionCount: z.number().int().min(1).max(20).default(5),
  }),
  run: async (job) => {
    const result = await generateUnit(claudeLlm(createClient()), job);
    logger.info("Generated unit", {
      unit: job.unit.position,
      guideParts: result.guide.length,
      questions: result.practice.length,
      failures: result.failures.length,
    });
    return result;
  },
});

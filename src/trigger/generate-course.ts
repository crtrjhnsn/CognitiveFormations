import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { claudeLlm, createClient } from "@/lib/ai/llm";
import { db } from "@/lib/db";
import { runGenerationJob } from "@/lib/owner/jobs";

// Runs a generation job's queued units. A retried run skips units that
// already finished, and a unit that runs twice replaces its own items.
export const generateCourseTask = schemaTask({
  id: "generate-course",
  schema: z.object({ jobId: z.string().uuid() }),
  maxDuration: 3600,
  retry: { maxAttempts: 2 },
  run: async ({ jobId }) => {
    await runGenerationJob(db(), claudeLlm(createClient()), jobId);
  },
});

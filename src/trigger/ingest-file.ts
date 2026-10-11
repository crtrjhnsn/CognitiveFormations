import { createClient } from "@supabase/supabase-js";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { ingestFile } from "@/lib/owner/files";
import { requireEnv } from "@/lib/env";

// Extracts and chunks one uploaded source file. Safe to retry: re-ingesting
// replaces the file's chunks.
export const ingestFileTask = schemaTask({
  id: "ingest-file",
  schema: z.object({ fileId: z.string().uuid() }),
  retry: { maxAttempts: 3 },
  run: async ({ fileId }) => {
    const sql = db();
    const [file] = await sql<{ storage_key: string }[]>`select storage_key from source_files where id = ${fileId}`;
    if (!file) {
      logger.warn("File was deleted before ingest", { fileId });
      return;
    }
    // Not @/lib/supabase/admin: its "server-only" guard throws outside Next.js.
    const storage = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    }).storage;
    const { data, error } = await storage.from("sources").download(file.storage_key);
    if (error) throw error;
    await ingestFile(sql, fileId, new Uint8Array(await data.arrayBuffer()));
  },
});

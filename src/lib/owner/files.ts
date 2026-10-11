import type { Sql } from "@/lib/db";
import { chunkPages, sha256 } from "@/pipeline/chunk";
import { extractPages } from "@/pipeline/extract";
import { checkSourceAllowed } from "@/pipeline/sources";

export const FILE_ROLES = ["syllabus", "slides", "textbook", "past_exam", "own_notes"] as const;
export type FileRole = (typeof FILE_ROLES)[number];

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// Records an uploaded file. Returns null when the same file is already in
// the course (matched by content hash).
export async function registerFile(
  sql: Sql,
  ownerId: string,
  courseId: string,
  file: { storageKey: string; filename: string; mime: string; role: FileRole; license: string; bytes: Uint8Array },
): Promise<string | null> {
  checkSourceAllowed(file.filename, file.license);
  const [course] = await sql`select id from courses where id = ${courseId} and owner_id = ${ownerId}`;
  if (!course) throw new Error("Course not found");
  const [row] = await sql<{ id: string }[]>`
    insert into source_files (course_id, storage_key, filename, mime, role, license, sha256)
    values (${courseId}, ${file.storageKey}, ${file.filename}, ${file.mime}, ${file.role}, ${file.license}, ${sha256(file.bytes)})
    on conflict (course_id, sha256) do nothing
    returning id`;
  return row?.id ?? null;
}

// Extracts and chunks a registered file into source_chunks. Re-running
// replaces the file's chunks, so a retried ingest never duplicates them.
export async function ingestFile(sql: Sql, fileId: string, bytes: Uint8Array) {
  const [file] = await sql<{ id: string; filename: string }[]>`select id, filename from source_files where id = ${fileId}`;
  if (!file) throw new Error(`File ${fileId} not found`);
  try {
    const pages = await extractPages(file.filename, bytes);
    if (pages.every((p) => !p.text.trim())) throw new Error("No text could be extracted (scanned PDF? OCR isn't supported yet)");
    const chunks = chunkPages(pages, { id: file.id, filename: file.filename });
    await sql.begin(async (tx) => {
      await tx`delete from source_chunks where file_id = ${fileId}`;
      for (const chunk of chunks) {
        await tx`insert into source_chunks (file_id, page, text, token_count)
          values (${fileId}, ${chunk.page}, ${chunk.text}, ${chunk.tokenCount})`;
      }
      await tx`update source_files set status = 'ingested', error = null, pages = ${pages.length} where id = ${fileId}`;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`update source_files set status = 'failed', error = ${message} where id = ${fileId}`;
    throw error;
  }
}

export async function deleteFile(sql: Sql, ownerId: string, fileId: string): Promise<string | null> {
  const [row] = await sql<{ storage_key: string }[]>`
    delete from source_files f using courses c
    where f.id = ${fileId} and c.id = f.course_id and c.owner_id = ${ownerId}
    returning f.storage_key`;
  return row?.storage_key ?? null;
}

"use server";

import { tasks } from "@trigger.dev/sdk";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Tier } from "@/lib/access";
import { ownerOrNull } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  getOwnedCourse,
  MODULE_TYPES,
  recordAttestation,
  saveModules,
  saveOutline,
  seedCourseFromConfig,
  setSourceMode,
  type ModuleType,
  type UnitInput,
} from "@/lib/owner/courses";
import { deleteFile, FILE_ROLES, MAX_UPLOAD_BYTES, registerFile, type FileRole } from "@/lib/owner/files";
import { cancelJob, JobRefused, retryJob, startJob } from "@/lib/owner/jobs";
import {
  approveItem,
  approveUnitDrafts,
  editItem,
  publishCourse,
  regenerateItem,
  ReviewRefused,
  rollbackItem,
  setItemTier,
  unpublishCourse,
} from "@/lib/owner/review";
import { claudeLlm, createClient as createClaudeClient } from "@/lib/ai/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import type { generateCourseTask } from "@/trigger/generate-course";
import type { ingestFileTask } from "@/trigger/ingest-file";

// Every action checks the owner itself: a Server Action is a public endpoint.
export interface ActionResult {
  error?: string;
  message?: string;
}

async function owner() {
  const user = await ownerOrNull();
  if (!user) throw new Error("Not signed in as an owner");
  return user;
}

function failure(error: unknown): ActionResult {
  return { error: error instanceof Error ? error.message : String(error) };
}

export async function seedCourse(slug: string) {
  const user = await owner();
  const id = await seedCourseFromConfig(db(), user.id, slug);
  redirect(`/owner/courses/${id}`);
}

// Step 1 of an upload: a one-time URL the browser uploads straight to, so
// large files never pass through a server function.
export async function createUploadUrl(courseId: string, filename: string, size: number) {
  const user = await owner();
  if (size > MAX_UPLOAD_BYTES) return { error: "Files are limited to 50 MB." };
  if (!/\.(pdf|docx|md|txt)$/i.test(filename)) return { error: "Upload PDF, DOCX, Markdown or plain-text files." };
  if (!(await getOwnedCourse(db(), user.id, courseId))) return { error: "Course not found" };

  const safeName = filename.replace(/[^\w.-]+/g, "_").slice(-100);
  const path = `${courseId}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await createAdminClient().storage.from("sources").createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path: data.path, token: data.token };
}

// Step 2: record the uploaded file and queue its extraction.
export async function registerUpload(
  courseId: string,
  upload: { path: string; filename: string; mime: string; role: string; license: string },
): Promise<ActionResult> {
  const user = await owner();
  if (!upload.path.startsWith(`${courseId}/`)) return { error: "Upload path doesn't match the course" };
  if (!FILE_ROLES.includes(upload.role as FileRole)) return { error: "Pick what kind of file this is" };
  if (!upload.license.trim()) return { error: "Say where this file comes from and that you may use it" };

  const storage = createAdminClient().storage.from("sources");
  const { data, error } = await storage.download(upload.path);
  if (error) return { error: "The upload didn't arrive. Try again." };

  try {
    const fileId = await registerFile(db(), user.id, courseId, {
      storageKey: upload.path,
      filename: upload.filename,
      mime: upload.mime,
      role: upload.role as FileRole,
      license: upload.license.trim(),
      bytes: new Uint8Array(await data.arrayBuffer()),
    });
    if (!fileId) {
      await storage.remove([upload.path]);
      return { message: `${upload.filename} is already in this course.` };
    }
    await tasks.trigger<typeof ingestFileTask>("ingest-file", { fileId });
    refresh();
    return { message: `${upload.filename} uploaded. Reading it now.` };
  } catch (err) {
    await storage.remove([upload.path]);
    return failure(err);
  }
}

export async function removeFile(fileId: string) {
  const user = await owner();
  const key = await deleteFile(db(), user.id, fileId);
  if (key) await createAdminClient().storage.from("sources").remove([key]);
  refresh();
}

export async function saveOutlineAction(courseId: string, units: UnitInput[]): Promise<ActionResult> {
  const user = await owner();
  try {
    await saveOutline(db(), user.id, courseId, units);
  } catch (err) {
    return failure(err);
  }
  refresh();
  return { message: "Outline saved." };
}

export async function saveModulesAction(courseId: string, _state: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await owner();
  const modules = MODULE_TYPES.map((type: ModuleType) => ({
    type,
    enabled: formData.get(`${type}.enabled`) === "on",
    tier: (formData.get(`${type}.tier`) ?? "pro") as Tier,
  }));
  if (modules.some((m) => !["free", "preview", "pro"].includes(m.tier))) return { error: "Unknown tier" };
  const mode = formData.get("source_mode");
  if (mode !== "materials_first" && mode !== "materials_only") return { error: "Unknown source mode" };
  await saveModules(db(), user.id, courseId, modules);
  await setSourceMode(db(), user.id, courseId, mode);
  refresh();
  return { message: "Settings saved." };
}

export async function attest(courseId: string): Promise<ActionResult> {
  const user = await owner();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    await recordAttestation(db(), user.id, courseId, ip);
  } catch (err) {
    return failure(err);
  }
  refresh();
  return {};
}

export async function generate(courseId: string): Promise<ActionResult> {
  const user = await owner();
  const sql = db();
  let jobId: string;
  try {
    jobId = await startJob(sql, user.id, courseId);
  } catch (err) {
    if (err instanceof JobRefused) return { error: err.message };
    throw err;
  }
  try {
    await tasks.trigger<typeof generateCourseTask>("generate-course", { jobId });
  } catch (err) {
    await sql`update generation_jobs set status = 'failed', error = 'Could not start the background job' where id = ${jobId}`;
    await sql`update courses set status = 'draft' where id = ${courseId}`;
    return failure(err);
  }
  refresh();
  return {};
}

export async function retry(jobId: string): Promise<ActionResult> {
  const user = await owner();
  try {
    await retryJob(db(), user.id, jobId);
    await tasks.trigger<typeof generateCourseTask>("generate-course", { jobId });
  } catch (err) {
    return failure(err);
  }
  refresh();
  return {};
}

export async function cancel(jobId: string) {
  const user = await owner();
  await cancelJob(db(), user.id, jobId);
  refresh();
}

// --- Review queue ------------------------------------------------------------

// Review refusals are messages for the owner; anything else is a bug.
async function review(run: () => Promise<unknown>, message?: string): Promise<ActionResult> {
  try {
    await run();
  } catch (err) {
    if (err instanceof ReviewRefused) return { error: err.message };
    throw err;
  }
  refresh();
  return message ? { message } : {};
}

export async function approve(itemId: string) {
  const user = await owner();
  return review(() => approveItem(db(), user.id, itemId));
}

export async function approveUnit(courseId: string, unitPosition: number) {
  const user = await owner();
  let count = 0;
  const result = await review(async () => {
    count = await approveUnitDrafts(db(), user.id, courseId, unitPosition);
  });
  return result.error ? result : { message: `Approved ${count} item${count === 1 ? "" : "s"}.` };
}

export async function changeTier(itemId: string, tier: "free" | "pro") {
  const user = await owner();
  if (tier !== "free" && tier !== "pro") return { error: "Unknown tier" };
  return review(() => setItemTier(db(), user.id, itemId, tier));
}

export async function saveEdit(itemId: string, changes: Record<string, unknown>): Promise<ActionResult> {
  const user = await owner();
  let flagged = false;
  const result = await review(async () => {
    flagged = (await editItem(db(), user.id, itemId, changes)).flagged;
  });
  if (result.error) return result;
  return flagged
    ? { error: "Saved, but it now copies a source too closely, so it's flagged. Reword it in your own words." }
    : { message: "Saved and approved." };
}

export async function rollback(itemId: string, version: number) {
  const user = await owner();
  return review(() => rollbackItem(db(), user.id, itemId, version), `Restored version ${version}. Approve it when it looks right.`);
}

export async function regenerate(itemId: string) {
  const user = await owner();
  return review(() => regenerateItem(db(), claudeLlm(createClaudeClient()), user.id, itemId), "New question ready for review.");
}

export async function publish(courseId: string) {
  const user = await owner();
  return review(() => publishCourse(db(), user.id, courseId), "Published.");
}

export async function unpublish(courseId: string) {
  const user = await owner();
  return review(() => unpublishCourse(db(), user.id, courseId));
}

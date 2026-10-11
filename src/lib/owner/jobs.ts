import type postgres from "postgres";
import { resolveTier, type Tier } from "@/lib/access";
import type { Llm } from "@/lib/ai/llm";
import type { Sql } from "@/lib/db";
import type { Chunk } from "@/pipeline/chunk";
import type { Flag } from "@/pipeline/checks";
import { generateUnit, type GeneratedItem, type UnitResult } from "@/pipeline/generate-unit";
import { costOf } from "@/pipeline/report";
import { buildContextPack } from "@/pipeline/retrieve";
import { ATTESTATION_TEXT_VERSION } from "./courses";

export class JobRefused extends Error {}

// Starts a generation job: one step per unit. Refused without a current
// rights attestation, a confirmed outline and at least one ingested file.
export async function startJob(sql: Sql, ownerId: string, courseId: string): Promise<string> {
  return sql.begin(async (tx) => {
    const [course] = await tx<{ id: string; outline_version: number; status: string }[]>`
      select id, outline_version, status from courses where id = ${courseId} and owner_id = ${ownerId} for update`;
    if (!course) throw new JobRefused("Course not found");
    const [attestation] = await tx`select 1 from rights_attestations
      where course_id = ${courseId} and text_version = ${ATTESTATION_TEXT_VERSION} limit 1`;
    if (!attestation) throw new JobRefused("Sign the rights attestation first");
    if (course.outline_version === 0) throw new JobRefused("Confirm the unit outline first");
    const [file] = await tx`select 1 from source_files where course_id = ${courseId} and status = 'ingested' and role <> 'past_exam' limit 1`;
    if (!file) throw new JobRefused("Upload at least one source file first");
    const [running] = await tx`select 1 from generation_jobs where course_id = ${courseId} and status in ('queued', 'running') limit 1`;
    if (running) throw new JobRefused("A generation job is already running");
    const [existing] = await tx`select 1 from items i join modules m on m.id = i.module_id where m.course_id = ${courseId} limit 1`;
    if (existing) throw new JobRefused("This course already has generated content; regenerating comes with the review queue");

    const [job] = await tx<{ id: string }[]>`insert into generation_jobs (course_id) values (${courseId}) returning id`;
    const units = await tx<{ id: string }[]>`select id from units where course_id = ${courseId} order by position`;
    for (const unit of units) {
      await tx`insert into job_steps (job_id, stage, unit_id, idempotency_key)
        values (${job.id}, 'unit', ${unit.id}, ${`${job.id}:${unit.id}:unit:v${course.outline_version}`})`;
    }
    await tx`update courses set status = 'generating' where id = ${courseId}`;
    return job.id;
  });
}

// Re-queues a finished job's failed or cancelled steps; succeeded steps are kept.
export async function retryJob(sql: Sql, ownerId: string, jobId: string) {
  await sql.begin(async (tx) => {
    const [job] = await tx<{ course_id: string }[]>`
      update generation_jobs j set status = 'queued', error = null, finished_at = null
      from courses c where j.id = ${jobId} and c.id = j.course_id and c.owner_id = ${ownerId}
        and j.status in ('failed', 'succeeded', 'cancelled')
      returning j.course_id`;
    if (!job) throw new JobRefused("Job not found or still running");
    await tx`update job_steps set status = 'queued', error = null where job_id = ${jobId} and status in ('failed', 'cancelled')`;
    await tx`update courses set status = 'generating' where id = ${job.course_id}`;
  });
}

export async function cancelJob(sql: Sql, ownerId: string, jobId: string) {
  await sql.begin(async (tx) => {
    const [job] = await tx<{ course_id: string }[]>`
      update generation_jobs j set status = 'cancelled', finished_at = now()
      from courses c where j.id = ${jobId} and c.id = j.course_id and c.owner_id = ${ownerId}
        and j.status in ('queued', 'running')
      returning j.course_id`;
    if (!job) return;
    // Running steps finish and save; queued ones are dropped.
    await tx`update job_steps set status = 'cancelled' where job_id = ${jobId} and status = 'queued'`;
    await setCourseStatusFromItems(tx, job.course_id);
  });
}

export async function getJobProgress(sql: Sql, ownerId: string, jobId: string) {
  const [job] = await sql<
    { id: string; course_id: string; status: string; stage: string | null; tokens_in: string; tokens_out: string; cost_estimate: string | null; error: string | null }[]
  >`select j.* from generation_jobs j join courses c on c.id = j.course_id
    where j.id = ${jobId} and c.owner_id = ${ownerId}`;
  if (!job) return null;
  const steps = await sql<{ position: number; title: string; status: string; error: string | null }[]>`
    select u.position, u.title, s.status, s.error from job_steps s join units u on u.id = s.unit_id
    where s.job_id = ${jobId} order by u.position`;
  return {
    ...job,
    tokensIn: Number(job.tokens_in),
    tokensOut: Number(job.tokens_out),
    costEstimate: job.cost_estimate === null ? null : Number(job.cost_estimate),
    steps,
    done: steps.filter((s) => s.status === "succeeded" || s.status === "failed" || s.status === "cancelled").length,
  };
}

export interface JobContext {
  course: { id: string; title: string; level: string; alignment: string | null; source_mode: "materials_first" | "materials_only" };
  modules: Map<string, { id: string; enabled: boolean; tier: Tier }>;
  draftable: Chunk[];
  all: Chunk[];
  // Short chunk ids shown to the model, mapped back to source_chunks ids.
  chunkUuid: Map<string, string>;
}

export async function loadJobContext(sql: Sql, courseId: string): Promise<JobContext> {
  const [course] = await sql<JobContext["course"][]>`
    select id, title, level, alignment, source_mode from courses where id = ${courseId}`;
  const modules = await sql<{ id: string; type: string; enabled: boolean; tier: Tier }[]>`
    select id, type, enabled, tier from modules where course_id = ${courseId}`;
  const rows = await sql<{ id: string; file_id: string; filename: string; role: string; page: number | null; text: string; token_count: number }[]>`
    select c.id, c.file_id, f.filename, f.role, c.page, c.text, c.token_count
    from source_chunks c join source_files f on f.id = c.file_id
    where f.course_id = ${courseId} and f.status = 'ingested'
    order by f.created_at, c.id`;

  const chunkUuid = new Map<string, string>();
  const all: Chunk[] = [];
  const draftable: Chunk[] = [];
  rows.forEach((row, i) => {
    const chunk: Chunk = { id: `c${i + 1}`, fileId: row.file_id, filename: row.filename, page: row.page, text: row.text, tokenCount: row.token_count };
    chunkUuid.set(chunk.id, row.id);
    all.push(chunk);
    // Past exams are only compared against, never shown to the drafting model.
    if (row.role !== "past_exam") draftable.push(chunk);
  });
  return { course, modules: new Map(modules.map((m) => [m.type, m])), draftable, all, chunkUuid };
}

// Runs a job's queued steps, units in parallel up to `concurrency`. Each step
// saves its own items in one transaction, so a crash or retry never leaves
// half a unit or duplicates.
export async function runGenerationJob(sql: Sql, llm: Llm, jobId: string, options: { concurrency?: number; questionCount?: number; cardCount?: number } = {}) {
  const [job] = await sql<{ id: string; course_id: string; status: string }[]>`
    update generation_jobs set status = 'running', stage = 'generating', started_at = coalesce(started_at, now())
    where id = ${jobId} and status in ('queued', 'running') returning id, course_id, status`;
  if (!job) return;
  const ctx = await loadJobContext(sql, job.course_id);
  const steps = await sql<{ id: string; unit_id: string; position: number; title: string; objectives: string[] }[]>`
    select s.id, s.unit_id, u.position, u.title, u.objectives from job_steps s join units u on u.id = s.unit_id
    where s.job_id = ${jobId} and s.status in ('queued', 'running') order by u.position`;

  let next = 0;
  const worker = async () => {
    while (next < steps.length) {
      const step = steps[next++];
      const [still] = await sql`select status from generation_jobs where id = ${jobId} and status = 'running'`;
      if (!still) return; // cancelled
      await sql`update job_steps set status = 'running', attempt = attempt + 1, started_at = now() where id = ${step.id}`;
      try {
        const unit = { position: step.position, title: step.title, objectives: step.objectives };
        const result = await generateUnit(llm, {
          course: { title: ctx.course.title, level: ctx.course.level, alignment: ctx.course.alignment ?? "", sourceMode: ctx.course.source_mode },
          unit,
          pack: buildContextPack(unit, ctx.draftable),
          allChunks: ctx.all,
          questionCount: options.questionCount ?? 5,
          cardCount: ctx.modules.get("cards")?.enabled ? (options.cardCount ?? 12) : 0,
        });
        await saveUnitResult(sql, ctx, jobId, step, result);
      } catch (error) {
        await sql`update job_steps set status = 'failed', finished_at = now(),
          error = ${error instanceof Error ? error.message : String(error)} where id = ${step.id}`;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, Math.max(steps.length, 1)) }, worker));
  await finishJob(sql, jobId, job.course_id);
}

async function saveUnitResult(sql: Sql, ctx: JobContext, jobId: string, step: { id: string; unit_id: string; position: number }, result: UnitResult) {
  const tokensIn = result.usage.reduce((n, r) => n + r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheWriteTokens, 0);
  const tokensOut = result.usage.reduce((n, r) => n + r.usage.outputTokens, 0);
  const cost = result.usage.reduce((n, r) => n + costOf(r), 0);

  await sql.begin(async (tx) => {
    await tx`delete from items where job_step_id = ${step.id}`;
    const save = async (moduleType: string, kind: string, items: GeneratedItem<unknown>[]) => {
      const mod = ctx.modules.get(moduleType);
      if (!mod?.enabled) return;
      for (const [position, item] of items.entries()) {
        const content = moduleType === "guide" ? { section: item.section, ...(item.content as object) } : item.content;
        const [row] = await tx<{ id: string }[]>`
          insert into items (module_id, unit_id, kind, position, content, tier, status, gap_filled, job_step_id)
          values (${mod.id}, ${step.unit_id}, ${kind}, ${position}, ${tx.json(content as never)},
            ${resolveTier(mod.tier, step.position)}, ${item.flags.length ? "flagged" : "draft"},
            ${(item.content as { gap_filled?: boolean }).gap_filled ?? false}, ${step.id})
          returning id`;
        for (const citation of item.citations) {
          const chunkId = ctx.chunkUuid.get(citation.chunk_id);
          if (!chunkId) continue;
          await tx`insert into item_citations (item_id, chunk_id, quote_start, quote_end)
            values (${row.id}, ${chunkId}, ${citation.quoteStart}, ${citation.quoteEnd}) on conflict do nothing`;
        }
        for (const flag of item.flags) {
          await tx`insert into flags (item_id, item_version, kind, detail) values (${row.id}, 1, ${flag.kind}, ${tx.json(storedFlagDetail(ctx, flag) as never)})`;
        }
      }
    };
    await save("guide", "guide_section", result.guide);
    await save("practice", "mcq", result.practice);
    await save("cards", "card", result.cards);

    const failed = result.failures.length > 0;
    await tx`update job_steps set status = ${failed ? "failed" : "succeeded"}, finished_at = now(),
      error = ${failed ? result.failures.map((f) => `${f.stage}: ${f.message}`).join("; ") : null},
      tokens_in = tokens_in + ${tokensIn}, tokens_out = tokens_out + ${tokensOut}
      where id = ${step.id}`;
    await tx`update generation_jobs set tokens_in = tokens_in + ${tokensIn}, tokens_out = tokens_out + ${tokensOut},
      cost_estimate = coalesce(cost_estimate, 0) + ${cost} where id = ${jobId}`;
  });
}

// Flags name chunks by the short ids the model saw; store the real ids.
export function storedFlagDetail(ctx: Pick<JobContext, "chunkUuid">, flag: Flag): Record<string, unknown> {
  const chunkId = flag.detail.chunkId;
  return typeof chunkId === "string" ? { ...flag.detail, chunkId: ctx.chunkUuid.get(chunkId) ?? null } : flag.detail;
}

async function finishJob(sql: Sql, jobId: string, courseId: string) {
  await sql.begin(async (tx) => {
    const steps = await tx<{ status: string }[]>`select status from job_steps where job_id = ${jobId}`;
    const failed = steps.filter((s) => s.status === "failed").length;
    const [job] = await tx<{ status: string }[]>`select status from generation_jobs where id = ${jobId}`;
    if (job.status === "running") {
      await tx`update generation_jobs set status = ${failed ? "failed" : "succeeded"}, stage = 'review', finished_at = now(),
        error = ${failed ? `${failed} of ${steps.length} units failed; retry to rerun them` : null} where id = ${jobId}`;
    }
    await setCourseStatusFromItems(tx, courseId);
  });
}

async function setCourseStatusFromItems(tx: postgres.TransactionSql, courseId: string) {
  const [items] = await tx<{ n: number }[]>`select count(*)::int as n from items i join modules m on m.id = i.module_id where m.course_id = ${courseId}`;
  await tx`update courses set status = ${items.n > 0 ? "needs_review" : "draft"} where id = ${courseId}`;
}

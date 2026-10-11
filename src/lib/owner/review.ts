import type postgres from "postgres";
import type { Tier } from "@/lib/access";
import type { Llm } from "@/lib/ai/llm";
import { guideSectionSchema, mcqSchema, validateMcq, type Mcq } from "@/lib/ai/schemas";
import type { Sql } from "@/lib/db";
import { checkGrounding, checkOverlap } from "@/pipeline/checks";
import { regenerateQuestion, visibleText } from "@/pipeline/generate-unit";
import { buildContextPack } from "@/pipeline/retrieve";
import { getOwnedCourse } from "./courses";
import { loadJobContext, storedFlagDetail, type JobContext } from "./jobs";

// The review queue: every generated item waits here until the owner approves
// it. Flagged items show why; edits, regenerations and rollbacks each write
// a new version and keep the old one.

export class ReviewRefused extends Error {}

type Tx = postgres.TransactionSql;
export type ReviewStatus = "flagged" | "draft" | "approved" | "all";

export interface ReviewFlag {
  id: string;
  kind: string;
  detail: Record<string, unknown>;
}

export interface ReviewCitation {
  filename: string;
  page: number | null;
  quote: string;
}

export interface ReviewItem {
  id: string;
  kind: "mcq" | "guide_section";
  module_type: string;
  position: number;
  content: Record<string, unknown>;
  tier: Tier;
  status: "draft" | "flagged" | "approved";
  version: number;
  gap_filled: boolean;
  unit_position: number;
  unit_title: string;
  flags: ReviewFlag[];
  citations: ReviewCitation[];
  // File names for chunks that flags point at (source_overlap).
  flagSources: Record<string, string>;
}

export async function getReviewSummary(sql: Sql, ownerId: string, courseId: string) {
  const course = await getOwnedCourse(sql, ownerId, courseId);
  if (!course) return null;
  const [units, flagKinds] = await Promise.all([
    sql<{ id: string; position: number; title: string; flagged: number; draft: number; approved: number }[]>`
      select u.id, u.position, u.title,
        count(*) filter (where i.status = 'flagged')::int as flagged,
        count(*) filter (where i.status = 'draft')::int as draft,
        count(*) filter (where i.status = 'approved')::int as approved
      from units u left join items i on i.unit_id = u.id
      where u.course_id = ${courseId} group by u.id order by u.position`,
    sql<{ kind: string; n: number }[]>`
      select f.kind, count(*)::int as n from flags f
      join items i on i.id = f.item_id join modules m on m.id = i.module_id
      where m.course_id = ${courseId} and f.status = 'open' group by f.kind order by f.kind`,
  ]);
  const totals = units.reduce(
    (t, u) => ({ flagged: t.flagged + u.flagged, draft: t.draft + u.draft, approved: t.approved + u.approved }),
    { flagged: 0, draft: 0, approved: 0 },
  );
  const openFlags = flagKinds.reduce((n, f) => n + f.n, 0);
  const items = totals.flagged + totals.draft + totals.approved;
  const publishBlocker =
    items === 0
      ? "Nothing has been generated yet."
      : openFlags > 0 || totals.flagged > 0
        ? `${openFlags} open flag${openFlags === 1 ? "" : "s"} to clear first.`
        : totals.draft > 0
          ? `${totals.draft} item${totals.draft === 1 ? "" : "s"} still to approve.`
          : null;
  return { course, units, totals, flagKinds, openFlags, publishBlocker };
}

export async function listReviewItems(
  sql: Sql,
  ownerId: string,
  courseId: string,
  filter: { status?: ReviewStatus; unitPosition?: number; limit?: number } = {},
): Promise<ReviewItem[]> {
  const status = filter.status ?? "all";
  const rows = await sql<Omit<ReviewItem, "flags" | "citations" | "flagSources">[]>`
    select i.id, i.kind, m.type as module_type, i.position, i.content, i.tier, i.status, i.version, i.gap_filled,
      u.position as unit_position, u.title as unit_title
    from items i
    join modules m on m.id = i.module_id
    join courses c on c.id = m.course_id
    join units u on u.id = i.unit_id
    where c.id = ${courseId} and c.owner_id = ${ownerId}
      ${status === "all" ? sql`` : sql`and i.status = ${status}`}
      ${filter.unitPosition ? sql`and u.position = ${filter.unitPosition}` : sql``}
    order by u.position, m.type, i.position
    limit ${filter.limit ?? 200}`;
  return attachDetails(sql, rows);
}

export async function getReviewItem(sql: Sql, ownerId: string, itemId: string): Promise<(ReviewItem & { course_id: string; versions: { version: number; created_at: Date; content: Record<string, unknown> }[] }) | null> {
  const [row] = await sql<(Omit<ReviewItem, "flags" | "citations" | "flagSources"> & { course_id: string })[]>`
    select i.id, i.kind, m.type as module_type, i.position, i.content, i.tier, i.status, i.version, i.gap_filled,
      u.position as unit_position, u.title as unit_title, c.id as course_id
    from items i join modules m on m.id = i.module_id join courses c on c.id = m.course_id join units u on u.id = i.unit_id
    where i.id = ${itemId} and c.owner_id = ${ownerId}`;
  if (!row) return null;
  const [item] = await attachDetails(sql, [row]);
  const versions = await sql<{ version: number; created_at: Date; content: Record<string, unknown> }[]>`
    select version, created_at, content from item_versions where item_id = ${itemId} order by version desc`;
  return { ...item, course_id: row.course_id, versions };
}

async function attachDetails<T extends Omit<ReviewItem, "flags" | "citations" | "flagSources">>(sql: Sql, rows: T[]): Promise<(T & ReviewItem)[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [flags, citations] = await Promise.all([
    sql<(ReviewFlag & { item_id: string })[]>`
      select id, item_id, kind, detail from flags where item_id in ${sql(ids)} and status = 'open' order by kind`,
    sql<(ReviewCitation & { item_id: string })[]>`
      select ic.item_id, f.filename, c.page,
        substr(c.text, coalesce(ic.quote_start, 0) + 1, least(coalesce(ic.quote_end - ic.quote_start, 200), 400)) as quote
      from item_citations ic join source_chunks c on c.id = ic.chunk_id join source_files f on f.id = c.file_id
      where ic.item_id in ${sql(ids)}`,
  ]);
  const chunkIds = [...new Set(flags.map((f) => f.detail.chunkId).filter((id): id is string => typeof id === "string"))];
  const sources = chunkIds.length
    ? await sql<{ id: string; filename: string }[]>`
        select c.id, f.filename from source_chunks c join source_files f on f.id = c.file_id where c.id in ${sql(chunkIds)}`
    : [];
  const flagSources = Object.fromEntries(sources.map((s) => [s.id, s.filename]));
  return rows.map((row) => ({
    ...row,
    flags: flags.filter((f) => f.item_id === row.id).map(({ id, kind, detail }) => ({ id, kind, detail })),
    citations: citations.filter((c) => c.item_id === row.id).map(({ filename, page, quote }) => ({ filename, page, quote })),
    flagSources,
  }));
}

// --- Decisions ---------------------------------------------------------------

interface LockedItem {
  id: string;
  kind: string;
  content: Record<string, unknown>;
  version: number;
  status: string;
  course_id: string;
  unit_id: string;
  unit_position: number;
}

async function lockItem(tx: Tx, ownerId: string, itemId: string): Promise<LockedItem> {
  const [item] = await tx<LockedItem[]>`
    select i.id, i.kind, i.content, i.version, i.status, c.id as course_id, i.unit_id, u.position as unit_position
    from items i join modules m on m.id = i.module_id join courses c on c.id = m.course_id join units u on u.id = i.unit_id
    where i.id = ${itemId} and c.owner_id = ${ownerId}
    for update of i`;
  if (!item) throw new ReviewRefused("Item not found");
  const [course] = await tx<{ status: string }[]>`select status from courses where id = ${item.course_id}`;
  if (course.status === "generating") throw new ReviewRefused("Wait for generation to finish before reviewing");
  return item;
}

async function resolveFlags(tx: Tx, ownerId: string, itemId: string, resolution: "approve" | "edit" | "regenerate" | "rollback") {
  await tx`update flags set status = 'resolved', resolution = ${resolution}, resolved_by = ${ownerId}, resolved_at = now()
    where item_id = ${itemId} and status = 'open'`;
}

// Keeps the current content as a numbered version, then replaces it.
async function writeVersion(tx: Tx, item: LockedItem, content: Record<string, unknown>, status: "draft" | "flagged" | "approved") {
  await tx`insert into item_versions (item_id, version, content) values (${item.id}, ${item.version}, ${tx.json(item.content as never)})`;
  await tx`update items set content = ${tx.json(content as never)}, version = ${item.version + 1}, status = ${status} where id = ${item.id}`;
  return item.version + 1;
}

// Ready once every item is approved; never moves a course out of
// generating or published.
async function syncCourseStatus(tx: Tx, courseId: string) {
  await tx`
    update courses c set status = case
      when not exists (select 1 from items i join modules m on m.id = i.module_id where m.course_id = c.id) then 'draft'::course_status
      when exists (select 1 from items i join modules m on m.id = i.module_id where m.course_id = c.id and i.status <> 'approved') then 'needs_review'::course_status
      else 'ready'::course_status end
    where c.id = ${courseId} and c.status not in ('generating', 'published')`;
}

export async function approveItem(sql: Sql, ownerId: string, itemId: string) {
  await sql.begin(async (tx) => {
    const item = await lockItem(tx, ownerId, itemId);
    await resolveFlags(tx, ownerId, itemId, "approve");
    await tx`update items set status = 'approved' where id = ${item.id}`;
    await syncCourseStatus(tx, item.course_id);
  });
}

// Approves a unit's unflagged drafts in one go. Flagged items still need a
// decision each.
export async function approveUnitDrafts(sql: Sql, ownerId: string, courseId: string, unitPosition: number): Promise<number> {
  return sql.begin(async (tx) => {
    const [course] = await tx<{ status: string }[]>`select status from courses where id = ${courseId} and owner_id = ${ownerId} for update`;
    if (!course) throw new ReviewRefused("Course not found");
    if (course.status === "generating") throw new ReviewRefused("Wait for generation to finish before reviewing");
    const approved = await tx`
      update items i set status = 'approved' from units u
      where u.id = i.unit_id and u.course_id = ${courseId} and u.position = ${unitPosition} and i.status = 'draft'
        and not exists (select 1 from flags f where f.item_id = i.id and f.status = 'open')
      returning i.id`;
    await syncCourseStatus(tx, courseId);
    return approved.length;
  });
}

export async function setItemTier(sql: Sql, ownerId: string, itemId: string, tier: "free" | "pro") {
  const [row] = await sql`
    update items i set tier = ${tier} from modules m, courses c
    where i.id = ${itemId} and m.id = i.module_id and c.id = m.course_id and c.owner_id = ${ownerId}
    returning i.id`;
  if (!row) throw new ReviewRefused("Item not found");
}

// Fields the owner may change; citations, ids and markers stay as generated.
const LOCKED_FIELDS = new Set(["kind", "section", "citations", "gap_filled", "objective_ids"]);

export function validateEdit(kind: string, current: Record<string, unknown>, changes: Record<string, unknown>) {
  const editable = Object.fromEntries(Object.entries(changes).filter(([key]) => !LOCKED_FIELDS.has(key) && key in current));
  const content = { ...current, ...editable };
  if (kind === "mcq") {
    const parsed = mcqSchema.safeParse(content);
    if (!parsed.success) throw new ReviewRefused(`Check the question: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    const citationIds = new Set(parsed.data.citations.map((c) => c.chunk_id));
    const problems = validateMcq(parsed.data, citationIds);
    if (problems.length) throw new ReviewRefused(`Check the question: ${problems.join("; ")}`);
    return parsed.data as Record<string, unknown>;
  }
  const section = String(current.section ?? "");
  const schema = guideSectionSchema(section);
  if (!schema) throw new ReviewRefused(`Unknown guide section ${section}`);
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(content).filter(([key]) => key !== "section")));
  if (!parsed.success) throw new ReviewRefused(`Check the section: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  return { section, ...(parsed.data as Record<string, unknown>) };
}

// Saves the owner's edit as a new version. The owner's edit counts as
// approval, except that an edit copying a source too closely is flagged.
export async function editItem(sql: Sql, ownerId: string, itemId: string, changes: Record<string, unknown>) {
  const peek = await peekItem(sql, ownerId, itemId);
  const ctx = await loadJobContext(sql, peek.course_id);
  return sql.begin(async (tx) => {
    const item = await lockItem(tx, ownerId, itemId);
    const content = validateEdit(item.kind, item.content, changes);
    const overlap = checkOverlap(visibleText(content), ctx.all);
    await resolveFlags(tx, ownerId, itemId, "edit");
    const version = await writeVersion(tx, item, content, overlap ? "flagged" : "approved");
    if (overlap) {
      await tx`insert into flags (item_id, item_version, kind, detail)
        values (${item.id}, ${version}, ${overlap.kind}, ${tx.json(storedFlagDetail(ctx, overlap) as never)})`;
    }
    await regroundCitations(tx, ctx, item.id, content);
    await syncCourseStatus(tx, item.course_id);
    return { flagged: Boolean(overlap) };
  });
}

// Restores an earlier version as a new version, waiting for approval again.
export async function rollbackItem(sql: Sql, ownerId: string, itemId: string, toVersion: number) {
  const peek = await peekItem(sql, ownerId, itemId);
  const ctx = await loadJobContext(sql, peek.course_id);
  await sql.begin(async (tx) => {
    const item = await lockItem(tx, ownerId, itemId);
    const [old] = await tx<{ content: Record<string, unknown> }[]>`
      select content from item_versions where item_id = ${itemId} and version = ${toVersion}`;
    if (!old) throw new ReviewRefused(`Version ${toVersion} not found`);
    await resolveFlags(tx, ownerId, itemId, "rollback");
    await writeVersion(tx, item, old.content, "draft");
    await regroundCitations(tx, ctx, item.id, old.content);
    await syncCourseStatus(tx, item.course_id);
  });
}

// Drafts a fresh practice question in place of this one and runs the full
// checks on it. The old question is kept as a version.
export async function regenerateItem(sql: Sql, llm: Llm, ownerId: string, itemId: string) {
  const peek = await peekItem(sql, ownerId, itemId);
  if (peek.kind !== "mcq") throw new ReviewRefused("Only practice questions can be regenerated so far; edit guide sections instead");
  const ctx = await loadJobContext(sql, peek.course_id);
  const [unit] = await sql<{ position: number; title: string; objectives: string[] }[]>`
    select position, title, objectives from units where id = ${peek.unit_id}`;
  const result = await regenerateQuestion(
    llm,
    {
      course: { title: ctx.course.title, level: ctx.course.level, alignment: ctx.course.alignment ?? "", sourceMode: ctx.course.source_mode },
      unit,
      pack: buildContextPack(unit, ctx.draftable),
      allChunks: ctx.all,
    },
    peek.content as unknown as Mcq,
  );
  if (!result.item) throw new ReviewRefused(`Couldn't write a new question: ${result.failure}`);
  const generated = result.item;

  return sql.begin(async (tx) => {
    const item = await lockItem(tx, ownerId, itemId);
    if (item.version !== peek.version) throw new ReviewRefused("This question changed while regenerating; try again");
    await resolveFlags(tx, ownerId, itemId, "regenerate");
    const version = await writeVersion(tx, item, generated.content as unknown as Record<string, unknown>, generated.flags.length ? "flagged" : "draft");
    await tx`update items set gap_filled = ${generated.content.gap_filled} where id = ${item.id}`;
    await tx`delete from item_citations where item_id = ${item.id}`;
    for (const citation of generated.citations) {
      const chunkId = ctx.chunkUuid.get(citation.chunk_id);
      if (!chunkId) continue;
      await tx`insert into item_citations (item_id, chunk_id, quote_start, quote_end)
        values (${item.id}, ${chunkId}, ${citation.quoteStart}, ${citation.quoteEnd}) on conflict do nothing`;
    }
    for (const flag of generated.flags) {
      await tx`insert into flags (item_id, item_version, kind, detail)
        values (${item.id}, ${version}, ${flag.kind}, ${tx.json(storedFlagDetail(ctx, flag) as never)})`;
    }
    await syncCourseStatus(tx, item.course_id);
    return { flags: generated.flags.map((f) => f.kind) };
  });
}

async function peekItem(sql: Sql, ownerId: string, itemId: string) {
  const [item] = await sql<{ id: string; kind: string; content: Record<string, unknown>; version: number; course_id: string; unit_id: string }[]>`
    select i.id, i.kind, i.content, i.version, c.id as course_id, i.unit_id
    from items i join modules m on m.id = i.module_id join courses c on c.id = m.course_id
    where i.id = ${itemId} and c.owner_id = ${ownerId}`;
  if (!item) throw new ReviewRefused("Item not found");
  return item;
}

// Rebuilds an item's citation spans from the quotes in its content. Quotes
// that no longer match a source chunk are dropped rather than misattributed.
async function regroundCitations(tx: Tx, ctx: JobContext, itemId: string, content: Record<string, unknown>) {
  if (!Array.isArray(content.citations)) return;
  const byId = new Map(ctx.all.map((c) => [c.id, c]));
  const { resolved } = checkGrounding(content as Parameters<typeof checkGrounding>[0], byId);
  await tx`delete from item_citations where item_id = ${itemId}`;
  for (const citation of resolved) {
    const chunkId = ctx.chunkUuid.get(citation.chunk_id);
    if (!chunkId) continue;
    await tx`insert into item_citations (item_id, chunk_id, quote_start, quote_end)
      values (${itemId}, ${chunkId}, ${citation.quoteStart}, ${citation.quoteEnd}) on conflict do nothing`;
  }
}

// --- Publishing --------------------------------------------------------------

export async function publishCourse(sql: Sql, ownerId: string, courseId: string) {
  await sql.begin(async (tx) => {
    const [course] = await tx<{ status: string }[]>`select status from courses where id = ${courseId} and owner_id = ${ownerId} for update`;
    if (!course) throw new ReviewRefused("Course not found");
    if (course.status === "published") return;
    if (course.status !== "ready") {
      const [counts] = await tx<{ items: number; pending: number; flags: number }[]>`
        select count(*)::int as items,
          count(*) filter (where i.status <> 'approved')::int as pending,
          (select count(*)::int from flags f join items fi on fi.id = f.item_id join modules fm on fm.id = fi.module_id
            where fm.course_id = ${courseId} and f.status = 'open') as flags
        from items i join modules m on m.id = i.module_id where m.course_id = ${courseId}`;
      if (counts.items === 0) throw new ReviewRefused("Nothing to publish yet");
      if (counts.flags > 0) throw new ReviewRefused(`Clear ${counts.flags} open flag${counts.flags === 1 ? "" : "s"} first`);
      if (counts.pending > 0) throw new ReviewRefused(`Approve the remaining ${counts.pending} item${counts.pending === 1 ? "" : "s"} first`);
      throw new ReviewRefused("The course isn't ready to publish");
    }
    await tx`update courses set status = 'published', published_at = now() where id = ${courseId}`;
  });
}

export async function unpublishCourse(sql: Sql, ownerId: string, courseId: string) {
  await sql.begin(async (tx) => {
    const [course] = await tx`update courses set status = 'needs_review', published_at = null
      where id = ${courseId} and owner_id = ${ownerId} and status = 'published' returning id`;
    if (course) await syncCourseStatus(tx, courseId);
  });
}

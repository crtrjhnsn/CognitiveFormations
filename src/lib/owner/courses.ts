import type { Sql } from "@/lib/db";
import type { Tier } from "@/lib/access";
import { getCourse } from "@/lib/courses";

// Owner-side course data. Every function takes the owner's id and only
// touches that owner's courses.

export const MODULE_TYPES = ["guide", "cards", "formula", "practice", "frq", "interview", "exam", "pdf", "cram"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

// Modules the generator drafts today; the rest arrive with later phases.
export const GENERATED_MODULES: ModuleType[] = ["guide", "practice"];

export const ATTESTATION_TEXT_VERSION = "2026-10-11";
export const ATTESTATION_TEXT =
  "I own these source files or have permission to use them to make a paid course, including with AI tools. They contain no College Board material.";

export interface CourseRow {
  id: string;
  slug: string;
  title: string;
  level: string;
  subject: string;
  alignment: string | null;
  status: string;
  source_mode: "materials_first" | "materials_only";
  outline_version: number;
}

export async function listCourses(sql: Sql, ownerId: string) {
  return sql<(CourseRow & { open_flags: number })[]>`
    select c.*, (
      select count(*)::int from flags f
      join items i on i.id = f.item_id join modules m on m.id = i.module_id
      where m.course_id = c.id and f.status = 'open'
    ) as open_flags
    from courses c where c.owner_id = ${ownerId} order by c.created_at`;
}

export async function getOwnedCourse(sql: Sql, ownerId: string, courseId: string): Promise<CourseRow | null> {
  const [course] = await sql<CourseRow[]>`select * from courses where id = ${courseId} and owner_id = ${ownerId}`;
  return course ?? null;
}

// Creates a course from its checked-in config (courses/<slug>/course.json):
// title, outline and module tiers. Returns the existing course if the slug
// is already set up.
export async function seedCourseFromConfig(sql: Sql, ownerId: string, slug: string): Promise<string> {
  const config = getCourse(slug);
  if (!config) throw new Error(`No course config for ${slug}`);
  const [existing] = await sql<{ id: string; owner_id: string }[]>`select id, owner_id from courses where slug = ${slug}`;
  if (existing) {
    if (existing.owner_id !== ownerId) throw new Error(`Course ${slug} belongs to another owner`);
    return existing.id;
  }

  return sql.begin(async (tx) => {
    const [course] = await tx<{ id: string }[]>`
      insert into courses (slug, title, level, subject, alignment, source_mode, owner_id)
      values (${config.slug}, ${config.title}, ${config.level}, ${config.subject}, ${config.alignment}, ${config.source_mode}, ${ownerId})
      returning id`;
    for (const unit of config.units) {
      await tx`insert into units (course_id, position, title, objectives)
        values (${course.id}, ${unit.position}, ${unit.title}, ${unit.objectives})`;
    }
    for (const type of MODULE_TYPES) {
      const tier = config.modules[type];
      await tx`insert into modules (course_id, type, enabled, tier)
        values (${course.id}, ${type}, ${tier !== undefined}, ${tier ?? "pro"})`;
    }
    return course.id;
  });
}

export interface UnitInput {
  title: string;
  objectives: string[];
}

// Saving the outline is the owner's confirmation; generation refuses to
// start until it has happened at least once (outline_version > 0).
export async function saveOutline(sql: Sql, ownerId: string, courseId: string, units: UnitInput[]) {
  const cleaned = units
    .map((u) => ({ title: u.title.trim(), objectives: u.objectives.map((o) => o.trim()).filter(Boolean) }))
    .filter((u) => u.title);
  if (cleaned.length === 0) throw new Error("The outline needs at least one unit");
  if (cleaned.some((u) => u.objectives.length === 0)) throw new Error("Every unit needs at least one objective");

  await sql.begin(async (tx) => {
    const [course] = await tx`select id from courses where id = ${courseId} and owner_id = ${ownerId} for update`;
    if (!course) throw new Error("Course not found");
    const existing = await tx<{ id: string; position: number }[]>`select id, position from units where course_id = ${courseId}`;
    // Update in place by position so generated items keep their unit.
    for (const [i, unit] of cleaned.entries()) {
      const position = i + 1;
      const match = existing.find((u) => u.position === position);
      if (match) await tx`update units set title = ${unit.title}, objectives = ${unit.objectives} where id = ${match.id}`;
      else await tx`insert into units (course_id, position, title, objectives) values (${courseId}, ${position}, ${unit.title}, ${unit.objectives})`;
    }
    await tx`delete from units where course_id = ${courseId} and position > ${cleaned.length}`;
    await tx`update courses set outline_version = outline_version + 1 where id = ${courseId}`;
  });
}

export async function saveModules(
  sql: Sql,
  ownerId: string,
  courseId: string,
  modules: { type: ModuleType; enabled: boolean; tier: Tier }[],
) {
  await sql.begin(async (tx) => {
    const [course] = await tx`select id from courses where id = ${courseId} and owner_id = ${ownerId}`;
    if (!course) throw new Error("Course not found");
    for (const m of modules) {
      await tx`update modules set enabled = ${m.enabled}, tier = ${m.tier} where course_id = ${courseId} and type = ${m.type}`;
    }
  });
}

export async function setSourceMode(sql: Sql, ownerId: string, courseId: string, mode: CourseRow["source_mode"]) {
  await sql`update courses set source_mode = ${mode} where id = ${courseId} and owner_id = ${ownerId}`;
}

export async function recordAttestation(sql: Sql, ownerId: string, courseId: string, ip: string | null) {
  const course = await getOwnedCourse(sql, ownerId, courseId);
  if (!course) throw new Error("Course not found");
  await sql`insert into rights_attestations (course_id, owner_id, text_version, ip)
    values (${courseId}, ${ownerId}, ${ATTESTATION_TEXT_VERSION}, ${ip})`;
}

export async function getCourseSetup(sql: Sql, ownerId: string, courseId: string) {
  const course = await getOwnedCourse(sql, ownerId, courseId);
  if (!course) return null;
  const [units, modules, files, attestations, jobs] = await Promise.all([
    sql<{ id: string; position: number; title: string; objectives: string[] }[]>`
      select id, position, title, objectives from units where course_id = ${courseId} order by position`,
    sql<{ type: ModuleType; enabled: boolean; tier: Tier }[]>`
      select type, enabled, tier from modules where course_id = ${courseId} order by type`,
    sql<{ id: string; filename: string; role: string; license: string | null; status: string; error: string | null; chunks: number }[]>`
      select f.id, f.filename, f.role, f.license, f.status, f.error,
        (select count(*)::int from source_chunks c where c.file_id = f.id) as chunks
      from source_files f where f.course_id = ${courseId} order by f.created_at`,
    sql<{ text_version: string; signed_at: Date }[]>`
      select text_version, signed_at from rights_attestations
      where course_id = ${courseId} order by signed_at desc limit 1`,
    sql<{ id: string; status: string }[]>`
      select id, status from generation_jobs where course_id = ${courseId} order by created_at desc limit 1`,
  ]);
  return { course, units, modules, files, attestation: attestations[0] ?? null, latestJob: jobs[0] ?? null };
}

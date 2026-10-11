import { canViewItem, type Entitlement, type ResolvedTier } from "@/lib/access";
import type { Sql } from "@/lib/db";

// Student-facing reads of published courses. Only approved items in enabled
// modules of published courses are ever returned, and locked or answer-key
// fields are removed here, before anything reaches a page.

export interface PublishedUnit {
  position: number;
  title: string;
  objectives: string[];
  guideParts: number;
  questions: number;
  cards: number;
}

export async function getPublishedCourse(sql: Sql, slug: string) {
  const [course] = await sql<{ id: string; slug: string; title: string; level: string }[]>`
    select id, slug, title, level from courses where slug = ${slug} and status = 'published'`;
  if (!course) return null;
  const units = await sql<PublishedUnit[]>`
    select u.position, u.title, u.objectives,
      count(i.id) filter (where i.kind = 'guide_section')::int as "guideParts",
      count(i.id) filter (where i.kind = 'mcq')::int as questions,
      count(i.id) filter (where i.kind = 'card')::int as cards
    from units u
    left join items i on i.unit_id = u.id and i.status = 'approved'
      and exists (select 1 from modules m where m.id = i.module_id and m.enabled)
    where u.course_id = ${course.id}
    group by u.id order by u.position`;
  const [exam] = await sql<{ enabled: boolean }[]>`
    select enabled from modules where course_id = ${course.id} and type = 'exam'`;
  return { ...course, units, hasExam: Boolean(exam?.enabled) };
}

export type StudentItem =
  | { id: string; kind: "guide_section"; tier: ResolvedTier; locked: false; content: Record<string, unknown> }
  | { id: string; kind: "mcq"; tier: ResolvedTier; locked: false; content: { stem: string; choices: string[]; difficulty: string } }
  | { id: string; kind: "guide_section" | "mcq"; tier: ResolvedTier; locked: true; label: string };

const PRIVATE_FIELDS = ["citations", "gap_filled", "objective_ids", "kind"];

// Strips what a student never sees (citations, review markers) and what this
// viewer hasn't paid for. Practice answers are never included: the page asks
// the server to check an answer instead.
export function presentItem(
  item: { id: string; kind: string; tier: ResolvedTier; content: Record<string, unknown> },
  entitlement: Entitlement | null,
  now: Date = new Date(),
): StudentItem {
  const kind = item.kind === "mcq" ? "mcq" : "guide_section";
  if (!canViewItem(item.tier, entitlement, now)) {
    const label = kind === "mcq" ? "Practice question" : String(item.content.section ?? "").replace(/\[\d+\]$/, "");
    return { id: item.id, kind, tier: item.tier, locked: true, label };
  }
  if (kind === "mcq") {
    const c = item.content;
    return {
      id: item.id,
      kind,
      tier: item.tier,
      locked: false,
      content: { stem: String(c.stem), choices: (c.choices as string[]) ?? [], difficulty: String(c.difficulty) },
    };
  }
  const content = Object.fromEntries(Object.entries(item.content).filter(([key]) => !PRIVATE_FIELDS.includes(key)));
  return { id: item.id, kind, tier: item.tier, locked: false, content };
}

export async function getPublishedUnit(sql: Sql, slug: string, position: number, entitlement: Entitlement | null) {
  const [unit] = await sql<{ id: string; course_id: string; course_title: string; position: number; title: string; objectives: string[] }[]>`
    select u.id, u.course_id, c.title as course_title, u.position, u.title, u.objectives
    from units u join courses c on c.id = u.course_id
    where c.slug = ${slug} and c.status = 'published' and u.position = ${position}`;
  if (!unit) return null;
  const items = await sql<{ id: string; kind: string; tier: ResolvedTier; content: Record<string, unknown> }[]>`
    select i.id, i.kind, i.tier, i.content from items i join modules m on m.id = i.module_id
    where i.unit_id = ${unit.id} and i.status = 'approved' and m.enabled
    order by i.kind desc, i.position`;
  const presented = items.filter((item) => item.kind !== "card").map((item) => presentItem(item, entitlement));
  return {
    unit,
    guide: presented.filter((i) => i.kind === "guide_section"),
    practice: presented.filter((i) => i.kind === "mcq"),
    // Flashcards are studied on their own page; the unit page only links there.
    cards: items.filter((i) => i.kind === "card").length,
  };
}

// Checks a practice answer server-side, so keys never reach a browser that
// isn't allowed to see them. Records the attempt for signed-in students.
export async function checkPracticeAnswer(
  sql: Sql,
  itemId: string,
  choice: number,
  viewer: { userId: string | null; entitlement: Entitlement | null },
): Promise<{ locked: true } | { locked: false; correct: boolean; answerIndex: number; explanation: string } | null> {
  const [item] = await sql<{ id: string; tier: ResolvedTier; content: { answer_index: number; explanation: string; choices: string[] } }[]>`
    select i.id, i.tier, i.content from items i join modules m on m.id = i.module_id join courses c on c.id = m.course_id
    where i.id = ${itemId} and i.kind = 'mcq' and i.status = 'approved' and m.enabled and c.status = 'published'`;
  if (!item) return null;
  if (!canViewItem(item.tier, viewer.entitlement)) return { locked: true };
  if (!Number.isInteger(choice) || choice < 0 || choice >= item.content.choices.length) return null;
  const correct = choice === item.content.answer_index;
  if (viewer.userId) {
    await sql`insert into attempts (user_id, item_id, answer, correct) values (${viewer.userId}, ${item.id}, ${sql.json({ choice })}, ${correct})`;
  }
  return { locked: false, correct, answerIndex: item.content.answer_index, explanation: item.content.explanation };
}

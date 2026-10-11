import { canViewItem, resolveTier, type Entitlement, type ResolvedTier, type Tier } from "@/lib/access";
import type { Sql } from "@/lib/db";
import { NEW_CARD, schedule, type Rating } from "@/lib/srs";

// Flashcard reviews, practice exams and progress for students. Like
// catalog.ts, only approved items in enabled modules of published courses
// are read, and access is checked per item.

export interface StudyCard {
  id: string;
  unitPosition: number;
  front: string;
  back: string;
  isNew: boolean;
}

const NEW_CARDS_PER_SESSION = 10;

// Cards due now for this student, oldest first, then a few new ones. Pass a
// unit to study just that unit (new cards included).
export async function getStudyCards(
  sql: Sql,
  slug: string,
  viewer: { userId: string; entitlement: Entitlement | null },
  options: { unitPosition?: number; limit?: number } = {},
): Promise<StudyCard[]> {
  const rows = await sql<{ id: string; tier: ResolvedTier; unit_position: number; content: { front: string; back: string }; due_at: Date | null }[]>`
    select i.id, i.tier, u.position as unit_position, i.content, r.due_at
    from items i
    join modules m on m.id = i.module_id and m.enabled and m.type = 'cards'
    join courses c on c.id = m.course_id and c.status = 'published' and c.slug = ${slug}
    join units u on u.id = i.unit_id
    left join card_reviews r on r.item_id = i.id and r.user_id = ${viewer.userId}
    where i.kind = 'card' and i.status = 'approved'
      ${options.unitPosition ? sql`and u.position = ${options.unitPosition}` : sql``}
      and (r.due_at is null or r.due_at <= now())
    order by r.due_at asc nulls last, u.position, i.position`;
  const viewable = rows.filter((r) => canViewItem(r.tier, viewer.entitlement));
  const due = viewable.filter((r) => r.due_at !== null);
  const fresh = viewable.filter((r) => r.due_at === null).slice(0, NEW_CARDS_PER_SESSION);
  return [...due, ...fresh].slice(0, options.limit ?? 50).map((r) => ({
    id: r.id,
    unitPosition: r.unit_position,
    front: r.content.front,
    back: r.content.back,
    isNew: r.due_at === null,
  }));
}

export async function reviewCard(
  sql: Sql,
  itemId: string,
  rating: Rating,
  viewer: { userId: string; entitlement: Entitlement | null },
): Promise<{ dueAt: Date } | null> {
  const [item] = await sql<{ id: string; tier: ResolvedTier }[]>`
    select i.id, i.tier from items i
    join modules m on m.id = i.module_id and m.enabled
    join courses c on c.id = m.course_id and c.status = 'published'
    where i.id = ${itemId} and i.kind = 'card' and i.status = 'approved'`;
  if (!item || !canViewItem(item.tier, viewer.entitlement)) return null;
  return sql.begin(async (tx) => {
    const [row] = await tx<{ interval_days: number; ease: number; reps: number; lapses: number }[]>`
      select interval_days, ease, reps, lapses from card_reviews where user_id = ${viewer.userId} and item_id = ${itemId} for update`;
    const next = schedule(
      row ? { intervalDays: row.interval_days, ease: row.ease, reps: row.reps, lapses: row.lapses } : NEW_CARD,
      rating,
    );
    await tx`
      insert into card_reviews (user_id, item_id, due_at, interval_days, ease, reps, lapses, last_reviewed_at)
      values (${viewer.userId}, ${itemId}, ${next.dueAt}, ${next.intervalDays}, ${next.ease}, ${next.reps}, ${next.lapses}, now())
      on conflict (user_id, item_id) do update set due_at = excluded.due_at, interval_days = excluded.interval_days,
        ease = excluded.ease, reps = excluded.reps, lapses = excluded.lapses, last_reviewed_at = now()`;
    return { dueAt: next.dueAt };
  });
}

// --- Practice exams ----------------------------------------------------------

export interface ExamQuestion {
  id: string;
  unitPosition: number;
  stem: string;
  choices: string[];
}

export type ExamAccess = "open" | "locked" | "off";

async function examModule(sql: Sql, slug: string) {
  const [row] = await sql<{ enabled: boolean; tier: Tier }[]>`
    select m.enabled, m.tier from modules m join courses c on c.id = m.course_id
    where c.slug = ${slug} and c.status = 'published' and m.type = 'exam'`;
  return row ?? null;
}

// A practice exam drawn from the course's approved practice questions,
// spread evenly across units. Only questions this viewer may see are used.
export async function buildExam(
  sql: Sql,
  slug: string,
  entitlement: Entitlement | null,
  size = 20,
  random: () => number = Math.random,
): Promise<{ access: ExamAccess; questions: ExamQuestion[] }> {
  const mod = await examModule(sql, slug);
  if (!mod?.enabled) return { access: "off", questions: [] };
  // The exam spans units, so a Preview tier counts as Pro here.
  if (!canViewItem(resolveTier(mod.tier, null), entitlement)) return { access: "locked", questions: [] };

  type Question = Awaited<ReturnType<typeof practicePool>>[number];
  const pool: Question[] = [...(await practicePool(sql, slug))];
  const byUnit = new Map<number, Question[]>();
  for (const q of pool.filter((q) => canViewItem(q.tier, entitlement))) {
    byUnit.set(q.unit_position, [...(byUnit.get(q.unit_position) ?? []), q]);
  }
  for (const list of byUnit.values()) shuffle(list, random);
  const picked: Question[] = [];
  const lists = [...byUnit.entries()].sort(([a], [b]) => a - b).map(([, list]) => list);
  while (picked.length < size && lists.some((l) => l.length)) {
    for (const list of lists) {
      const next = list.shift();
      if (next && picked.length < size) picked.push(next);
    }
  }
  shuffle(picked, random);
  return {
    access: "open",
    questions: picked.map((q) => ({ id: q.id, unitPosition: q.unit_position, stem: q.content.stem, choices: q.content.choices })),
  };
}

async function practicePool(sql: Sql, slug: string, ids?: string[]) {
  return sql<{ id: string; tier: ResolvedTier; unit_position: number; content: { stem: string; choices: string[]; answer_index: number; explanation: string } }[]>`
    select i.id, i.tier, u.position as unit_position, i.content
    from items i
    join modules m on m.id = i.module_id and m.enabled and m.type = 'practice'
    join courses c on c.id = m.course_id and c.status = 'published' and c.slug = ${slug}
    join units u on u.id = i.unit_id
    where i.kind = 'mcq' and i.status = 'approved' ${ids ? sql`and i.id in ${sql(ids)}` : sql``}`;
}

function shuffle<T>(list: T[], random: () => number) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

export interface ExamResult {
  score: number;
  total: number;
  byUnit: { unitPosition: number; correct: number; total: number }[];
  questions: { id: string; choice: number | null; correct: boolean; answerIndex: number; explanation: string }[];
}

// Scores a submitted exam on the server and records each answer.
// Questions left blank count as wrong and aren't recorded as attempts.
export async function scoreExam(
  sql: Sql,
  slug: string,
  answers: { id: string; choice: number | null }[],
  viewer: { userId: string | null; entitlement: Entitlement | null },
): Promise<ExamResult | null> {
  if (answers.length === 0 || answers.length > 100) return null;
  const mod = await examModule(sql, slug);
  if (!mod?.enabled || !canViewItem(resolveTier(mod.tier, null), viewer.entitlement)) return null;
  const pool = new Map((await practicePool(sql, slug, answers.map((a) => a.id))).map((q) => [q.id, q]));

  const questions: ExamResult["questions"] = [];
  const units = new Map<number, { correct: number; total: number }>();
  for (const answer of answers) {
    const q = pool.get(answer.id);
    if (!q || !canViewItem(q.tier, viewer.entitlement)) return null;
    const valid = answer.choice !== null && Number.isInteger(answer.choice) && answer.choice >= 0 && answer.choice < q.content.choices.length;
    const correct = valid && answer.choice === q.content.answer_index;
    questions.push({ id: q.id, choice: valid ? answer.choice : null, correct, answerIndex: q.content.answer_index, explanation: q.content.explanation });
    const u = units.get(q.unit_position) ?? { correct: 0, total: 0 };
    units.set(q.unit_position, { correct: u.correct + (correct ? 1 : 0), total: u.total + 1 });
  }
  if (viewer.userId) {
    for (const q of questions.filter((q) => q.choice !== null)) {
      await sql`insert into attempts (user_id, item_id, answer, correct)
        values (${viewer.userId}, ${q.id}, ${sql.json({ choice: q.choice, source: "exam" })}, ${q.correct})`;
    }
  }
  return {
    score: questions.filter((q) => q.correct).length,
    total: questions.length,
    byUnit: [...units.entries()].sort(([a], [b]) => a - b).map(([unitPosition, u]) => ({ unitPosition, ...u })),
    questions,
  };
}

// --- Progress ----------------------------------------------------------------

export interface UnitProgress {
  position: number;
  title: string;
  questions: number;
  answered: number;
  // Of the answered questions, how many the student got right last time.
  correct: number;
  cards: number;
  cardsStarted: number;
  cardsDue: number;
}

export async function getProgress(sql: Sql, slug: string, userId: string): Promise<UnitProgress[] | null> {
  const [course] = await sql<{ id: string }[]>`select id from courses where slug = ${slug} and status = 'published'`;
  if (!course) return null;
  return sql<UnitProgress[]>`
    with visible as (
      select i.id, i.kind, i.unit_id from items i join modules m on m.id = i.module_id and m.enabled
      where m.course_id = ${course.id} and i.status = 'approved' and i.kind in ('mcq', 'card')
    ),
    latest as (
      select distinct on (a.item_id) a.item_id, a.correct from attempts a
      join visible v on v.id = a.item_id where a.user_id = ${userId}
      order by a.item_id, a.created_at desc
    )
    select u.position, u.title,
      count(v.id) filter (where v.kind = 'mcq')::int as questions,
      count(l.item_id)::int as answered,
      count(l.item_id) filter (where l.correct)::int as correct,
      count(v.id) filter (where v.kind = 'card')::int as cards,
      count(r.item_id)::int as "cardsStarted",
      count(r.item_id) filter (where r.due_at <= now())::int as "cardsDue"
    from units u
    left join visible v on v.unit_id = u.id
    left join latest l on l.item_id = v.id
    left join card_reviews r on r.item_id = v.id and r.user_id = ${userId}
    where u.course_id = ${course.id}
    group by u.id order by u.position`;
}

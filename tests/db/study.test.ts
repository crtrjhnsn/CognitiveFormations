import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Entitlement } from "@/lib/access";
import { saveModules } from "@/lib/owner/courses";
import { approveItem, listReviewItems, publishCourse } from "@/lib/owner/review";
import { buildExam, getProgress, getStudyCards, reviewCard, scoreExam } from "@/lib/study";
import { createTestDatabase, createUser } from "./harness";
import { seedGeneratedCourse } from "./seed";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const active: Entitlement = { status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000) };

describe.skipIf(!enabled)("flashcards, exams and progress (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let owner: string;
  let student: string;
  let courseId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db.sql, "owner@example.com");
    student = await createUser(db.sql, "student@example.com", "student");
    courseId = await seedGeneratedCourse(db.sql, owner);
    for (const item of await listReviewItems(db.sql, owner, courseId)) await approveItem(db.sql, owner, item.id);
    await publishCourse(db.sql, owner, courseId);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("generates flashcards with the rest of the unit", async () => {
    const cards = (await listReviewItems(db.sql, owner, courseId)).filter((i) => i.kind === "card");
    expect(cards).toHaveLength(2);
    expect(cards[0].citations).toHaveLength(1);
  });

  it("schedules flashcards per student", async () => {
    const viewer = { userId: student, entitlement: null };
    const first = await getStudyCards(db.sql, "ap-biology", viewer);
    expect(first.map((c) => c.isNew)).toEqual([true, true]);
    expect(first[0]).toMatchObject({ front: "Hydrogen bond", unitPosition: 1 });

    const next = await reviewCard(db.sql, first[0].id, "good", viewer);
    expect(next!.dueAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    await reviewCard(db.sql, first[1].id, "again", viewer);
    // "Good" is out for a day; "again" is back in ten minutes, so neither is due now.
    expect(await getStudyCards(db.sql, "ap-biology", viewer)).toEqual([]);

    await db.sql`update card_reviews set due_at = now() - interval '1 minute' where item_id = ${first[1].id}`;
    expect((await getStudyCards(db.sql, "ap-biology", viewer)).map((c) => [c.id, c.isNew])).toEqual([[first[1].id, false]]);
    expect(await reviewCard(db.sql, courseId, "good", viewer)).toBeNull();
  });

  it("locks the Pro exam and builds one spread across units for subscribers", async () => {
    expect(await buildExam(db.sql, "ap-biology", null)).toEqual({ access: "locked", questions: [] });
    const exam = await buildExam(db.sql, "ap-biology", active, 20, () => 0.5);
    expect(exam.access).toBe("open");
    expect(exam.questions).toHaveLength(2);
    expect(JSON.stringify(exam)).not.toContain("answer_index");
  });

  it("scores an exam on the server and records the answers", async () => {
    const { questions } = await buildExam(db.sql, "ap-biology", active);
    const answers = questions.map((q) => ({ id: q.id, choice: 0 }));
    expect(await scoreExam(db.sql, "ap-biology", answers, { userId: student, entitlement: null })).toBeNull();

    const result = await scoreExam(db.sql, "ap-biology", answers, { userId: student, entitlement: active });
    // The fake course's first key is 0; the second (mismatched) key was 2 and approved as is.
    expect(result).toMatchObject({ score: 1, total: 2, byUnit: [{ unitPosition: 1, correct: 1, total: 2 }] });
    expect(await scoreExam(db.sql, "ap-biology", [{ id: courseId, choice: 0 }], { userId: student, entitlement: active })).toBeNull();
  });

  it("sums up progress from the latest attempt per question", async () => {
    const [unit] = (await getProgress(db.sql, "ap-biology", student))!;
    expect(unit).toMatchObject({ position: 1, questions: 2, answered: 2, correct: 1, cards: 2, cardsStarted: 2, cardsDue: 1 });
    expect(await getProgress(db.sql, "nope", student)).toBeNull();
  });

  it("turns the exam off with its module", async () => {
    await saveModules(db.sql, owner, courseId, [{ type: "exam", enabled: false, tier: "pro" }]);
    expect((await buildExam(db.sql, "ap-biology", active)).access).toBe("off");
  });
});

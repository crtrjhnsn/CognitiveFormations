import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Entitlement } from "@/lib/access";
import { checkPracticeAnswer, getPublishedCourse, getPublishedUnit } from "@/lib/catalog";
import { saveModules } from "@/lib/owner/courses";
import { approveItem, listReviewItems, publishCourse, setItemTier } from "@/lib/owner/review";
import { createTestDatabase, createUser } from "./harness";
import { seedGeneratedCourse } from "./seed";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const active: Entitlement = { status: "active", currentPeriodEnd: new Date(Date.now() + 86_400_000) };
const lapsed: Entitlement = { status: "active", currentPeriodEnd: new Date(Date.now() - 1000) };

describe.skipIf(!enabled)("published course and paywall (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let owner: string;
  let student: string;
  let courseId: string;
  let freeQuestion: string;
  let proQuestion: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db.sql, "owner@example.com");
    student = await createUser(db.sql, "student@example.com", "student");
    courseId = await seedGeneratedCourse(db.sql, owner);
    const items = await listReviewItems(db.sql, owner, courseId);
    for (const item of items) await approveItem(db.sql, owner, item.id);
    const questions = items.filter((i) => i.kind === "mcq");
    freeQuestion = questions[0].id; // unit 1 of a preview module resolves to free
    proQuestion = questions[1].id;
    await setItemTier(db.sql, owner, proQuestion, "pro");
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("shows nothing until the course is published", async () => {
    expect(await getPublishedCourse(db.sql, "ap-biology")).toBeNull();
    expect(await getPublishedUnit(db.sql, "ap-biology", 1, active)).toBeNull();
    expect(await checkPracticeAnswer(db.sql, freeQuestion, 0, { userId: null, entitlement: active })).toBeNull();
    await publishCourse(db.sql, owner, courseId);
  });

  it("lists published units with what's in them", async () => {
    const course = await getPublishedCourse(db.sql, "ap-biology");
    expect(course?.units).toEqual([expect.objectContaining({ position: 1, title: "Water", questions: 2, cards: 2 })]);
    expect(course?.hasExam).toBe(true);
    expect(course?.units[0].guideParts).toBeGreaterThan(0);
  });

  it("never sends answer keys, citations or locked content", async () => {
    const unit = await getPublishedUnit(db.sql, "ap-biology", 1, null);
    const json = JSON.stringify(unit);
    expect(json).not.toContain("answer_index");
    expect(json).not.toContain("explanation");
    expect(json).not.toContain("citations");
    expect(json).not.toContain("gap_filled");
    expect(json).not.toContain("A weak attraction"); // flashcards have their own page
    expect(unit!.cards).toBe(2);

    const free = unit!.practice.find((i) => i.id === freeQuestion);
    const pro = unit!.practice.find((i) => i.id === proQuestion);
    expect(free).toMatchObject({ locked: false, content: { stem: expect.any(String) } });
    expect(pro).toEqual({ id: proQuestion, kind: "mcq", tier: "pro", locked: true, label: "Practice question" });
  });

  it("opens Pro items for an active plan only", async () => {
    const paid = await getPublishedUnit(db.sql, "ap-biology", 1, active);
    expect(paid!.practice.every((i) => !i.locked)).toBe(true);
    const expired = await getPublishedUnit(db.sql, "ap-biology", 1, lapsed);
    expect(expired!.practice.find((i) => i.id === proQuestion)?.locked).toBe(true);
  });

  it("checks answers on the server and records signed-in attempts", async () => {
    expect(await checkPracticeAnswer(db.sql, freeQuestion, 0, { userId: student, entitlement: null })).toEqual({
      locked: false,
      correct: true,
      answerIndex: 0,
      explanation: expect.any(String),
    });
    expect(await checkPracticeAnswer(db.sql, freeQuestion, 1, { userId: null, entitlement: null })).toMatchObject({ correct: false });
    expect(await checkPracticeAnswer(db.sql, freeQuestion, 9, { userId: null, entitlement: null })).toBeNull();
    expect(await checkPracticeAnswer(db.sql, proQuestion, 0, { userId: student, entitlement: null })).toEqual({ locked: true });

    const attempts = await db.sql`select correct from attempts where user_id = ${student}`;
    expect(attempts.map((a) => a.correct)).toEqual([true]);
  });

  it("hides items from modules the owner switched off", async () => {
    await saveModules(db.sql, owner, courseId, [{ type: "practice", enabled: false, tier: "preview" }]);
    const unit = await getPublishedUnit(db.sql, "ap-biology", 1, active);
    expect(unit!.practice).toEqual([]);
    expect(await checkPracticeAnswer(db.sql, freeQuestion, 0, { userId: null, entitlement: active })).toBeNull();
  });

  it("records the 13+ answer from sign-up on the new profile", async () => {
    const [user] = await db.sql<{ id: string }[]>`
      insert into auth.users (email, raw_user_meta_data) values ('teen@example.com', ${db.sql.json({ confirmed_13_plus: true })}) returning id`;
    const [kid] = await db.sql<{ id: string }[]>`
      insert into auth.users (email, raw_user_meta_data) values ('nobody@example.com', '{}') returning id`;
    const profiles = await db.sql`select id, confirmed_13_plus, role from profiles where id in (${user.id}, ${kid.id})`;
    expect(profiles.find((p) => p.id === user.id)).toMatchObject({ confirmed_13_plus: true, role: "student" });
    expect(profiles.find((p) => p.id === kid.id)).toMatchObject({ confirmed_13_plus: false });
  });
});

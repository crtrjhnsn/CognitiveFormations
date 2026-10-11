import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAttestation, saveOutline, seedCourseFromConfig } from "@/lib/owner/courses";
import { ingestFile, registerFile } from "@/lib/owner/files";
import { runGenerationJob, startJob } from "@/lib/owner/jobs";
import {
  approveItem,
  approveUnitDrafts,
  editItem,
  getReviewItem,
  getReviewSummary,
  listReviewItems,
  publishCourse,
  regenerateItem,
  ReviewRefused,
  rollbackItem,
  setItemTier,
  unpublishCourse,
} from "@/lib/owner/review";
import { fakeLlm, question } from "../fixtures";
import { createTestDatabase, createUser } from "./harness";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

const COPIED = "Surface tension lets some insects walk across a pond because hydrogen bonds pull surface water molecules inward and together";
const notes = new TextEncoder().encode(
  `# Water\n\nHydrogen bonds hold neighboring water molecules together. Water is polar. ${COPIED}.\n`,
);

describe.skipIf(!enabled)("review queue (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let owner: string;
  let other: string;
  let courseId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db.sql, "owner@example.com");
    other = await createUser(db.sql, "other@example.com");
    courseId = await seedCourseFromConfig(db.sql, owner, "ap-biology");
    await saveOutline(db.sql, owner, courseId, [{ title: "Water", objectives: ["Explain hydrogen bonding"] }]);
    const fileId = await registerFile(db.sql, owner, courseId, {
      storageKey: `${courseId}/notes.md`, filename: "notes.md", mime: "text/markdown", role: "own_notes", license: "own", bytes: notes,
    });
    await ingestFile(db.sql, fileId!, notes);
    await recordAttestation(db.sql, owner, courseId, null);
    const jobId = await startJob(db.sql, owner, courseId);
    const wrongKey = question({ stem: "Which property makes water a good solvent?", answer_index: 2 });
    await runGenerationJob(db.sql, fakeLlm([[question({}), wrongKey]], () => 0).llm, jobId, { questionCount: 2 });
  });
  afterAll(async () => {
    await db?.drop();
  });

  const mcqs = async () => (await listReviewItems(db.sql, owner, courseId)).filter((i) => i.kind === "mcq");

  it("summarizes what blocks publishing", async () => {
    const summary = await getReviewSummary(db.sql, owner, courseId);
    expect(summary?.course.status).toBe("needs_review");
    expect(summary?.flagKinds.map((f) => f.kind).sort()).toEqual(["answer_mismatch", "not_in_sources"]);
    expect(summary?.publishBlocker).toMatch(/open flags/);
    expect(await getReviewSummary(db.sql, other, courseId)).toBeNull();
    await expect(publishCourse(db.sql, owner, courseId)).rejects.toThrow("open flag");
  });

  it("lists flagged items with their reasons and sources, for the owner only", async () => {
    const flagged = await listReviewItems(db.sql, owner, courseId, { status: "flagged" });
    expect(flagged.map((i) => i.kind).sort()).toEqual(["guide_section", "mcq"]);
    const mismatch = flagged.find((i) => i.kind === "mcq")!;
    expect(mismatch.flags[0]).toMatchObject({ kind: "answer_mismatch", detail: { drafted: 2, resolved: 0 } });
    expect(mismatch.citations).toEqual([{ filename: "notes.md", page: null, quote: "Water is polar" }]);
    expect(await listReviewItems(db.sql, other, courseId)).toEqual([]);
  });

  it("approves a unit's unflagged drafts in one step", async () => {
    const approved = await approveUnitDrafts(db.sql, owner, courseId, 1);
    const items = await listReviewItems(db.sql, owner, courseId);
    expect(approved).toBe(items.filter((i) => i.status === "approved").length);
    expect(items.filter((i) => i.status === "draft")).toEqual([]);
    expect(items.filter((i) => i.status === "flagged")).toHaveLength(2);
  });

  it("saves an edit as a new version and clears the item's flags", async () => {
    const item = (await mcqs()).find((i) => i.flags.length)!;
    await expect(editItem(db.sql, owner, item.id, { choices: ["Polarity", "Mass", "Color"] })).rejects.toBeInstanceOf(ReviewRefused);
    await expect(editItem(db.sql, other, item.id, { answer_index: 0 })).rejects.toThrow("not found");

    const result = await editItem(db.sql, owner, item.id, { answer_index: 0, explanation: "Polar molecules dissolve other polar molecules." });
    expect(result.flagged).toBe(false);
    const saved = await getReviewItem(db.sql, owner, item.id);
    expect(saved).toMatchObject({ version: 2, status: "approved", flags: [] });
    expect(saved?.content).toMatchObject({ answer_index: 0, citations: item.content.citations });
    expect(saved?.versions.map((v) => v.version)).toEqual([1]);
    const [flag] = await db.sql`select resolution from flags where item_id = ${item.id}`;
    expect(flag.resolution).toBe("edit");
  });

  it("flags an edit that copies a source too closely", async () => {
    const term = (await listReviewItems(db.sql, owner, courseId, { status: "flagged" }))[0];
    expect(term.content.section).toBe("key_terms[1]");
    const result = await editItem(db.sql, owner, term.id, { definition: COPIED, section: "big_idea" });
    expect(result.flagged).toBe(true);
    const saved = await getReviewItem(db.sql, owner, term.id);
    expect(saved?.content.section).toBe("key_terms[1]"); // locked field ignored
    expect(saved?.flags[0]).toMatchObject({ kind: "source_overlap" });
    expect(saved?.flagSources[saved.flags[0].detail.chunkId as string]).toBe("notes.md");
  });

  it("rolls back to an earlier version, which needs approval again", async () => {
    const term = (await listReviewItems(db.sql, owner, courseId, { status: "flagged" }))[0];
    await rollbackItem(db.sql, owner, term.id, 1);
    const saved = await getReviewItem(db.sql, owner, term.id);
    expect(saved).toMatchObject({ version: 3, status: "draft", flags: [] });
    expect(saved?.content.definition).toBe("Water sticks to water.");
    expect(saved?.versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it("regenerates a practice question with the full checks", async () => {
    const item = (await mcqs())[0];
    const replacement = question({ stem: "What makes water molecules cling to each other?" });
    const { llm, calls } = fakeLlm([[replacement]], () => 0);
    const result = await regenerateItem(db.sql, llm, owner, item.id);
    expect(result.flags).toEqual([]);
    expect(calls.map((c) => c.task).join("\n")).toContain(String(item.content.stem));

    const saved = await getReviewItem(db.sql, owner, item.id);
    expect(saved).toMatchObject({ status: "draft", version: item.version + 1 });
    expect(saved?.content.stem).toBe(replacement.stem);
    expect(saved?.citations).toHaveLength(1);

    const guide = (await listReviewItems(db.sql, owner, courseId)).find((i) => i.kind === "guide_section")!;
    await expect(regenerateItem(db.sql, llm, owner, guide.id)).rejects.toThrow("Only practice questions");
  });

  it("publishes only when everything is approved", async () => {
    const item = (await mcqs())[0];
    await setItemTier(db.sql, owner, item.id, "pro");
    await expect(setItemTier(db.sql, other, item.id, "free")).rejects.toThrow("not found");
    await expect(publishCourse(db.sql, owner, courseId)).rejects.toThrow("Approve the remaining");

    for (const pending of await listReviewItems(db.sql, owner, courseId)) {
      if (pending.status !== "approved") await approveItem(db.sql, owner, pending.id);
    }
    expect((await getReviewSummary(db.sql, owner, courseId))?.course.status).toBe("ready");
    await publishCourse(db.sql, owner, courseId);
    const [course] = await db.sql`select status, published_at from courses where id = ${courseId}`;
    expect(course.status).toBe("published");
    expect(course.published_at).toBeInstanceOf(Date);

    await unpublishCourse(db.sql, owner, courseId);
    expect((await getReviewSummary(db.sql, owner, courseId))?.course.status).toBe("ready");
  });
});

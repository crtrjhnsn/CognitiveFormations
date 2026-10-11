import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCourse } from "@/lib/courses";
import {
  getCourseSetup,
  recordAttestation,
  saveModules,
  saveOutline,
  seedCourseFromConfig,
} from "@/lib/owner/courses";
import { deleteFile, ingestFile, registerFile } from "@/lib/owner/files";
import { cancelJob, getJobProgress, JobRefused, retryJob, runGenerationJob, startJob } from "@/lib/owner/jobs";
import { fakeLlm, question } from "../fixtures";
import { createTestDatabase, createUser } from "./harness";

// Runs against a real Postgres with pgvector (CI provides one). Skipped when
// TEST_DATABASE_URL isn't set so `npm test` works without a database.
const enabled = Boolean(process.env.TEST_DATABASE_URL);

const notes = new TextEncoder().encode(
  "# Water\n\nHydrogen bonds hold neighboring water molecules together. Water is polar.\n",
);

describe.skipIf(!enabled)("owner flow (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let owner: string;
  let other: string;
  let courseId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db.sql, "owner@example.com");
    other = await createUser(db.sql, "other@example.com");
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("seeds AP Biology from its config, once", async () => {
    courseId = await seedCourseFromConfig(db.sql, owner, "ap-biology");
    expect(await seedCourseFromConfig(db.sql, owner, "ap-biology")).toBe(courseId);
    await expect(seedCourseFromConfig(db.sql, other, "ap-biology")).rejects.toThrow("another owner");

    const setup = await getCourseSetup(db.sql, owner, courseId);
    expect(setup?.units).toHaveLength(getCourse("ap-biology")!.units.length);
    expect(setup?.modules.find((m) => m.type === "formula")).toMatchObject({ enabled: true, tier: "free" });
    expect(await getCourseSetup(db.sql, other, courseId)).toBeNull();
  });

  it("refuses to generate before the outline, attestation and sources are in place", async () => {
    await expect(startJob(db.sql, owner, courseId)).rejects.toBeInstanceOf(JobRefused);
    await expect(startJob(db.sql, other, courseId)).rejects.toThrow("Course not found");
  });

  it("saves an edited outline in place and rejects units without objectives", async () => {
    await expect(saveOutline(db.sql, owner, courseId, [{ title: "Water", objectives: [" "] }])).rejects.toThrow("objective");
    await saveOutline(db.sql, owner, courseId, [
      { title: "Water", objectives: ["Explain hydrogen bonding"] },
      { title: "Cells", objectives: ["Compare prokaryotes and eukaryotes"] },
    ]);
    const setup = await getCourseSetup(db.sql, owner, courseId);
    expect(setup?.units.map((u) => u.title)).toEqual(["Water", "Cells"]);
    expect(setup?.course.outline_version).toBe(1);
  });

  it("registers and ingests an uploaded file, ignoring duplicates and banned sources", async () => {
    const file = { storageKey: `${courseId}/notes.md`, filename: "notes.md", mime: "text/markdown", role: "own_notes" as const, license: "own", bytes: notes };
    const fileId = await registerFile(db.sql, owner, courseId, file);
    expect(fileId).toBeTruthy();
    expect(await registerFile(db.sql, owner, courseId, file)).toBeNull();
    await expect(registerFile(db.sql, owner, courseId, { ...file, filename: "ced.pdf", license: "College Board CED" })).rejects.toThrow();

    await ingestFile(db.sql, fileId!, notes);
    await ingestFile(db.sql, fileId!, notes); // retry doesn't duplicate chunks
    const setup = await getCourseSetup(db.sql, owner, courseId);
    expect(setup?.files).toEqual([expect.objectContaining({ status: "ingested", chunks: 1 })]);
  });

  it("marks a file failed when no text can be extracted", async () => {
    const empty = new Uint8Array();
    const fileId = await registerFile(db.sql, owner, courseId, {
      storageKey: `${courseId}/blank.txt`, filename: "blank.txt", mime: "text/plain", role: "own_notes", license: "own", bytes: empty,
    });
    await expect(ingestFile(db.sql, fileId!, empty)).rejects.toThrow("No text");
    const [row] = await db.sql`select status from source_files where id = ${fileId}`;
    expect(row.status).toBe("failed");
    expect(await deleteFile(db.sql, other, fileId!)).toBeNull();
    expect(await deleteFile(db.sql, owner, fileId!)).toBe(`${courseId}/blank.txt`);
  });

  it("runs a generation job unit by unit and saves items, citations and flags", async () => {
    await saveModules(db.sql, owner, courseId, [{ type: "practice", enabled: true, tier: "preview" }]);
    await recordAttestation(db.sql, owner, courseId, "127.0.0.1");
    const jobId = await startJob(db.sql, owner, courseId);
    await expect(startJob(db.sql, owner, courseId)).rejects.toThrow("already running");

    const wrongKey = question({ stem: "Which property makes water a good solvent?", answer_index: 2 });
    const { llm } = fakeLlm([[question({}), wrongKey]], () => 0);
    await runGenerationJob(db.sql, llm, jobId, { questionCount: 2 });

    const progress = await getJobProgress(db.sql, owner, jobId);
    expect(progress?.status).toBe("succeeded");
    expect(progress?.steps.map((s) => s.status)).toEqual(["succeeded", "succeeded"]);
    expect(progress?.costEstimate).toBeGreaterThan(0);
    expect(await getJobProgress(db.sql, other, jobId)).toBeNull();

    const items = await db.sql<{ kind: string; status: string; tier: string; position: number }[]>`
      select i.kind, i.status, i.tier, u.position from items i join units u on u.id = i.unit_id where i.kind = 'mcq' order by u.position, i.position`;
    // Unit 1 practice is a free preview; the mismatched key is flagged, the rest wait for review.
    const flags = await db.sql<{ kind: string; position: number }[]>`
      select f.kind, u.position from flags f join items i on i.id = f.item_id join units u on u.id = i.unit_id
      where i.kind = 'mcq' order by u.position, i.position, f.kind`;
    // Unit 1 practice is a free preview: the mismatched key is flagged, the other waits for review.
    // Unit 2 (Cells) has no matching notes, so the canned water questions are flagged as unsupported.
    expect(items.map((i) => [i.position, i.tier, i.status])).toEqual([
      [1, "free", "draft"], [1, "free", "flagged"], [2, "pro", "flagged"], [2, "pro", "flagged"],
    ]);
    expect(flags.filter((f) => f.position === 1).map((f) => f.kind)).toEqual(["answer_mismatch"]);
    expect(flags.filter((f) => f.position === 2).map((f) => f.kind)).toContain("not_in_sources");
    const [citations] = await db.sql<{ n: number }[]>`select count(*)::int as n from item_citations`;
    expect(citations.n).toBeGreaterThan(0);
    const [course] = await db.sql`select status from courses where id = ${courseId}`;
    expect(course.status).toBe("needs_review");

    // Content exists now, so a second run is refused until the review queue handles regeneration.
    await expect(startJob(db.sql, owner, courseId)).rejects.toThrow("already has generated content");
  });

  it("retries only failed units without duplicating items", async () => {
    const [job] = await db.sql<{ id: string }[]>`select id from generation_jobs where course_id = ${courseId}`;
    const [step] = await db.sql<{ id: string }[]>`select s.id from job_steps s join units u on u.id = s.unit_id where s.job_id = ${job.id} and u.position = 2`;
    await db.sql`update job_steps set status = 'failed' where id = ${step.id}`;
    await db.sql`update generation_jobs set status = 'failed' where id = ${job.id}`;
    const unitItems = (position: number) =>
      db.sql<{ id: string; kind: string }[]>`select i.id, i.kind from items i join units u on u.id = i.unit_id where u.position = ${position} order by i.id`;
    const unit1Before = await unitItems(1);

    await retryJob(db.sql, owner, job.id);
    const { llm } = fakeLlm([[question({})]], () => 0);
    await runGenerationJob(db.sql, llm, job.id, { questionCount: 1 });

    // Only unit 2 was redrafted; its old items were replaced, unit 1's untouched.
    const attempts = await db.sql<{ attempt: number }[]>`
      select s.attempt from job_steps s join units u on u.id = s.unit_id where s.job_id = ${job.id} order by u.position`;
    expect(attempts.map((a) => a.attempt)).toEqual([1, 2]);
    expect(await unitItems(1)).toEqual(unit1Before);
    expect((await unitItems(2)).filter((i) => i.kind === "mcq")).toHaveLength(1);
    expect((await getJobProgress(db.sql, owner, job.id))?.status).toBe("succeeded");
  });

  it("cancels queued work", async () => {
    const [job] = await db.sql<{ id: string }[]>`select id from generation_jobs where course_id = ${courseId}`;
    await db.sql`update generation_jobs set status = 'queued' where id = ${job.id}`;
    await db.sql`update job_steps set status = 'queued' where job_id = ${job.id}`;
    await cancelJob(db.sql, owner, job.id);
    const steps = await db.sql<{ status: string }[]>`select status from job_steps where job_id = ${job.id}`;
    expect(steps.every((s) => s.status === "cancelled")).toBe(true);
  });
});

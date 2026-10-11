import type postgres from "postgres";
import { recordAttestation, saveOutline, seedCourseFromConfig } from "@/lib/owner/courses";
import { ingestFile, registerFile } from "@/lib/owner/files";
import { runGenerationJob, startJob } from "@/lib/owner/jobs";
import { fakeLlm, question } from "../fixtures";

export const COPIED =
  "Surface tension lets some insects walk across a pond because hydrogen bonds pull surface water molecules inward and together";
const notes = new TextEncoder().encode(
  `# Water\n\nHydrogen bonds hold neighboring water molecules together. Water is polar. ${COPIED}.\n`,
);

// AP Biology with a one-unit outline, one notes file and a finished
// generation run (fake model): a guide plus two practice questions, the
// second with a mismatched key.
export async function seedGeneratedCourse(sql: postgres.Sql, owner: string) {
  const courseId = await seedCourseFromConfig(sql, owner, "ap-biology");
  await saveOutline(sql, owner, courseId, [{ title: "Water", objectives: ["Explain hydrogen bonding"] }]);
  const fileId = await registerFile(sql, owner, courseId, {
    storageKey: `${courseId}/notes.md`, filename: "notes.md", mime: "text/markdown", role: "own_notes", license: "own", bytes: notes,
  });
  await ingestFile(sql, fileId!, notes);
  await recordAttestation(sql, owner, courseId, null);
  const jobId = await startJob(sql, owner, courseId);
  const wrongKey = question({ stem: "Which property makes water a good solvent?", answer_index: 2 });
  await runGenerationJob(sql, fakeLlm([[question({}), wrongKey]], () => 0).llm, jobId, { questionCount: 2 });
  return courseId;
}

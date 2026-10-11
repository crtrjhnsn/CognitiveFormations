// Phase 1 pipeline script: generates a course from a folder of source files.
//
//   npm run generate -- --course ap-biology --sources ./my-sources --units 1,2
//
// The sources folder needs a manifest.json (see courses/ap-biology/README.md).
// Results are written to out/<course>/<timestamp>/ (git-ignored).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { claudeLlm, createClient } from "@/lib/ai/llm";
import { getCourse } from "@/lib/courses";
import { renderReport } from "@/pipeline/report";
import { runCourse } from "@/pipeline/run-course";
import { ingestSources } from "@/pipeline/sources";

const { values } = parseArgs({
  options: {
    course: { type: "string" },
    sources: { type: "string" },
    units: { type: "string" },
    questions: { type: "string", default: "5" },
    cards: { type: "string", default: "12" },
    mode: { type: "string", default: "materials_first" },
    concurrency: { type: "string", default: "4" },
  },
});

async function main() {
  const course = values.course && getCourse(values.course);
  if (!course || !values.sources) {
    throw new Error("Usage: npm run generate -- --course <slug> --sources <folder> [--units 1,2] [--questions 5] [--cards 12] [--mode materials_first|materials_only]");
  }
  if (values.mode !== "materials_first" && values.mode !== "materials_only") throw new Error(`Unknown --mode ${values.mode}`);

  const sources = await ingestSources(values.sources);
  console.log(`Ingested ${sources.files.length} files into ${sources.all.length} chunks`);

  const outDir = path.join("out", course.slug, new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "chunks.json"), JSON.stringify(sources, null, 2));

  const results = await runCourse(claudeLlm(createClient()), course, sources, {
    units: values.units?.split(",").map(Number),
    questionCount: Number(values.questions),
    cardCount: Number(values.cards),
    sourceMode: values.mode,
    concurrency: Number(values.concurrency),
    onUnitDone: async (r) => {
      await writeFile(path.join(outDir, `unit-${r.unit.position}.json`), JSON.stringify(r, null, 2));
      console.log(`Unit ${r.unit.position} done: ${r.guide.length} guide parts, ${r.practice.length} questions, ${r.cards.length} flashcards, ${r.failures.length} failures`);
    },
  });

  await writeFile(path.join(outDir, "report.md"), renderReport(course.title, results));
  console.log(`Report: ${path.join(outDir, "report.md")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

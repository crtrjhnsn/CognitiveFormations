import { CHECK_MODEL, DRAFT_MODEL } from "@/lib/ai/models";
import { GenerationError, type Llm, type Usage } from "@/lib/ai/llm";
import { guideSchema, practiceSetSchema, resolveSchema, validateMcq, type Citation, type Guide, type Mcq } from "@/lib/ai/schemas";
import type { Chunk } from "./chunk";
import { checkGrounding, checkOverlap, type Flag, type ResolvedCitation } from "./checks";
import { DRAFT_SYSTEM, RESOLVE_SYSTEM, unitContext } from "./prompts";

export interface UnitJob {
  course: { title: string; level: string; alignment: string; sourceMode: "materials_first" | "materials_only" };
  unit: { position: number; title: string; objectives: string[] };
  pack: Chunk[];
  // Every chunk from the course's sources, for the overlap check.
  allChunks: Chunk[];
  questionCount: number;
}

export interface GeneratedItem<T> {
  section: string;
  content: T;
  citations: ResolvedCitation[];
  flags: Flag[];
}

export interface UsageRecord {
  model: string;
  stage: "draft_guide" | "draft_practice" | "resolve";
  usage: Usage;
}

export interface UnitResult {
  unit: UnitJob["unit"];
  packChunkIds: string[];
  guide: GeneratedItem<unknown>[];
  practice: GeneratedItem<Mcq>[];
  // Items left out entirely ("only my materials" mode drops gap-filled items).
  dropped: { section: string; reason: string }[];
  // Steps that failed outright; each becomes a schema_retry_failed flag at review.
  failures: { stage: string; message: string }[];
  usage: UsageRecord[];
}

type Grounded = { citations: Citation[]; gap_filled: boolean };

// Flattens a guide into reviewable parts: one per section, or one per entry
// for list sections (each key term, trap and check question stands alone).
export function guideParts(guide: Guide): { section: string; part: Grounded & Record<string, unknown> }[] {
  const parts: { section: string; part: Grounded & Record<string, unknown> }[] = [];
  for (const [key, value] of Object.entries(guide)) {
    if (value == null || key === "objectives") continue;
    const entries = (Array.isArray(value) ? value : [value]) as (Grounded & Record<string, unknown>)[];
    entries.forEach((part, i) => parts.push({ section: Array.isArray(value) ? `${key}[${i}]` : key, part }));
  }
  return parts;
}

// Text shown to students, without citation metadata, for the overlap check.
function visibleText(part: Record<string, unknown>): string {
  const rest = Object.fromEntries(Object.entries(part).filter(([key]) => key !== "citations" && key !== "gap_filled"));
  return JSON.stringify(rest).replace(/[{}[\]",:]/g, " ");
}

function reviewPart<T extends Grounded>(section: string, part: T, job: UnitJob, packById: Map<string, Chunk>): GeneratedItem<T> {
  const { resolved, flag } = checkGrounding(part, packById);
  const overlap = checkOverlap(visibleText(part), job.allChunks);
  return { section, content: part, citations: resolved, flags: [flag, overlap].filter((f): f is Flag => f !== null) };
}

export async function generateUnit(llm: Llm, job: UnitJob): Promise<UnitResult> {
  const result: UnitResult = {
    unit: job.unit,
    packChunkIds: job.pack.map((c) => c.id),
    guide: [],
    practice: [],
    dropped: [],
    failures: [],
    usage: [],
  };
  const context = unitContext(job.course, job.unit, job.pack);
  const packById = new Map(job.pack.map((c) => [c.id, c]));
  const onlyMaterials = job.course.sourceMode === "materials_only";

  // 1. Guide first, so practice questions use the same terms and notation.
  let guide: Guide | null = null;
  try {
    const res = await llm({
      model: DRAFT_MODEL,
      effort: "high",
      system: DRAFT_SYSTEM,
      context,
      task: "Write this unit's study guide. Use the objective ids above. Return null for compare, diagram or formula when the unit has nothing that fits.",
      schema: guideSchema,
    });
    result.usage.push({ model: res.servedBy, stage: "draft_guide", usage: res.usage });
    guide = res.output;
    for (const { section, part } of guideParts(guide)) {
      if (onlyMaterials && part.gap_filled) {
        result.dropped.push({ section, reason: "gap-filled in only-my-materials mode" });
        continue;
      }
      result.guide.push(reviewPart(section, part, job, packById));
    }
  } catch (error) {
    result.failures.push({ stage: "draft_guide", message: errorMessage(error) });
  }

  // 2. Practice set, with one retry carrying the validator's problems.
  const chunkIds = new Set(packById.keys());
  let questions: Mcq[] = [];
  let invalid: { index: number; problems: string[] }[] = [];
  let task = `Write ${job.questionCount} multiple-choice practice questions covering the objectives, mixing easy, medium and hard.${
    guide ? `\n\nMatch the terms and notation of this unit's guide:\n${JSON.stringify(guide)}` : ""
  }`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await llm({ model: DRAFT_MODEL, effort: "high", system: DRAFT_SYSTEM, context, task, schema: practiceSetSchema });
      result.usage.push({ model: res.servedBy, stage: "draft_practice", usage: res.usage });
      questions = res.output.questions;
      invalid = questions
        .map((q, index) => ({ index, problems: validateMcq(q, chunkIds) }))
        .filter((v) => v.problems.length > 0);
      if (invalid.length === 0) break;
      task += `\n\nYour previous attempt had these problems; fix them:\n${invalid
        .map((v) => `- question ${v.index + 1}: ${v.problems.join("; ")}`)
        .join("\n")}`;
    } catch (error) {
      result.failures.push({ stage: "draft_practice", message: errorMessage(error) });
      break;
    }
  }

  // 3. Review each question: schema rules, grounding, overlap, independent re-solve.
  for (const [index, question] of questions.entries()) {
    const section = `practice[${index}]`;
    if (onlyMaterials && question.gap_filled) {
      result.dropped.push({ section, reason: "gap-filled in only-my-materials mode" });
      continue;
    }
    const item = reviewPart(section, question, job, packById);
    const problems = invalid.find((v) => v.index === index)?.problems;
    if (problems) item.flags.push({ kind: "schema_retry_failed", detail: { problems } });
    else item.flags.push(...(await resolveCheck(llm, job, question, result)));
    result.practice.push(item);
  }

  return result;
}

// Asks a different, stronger model to answer without the key. Any
// disagreement blocks publishing until the owner decides.
async function resolveCheck(llm: Llm, job: UnitJob, question: Mcq, result: UnitResult): Promise<Flag[]> {
  try {
    const res = await llm({
      model: CHECK_MODEL,
      effort: "high",
      system: RESOLVE_SYSTEM,
      context: `Course: ${job.course.title} (${job.course.level})\nUnit ${job.unit.position}: ${job.unit.title}`,
      task: `Question: ${question.stem}\n\nChoices:\n${question.choices.map((c, i) => `${i}. ${c}`).join("\n")}`,
      schema: resolveSchema,
    });
    result.usage.push({ model: res.servedBy, stage: "resolve", usage: res.usage });
    if (res.output.answer_index === question.answer_index) return [];
    return [
      {
        kind: "answer_mismatch",
        detail: {
          drafted: question.answer_index,
          resolved: res.output.answer_index,
          working: res.output.working,
          suggestion: "Use re-solved answer, or edit the question",
        },
      },
    ];
  } catch (error) {
    // An unchecked key must not pass silently.
    return [{ kind: "answer_mismatch", detail: { error: `Re-solve failed: ${errorMessage(error)}` } }];
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof GenerationError) return `${error.reason}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

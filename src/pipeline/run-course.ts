import type { Llm } from "@/lib/ai/llm";
import type { CourseConfig } from "@/lib/courses";
import { buildContextPack } from "./retrieve";
import { generateUnit, type UnitResult } from "./generate-unit";
import type { IngestedSources } from "./sources";

export interface RunOptions {
  units?: number[];
  questionCount: number;
  cardCount?: number;
  sourceMode: "materials_first" | "materials_only";
  // Spec: units run in parallel, capped per course.
  concurrency: number;
  onUnitDone?: (result: UnitResult) => Promise<void> | void;
}

export async function runCourse(llm: Llm, course: CourseConfig, sources: IngestedSources, options: RunOptions): Promise<UnitResult[]> {
  const units = course.units.filter((u) => !options.units || options.units.includes(u.position));
  const results: UnitResult[] = new Array(units.length);
  let next = 0;

  // A failed unit records its failure and the rest carry on.
  const worker = async () => {
    while (next < units.length) {
      const i = next++;
      const unit = units[i];
      results[i] = await generateUnit(llm, {
        course: { title: course.title, level: course.level, alignment: course.alignment, sourceMode: options.sourceMode },
        unit,
        pack: buildContextPack(unit, sources.draftable),
        allChunks: sources.all,
        questionCount: options.questionCount,
        cardCount: options.cardCount,
      });
      await options.onUnitDone?.(results[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency, units.length) }, worker));
  return results;
}

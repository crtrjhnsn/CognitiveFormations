import type { Chunk } from "./chunk";

export const DRAFT_SYSTEM = `You write study material for a paid study guide, drafted from the course owner's own source materials.

House rules:
- Write for the stated course level. Be accurate, concrete and concise.
- Ground every factual claim in the sources. For each section or item, cite the chunk ids you used, each with a short quote copied exactly from that chunk (a phrase or one sentence).
- If something the section needs isn't in the sources, you may write it from general knowledge, but set gap_filled: true on that section or item. Never invent citations.
- Never copy more than one sentence verbatim from a source. Paraphrase and explain instead.
- Never reuse the wording or numbers of an exam question that appears in the sources.
- Multiple-choice items have exactly 4 distinct choices, one correct answer, and no "all of the above" or "none of the above".`;

export const RESOLVE_SYSTEM = `You are checking a practice question for a study guide. Solve it yourself, as a careful expert would, without assuming any particular choice is intended to be correct. Show brief working, then give the 0-based index of the single best answer.`;

export function objectiveIds(position: number, objectives: string[]): { id: string; text: string }[] {
  return objectives.map((text, i) => ({ id: `u${position}-o${i + 1}`, text }));
}

export function unitContext(
  course: { title: string; level: string; alignment: string },
  unit: { position: number; title: string; objectives: string[] },
  pack: Chunk[],
): string {
  const objectives = objectiveIds(unit.position, unit.objectives)
    .map((o) => `- ${o.id}: ${o.text}`)
    .join("\n");
  const sources = pack
    .map((c) => `<chunk id="${c.id}" file="${c.filename}"${c.page ? ` page="${c.page}"` : ""}>\n${c.text}\n</chunk>`)
    .join("\n");
  return `Course: ${course.title}
Level: ${course.level}
Alignment: ${course.alignment}

Unit ${unit.position}: ${unit.title}
Learning objectives:
${objectives}

Sources for this unit:
${sources || "(none matched this unit)"}`;
}

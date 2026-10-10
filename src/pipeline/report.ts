import { PRICING } from "@/config/pricing";
import type { FlagKind } from "./checks";
import type { UnitResult, UsageRecord } from "./generate-unit";

export interface RunSummary {
  items: number;
  flaggedItems: number;
  flagsByKind: Record<FlagKind, number>;
  dropped: number;
  failures: number;
  costUsd: number;
  tokens: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>;
}

export function costOf(record: UsageRecord): number {
  const price = PRICING[record.model];
  if (!price) return 0;
  const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = record.usage;
  return (
    (inputTokens * price.input + outputTokens * price.output + cacheReadTokens * price.cacheRead + cacheWriteTokens * price.cacheWrite) /
    1_000_000
  );
}

export function summarize(units: UnitResult[]): RunSummary {
  const summary: RunSummary = {
    items: 0,
    flaggedItems: 0,
    flagsByKind: { answer_mismatch: 0, not_in_sources: 0, source_overlap: 0, schema_retry_failed: 0, safety: 0 },
    dropped: 0,
    failures: 0,
    costUsd: 0,
    tokens: {},
  };
  for (const unit of units) {
    for (const item of [...unit.guide, ...unit.practice]) {
      summary.items++;
      if (item.flags.length) summary.flaggedItems++;
      for (const flag of item.flags) summary.flagsByKind[flag.kind]++;
    }
    summary.dropped += unit.dropped.length;
    summary.failures += unit.failures.length;
    for (const record of unit.usage) {
      summary.costUsd += costOf(record);
      const t = (summary.tokens[record.model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
      t.input += record.usage.inputTokens;
      t.output += record.usage.outputTokens;
      t.cacheRead += record.usage.cacheReadTokens;
      t.cacheWrite += record.usage.cacheWriteTokens;
    }
  }
  return summary;
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "n/a");

export function renderReport(courseTitle: string, units: UnitResult[]): string {
  const s = summarize(units);
  const lines = [
    `# Generation run: ${courseTitle}`,
    "",
    `- Items drafted: ${s.items}`,
    `- Items with at least one flag: ${s.flaggedItems} (${pct(s.flaggedItems, s.items)})`,
    `- Items dropped (only-my-materials mode): ${s.dropped}`,
    `- Steps that failed: ${s.failures}`,
    `- Estimated cost: $${s.costUsd.toFixed(2)} (check current pricing)`,
    "",
    "## Flags by kind",
    "",
    "| Kind | Count |",
    "| --- | --- |",
    ...Object.entries(s.flagsByKind).map(([kind, n]) => `| ${kind} | ${n} |`),
    "",
    "## Units",
    "",
    "| Unit | Source chunks used | Guide parts | Questions | Flagged | Failures |",
    "| --- | --- | --- | --- | --- | --- |",
    ...units.map((u) => {
      const items = [...u.guide, ...u.practice];
      return `| ${u.unit.position}. ${u.unit.title} | ${u.packChunkIds.length} | ${u.guide.length} | ${u.practice.length} | ${
        items.filter((i) => i.flags.length).length
      } | ${u.failures.map((f) => f.stage).join(", ") || "none"} |`;
    }),
    "",
    "## Tokens by model",
    "",
    "| Model | Input | Output | Cache read | Cache write |",
    "| --- | --- | --- | --- | --- |",
    ...Object.entries(s.tokens).map(([m, t]) => `| ${m} | ${t.input} | ${t.output} | ${t.cacheRead} | ${t.cacheWrite} |`),
    "",
  ];
  return lines.join("\n");
}

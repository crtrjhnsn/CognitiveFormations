import type { ReviewItem } from "@/lib/owner/review";

const LETTERS = "ABCDEFGH";
export const letter = (index: unknown) => (typeof index === "number" ? (LETTERS[index] ?? String(index)) : "?");

const SECTION_LABELS: Record<string, string> = {
  big_idea: "Big idea",
  key_terms: "Key term",
  compare: "Compare",
  diagram: "Diagram",
  formula: "Formula",
  worked_example: "Worked example",
  exam_traps: "Exam trap",
  interview: "Explain it",
  check_yourself: "Check yourself",
};

export function sectionLabel(section: unknown): string {
  const key = String(section ?? "").replace(/\[\d+\]$/, "");
  return SECTION_LABELS[key] ?? key;
}

export function itemLabel(item: { kind: string; position: number; content: Record<string, unknown> }): string {
  if (item.kind === "mcq") return `Practice question ${item.position + 1}`;
  if (item.kind === "card") return `Flashcard ${item.position + 1}`;
  return sectionLabel(item.content.section);
}

const HIDDEN = new Set(["kind", "section", "citations", "gap_filled", "objective_ids"]);

// Read-only rendering of an item's content as a student would see it, plus
// the answer key.
export function ItemContent({ item }: { item: Pick<ReviewItem, "kind" | "content"> }) {
  const c = item.content;
  if (item.kind === "card") {
    return (
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p className="rounded bg-zinc-50 p-2 font-medium">{String(c.front)}</p>
        <p className="rounded bg-zinc-50 p-2">{String(c.back)}</p>
      </div>
    );
  }
  if (item.kind === "mcq") {
    const choices = (c.choices as string[]) ?? [];
    return (
      <div className="text-sm">
        <p className="font-medium">{String(c.stem)}</p>
        <ol className="mt-2 space-y-1">
          {choices.map((choice, i) => (
            <li key={i} className={i === c.answer_index ? "font-medium text-green-800" : ""}>
              {letter(i)}. {choice}
              {i === c.answer_index && " ✓"}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-zinc-600">{String(c.explanation)}</p>
        <p className="mt-1 text-xs text-zinc-500">Difficulty: {String(c.difficulty)}</p>
      </div>
    );
  }
  return (
    <dl className="space-y-1 text-sm">
      {Object.entries(c)
        .filter(([key]) => !HIDDEN.has(key))
        .map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{key.replace(/_/g, " ")}</dt>
            <dd>{renderValue(value)}</dd>
          </div>
        ))}
    </dl>
  );
}

function renderValue(value: unknown): React.ReactNode {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return (
      <ul className="list-disc pl-5">
        {value.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
    );
  }
  return <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

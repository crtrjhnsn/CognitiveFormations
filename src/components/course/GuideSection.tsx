// Renders one guide part for students. Sections follow the unit guide
// template in src/lib/ai/schemas.ts.

type Content = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? v : []);

export const SECTION_TITLES: Record<string, string> = {
  big_idea: "Big idea",
  key_terms: "Key terms",
  compare: "Compare",
  diagram: "Diagram",
  formula: "Formula",
  worked_example: "Worked example",
  exam_traps: "Exam traps",
  interview: "Explain it",
  check_yourself: "Check yourself",
};

export function sectionKey(content: Content): string {
  return str(content.section).replace(/\[\d+\]$/, "");
}

export function GuideSection({ content }: { content: Content }) {
  switch (sectionKey(content)) {
    case "big_idea":
      return <p className="text-lg">{str(content.text)}</p>;
    case "key_terms":
      return (
        <p>
          <span className="font-medium">{str(content.term)}:</span> {str(content.definition)}
        </p>
      );
    case "compare":
      return (
        <div className="overflow-x-auto">
          <p className="font-medium">{str(content.title)}</p>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr>{list(content.headers).map((h, i) => <th key={i} className="border border-zinc-200 px-2 py-1 text-left">{String(h)}</th>)}</tr>
            </thead>
            <tbody>
              {list(content.rows).map((row, i) => (
                <tr key={i}>{list(row).map((cell, j) => <td key={j} className="border border-zinc-200 px-2 py-1">{String(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "diagram":
      return (
        <div>
          <p className="font-medium">{str(content.title)}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {list(content.elements).map((e, i) => (
              <li key={i}><span className="font-medium">{str((e as Content).label)}</span>: {str((e as Content).detail)}</li>
            ))}
          </ul>
          {list(content.connections).length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm text-zinc-600">
              {list(content.connections).map((c, i) => (
                <li key={i}>{str((c as Content).from)} → {str((c as Content).to)}: {str((c as Content).label)}</li>
              ))}
            </ul>
          )}
        </div>
      );
    case "formula":
      return (
        <div>
          <code className="block rounded bg-zinc-50 px-2 py-1">{str(content.latex)}</code>
          <ul className="mt-1 list-disc pl-5 text-sm">{list(content.interpretation).map((t, i) => <li key={i}>{String(t)}</li>)}</ul>
        </div>
      );
    case "worked_example":
      return (
        <div>
          <p className="font-medium">{str(content.prompt)}</p>
          <ol className="mt-1 list-decimal pl-5 text-sm">{list(content.steps).map((s, i) => <li key={i}>{String(s)}</li>)}</ol>
          <p className="mt-1 text-sm text-zinc-600">Check: {str(content.check)}</p>
        </div>
      );
    case "exam_traps":
      return (
        <p>
          <span className="font-medium">Trap:</span> {str(content.trap)} <span className="font-medium">Instead:</span> {str(content.fix)}
        </p>
      );
    case "interview":
      return (
        <div>
          <p className="font-medium">{str(content.question)}</p>
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer text-zinc-600">Model answer</summary>
            <p className="mt-1">{str(content.model_answer)}</p>
            {list(content.follow_ups).length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-zinc-600">{list(content.follow_ups).map((f, i) => <li key={i}>{String(f)}</li>)}</ul>
            )}
          </details>
        </div>
      );
    case "check_yourself":
      return (
        <details>
          <summary className="cursor-pointer">{str(content.q)}</summary>
          <p className="mt-1 text-sm text-zinc-700">{str(content.a)}</p>
        </details>
      );
    default:
      return null;
  }
}

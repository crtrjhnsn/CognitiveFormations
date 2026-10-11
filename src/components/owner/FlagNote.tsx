import type { ReviewFlag } from "@/lib/owner/review";
import { letter } from "./ItemContent";

// A flag in plain words: what the check found and what to do about it.
export function FlagNote({ flag, sources }: { flag: ReviewFlag; sources: Record<string, string> }) {
  const d = flag.detail;
  const problems = Array.isArray(d.problems) ? (d.problems as string[]) : [];
  let reason: React.ReactNode;
  let action: string;
  switch (flag.kind) {
    case "answer_mismatch":
      if (typeof d.error === "string") {
        reason = `The answer couldn't be double-checked (${d.error}).`;
        action = "Check the answer yourself, then approve, or regenerate.";
      } else {
        reason = (
          <>
            A second model, answering without the key, chose {letter(d.resolved)}. The key says {letter(d.drafted)}.
            {typeof d.working === "string" && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs">Its working</summary>
                <p className="mt-1 whitespace-pre-wrap text-xs">{d.working}</p>
              </details>
            )}
          </>
        );
        action = `If ${letter(d.resolved)} is right, edit the key and the explanation. If the key is right, approve.`;
      }
      break;
    case "not_in_sources":
      reason = (
        <>
          Not backed by your files{problems.length > 0 && ":"}
          {problems.length > 0 && (
            <ul className="list-disc pl-5 text-xs">
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </>
      );
      action = "Check it's accurate before approving, or edit it.";
      break;
    case "source_overlap":
      reason = `${d.sharedWords} words in a row match ${sources[String(d.chunkId)] ?? "one of your files"}.`;
      action = "Reword it in your own words.";
      break;
    case "schema_retry_failed":
      reason = `The draft broke the question rules: ${problems.join("; ") || "unknown problem"}.`;
      action = "Edit it to fix the problem, or regenerate.";
      break;
    default:
      reason = flag.kind;
      action = "Review it carefully before approving.";
  }
  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
      <div>{reason}</div>
      <div className="mt-1 text-xs text-amber-900">Suggested: {action}</div>
    </div>
  );
}

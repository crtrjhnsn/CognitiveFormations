"use client";

import { useActionState } from "react";
import { saveModulesAction, type ActionResult } from "@/app/owner/actions";

const LABELS: Record<string, string> = {
  guide: "Study guide",
  cards: "Flashcards",
  formula: "Formula sheet",
  practice: "Practice questions",
  frq: "Free-response practice",
  interview: "Explain-it questions",
  exam: "Practice exams",
  pdf: "Printable PDF",
  cram: "Cram sheet",
};

export function ModulesForm({
  courseId,
  modules,
  sourceMode,
  generated,
}: {
  courseId: string;
  modules: { type: string; enabled: boolean; tier: string }[];
  sourceMode: string;
  generated: string[];
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveModulesAction.bind(null, courseId), {});
  return (
    <form action={action} className="mt-4 space-y-4">
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1 font-normal">Module</th>
            <th className="py-1 font-normal">On</th>
            <th className="py-1 font-normal">Who sees it</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <tr key={m.type} className="border-t border-zinc-100">
              <td className="py-1">
                {LABELS[m.type] ?? m.type}
                {!generated.includes(m.type) && <span className="ml-2 text-xs text-zinc-400">not generated yet</span>}
              </td>
              <td className="py-1">
                <input type="checkbox" name={`${m.type}.enabled`} defaultChecked={m.enabled} aria-label={`${LABELS[m.type]} on`} />
              </td>
              <td className="py-1">
                <select name={`${m.type}.tier`} defaultValue={m.tier} className="rounded border border-zinc-300 px-1" aria-label={`${LABELS[m.type]} access`}>
                  <option value="free">Everyone</option>
                  <option value="preview">Unit 1 free, rest Pro</option>
                  <option value="pro">Pro only</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <fieldset className="text-sm">
        <legend className="font-medium">When my files don&apos;t cover something</legend>
        <label className="mt-1 flex gap-2">
          <input type="radio" name="source_mode" value="materials_first" defaultChecked={sourceMode === "materials_first"} />
          Fill the gap and flag it for review
        </label>
        <label className="flex gap-2">
          <input type="radio" name="source_mode" value="materials_only" defaultChecked={sourceMode === "materials_only"} />
          Leave it out (only my materials)
        </label>
      </fieldset>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded bg-zinc-900 px-4 py-1 text-sm text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        {state.message && <p className="text-sm text-zinc-700">{state.message}</p>}
      </div>
    </form>
  );
}

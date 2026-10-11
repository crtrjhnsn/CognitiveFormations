"use client";

import { useState, useTransition } from "react";
import { saveOutlineAction, type ActionResult } from "@/app/owner/actions";

interface Unit {
  title: string;
  objectives: string;
}

// One objective per line. Saving confirms the outline for generation.
export function OutlineEditor({ courseId, units }: { courseId: string; units: { title: string; objectives: string[] }[] }) {
  const [draft, setDraft] = useState<Unit[]>(units.map((u) => ({ title: u.title, objectives: u.objectives.join("\n") })));
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<Unit>) => setDraft((d) => d.map((u, j) => (j === i ? { ...u, ...patch } : u)));

  return (
    <div className="mt-4 space-y-4">
      {draft.map((unit, i) => (
        <div key={i} className="rounded border border-zinc-200 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">Unit {i + 1}</span>
            <input
              value={unit.title}
              onChange={(e) => update(i, { title: e.target.value })}
              aria-label={`Unit ${i + 1} title`}
              className="flex-1 rounded border border-zinc-300 px-2 py-1"
            />
            <button onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="text-sm text-zinc-500 hover:text-red-700">
              Remove
            </button>
          </div>
          <textarea
            value={unit.objectives}
            onChange={(e) => update(i, { objectives: e.target.value })}
            aria-label={`Unit ${i + 1} objectives, one per line`}
            rows={Math.max(3, unit.objectives.split("\n").length)}
            className="mt-2 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={() => setDraft((d) => [...d, { title: "", objectives: "" }])} className="rounded border border-zinc-300 px-3 py-1 text-sm">
          Add unit
        </button>
        <button
          disabled={pending}
          onClick={() =>
            start(async () =>
              setResult(await saveOutlineAction(courseId, draft.map((u) => ({ title: u.title, objectives: u.objectives.split("\n") })))),
            )
          }
          className="rounded bg-zinc-900 px-4 py-1 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save outline"}
        </button>
        {result.error && <p className="text-sm text-red-700">{result.error}</p>}
        {result.message && <p className="text-sm text-zinc-700">{result.message}</p>}
      </div>
    </div>
  );
}

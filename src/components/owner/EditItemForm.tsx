"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveEdit, type ActionResult } from "@/app/owner/actions";
import { letter } from "./ItemContent";

const HIDDEN = new Set(["kind", "section", "citations", "gap_filled", "objective_ids"]);

type Field = { key: string; type: "text" | "lines" | "json"; value: string };

// Guide sections: strings become text boxes, string lists one line per entry,
// anything nested (tables, diagrams) is edited as JSON.
function guideFields(content: Record<string, unknown>): Field[] {
  return Object.entries(content)
    .filter(([key]) => !HIDDEN.has(key))
    .map(([key, value]) =>
      typeof value === "string"
        ? { key, type: "text", value }
        : Array.isArray(value) && value.every((v) => typeof v === "string")
          ? { key, type: "lines", value: value.join("\n") }
          : { key, type: "json", value: JSON.stringify(value, null, 2) },
    );
}

export function EditItemForm({ itemId, kind, content, backHref }: { itemId: string; kind: string; content: Record<string, unknown>; backHref: string }) {
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const [fields, setFields] = useState(() => guideFields(content));
  const [mcq, setMcq] = useState(() => ({
    stem: String(content.stem ?? ""),
    choices: [...((content.choices as string[]) ?? [])],
    answer_index: Number(content.answer_index ?? 0),
    explanation: String(content.explanation ?? ""),
    difficulty: String(content.difficulty ?? "medium"),
  }));

  const submit = () => {
    let changes: Record<string, unknown>;
    if (kind === "mcq") {
      changes = mcq;
    } else {
      try {
        changes = Object.fromEntries(
          fields.map((f) => [f.key, f.type === "text" ? f.value : f.type === "lines" ? f.value.split("\n").map((l) => l.trim()).filter(Boolean) : JSON.parse(f.value)]),
        );
      } catch {
        return setResult({ error: "One of the structured fields isn't valid JSON." });
      }
    }
    start(async () => setResult(await saveEdit(itemId, changes)));
  };

  const box = "mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm";
  return (
    <div className="space-y-4">
      {kind === "mcq" ? (
        <>
          <label className="block text-sm font-medium">
            Question
            <textarea value={mcq.stem} onChange={(e) => setMcq({ ...mcq, stem: e.target.value })} rows={3} className={box} />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Choices (select the correct one)</legend>
            {mcq.choices.map((choice, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="answer"
                  checked={mcq.answer_index === i}
                  onChange={() => setMcq({ ...mcq, answer_index: i })}
                  aria-label={`Choice ${letter(i)} is correct`}
                />
                <span className="w-4 text-sm">{letter(i)}</span>
                <input
                  value={choice}
                  onChange={(e) => setMcq({ ...mcq, choices: mcq.choices.map((c, j) => (j === i ? e.target.value : c)) })}
                  aria-label={`Choice ${letter(i)}`}
                  className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm"
                />
              </div>
            ))}
          </fieldset>
          <label className="block text-sm font-medium">
            Explanation
            <textarea value={mcq.explanation} onChange={(e) => setMcq({ ...mcq, explanation: e.target.value })} rows={3} className={box} />
          </label>
          <label className="block text-sm font-medium">
            Difficulty{" "}
            <select value={mcq.difficulty} onChange={(e) => setMcq({ ...mcq, difficulty: e.target.value })} className="rounded border border-zinc-300 px-1">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </>
      ) : (
        fields.map((f, i) => (
          <label key={f.key} className="block text-sm font-medium">
            {f.key.replace(/_/g, " ")}
            {f.type === "lines" && <span className="font-normal text-zinc-500"> (one per line)</span>}
            {f.type === "json" && <span className="font-normal text-zinc-500"> (JSON)</span>}
            <textarea
              value={f.value}
              onChange={(e) => setFields(fields.map((g, j) => (j === i ? { ...g, value: e.target.value } : g)))}
              rows={f.type === "json" ? 8 : Math.max(2, f.value.split("\n").length)}
              className={`${box} ${f.type === "json" ? "font-mono text-xs" : ""}`}
            />
          </label>
        ))
      )}
      <p className="text-xs text-zinc-500">Saving approves the item. Sources stay as generated; an edit that copies a source too closely gets flagged.</p>
      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={pending} className="rounded bg-zinc-900 px-4 py-1 text-sm text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save and approve"}
        </button>
        <Link href={backHref} className="text-sm text-zinc-600 hover:underline">Back to review</Link>
        {result.error && <p className="text-sm text-red-700">{result.error}</p>}
        {result.message && <p className="text-sm text-zinc-700">{result.message}</p>}
      </div>
    </div>
  );
}

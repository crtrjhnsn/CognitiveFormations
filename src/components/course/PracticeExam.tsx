"use client";

import { useState, useTransition } from "react";
import { submitExam } from "@/app/c/actions";
import type { ExamQuestion, ExamResult } from "@/lib/study";

const LETTERS = "ABCDEFGH";

export function PracticeExam({ slug, questions }: { slug: string; questions: ExamQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const answered = Object.keys(answers).length;
  const results = new Map(result?.questions.map((q) => [q.id, q]));

  const submit = () =>
    start(async () => {
      const scored = await submitExam(slug, questions.map((q) => ({ id: q.id, choice: answers[q.id] ?? null })));
      if (!scored) return setError("We couldn't score this exam. Reload the page and try again.");
      setResult(scored);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  return (
    <div className="mt-6 space-y-6">
      {result && (
        <section className="rounded border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xl font-semibold">
            {result.score} of {result.total} ({Math.round((result.score / result.total) * 100)}%)
          </p>
          <ul className="mt-2 text-sm text-zinc-700">
            {result.byUnit.map((u) => (
              <li key={u.unitPosition}>
                Unit {u.unitPosition}: {u.correct} of {u.total}
              </li>
            ))}
          </ul>
        </section>
      )}
      {questions.map((q, n) => {
        const r = results.get(q.id);
        return (
          <fieldset key={q.id} className="rounded border border-zinc-200 p-4">
            <legend className="px-1 text-xs text-zinc-500">Question {n + 1} · Unit {q.unitPosition}</legend>
            <p className="font-medium">{q.stem}</p>
            <div className="mt-3 space-y-2">
              {q.choices.map((choice, i) => {
                const mark = r ? (i === r.answerIndex ? "border-green-600 bg-green-50" : i === r.choice ? "border-red-600 bg-red-50" : "border-zinc-200") : "border-zinc-200";
                return (
                  <label key={i} className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-sm ${mark}`}>
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === i}
                      disabled={Boolean(result)}
                      onChange={() => setAnswers({ ...answers, [q.id]: i })}
                      className="mt-1"
                    />
                    <span>
                      {LETTERS[i]}. {choice}
                    </span>
                  </label>
                );
              })}
            </div>
            {r && (
              <p className="mt-2 text-sm text-zinc-700">
                {r.correct ? "Correct. " : r.choice === null ? `Left blank. The answer is ${LETTERS[r.answerIndex]}. ` : `The answer is ${LETTERS[r.answerIndex]}. `}
                {r.explanation}
              </p>
            )}
          </fieldset>
        );
      })}
      {!result && (
        <div className="flex items-center gap-3">
          <button onClick={submit} disabled={pending} className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50">
            {pending ? "Scoring…" : "Submit exam"}
          </button>
          <span className="text-sm text-zinc-600">
            {answered} of {questions.length} answered
          </span>
          {error && <span className="text-sm text-red-700">{error}</span>}
        </div>
      )}
    </div>
  );
}

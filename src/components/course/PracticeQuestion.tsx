"use client";

import { useState, useTransition } from "react";
import { checkAnswer } from "@/app/c/actions";

const LETTERS = "ABCDEFGH";

type Result = Awaited<ReturnType<typeof checkAnswer>>;

export function PracticeQuestion({ id, number, stem, choices }: { id: string; number: number; stem: string; choices: string[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [pending, start] = useTransition();
  const answered = result && !result.locked ? result : null;

  return (
    <div className="rounded border border-zinc-200 p-4">
      <p className="font-medium">
        {number}. {stem}
      </p>
      <ol className="mt-3 space-y-2">
        {choices.map((choice, i) => {
          const style = answered
            ? i === answered.answerIndex
              ? "border-green-600 bg-green-50"
              : i === picked
                ? "border-red-600 bg-red-50"
                : "border-zinc-200"
            : i === picked
              ? "border-zinc-900"
              : "border-zinc-200 hover:border-zinc-400";
          return (
            <li key={i}>
              <button
                disabled={pending || Boolean(answered)}
                onClick={() => {
                  setPicked(i);
                  start(async () => setResult(await checkAnswer(id, i)));
                }}
                className={`w-full rounded border px-3 py-2 text-left text-sm ${style}`}
              >
                {LETTERS[i]}. {choice}
              </button>
            </li>
          );
        })}
      </ol>
      {pending && <p className="mt-2 text-sm text-zinc-500">Checking…</p>}
      {answered && (
        <div className="mt-3 text-sm">
          <p className={answered.correct ? "text-green-800" : "text-red-800"}>
            {answered.correct ? "Correct." : `Not quite. The answer is ${LETTERS[answered.answerIndex]}.`}
          </p>
          <p className="mt-1 text-zinc-700">{answered.explanation}</p>
          <button
            onClick={() => {
              setPicked(null);
              setResult(null);
            }}
            className="mt-2 text-xs text-zinc-600 underline"
          >
            Try again
          </button>
        </div>
      )}
      {result?.locked && <p className="mt-2 text-sm text-zinc-600">This question is part of Pro.</p>}
    </div>
  );
}

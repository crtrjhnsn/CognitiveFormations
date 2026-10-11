"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { rateCard } from "@/app/c/actions";
import type { Rating } from "@/lib/srs";

const BUTTONS: { rating: Rating; label: string; hint: string }[] = [
  { rating: "again", label: "Again", hint: "didn't know it" },
  { rating: "hard", label: "Hard", hint: "got it, slowly" },
  { rating: "good", label: "Good", hint: "got it" },
  { rating: "easy", label: "Easy", hint: "knew it cold" },
];

export function CardDeck({ cards, slug }: { cards: { id: string; front: string; back: string; unitPosition: number; isNew: boolean }[]; slug: string }) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const card = cards[index];

  if (!card) {
    return (
      <div className="mt-8 rounded border border-zinc-200 p-6 text-center">
        <p className="font-medium">All caught up.</p>
        <p className="mt-1 text-sm text-zinc-600">Come back when more cards are due.</p>
        <Link href={`/c/${slug}/progress`} className="mt-3 inline-block text-sm underline">See your progress</Link>
      </div>
    );
  }

  const rate = (rating: Rating) =>
    start(async () => {
      const saved = await rateCard(card.id, rating);
      if (!saved) return setError("That didn't save. Try again.");
      setError(undefined);
      setShown(false);
      setIndex(index + 1);
    });

  return (
    <div className="mt-8">
      <p className="text-sm text-zinc-500">
        Card {index + 1} of {cards.length} · Unit {card.unitPosition}
        {card.isNew && " · new"}
      </p>
      <div className="mt-2 min-h-48 rounded border border-zinc-200 p-6">
        <p className="text-lg font-medium">{card.front}</p>
        {shown && <p className="mt-4 border-t border-zinc-100 pt-4 text-zinc-800">{card.back}</p>}
      </div>
      {shown ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BUTTONS.map((b) => (
            <button key={b.rating} onClick={() => rate(b.rating)} disabled={pending} className="rounded border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50">
              <span className="block font-medium">{b.label}</span>
              <span className="block text-xs text-zinc-500">{b.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <button onClick={() => setShown(true)} className="mt-4 rounded bg-zinc-900 px-4 py-2 text-sm text-white">
          Show answer
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

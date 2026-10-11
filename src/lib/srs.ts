// Spaced repetition for flashcards: a small SM-2 variant. Pure, so the
// schedule is easy to test and tune.

export type Rating = "again" | "hard" | "good" | "easy";
export const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

export interface CardState {
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export const NEW_CARD: CardState = { intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 };

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;

export function schedule(state: CardState, rating: Rating, now: Date = new Date()): CardState & { dueAt: Date } {
  let { intervalDays, ease, reps, lapses } = state;
  if (rating === "again") {
    // Forgotten: see it again in ten minutes and start the climb over.
    lapses += 1;
    reps = 0;
    ease = Math.max(MIN_EASE, ease - 0.2);
    return { intervalDays: 0, ease, reps, lapses, dueAt: new Date(now.getTime() + 10 * 60 * 1000) };
  }
  ease = Math.max(MIN_EASE, ease + (rating === "hard" ? -0.15 : rating === "easy" ? 0.15 : 0));
  if (reps === 0) intervalDays = rating === "easy" ? 4 : 1;
  else if (reps === 1) intervalDays = rating === "hard" ? 3 : rating === "easy" ? 8 : 6;
  else intervalDays = Math.max(intervalDays + 1, Math.round(intervalDays * (rating === "hard" ? 1.2 : rating === "easy" ? ease * 1.3 : ease)));
  reps += 1;
  return { intervalDays, ease, reps, lapses, dueAt: new Date(now.getTime() + intervalDays * DAY_MS) };
}

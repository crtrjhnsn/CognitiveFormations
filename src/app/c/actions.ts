"use server";

import { checkPracticeAnswer } from "@/lib/catalog";
import { RATINGS, type Rating } from "@/lib/srs";
import { reviewCard, scoreExam } from "@/lib/study";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/viewer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function checkAnswer(itemId: string, choice: number) {
  if (!UUID.test(itemId)) return null;
  const viewer = await getViewer();
  return checkPracticeAnswer(db(), itemId, choice, { userId: viewer.user?.id ?? null, entitlement: viewer.entitlement });
}

export async function rateCard(itemId: string, rating: Rating) {
  if (!UUID.test(itemId) || !RATINGS.includes(rating)) return null;
  const viewer = await getViewer();
  if (!viewer.user) return null;
  const next = await reviewCard(db(), itemId, rating, { userId: viewer.user.id, entitlement: viewer.entitlement });
  return next ? { dueAt: next.dueAt.toISOString() } : null;
}

export async function submitExam(slug: string, answers: { id: string; choice: number | null }[]) {
  if (typeof slug !== "string" || !Array.isArray(answers) || answers.some((a) => !UUID.test(String(a?.id)))) return null;
  const viewer = await getViewer();
  return scoreExam(db(), slug, answers, { userId: viewer.user?.id ?? null, entitlement: viewer.entitlement });
}

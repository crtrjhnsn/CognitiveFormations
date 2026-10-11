"use server";

import { checkPracticeAnswer } from "@/lib/catalog";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/viewer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function checkAnswer(itemId: string, choice: number) {
  if (!UUID.test(itemId)) return null;
  const viewer = await getViewer();
  return checkPracticeAnswer(db(), itemId, choice, { userId: viewer.user?.id ?? null, entitlement: viewer.entitlement });
}

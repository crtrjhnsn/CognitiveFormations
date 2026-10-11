import "server-only";
import type { Entitlement } from "@/lib/access";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export interface Viewer {
  user: SessionUser | null;
  entitlement: (Entitlement & { plan: string; cancelAtPeriodEnd: boolean }) | null;
}

// Who is looking and what they've paid for. Reads the session, so it only
// runs inside a request (behind a Suspense boundary on pages).
export async function getViewer(): Promise<Viewer> {
  const user = await getSessionUser();
  if (!user) return { user: null, entitlement: null };
  const [row] = await db()<{ plan: string; status: Entitlement["status"]; current_period_end: Date; cancel_at_period_end: boolean }[]>`
    select plan, status, current_period_end, cancel_at_period_end from entitlements where user_id = ${user.id}`;
  return {
    user,
    entitlement: row
      ? { plan: row.plan, status: row.status, currentPeriodEnd: row.current_period_end, cancelAtPeriodEnd: row.cancel_at_period_end }
      : null,
  };
}

import type { Sql } from "@/lib/db";
import type { EntitlementRow } from "@/lib/billing/entitlements";

// Writes the entitlement a Stripe event describes. Stripe can deliver events
// late or out of order, so a subscription event never replaces a different
// plan that is still running: for example, an old subscription's
// cancellation arriving after the student bought a semester pass. A paid
// semester pass is always recorded. Returns false when the row was kept.
export async function saveEntitlement(sql: Sql, row: EntitlementRow): Promise<boolean> {
  const isPass = row.stripe_subscription_id === null;
  const saved = await sql`
    insert into entitlements (user_id, plan, status, current_period_end, stripe_customer_id, stripe_subscription_id, cancel_at_period_end)
    values (${row.user_id}, ${row.plan}, ${row.status}, ${row.current_period_end}, ${row.stripe_customer_id},
            ${row.stripe_subscription_id}, ${row.cancel_at_period_end})
    on conflict (user_id) do update set
      plan = excluded.plan,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = now()
    where ${isPass}
      or entitlements.stripe_subscription_id is not distinct from excluded.stripe_subscription_id
      or not (entitlements.status = 'active' and entitlements.current_period_end > now())
    returning user_id`;
  return saved.length > 0;
}

// A refunded or disputed semester pass ends access. Subscriptions are left
// alone: cancelling one in Stripe sends its own event.
export async function revokeSemesterPass(sql: Sql, stripeCustomerId: string): Promise<boolean> {
  const revoked = await sql`
    update entitlements set status = 'canceled', updated_at = now()
    where stripe_customer_id = ${stripeCustomerId} and plan = 'pro_semester' and stripe_subscription_id is null
    returning user_id`;
  return revoked.length > 0;
}

import type Stripe from "stripe";
import { SEMESTER_PASS_DAYS } from "@/config/billing";

// Maps Stripe objects to rows in the entitlements table. Pure, so the webhook
// logic can be tested without Stripe or a database.

export interface EntitlementRow {
  user_id: string;
  plan: "pro_monthly" | "pro_semester";
  status: "active" | "past_due" | "canceled";
  current_period_end: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function customerId(customer: string | { id: string } | null): string {
  if (!customer) throw new Error("Stripe object has no customer");
  return typeof customer === "string" ? customer : customer.id;
}

export function subscriptionStatus(status: Stripe.Subscription.Status): EntitlementRow["status"] {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      return "canceled";
  }
}

export function entitlementFromSubscription(subscription: Stripe.Subscription): EntitlementRow {
  const userId = subscription.metadata.user_id;
  if (!userId) throw new Error(`Subscription ${subscription.id} has no user_id metadata`);
  // Billing periods live on subscription items in current Stripe API versions.
  const periodEnd = Math.max(...subscription.items.data.map((item) => item.current_period_end));
  return {
    user_id: userId,
    plan: "pro_monthly",
    status: subscriptionStatus(subscription.status),
    current_period_end: new Date(periodEnd * 1000).toISOString(),
    stripe_customer_id: customerId(subscription.customer),
    stripe_subscription_id: subscription.id,
  };
}

// A semester pass is a one-time payment that grants access for a fixed length.
export function entitlementFromSemesterPass(session: Stripe.Checkout.Session): EntitlementRow {
  const userId = session.client_reference_id;
  if (!userId) throw new Error(`Checkout session ${session.id} has no client_reference_id`);
  return {
    user_id: userId,
    plan: "pro_semester",
    status: "active",
    current_period_end: new Date(session.created * 1000 + SEMESTER_PASS_DAYS * DAY_MS).toISOString(),
    stripe_customer_id: customerId(session.customer),
    stripe_subscription_id: null,
  };
}

import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { entitlementFromSemesterPass, entitlementFromSubscription } from "@/lib/billing/entitlements";
import { SEMESTER_PASS_DAYS } from "@/config/billing";

function subscription(overrides: Partial<Stripe.Subscription>): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    metadata: { user_id: "user-1" },
    items: { data: [{ current_period_end: 1_800_000_000 }] },
    cancel_at_period_end: false,
    cancel_at: null,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("entitlementFromSubscription", () => {
  it("maps an active subscription", () => {
    expect(entitlementFromSubscription(subscription({}))).toEqual({
      user_id: "user-1",
      plan: "pro_monthly",
      status: "active",
      current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      cancel_at_period_end: false,
    });
  });
  it("keeps access to the period end after a cancellation", () => {
    const row = entitlementFromSubscription(subscription({ cancel_at_period_end: true }));
    expect(row).toMatchObject({ status: "active", cancel_at_period_end: true });
  });
  it("locks access when payment fails or the subscription ends", () => {
    expect(entitlementFromSubscription(subscription({ status: "past_due" })).status).toBe("past_due");
    expect(entitlementFromSubscription(subscription({ status: "canceled" })).status).toBe("canceled");
  });
  it("refuses a subscription without a user", () => {
    expect(() => entitlementFromSubscription(subscription({ metadata: {} }))).toThrow(/user_id/);
  });
});

describe("entitlementFromSemesterPass", () => {
  it("grants access for the pass length from purchase", () => {
    const created = 1_790_000_000;
    const row = entitlementFromSemesterPass({
      id: "cs_1",
      created,
      client_reference_id: "user-2",
      customer: "cus_2",
    } as unknown as Stripe.Checkout.Session);
    expect(row.plan).toBe("pro_semester");
    expect(row.current_period_end).toBe(new Date((created + SEMESTER_PASS_DAYS * 86_400) * 1000).toISOString());
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EntitlementRow } from "@/lib/billing/entitlements";
import { revokeSemesterPass, saveEntitlement } from "@/lib/billing/store";
import { createTestDatabase, createUser } from "./harness";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe.skipIf(!enabled)("saving entitlements from Stripe events (database)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let student: string;

  const subscription = (overrides: Partial<EntitlementRow> = {}): EntitlementRow => ({
    user_id: student,
    plan: "pro_monthly",
    status: "active",
    current_period_end: inDays(30),
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_old",
    cancel_at_period_end: false,
    ...overrides,
  });
  const pass = (): EntitlementRow => ({
    ...subscription(),
    plan: "pro_semester",
    current_period_end: inDays(180),
    stripe_subscription_id: null,
  });
  const current = async () => {
    const [row] = await db.sql<{ plan: string; status: string; stripe_subscription_id: string | null }[]>`
      select plan, status, stripe_subscription_id from entitlements where user_id = ${student}`;
    return row;
  };

  beforeAll(async () => {
    db = await createTestDatabase();
    student = await createUser(db.sql, "student@example.com", "student");
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("records and updates a subscription", async () => {
    expect(await saveEntitlement(db.sql, subscription())).toBe(true);
    expect(await saveEntitlement(db.sql, subscription({ status: "past_due" }))).toBe(true);
    expect(await current()).toMatchObject({ plan: "pro_monthly", status: "past_due" });
  });

  it("lets a pass replace an ended subscription, and keeps a late event from undoing it", async () => {
    await saveEntitlement(db.sql, subscription({ status: "canceled" }));
    expect(await saveEntitlement(db.sql, pass())).toBe(true);
    // The old subscription's events arrive after the pass was bought.
    expect(await saveEntitlement(db.sql, subscription({ status: "canceled" }))).toBe(false);
    expect(await saveEntitlement(db.sql, subscription({ stripe_subscription_id: "sub_other" }))).toBe(false);
    expect(await current()).toMatchObject({ plan: "pro_semester", status: "active", stripe_subscription_id: null });
  });

  it("ends a refunded pass but not a subscription", async () => {
    expect(await revokeSemesterPass(db.sql, "cus_1")).toBe(true);
    expect(await current()).toMatchObject({ plan: "pro_semester", status: "canceled" });

    // With the pass over, a new subscription can take its place, and a refund
    // for that customer leaves it alone.
    expect(await saveEntitlement(db.sql, subscription({ stripe_subscription_id: "sub_new" }))).toBe(true);
    expect(await revokeSemesterPass(db.sql, "cus_1")).toBe(false);
    expect(await current()).toMatchObject({ plan: "pro_monthly", status: "active" });
  });
});

"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { stripe } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { requireEnv } from "@/lib/env";

// Stripe's customer portal handles card changes, receipts and cancelling,
// so cancelling online is always one click from the account page.
export async function openBillingPortal() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/account");
  const [row] = await db()<{ stripe_customer_id: string }[]>`select stripe_customer_id from entitlements where user_id = ${user.id}`;
  if (!row) redirect("/pricing");
  const session = await stripe().billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${requireEnv("NEXT_PUBLIC_SITE_URL")}/account`,
  });
  redirect(session.url);
}

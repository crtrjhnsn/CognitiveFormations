import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { entitlementFromSemesterPass, entitlementFromSubscription, type EntitlementRow } from "@/lib/billing/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEnv } from "@/lib/env";

// The only writer of the entitlements table. A failed payment moves the
// subscription to past_due, which arrives as customer.subscription.updated.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      await request.text(),
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  let row: EntitlementRow | null = null;
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "payment" && session.payment_status === "paid") {
        row = entitlementFromSemesterPass(session);
      } else if (session.mode === "subscription" && session.subscription) {
        const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        row = entitlementFromSubscription(await stripe().subscriptions.retrieve(id));
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      row = entitlementFromSubscription(event.data.object);
      break;
  }

  if (row) {
    const { error } = await createAdminClient()
      .from("entitlements")
      .upsert({ ...row, updated_at: new Date().toISOString() });
    // A non-2xx response makes Stripe retry the event.
    if (error) return new Response(error.message, { status: 500 });
  }
  return Response.json({ received: true });
}

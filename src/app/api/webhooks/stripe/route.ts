import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { entitlementFromSemesterPass, entitlementFromSubscription, type EntitlementRow } from "@/lib/billing/entitlements";
import { revokeSemesterPass, saveEntitlement } from "@/lib/billing/store";
import { db } from "@/lib/db";
import { requireEnv } from "@/lib/env";

function id(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

// The only writer of the entitlements table. A failed payment moves the
// subscription to past_due, which arrives as customer.subscription.updated.
// Subscriptions are re-read from Stripe rather than taken from the event,
// because events can arrive out of order and an old one would undo a newer
// change.
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
  let refundedCustomer: string | null = null;
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "payment" && session.payment_status === "paid") {
        row = entitlementFromSemesterPass(session);
      } else if (session.mode === "subscription" && session.subscription) {
        row = entitlementFromSubscription(await stripe().subscriptions.retrieve(id(session.subscription)!));
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      row = entitlementFromSubscription(await stripe().subscriptions.retrieve(event.data.object.id));
      break;
    case "charge.refunded":
      // Only a full refund ends a pass; a partial one is a goodwill credit.
      if (event.data.object.refunded) refundedCustomer = id(event.data.object.customer);
      break;
    case "charge.dispute.created": {
      const charge = await stripe().charges.retrieve(id(event.data.object.charge)!);
      refundedCustomer = id(charge.customer);
      break;
    }
  }

  // An error here returns a 500, which makes Stripe retry the event.
  if (row) await saveEntitlement(db(), row);
  if (refundedCustomer) await revokeSemesterPass(db(), refundedCustomer);
  return Response.json({ received: true });
}

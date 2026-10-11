import { hasActiveEntitlement, type Entitlement } from "@/lib/access";
import { getSessionUser } from "@/lib/auth/session";
import { priceEnv } from "@/lib/billing/plans";
import { stripe } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { requireEnv } from "@/lib/env";

const MODES = { pro_monthly: "subscription", pro_semester: "payment" } as const;

// Starts Stripe Checkout for the signed-in student. With payer "parent" it
// returns a link the student can send to a parent or guardian, who pays
// with their own email and card; access still goes to the student.
export async function POST(request: Request) {
  const { plan, payer } = (await request.json().catch(() => ({}))) as { plan?: string; payer?: string };
  if (plan !== "pro_monthly" && plan !== "pro_semester") {
    return new Response("Unknown plan", { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const [profile] = await db()<{ confirmed_13_plus: boolean }[]>`select confirmed_13_plus from profiles where id = ${user.id}`;
  if (!profile?.confirmed_13_plus) return new Response("Accounts are for ages 13 and up", { status: 403 });
  // One plan at a time, so nobody pays twice for the same access.
  const [current] = await db()<{ status: Entitlement["status"]; current_period_end: Date }[]>`
    select status, current_period_end from entitlements where user_id = ${user.id}`;
  if (current && hasActiveEntitlement({ status: current.status, currentPeriodEnd: current.current_period_end })) {
    return new Response("You already have Pro. You can manage it from your account page.", { status: 409 });
  }

  const forParent = payer === "parent";
  const mode = MODES[plan];
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");
  const session = await stripe().checkout.sessions.create({
    mode,
    line_items: [{ price: requireEnv(priceEnv(plan)), quantity: 1 }],
    client_reference_id: user.id,
    ...(forParent || !user.email ? {} : { customer_email: user.email }),
    ...(mode === "subscription"
      ? { subscription_data: { metadata: { user_id: user.id } } }
      : { customer_creation: "always" as const }),
    automatic_tax: { enabled: true },
    success_url: forParent ? `${siteUrl}/pricing/thanks` : `${siteUrl}/account?checkout=success`,
    cancel_url: `${siteUrl}/pricing`,
  });

  return Response.json({ url: session.url, expiresAt: session.expires_at });
}

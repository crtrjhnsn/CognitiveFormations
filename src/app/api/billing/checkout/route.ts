import { stripe } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/env";

const PLANS = {
  pro_monthly: { price: "STRIPE_PRICE_PRO_MONTHLY", mode: "subscription" },
  pro_semester: { price: "STRIPE_PRICE_PRO_SEMESTER", mode: "payment" },
} as const;

export async function POST(request: Request) {
  const { plan } = (await request.json().catch(() => ({}))) as { plan?: string };
  if (plan !== "pro_monthly" && plan !== "pro_semester") {
    return new Response("Unknown plan", { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in first", { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("confirmed_13_plus").eq("id", user.id).single();
  if (!profile?.confirmed_13_plus) return new Response("Accounts are for ages 13 and up", { status: 403 });

  const { price, mode } = PLANS[plan];
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");
  const session = await stripe().checkout.sessions.create({
    mode,
    line_items: [{ price: requireEnv(price), quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email,
    ...(mode === "subscription"
      ? { subscription_data: { metadata: { user_id: user.id } } }
      : { customer_creation: "always" as const }),
    automatic_tax: { enabled: true },
    success_url: `${siteUrl}/account?checkout=success`,
    cancel_url: `${siteUrl}/pricing`,
  });

  return Response.json({ url: session.url });
}

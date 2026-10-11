import "server-only";
import { SEMESTER_PASS_DAYS } from "@/config/billing";
import { stripe } from "@/lib/billing/stripe";

export type PlanId = "pro_monthly" | "pro_semester";

export interface PlanOffer {
  id: PlanId;
  name: string;
  price: string;
  // Shown next to the button, before payment (auto-renewal laws want the
  // renewal terms and how to cancel stated plainly up front).
  terms: string;
}

const PRICE_ENV: Record<PlanId, string> = {
  pro_monthly: "STRIPE_PRICE_PRO_MONTHLY",
  pro_semester: "STRIPE_PRICE_PRO_SEMESTER",
};

function money(amount: number | null, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((amount ?? 0) / 100);
}

// Reads prices from Stripe so the page never shows a stale amount. Returns
// null when billing isn't configured yet.
export async function getPlanOffers(): Promise<PlanOffer[] | null> {
  const monthlyId = process.env[PRICE_ENV.pro_monthly];
  const semesterId = process.env[PRICE_ENV.pro_semester];
  if (!process.env.STRIPE_SECRET_KEY || !monthlyId || !semesterId) return null;
  const [monthly, semester] = await Promise.all([stripe().prices.retrieve(monthlyId), stripe().prices.retrieve(semesterId)]);
  const monthlyPrice = money(monthly.unit_amount, monthly.currency);
  const semesterPrice = money(semester.unit_amount, semester.currency);
  return [
    {
      id: "pro_monthly",
      name: "Pro, monthly",
      price: `${monthlyPrice} a month`,
      terms: `You'll be charged ${monthlyPrice} plus any tax today and again every month until you cancel. Cancel anytime from your account page; Pro stays on until the end of the month you paid for.`,
    },
    {
      id: "pro_semester",
      name: "Pro, semester pass",
      price: `${semesterPrice} once`,
      terms: `One payment of ${semesterPrice} plus any tax for ${SEMESTER_PASS_DAYS} days of Pro. It doesn't renew.`,
    },
  ];
}

export function priceEnv(plan: PlanId) {
  return PRICE_ENV[plan];
}

import "server-only";
import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

let client: Stripe | undefined;

export function stripe(): Stripe {
  client ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return client;
}

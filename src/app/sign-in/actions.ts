"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/next-path";
import { requireEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface SignInState {
  sent?: string;
  error?: string;
}

// Emails a one-time sign-in link. Accounts are created separately (owners by
// scripts/make-owner.ts; students with the 13+ sign-up in phase 4), so an
// unknown email gets the same answer and no account.
export async function sendSignInLink(_state: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  const next = safeNextPath(formData.get("next"));

  const supabase = await createClient();
  const callback = new URL("/auth/callback", requireEnv("NEXT_PUBLIC_SITE_URL"));
  callback.searchParams.set("next", next);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: callback.toString() },
  });
  // Unknown emails also fail here; answer the same way so the form doesn't
  // reveal who has an account. Rate limits are the one error worth showing.
  if (error?.status === 429) return { error: "Too many requests. Try again in a minute." };
  if (error) console.warn("sign-in link not sent", error.code ?? error.message);
  return { sent: email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

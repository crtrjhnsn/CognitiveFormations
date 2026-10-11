"use server";

import { cookies } from "next/headers";
import { AGE_BLOCK_COOKIE, isAtLeast, MIN_AGE, parseBirthDate } from "@/lib/age";
import { safeNextPath } from "@/lib/auth/next-path";
import { requireEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";


export interface SignUpState {
  step: "age" | "email" | "sent" | "blocked";
  birth?: { year: number; month: number; day: number };
  email?: string;
  error?: string;
}

function birthFrom(formData: FormData) {
  return parseBirthDate(formData.get("year"), formData.get("month"), formData.get("day"));
}

// A neutral age screen: it asks for a birth date without saying what age is
// needed, keeps no record of it, and remembers a "no" for a day so the
// answer can't simply be changed with the back button.
export async function signUpStep(state: SignUpState, formData: FormData): Promise<SignUpState> {
  const jar = await cookies();
  if (jar.get(AGE_BLOCK_COOKIE)) return { step: "blocked" };

  const birth = birthFrom(formData);
  if (!birth) return { ...state, step: "age", error: "Enter a real date." };
  if (!isAtLeast(birth, MIN_AGE)) {
    jar.set(AGE_BLOCK_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24, path: "/" });
    return { step: "blocked" };
  }
  if (state.step === "age") return { step: "email", birth };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { step: "email", birth, error: "Enter a valid email address." };

  const callback = new URL("/auth/callback", requireEnv("NEXT_PUBLIC_SITE_URL"));
  callback.searchParams.set("next", safeNextPath(formData.get("next"), "/account"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: callback.toString(), data: { confirmed_13_plus: true } },
  });
  if (error?.status === 429) return { step: "email", birth, error: "Too many requests. Try again in a minute." };
  if (error) return { step: "email", birth, error: "We couldn't send the link. Try again." };
  return { step: "sent", email };
}

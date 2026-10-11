import "server-only";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
  role: "owner" | "student";
}

// The signed-in user, verified from the session JWT, or null.
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return null;
  const [profile] = await db()<{ role: SessionUser["role"] }[]>`select role from profiles where id = ${userId}`;
  if (!profile) return null;
  return { id: userId, email: (data.claims.email as string | undefined) ?? null, role: profile.role };
}

// For owner pages: sends signed-out visitors to sign in and hides the page
// from everyone who isn't an owner.
export async function requireOwner(next = "/owner"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (user.role !== "owner") notFound();
  return user;
}

// For owner actions and route handlers, which report rather than redirect.
export async function ownerOrNull(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.role === "owner" ? user : null;
}

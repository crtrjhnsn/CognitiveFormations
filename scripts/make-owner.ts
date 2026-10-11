// Gives an email owner access to /owner, creating the account if needed.
// Run once per owner with the production env loaded:
//
//   npm run make-owner -- you@example.com
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { requireEnv } from "@/lib/env";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email?.includes("@")) throw new Error("Usage: npm run make-owner -- <email>");
  const sql = db();

  let [profile] = await sql<{ id: string }[]>`select id from profiles where lower(email) = ${email}`;
  if (!profile) {
    const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    // Owners are adults running the business, so the 13+ screen is answered here.
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { confirmed_13_plus: true } });
    if (error) throw error;
    [profile] = await sql<{ id: string }[]>`select id from profiles where lower(email) = ${email}`;
  }
  await sql`update profiles set role = 'owner' where id = ${profile.id}`;
  console.log(`${email} is an owner. Sign in at /sign-in?next=/owner`);
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

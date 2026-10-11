import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

// Where the emailed sign-in link lands. Handles both the PKCE code and the
// token-hash link formats, then sends the user on to `next`.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const supabase = await createClient();

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing sign-in code") };

  const target = error ? new URL(`/sign-in?error=1&next=${encodeURIComponent(next)}`, request.url) : new URL(next, request.url);
  return NextResponse.redirect(target);
}

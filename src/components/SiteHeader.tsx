import Link from "next/link";
import { Suspense } from "react";
import { SITE_NAME } from "@/config/site";
import { getSessionUser } from "@/lib/auth/session";

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold">{SITE_NAME}</Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-zinc-600 hover:text-zinc-900">Plans</Link>
          <Suspense fallback={<span className="w-14" />}>
            <AccountLink />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

async function AccountLink() {
  const user = await getSessionUser().catch(() => null);
  if (!user) return <Link href="/sign-in" className="text-zinc-600 hover:text-zinc-900">Sign in</Link>;
  return (
    <>
      {user.role === "owner" && <Link href="/owner" className="text-zinc-600 hover:text-zinc-900">Owner</Link>}
      <Link href="/account" className="text-zinc-600 hover:text-zinc-900">Account</Link>
    </>
  );
}

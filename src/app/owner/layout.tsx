import Link from "next/link";
import { SITE_NAME } from "@/config/site";
import { signOut } from "../sign-in/actions";

export const metadata = { robots: { index: false } };

// Owner pages read the session on every request, so they block rather than
// prerender a shell.
export const instant = false;

export default function OwnerLayout({ children }: LayoutProps<"/owner">) {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <header className="mb-8 flex items-center justify-between border-b border-zinc-200 pb-4">
        <Link href="/owner" className="font-semibold">
          {SITE_NAME} · Owner
        </Link>
        <form action={signOut}>
          <button className="text-sm text-zinc-600 hover:text-zinc-900">Sign out</button>
        </form>
      </header>
      {children}
    </div>
  );
}

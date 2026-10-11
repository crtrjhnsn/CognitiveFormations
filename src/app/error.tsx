"use client";

import Link from "next/link";

// Shown in place of a page that failed on the server or in the browser. In
// production the error carries only a digest, which matches the server log.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-zinc-700">
        This page didn&apos;t load. Try again, and if it keeps happening, come back in a few minutes.
      </p>
      {error.digest && <p className="mt-2 text-xs text-zinc-500">Error reference: {error.digest}</p>}
      <div className="mt-6 flex gap-4">
        <button type="button" onClick={() => retry()} className="rounded bg-zinc-900 px-4 py-2 text-white">
          Try again
        </button>
        <Link href="/" className="self-center underline">
          Home page
        </Link>
      </div>
    </main>
  );
}

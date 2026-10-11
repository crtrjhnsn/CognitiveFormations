"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

// Last-resort page for errors in the root layout itself. It replaces the
// whole document, so it brings its own <html>, <body> and styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // Server errors are reported where they happen and arrive here with only a
  // digest; report the ones that happened in the browser.
  useEffect(() => {
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-white font-sans text-zinc-900">
        <title>Something went wrong</title>
        <main className="mx-auto w-full max-w-xl px-6 py-16">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-zinc-700">The site didn&apos;t load. Try again in a few minutes.</p>
          {error.digest && <p className="mt-2 text-xs text-zinc-500">Error reference: {error.digest}</p>}
          <button type="button" onClick={() => retry()} className="mt-6 rounded bg-zinc-900 px-4 py-2 text-white">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

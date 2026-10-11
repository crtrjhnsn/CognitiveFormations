"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendSignInLink, type SignInState } from "./actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendSignInLink, {});
  if (state.sent) {
    return <p className="mt-6 text-zinc-700">If {state.sent} has an account, a sign-in link is on its way. It works once.</p>;
  }
  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium" htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required autoComplete="email" className="w-full rounded border border-zinc-300 px-3 py-2" />
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="text-sm text-zinc-600">
        New here? <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="underline">Create an account</Link>
      </p>
    </form>
  );
}

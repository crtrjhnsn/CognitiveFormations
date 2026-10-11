"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpStep, type SignUpState } from "./actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function SignUpForm({ next, blocked }: { next: string; blocked: boolean }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUpStep, { step: blocked ? "blocked" : "age" });
  const box = "rounded border border-zinc-300 px-2 py-2";

  if (state.step === "blocked") {
    return <p className="mt-6 text-zinc-700">Sorry, we can&apos;t create an account for you right now.</p>;
  }
  if (state.step === "sent") {
    return <p className="mt-6 text-zinc-700">Check {state.email} for a link to finish signing up. It works once.</p>;
  }
  const birth = state.birth;
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      {state.step === "age" ? (
        <fieldset>
          <legend className="text-sm font-medium">Date of birth</legend>
          <div className="mt-1 flex gap-2">
            <select name="month" required defaultValue="" className={box} aria-label="Month">
              <option value="" disabled>Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <input name="day" type="number" min={1} max={31} required placeholder="Day" aria-label="Day" className={`${box} w-20`} />
            <input name="year" type="number" min={1900} max={2100} required placeholder="Year" aria-label="Year" className={`${box} w-24`} />
          </div>
        </fieldset>
      ) : (
        <>
          <input type="hidden" name="year" value={birth?.year} />
          <input type="hidden" name="month" value={birth?.month} />
          <input type="hidden" name="day" value={birth?.day} />
          <label className="block text-sm font-medium">
            Email
            <input name="email" type="email" required autoComplete="email" className={`mt-1 w-full ${box}`} />
          </label>
        </>
      )}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50">
        {pending ? "One moment…" : state.step === "age" ? "Continue" : "Email me a sign-up link"}
      </button>
      <p className="text-sm text-zinc-600">
        Already have an account? <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="underline">Sign in</Link>
      </p>
    </form>
  );
}

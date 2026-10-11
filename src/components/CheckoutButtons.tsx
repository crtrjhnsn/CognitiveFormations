"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Pay now, or make a link for a parent or guardian to pay.
export function CheckoutButtons({ plan }: { plan: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [parentLink, setParentLink] = useState<string>();

  const start = async (payer: "self" | "parent") => {
    setPending(true);
    setError(undefined);
    const res = await fetch("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan, payer }) });
    setPending(false);
    if (res.status === 401) return router.push("/sign-up?next=/pricing");
    if (!res.ok) return setError((await res.text()) || "Something went wrong. Try again.");
    const { url } = (await res.json()) as { url: string };
    if (payer === "self") window.location.assign(url);
    else setParentLink(url);
  };

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap gap-3">
        <button onClick={() => start("self")} disabled={pending} className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          Continue to payment
        </button>
        <button onClick={() => start("parent")} disabled={pending} className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50">
          Ask a parent to pay
        </button>
      </div>
      {parentLink && (
        <div className="rounded bg-zinc-50 p-3 text-sm">
          <p>Send this link to a parent or guardian. It works for 24 hours and adds Pro to your account once they pay.</p>
          <input readOnly value={parentLink} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded border border-zinc-300 px-2 py-1 text-xs" />
          <button onClick={() => navigator.clipboard?.writeText(parentLink)} className="mt-2 text-xs underline">Copy link</button>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

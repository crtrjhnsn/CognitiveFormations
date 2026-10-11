import { connection } from "next/server";
import { Suspense } from "react";
import { CheckoutButtons } from "@/components/CheckoutButtons";
import { getPlanOffers } from "@/lib/billing/plans";

export const metadata = { title: "Plans" };

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Plans</h1>
      <p className="mt-2 text-zinc-600">
        Every course has free sections. Pro opens every unit&apos;s full study guide and all practice questions.
      </p>
      <Suspense fallback={<p className="mt-8 text-zinc-500">Loading prices…</p>}>
        <Offers />
      </Suspense>
    </main>
  );
}

async function Offers() {
  await connection();
  const offers = await getPlanOffers();
  if (!offers) return <p className="mt-8 text-zinc-700">Pro plans open soon.</p>;
  return (
    <div className="mt-8 grid gap-6 sm:grid-cols-2">
      {offers.map((offer) => (
        <section key={offer.id} className="rounded border border-zinc-200 p-5">
          <h2 className="text-lg font-semibold">{offer.name}</h2>
          <p className="mt-1 text-2xl">{offer.price}</p>
          <p className="mt-3 text-sm text-zinc-600">{offer.terms}</p>
          <CheckoutButtons plan={offer.id} />
        </section>
      ))}
    </div>
  );
}

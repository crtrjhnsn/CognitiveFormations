export const metadata = { title: "Thank you", robots: { index: false } };

// Where a parent lands after paying for a student's plan.
export default function ThanksPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Thank you</h1>
      <p className="mt-3 text-zinc-700">
        Payment received. Pro is now on for the student&apos;s account. Stripe will email you a receipt, and any
        subscription can be cancelled from the student&apos;s account page or the link in that receipt.
      </p>
    </main>
  );
}

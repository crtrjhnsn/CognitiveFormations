import Link from "next/link";

export const metadata = { title: "Page not found" };

// Shown for unknown URLs and wherever a page calls notFound(), including
// owner pages viewed by anyone who isn't an owner.
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-3 text-zinc-700">That page doesn&apos;t exist or has moved.</p>
      <Link href="/" className="mt-6 inline-block underline">
        Go to the home page
      </Link>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { hasActiveEntitlement } from "@/lib/access";
import { getViewer } from "@/lib/viewer";
import { signOut } from "../sign-in/actions";
import { openBillingPortal } from "./actions";

export const metadata = { title: "Your account", robots: { index: false } };

const PLAN_NAMES: Record<string, string> = { pro_monthly: "Pro, monthly", pro_semester: "Pro, semester pass", school: "School" };

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Your account</h1>
      <Suspense fallback={<p className="mt-6 text-zinc-500">Loading…</p>}>
        <Account searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Account({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  const params = await searchParams;
  const { user, entitlement } = await getViewer();
  if (!user) redirect("/sign-in?next=/account");
  const active = hasActiveEntitlement(entitlement);
  const date = entitlement?.currentPeriodEnd.toLocaleDateString("en-US", { dateStyle: "long" });

  return (
    <div className="mt-6 space-y-6">
      {params.checkout === "success" && (
        <p className="rounded bg-green-50 p-3 text-sm text-green-900">Thanks! Pro turns on as soon as Stripe confirms the payment, usually within a minute.</p>
      )}
      <p className="text-sm text-zinc-600">Signed in as {user.email}</p>
      <section className="rounded border border-zinc-200 p-4">
        <h2 className="font-medium">Plan</h2>
        {entitlement ? (
          <>
            <p className="mt-1 text-sm">
              {PLAN_NAMES[entitlement.plan] ?? entitlement.plan}:{" "}
              {active
                ? entitlement.plan === "pro_semester" || entitlement.cancelAtPeriodEnd
                  ? `active until ${date}${entitlement.cancelAtPeriodEnd ? " (cancelled, won't renew)" : ""}`
                  : `renews ${date}`
                : entitlement.status === "past_due"
                  ? "payment failed; update your card to keep Pro"
                  : `ended ${date}`}
            </p>
            {entitlement.plan !== "pro_semester" && (
              <form action={openBillingPortal} className="mt-3">
                <button className="rounded border border-zinc-300 px-4 py-1 text-sm">Manage billing or cancel</button>
              </form>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm">
            Free. <Link href="/pricing" className="underline">See Pro plans</Link>
          </p>
        )}
      </section>
      <form action={signOut}>
        <button className="text-sm text-zinc-600 underline">Sign out</button>
      </form>
    </div>
  );
}

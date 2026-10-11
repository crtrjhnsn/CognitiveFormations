import Link from "next/link";

export function LockedCard({ label, signedIn }: { label: string; signedIn: boolean }) {
  return (
    <div className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
      <span className="font-medium text-zinc-800">{label}</span> is part of Pro.{" "}
      <Link href={signedIn ? "/pricing" : "/sign-up?next=/pricing"} className="underline">
        {signedIn ? "See plans" : "Create an account to see plans"}
      </Link>
    </div>
  );
}

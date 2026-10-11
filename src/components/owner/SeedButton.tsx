"use client";

import { useTransition } from "react";
import { seedCourse } from "@/app/owner/actions";

export function SeedButton({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => seedCourse(slug))}
      disabled={pending}
      className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-50"
    >
      {pending ? "Creating…" : "Set up"}
    </button>
  );
}

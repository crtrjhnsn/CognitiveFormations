"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/owner/actions";

// A button that runs a server action and shows its error, if any.
export function ActionButton({
  action,
  children,
  pendingLabel,
  variant = "primary",
}: {
  action: () => Promise<ActionResult | void>;
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const style =
    variant === "primary" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-800 hover:bg-zinc-50";
  return (
    <span className="inline-flex items-center gap-3">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await action();
            setError(result?.error);
          })
        }
        className={`rounded px-4 py-1 text-sm disabled:opacity-50 ${style}`}
      >
        {pending ? pendingLabel : children}
      </button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </span>
  );
}

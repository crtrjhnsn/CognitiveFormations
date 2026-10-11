"use client";

import { useState, useTransition } from "react";
import { changeTier } from "@/app/owner/actions";

export function TierSelect({ itemId, tier }: { itemId: string; tier: "free" | "pro" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <label className="text-xs text-zinc-600">
      Access{" "}
      <select
        defaultValue={tier}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as "free" | "pro";
          start(async () => setError((await changeTier(itemId, next)).error));
        }}
        className="rounded border border-zinc-300 px-1"
      >
        <option value="free">Free</option>
        <option value="pro">Pro</option>
      </select>
      {error && <span className="ml-2 text-red-700">{error}</span>}
    </label>
  );
}

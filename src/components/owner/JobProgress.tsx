"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Progress {
  status: string;
  error: string | null;
  costEstimate: number | null;
  done: number;
  steps: { position: number; title: string; status: string; error: string | null }[];
}

const ACTIVE = ["queued", "running"];

// Polls the job while it runs, then refreshes the page so the rest of the
// setup view (course status, retry button) catches up.
export function JobProgress({ jobId, initial }: { jobId: string; initial: Progress }) {
  const [progress, setProgress] = useState(initial);
  const router = useRouter();

  useEffect(() => {
    if (!ACTIVE.includes(progress.status)) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/owner/jobs/${jobId}`, { cache: "no-store" });
      if (!res.ok) return;
      const next: Progress = await res.json();
      setProgress(next);
      if (!ACTIVE.includes(next.status)) router.refresh();
    }, 3000);
    return () => clearTimeout(timer);
  }, [jobId, progress, router]);

  return (
    <div className="mt-4">
      <p className="text-sm">
        {progress.done} of {progress.steps.length} units done · {progress.status}
        {progress.costEstimate !== null && ` · about $${progress.costEstimate.toFixed(2)} so far`}
      </p>
      {progress.error && <p className="mt-1 text-sm text-red-700">{progress.error}</p>}
      <ol className="mt-2 space-y-1 text-sm">
        {progress.steps.map((s) => (
          <li key={s.position} className="flex gap-2">
            <span className="w-20 text-zinc-500">{s.status}</span>
            <span>
              Unit {s.position}: {s.title}
              {s.error && <span className="block text-xs text-red-700">{s.error}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { approve, approveUnit, publish, regenerate, unpublish } from "@/app/owner/actions";
import { ActionButton } from "@/components/owner/ActionButton";
import { FlagNote } from "@/components/owner/FlagNote";
import { ItemContent, sectionLabel } from "@/components/owner/ItemContent";
import { TierSelect } from "@/components/owner/TierSelect";
import { requireOwner } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getReviewSummary, listReviewItems, type ReviewStatus } from "@/lib/owner/review";

export const metadata = { title: "Review" };
// Regenerating a question drafts and re-checks it with Claude inside the action.
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: { value: ReviewStatus; label: string }[] = [
  { value: "flagged", label: "Flagged" },
  { value: "draft", label: "To approve" },
  { value: "approved", label: "Approved" },
  { value: "all", label: "All" },
];

export default async function ReviewPage({ params, searchParams }: PageProps<"/owner/courses/[id]/review">) {
  const { id } = await params;
  const query = await searchParams;
  const owner = await requireOwner(`/owner/courses/${id}/review`);
  if (!UUID.test(id)) notFound();
  const sql = db();
  const summary = await getReviewSummary(sql, owner.id, id);
  if (!summary) notFound();
  const { course, units, totals, publishBlocker } = summary;

  const requested = STATUSES.find((s) => s.value === query.status)?.value;
  const status: ReviewStatus = requested ?? (totals.flagged ? "flagged" : totals.draft ? "draft" : "all");
  const unitPosition = Number(query.unit) || undefined;
  const items = await listReviewItems(sql, owner.id, id, { status, unitPosition });
  const href = (next: { status?: string; unit?: number }) => {
    const p = new URLSearchParams({ status: next.status ?? status });
    const unit = "unit" in next ? next.unit : unitPosition;
    if (unit) p.set("unit", String(unit));
    return `/owner/courses/${id}/review?${p}`;
  };

  return (
    <main className="space-y-8">
      <div>
        <Link href={`/owner/courses/${id}`} className="text-sm text-zinc-500 hover:underline">← Course setup</Link>
        <h1 className="mt-2 text-2xl font-semibold">Review: {course.title}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {totals.flagged} flagged · {totals.draft} to approve · {totals.approved} approved
        </p>
      </div>

      <section className="rounded border border-zinc-200 p-4">
        {course.status === "published" ? (
          <div className="flex items-center gap-4">
            <p className="text-sm">Published. Approved items are live.</p>
            <ActionButton action={unpublish.bind(null, id)} pendingLabel="Unpublishing…" variant="secondary">Unpublish</ActionButton>
          </div>
        ) : publishBlocker ? (
          <p className="text-sm">Publishing opens when every item is approved. {publishBlocker}</p>
        ) : (
          <div className="flex items-center gap-4">
            <p className="text-sm">Everything is approved.</p>
            <ActionButton action={publish.bind(null, id)} pendingLabel="Publishing…">Publish course</ActionButton>
          </div>
        )}
      </section>

      <nav className="flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s.value} href={href({ status: s.value })} className={`rounded px-2 py-1 ${s.value === status ? "bg-zinc-900 text-white" : "border border-zinc-300"}`}>
            {s.label}
          </Link>
        ))}
        <span className="mx-2 text-zinc-300">|</span>
        <Link href={href({ unit: undefined })} className={!unitPosition ? "font-medium" : "text-zinc-600"}>All units</Link>
        {units.map((u) => (
          <Link key={u.id} href={href({ unit: u.position })} className={u.position === unitPosition ? "font-medium" : "text-zinc-600"} title={u.title}>
            Unit {u.position}
            {u.flagged > 0 && <span className="text-amber-700"> ({u.flagged})</span>}
          </Link>
        ))}
      </nav>

      {unitPosition && (units.find((u) => u.position === unitPosition)?.draft ?? 0) > 0 && (
        <ActionButton action={approveUnit.bind(null, id, unitPosition)} pendingLabel="Approving…" variant="secondary">
          Approve all unflagged items in unit {unitPosition}
        </ActionButton>
      )}

      {items.length === 0 ? (
        <p className="text-zinc-600">Nothing here.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id} className="rounded border border-zinc-200 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span>Unit {item.unit_position}</span>
                <span>{item.kind === "mcq" ? `Practice question ${item.position + 1}` : sectionLabel(item.content.section)}</span>
                <span>v{item.version}</span>
                <span className={item.status === "approved" ? "text-green-700" : item.status === "flagged" ? "text-amber-700" : ""}>{item.status}</span>
                {item.gap_filled && <span className="rounded bg-zinc-100 px-1">filled in beyond your files</span>}
                <TierSelect itemId={item.id} tier={item.tier as "free" | "pro"} />
              </div>
              <ItemContent item={item} />
              {item.flags.length > 0 && (
                <div className="mt-3 space-y-2">
                  {item.flags.map((flag) => (
                    <FlagNote key={flag.id} flag={flag} sources={item.flagSources} />
                  ))}
                </div>
              )}
              {item.citations.length > 0 && (
                <details className="mt-2 text-xs text-zinc-600">
                  <summary className="cursor-pointer">Sources ({item.citations.length})</summary>
                  <ul className="mt-1 space-y-1">
                    {item.citations.map((c, i) => (
                      <li key={i}>
                        {c.filename}
                        {c.page !== null && `, p. ${c.page}`}: “{c.quote}”
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                {item.status !== "approved" && (
                  <ActionButton action={approve.bind(null, item.id)} pendingLabel="Approving…">Approve</ActionButton>
                )}
                <Link href={`/owner/courses/${id}/review/${item.id}`} className="rounded border border-zinc-300 px-4 py-1 text-sm hover:bg-zinc-50">
                  Edit
                </Link>
                {item.kind === "mcq" && (
                  <ActionButton action={regenerate.bind(null, item.id)} pendingLabel="Writing a new question…" variant="secondary">
                    Regenerate
                  </ActionButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

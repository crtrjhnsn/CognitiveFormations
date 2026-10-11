import Link from "next/link";
import { notFound } from "next/navigation";
import { rollback } from "@/app/owner/actions";
import { ActionButton } from "@/components/owner/ActionButton";
import { EditItemForm } from "@/components/owner/EditItemForm";
import { FlagNote } from "@/components/owner/FlagNote";
import { ItemContent, itemLabel } from "@/components/owner/ItemContent";
import { requireOwner } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getReviewItem } from "@/lib/owner/review";

export const metadata = { title: "Edit item" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditItemPage({ params }: PageProps<"/owner/courses/[id]/review/[itemId]">) {
  const { id, itemId } = await params;
  const owner = await requireOwner(`/owner/courses/${id}/review/${itemId}`);
  if (!UUID.test(id) || !UUID.test(itemId)) notFound();
  const item = await getReviewItem(db(), owner.id, itemId);
  if (!item || item.course_id !== id) notFound();
  const backHref = `/owner/courses/${id}/review?status=all&unit=${item.unit_position}`;

  return (
    <main className="space-y-8">
      <div>
        <Link href={backHref} className="text-sm text-zinc-500 hover:underline">← Review</Link>
        <h1 className="mt-2 text-xl font-semibold">
          Unit {item.unit_position}: {itemLabel(item)}
        </h1>
        <p className="text-sm text-zinc-600">Version {item.version} · {item.status}</p>
      </div>
      {item.flags.length > 0 && (
        <div className="space-y-2">
          {item.flags.map((flag) => (
            <FlagNote key={flag.id} flag={flag} sources={item.flagSources} />
          ))}
        </div>
      )}
      <EditItemForm key={item.version} itemId={item.id} kind={item.kind} content={item.content} backHref={backHref} />
      {item.versions.length > 0 && (
        <section>
          <h2 className="font-medium">Earlier versions</h2>
          <ul className="mt-2 space-y-3">
            {item.versions.map((v) => (
              <li key={v.version} className="rounded border border-zinc-200 p-3">
                <div className="mb-2 flex items-center gap-3 text-sm">
                  <span>Version {v.version}</span>
                  <span className="text-zinc-500">replaced {v.created_at.toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
                  <ActionButton action={rollback.bind(null, item.id, v.version)} pendingLabel="Restoring…" variant="secondary">Restore</ActionButton>
                </div>
                <ItemContent item={{ kind: item.kind, content: v.content }} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

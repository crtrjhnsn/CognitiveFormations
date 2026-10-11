import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SITE_NAME } from "@/config/site";
import { getCourse } from "@/lib/courses";
import { db } from "@/lib/db";
import { getProgress } from "@/lib/study";
import { getViewer } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/c/[slug]/progress">) {
  const course = getCourse((await params).slug);
  return { title: course ? `Your progress · ${SITE_NAME}'s Guide to ${course.title}` : SITE_NAME, robots: { index: false } };
}

export default function ProgressPage({ params }: PageProps<"/c/[slug]/progress">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Progress params={params} />
      </Suspense>
    </main>
  );
}

async function Progress({ params }: Pick<PageProps<"/c/[slug]/progress">, "params">) {
  const { slug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();
  const viewer = await getViewer();
  if (!viewer.user) redirect(`/sign-in?next=${encodeURIComponent(`/c/${slug}/progress`)}`);
  const units = await getProgress(db(), slug, viewer.user.id);
  if (!units) notFound();
  const due = units.reduce((n, u) => n + u.cardsDue, 0);

  return (
    <>
      <Link href={`/c/${slug}`} className="text-sm text-zinc-500 hover:underline">
        ← {SITE_NAME}&apos;s Guide to {course.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Your progress</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Questions count your most recent answer. Flashcards count cards you&apos;ve studied at least once.
        {due > 0 && (
          <>
            {" "}
            <Link href={`/c/${slug}/cards`} className="underline">
              {due} {due === 1 ? "card is" : "cards are"} due now
            </Link>
            .
          </>
        )}
      </p>
      <table className="mt-6 w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-zinc-500">
          <tr>
            <th className="py-2 pr-4 font-normal">Unit</th>
            <th className="py-2 pr-4 font-normal">Questions right</th>
            <th className="py-2 font-normal">Flashcards studied</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.position} className="border-b border-zinc-100">
              <td className="py-2 pr-4">
                <Link href={`/c/${slug}/${u.position}`} className="hover:underline">
                  {u.position}. {u.title}
                </Link>
              </td>
              <td className="py-2 pr-4">
                {u.questions === 0 ? "—" : `${u.correct} of ${u.questions}`}
                {u.answered > 0 && u.answered < u.questions && <span className="text-zinc-500"> ({u.answered} tried)</span>}
              </td>
              <td className="py-2">{u.cards === 0 ? "—" : `${u.cardsStarted} of ${u.cards}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

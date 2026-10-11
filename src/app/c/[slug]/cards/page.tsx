import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CardDeck } from "@/components/course/CardDeck";
import { SITE_NAME } from "@/config/site";
import { getCourse } from "@/lib/courses";
import { db } from "@/lib/db";
import { getStudyCards } from "@/lib/study";
import { getViewer } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/c/[slug]/cards">) {
  const course = getCourse((await params).slug);
  return { title: course ? `Flashcards · ${SITE_NAME}'s Guide to ${course.title}` : SITE_NAME, robots: { index: false } };
}

// A flashcard session: cards due for review first, then a few new ones.
// Scheduling is per student, so this page needs an account.
export default function CardsPage({ params, searchParams }: PageProps<"/c/[slug]/cards">) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Cards params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Cards({ params, searchParams }: Pick<PageProps<"/c/[slug]/cards">, "params" | "searchParams">) {
  const { slug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();
  const unitParam = (await searchParams).unit;
  const unitPosition = typeof unitParam === "string" && /^\d+$/.test(unitParam) ? Number(unitParam) : undefined;
  const viewer = await getViewer();
  if (!viewer.user) {
    const here = `/c/${slug}/cards${unitPosition ? `?unit=${unitPosition}` : ""}`;
    redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  }
  const cards = await getStudyCards(db(), slug, { userId: viewer.user.id, entitlement: viewer.entitlement }, { unitPosition });
  const unit = unitPosition ? course.units.find((u) => u.position === unitPosition) : undefined;

  return (
    <>
      <Link href={unit ? `/c/${slug}/${unit.position}` : `/c/${slug}`} className="text-sm text-zinc-500 hover:underline">
        ← {unit ? `Unit ${unit.position}: ${unit.title}` : `${SITE_NAME}'s Guide to ${course.title}`}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Flashcards{unit && `: Unit ${unit.position}`}</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Rate each card after you check the answer. Cards you find hard come back sooner.
        {unit && (
          <>
            {" "}
            <Link href={`/c/${slug}/cards`} className="underline">
              Study all units
            </Link>
          </>
        )}
      </p>
      <CardDeck cards={cards} slug={slug} />
    </>
  );
}

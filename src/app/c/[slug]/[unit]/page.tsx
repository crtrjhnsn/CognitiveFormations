import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GuideSection, SECTION_TITLES, sectionKey } from "@/components/course/GuideSection";
import { LockedCard } from "@/components/course/LockedCard";
import { PracticeQuestion } from "@/components/course/PracticeQuestion";
import { SITE_NAME } from "@/config/site";
import { getPublishedUnit, type StudentItem } from "@/lib/catalog";
import { getCourse } from "@/lib/courses";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/c/[slug]/[unit]">) {
  const { slug, unit } = await params;
  const course = getCourse(slug);
  const title = course?.units.find((u) => String(u.position) === unit)?.title;
  return { title: course && title ? `Unit ${unit}: ${title} · ${SITE_NAME}'s Guide to ${course.title}` : SITE_NAME };
}

// A unit's study guide and practice questions. Free parts render for
// everyone; Pro parts only for subscribers, checked on the server.
export default function UnitPage({ params }: PageProps<"/c/[slug]/[unit]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Unit params={params} />
      </Suspense>
    </main>
  );
}

async function Unit({ params }: Pick<PageProps<"/c/[slug]/[unit]">, "params">) {
  const { slug, unit: unitParam } = await params;
  const position = Number(unitParam);
  if (!Number.isInteger(position) || position < 1) notFound();
  const viewer = await getViewer();
  const data = await getPublishedUnit(db(), slug, position, viewer.entitlement);
  if (!data) notFound();
  const { unit, guide, practice } = data;
  const signedIn = Boolean(viewer.user);

  return (
    <>
      <Link href={`/c/${slug}`} className="text-sm text-zinc-500 hover:underline">
        ← {SITE_NAME}&apos;s Guide to {unit.course_title}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">
        Unit {unit.position}: {unit.title}
      </h1>
      <ul className="mt-3 list-disc pl-5 text-sm text-zinc-600">
        {unit.objectives.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>

      {guide.length > 0 && <GuideList items={guide} signedIn={signedIn} />}

      {practice.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Practice questions</h2>
          <div className="mt-4 space-y-4">
            {practice.map((item, i) =>
              item.locked || item.kind !== "mcq" ? (
                <LockedCard key={item.id} label={`Question ${i + 1}`} signedIn={signedIn} />
              ) : (
                <PracticeQuestion key={item.id} id={item.id} number={i + 1} stem={item.content.stem} choices={item.content.choices} />
              ),
            )}
          </div>
        </section>
      )}
      {guide.length === 0 && practice.length === 0 && <p className="mt-8 text-zinc-600">This unit is still being written.</p>}
    </>
  );
}

function GuideList({ items, signedIn }: { items: StudentItem[]; signedIn: boolean }) {
  // Group consecutive parts of the same section under one heading.
  const groups: { key: string; items: StudentItem[] }[] = [];
  for (const item of items) {
    const key = item.locked ? item.label : sectionKey(item.content);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return (
    <div className="mt-8 space-y-8">
      {groups.map((group, i) => (
        <section key={i}>
          <h2 className="text-lg font-semibold">{SECTION_TITLES[group.key] ?? group.key}</h2>
          <div className="mt-2 space-y-3">
            {group.items.map((item) =>
              item.locked ? (
                <LockedCard key={item.id} label={SECTION_TITLES[group.key] ?? "This section"} signedIn={signedIn} />
              ) : item.kind === "guide_section" ? (
                <GuideSection key={item.id} content={item.content} />
              ) : null,
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE_NAME } from "@/config/site";
import { getPublishedCourse } from "@/lib/catalog";
import { courses, getCourse } from "@/lib/courses";
import { db } from "@/lib/db";

export function generateStaticParams() {
  return courses.map((course) => ({ slug: course.slug }));
}

export async function generateMetadata({ params }: PageProps<"/c/[slug]">) {
  const course = getCourse((await params).slug);
  return { title: course ? `${SITE_NAME}'s Guide to ${course.title}` : SITE_NAME };
}

// Course outline page. The outline is static; which units are published
// comes from the database per request.
export default async function CoursePage({ params }: PageProps<"/c/[slug]">) {
  const course = getCourse((await params).slug);
  if (!course) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">
        {SITE_NAME}&apos;s Guide to {course.title}
      </h1>
      <p className="mt-2 text-zinc-600">{course.level}</p>
      <Suspense
        fallback={
          <ol className="mt-8 space-y-6">
            {course.units.map((unit) => (
              <li key={unit.position} className="font-medium">
                Unit {unit.position}: {unit.title}
              </li>
            ))}
          </ol>
        }
      >
        <Units slug={course.slug} />
      </Suspense>
    </main>
  );
}

async function Units({ slug }: { slug: string }) {
  await connection();
  const published = await getPublishedCourse(db(), slug);
  const config = getCourse(slug)!;
  const units = published?.units ?? config.units.map((u) => ({ ...u, guideParts: 0, questions: 0 }));
  return (
    <>
      {!published && <p className="mt-6 rounded bg-zinc-50 p-3 text-sm text-zinc-700">This guide is being written. Here&apos;s what it will cover.</p>}
      <ol className="mt-8 space-y-6">
        {units.map((unit) => {
          const ready = unit.guideParts + unit.questions > 0;
          return (
            <li key={unit.position}>
              <h2 className="font-medium">
                {ready ? (
                  <Link href={`/c/${slug}/${unit.position}`} className="underline">
                    Unit {unit.position}: {unit.title}
                  </Link>
                ) : (
                  <>
                    Unit {unit.position}: {unit.title}
                  </>
                )}
              </h2>
              {ready && (
                <p className="text-xs text-zinc-500">
                  Study guide{unit.questions > 0 && ` · ${unit.questions} practice questions`}
                </p>
              )}
              <ul className="mt-2 list-disc pl-5 text-sm text-zinc-600">
                {unit.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </>
  );
}

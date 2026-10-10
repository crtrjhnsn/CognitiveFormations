import { notFound } from "next/navigation";
import { SITE_NAME } from "@/config/site";
import { courses, getCourse } from "@/lib/courses";

export function generateStaticParams() {
  return courses.map((course) => ({ slug: course.slug }));
}

export async function generateMetadata({ params }: PageProps<"/c/[slug]">) {
  const course = getCourse((await params).slug);
  return { title: course ? `${SITE_NAME}'s Guide to ${course.title}` : SITE_NAME };
}

// Course outline page. Free content is static and indexable; Pro content will
// be fetched per request through the paywall (phase 4).
export default async function CoursePage({ params }: PageProps<"/c/[slug]">) {
  const course = getCourse((await params).slug);
  if (!course) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">
        {SITE_NAME}&apos;s Guide to {course.title}
      </h1>
      <p className="mt-2 text-zinc-600">{course.level}</p>
      <ol className="mt-8 space-y-6">
        {course.units.map((unit) => (
          <li key={unit.position}>
            <h2 className="font-medium">
              Unit {unit.position}: {unit.title}
            </h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-zinc-600">
              {unit.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </main>
  );
}

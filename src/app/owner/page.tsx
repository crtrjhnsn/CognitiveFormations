import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { courses as courseConfigs } from "@/lib/courses";
import { db } from "@/lib/db";
import { listCourses } from "@/lib/owner/courses";
import { SeedButton } from "@/components/owner/SeedButton";

export const metadata = { title: "Courses" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Setting up",
  generating: "Generating",
  needs_review: "Needs review",
  ready: "Ready to publish",
  published: "Published",
};

export default async function OwnerHome() {
  const owner = await requireOwner();
  const courses = await listCourses(db(), owner.id);
  const unseeded = courseConfigs.filter((c) => !courses.some((row) => row.slug === c.slug));

  return (
    <main>
      <h1 className="text-2xl font-semibold">Courses</h1>
      {courses.length === 0 && <p className="mt-4 text-zinc-600">No courses yet. Start from a course outline below.</p>}
      <ul className="mt-6 divide-y divide-zinc-200">
        {courses.map((course) => (
          <li key={course.id} className="flex items-center justify-between py-3">
            <Link href={`/owner/courses/${course.id}`} className="font-medium hover:underline">
              {course.title}
            </Link>
            <span className="text-sm text-zinc-600">
              {STATUS_LABEL[course.status] ?? course.status}
              {course.open_flags > 0 && ` · ${course.open_flags} flagged`}
            </span>
          </li>
        ))}
      </ul>
      {unseeded.length > 0 && (
        <section className="mt-10">
          <h2 className="font-medium">Start a course</h2>
          <ul className="mt-3 space-y-2">
            {unseeded.map((c) => (
              <li key={c.slug} className="flex items-center gap-3">
                <span>{c.title}</span>
                <SeedButton slug={c.slug} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

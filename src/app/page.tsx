import Link from "next/link";
import { SITE_NAME } from "@/config/site";
import { courses } from "@/lib/courses";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">{SITE_NAME}</h1>
      <p className="mt-2 text-zinc-600">Study guides, flashcards and practice exams.</p>
      <h2 className="mt-10 text-lg font-medium">Courses</h2>
      <ul className="mt-3 space-y-2">
        {courses.map((course) => (
          <li key={course.slug}>
            <Link href={`/c/${course.slug}`} className="underline">
              {SITE_NAME}&apos;s Guide to {course.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

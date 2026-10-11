import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PracticeExam } from "@/components/course/PracticeExam";
import { SITE_NAME } from "@/config/site";
import { getCourse } from "@/lib/courses";
import { db } from "@/lib/db";
import { buildExam } from "@/lib/study";
import { getViewer } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/c/[slug]/exam">) {
  const course = getCourse((await params).slug);
  return { title: course ? `Practice exam · ${SITE_NAME}'s Guide to ${course.title}` : SITE_NAME, robots: { index: false } };
}

// A practice exam drawn fresh on each visit from the course's approved
// questions. Answers are scored on the server.
export default function ExamPage({ params }: PageProps<"/c/[slug]/exam">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Exam params={params} />
      </Suspense>
    </main>
  );
}

async function Exam({ params }: Pick<PageProps<"/c/[slug]/exam">, "params">) {
  const { slug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();
  const viewer = await getViewer();
  const exam = await buildExam(db(), slug, viewer.entitlement);
  if (exam.access === "off") notFound();

  return (
    <>
      <Link href={`/c/${slug}`} className="text-sm text-zinc-500 hover:underline">
        ← {SITE_NAME}&apos;s Guide to {course.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Practice exam</h1>
      {exam.access === "locked" ? (
        <div className="mt-6 rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
          Practice exams are part of Pro.{" "}
          <Link href={viewer.user ? "/pricing" : "/sign-up?next=/pricing"} className="underline">
            {viewer.user ? "See plans" : "Create an account to see plans"}
          </Link>
        </div>
      ) : exam.questions.length === 0 ? (
        <p className="mt-6 text-zinc-600">There are no practice questions in this course yet.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-600">
            {exam.questions.length} multiple-choice questions from across the course. This is practice written by {SITE_NAME}, not an official
            exam, so your score here doesn&apos;t predict an exam score.
            {!viewer.user && " Sign in to keep your results."}
          </p>
          <PracticeExam slug={slug} questions={exam.questions} />
        </>
      )}
    </>
  );
}

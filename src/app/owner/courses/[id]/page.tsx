import Link from "next/link";
import { notFound } from "next/navigation";
import { attest, cancel, generate, removeFile, retry } from "@/app/owner/actions";
import { ActionButton } from "@/components/owner/ActionButton";
import { JobProgress } from "@/components/owner/JobProgress";
import { ModulesForm } from "@/components/owner/ModulesForm";
import { OutlineEditor } from "@/components/owner/OutlineEditor";
import { UploadForm } from "@/components/owner/UploadForm";
import { requireOwner } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ATTESTATION_TEXT, ATTESTATION_TEXT_VERSION, GENERATED_MODULES, getCourseSetup } from "@/lib/owner/courses";
import { getJobProgress } from "@/lib/owner/jobs";

export const metadata = { title: "Course setup" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CourseSetupPage({ params }: PageProps<"/owner/courses/[id]">) {
  const { id } = await params;
  const owner = await requireOwner(`/owner/courses/${id}`);
  if (!UUID.test(id)) notFound();
  const sql = db();
  const setup = await getCourseSetup(sql, owner.id, id);
  if (!setup) notFound();
  const { course, units, modules, files, attestation, latestJob } = setup;
  const job = latestJob ? await getJobProgress(sql, owner.id, latestJob.id) : null;

  const attested = attestation?.text_version === ATTESTATION_TEXT_VERSION;
  const ready = {
    files: files.some((f) => f.status === "ingested" && f.role !== "past_exam"),
    outline: course.outline_version > 0,
    attested,
  };
  const jobActive = job && ["queued", "running"].includes(job.status);

  return (
    <main className="space-y-12">
      <div>
        <Link href="/owner" className="text-sm text-zinc-500 hover:underline">← Courses</Link>
        <h1 className="mt-2 text-2xl font-semibold">{course.title}</h1>
        <p className="text-sm text-zinc-600">{course.level}</p>
      </div>

      <section>
        <h2 className="text-lg font-medium">1. Source files</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Upload your own notes and anything you have permission to use. Never upload College Board material (course
          descriptions, released exams or questions).
        </p>
        {files.length > 0 && (
          <ul className="mt-4 divide-y divide-zinc-100 text-sm">
            {files.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-4 py-2">
                <span>
                  <span className="font-medium">{f.filename}</span>
                  <span className="ml-2 text-zinc-500">{f.role.replace("_", " ")} · {f.license}</span>
                  <span className="block text-zinc-500">
                    {f.status === "ingested" ? `${f.chunks} passages` : f.status === "pending" ? "Reading…" : "Couldn't read this file"}
                  </span>
                  {f.error && <span className="block text-red-700">{f.error}</span>}
                </span>
                <ActionButton action={removeFile.bind(null, f.id)} pendingLabel="Removing…" variant="secondary">Remove</ActionButton>
              </li>
            ))}
          </ul>
        )}
        <UploadForm courseId={course.id} />
      </section>

      <section>
        <h2 className="text-lg font-medium">2. Outline</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Units and learning objectives in your own words. Saving confirms the outline for generation.
          {!ready.outline && " Not confirmed yet."}
        </p>
        <OutlineEditor courseId={course.id} units={units} />
      </section>

      <section>
        <h2 className="text-lg font-medium">3. Modules and access</h2>
        <ModulesForm courseId={course.id} modules={modules} sourceMode={course.source_mode} generated={GENERATED_MODULES} />
      </section>

      <section>
        <h2 className="text-lg font-medium">4. Rights</h2>
        <p className="mt-2 rounded bg-zinc-50 p-3 text-sm">{ATTESTATION_TEXT}</p>
        <div className="mt-3">
          {attested ? (
            <p className="text-sm text-zinc-700">Confirmed {attestation.signed_at.toLocaleDateString("en-US", { dateStyle: "medium" })}.</p>
          ) : (
            <ActionButton action={attest.bind(null, course.id)} pendingLabel="Saving…">I confirm</ActionButton>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">5. Generate</h2>
        <ul className="mt-2 text-sm">
          <li>{ready.files ? "✓" : "○"} At least one source file read (past exams don&apos;t count)</li>
          <li>{ready.outline ? "✓" : "○"} Outline confirmed</li>
          <li>{ready.attested ? "✓" : "○"} Rights confirmed</li>
        </ul>
        <div className="mt-4 flex gap-3">
          {!job && (
            <ActionButton action={generate.bind(null, course.id)} pendingLabel="Starting…">
              Generate study guide and practice questions
            </ActionButton>
          )}
          {jobActive && (
            <ActionButton action={cancel.bind(null, job.id)} pendingLabel="Cancelling…" variant="secondary">Cancel</ActionButton>
          )}
          {job && ["failed", "cancelled"].includes(job.status) && (
            <ActionButton action={retry.bind(null, job.id)} pendingLabel="Retrying…">Retry unfinished units</ActionButton>
          )}
        </div>
        {job && <JobProgress key={`${job.id}:${job.status}`} jobId={job.id} initial={job} />}
        {["needs_review", "ready", "published"].includes(course.status) && (
          <Link href={`/owner/courses/${course.id}/review`} className="mt-4 inline-block rounded bg-zinc-900 px-4 py-2 text-sm text-white">
            {course.status === "needs_review" ? "Review generated content" : "Open review"}
          </Link>
        )}
      </section>
    </main>
  );
}

"use client";

import { useState, useTransition } from "react";
import { createUploadUrl, registerUpload, type ActionResult } from "@/app/owner/actions";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const ROLES = [
  { value: "own_notes", label: "My notes" },
  { value: "slides", label: "Slides" },
  { value: "textbook", label: "Textbook (with permission)" },
  { value: "syllabus", label: "Syllabus" },
  { value: "past_exam", label: "Past exam (only checked against, never used to write)" },
];

export function UploadForm({ courseId }: { courseId: string }) {
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();

  const submit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) return setResult({ error: "Choose a file" });
    start(async () => {
      const url = await createUploadUrl(courseId, file.name, file.size);
      if ("error" in url) return setResult({ error: url.error });
      const { error } = await createBrowserSupabase().storage.from("sources").uploadToSignedUrl(url.path, url.token, file);
      if (error) return setResult({ error: `Upload failed: ${error.message}` });
      const registered = await registerUpload(courseId, {
        path: url.path,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        role: String(data.get("role")),
        license: String(data.get("license") ?? ""),
      });
      setResult(registered);
      if (!registered.error) form.reset();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="mt-4 grid gap-3 rounded border border-zinc-200 p-4 sm:grid-cols-2"
    >
      <label className="text-sm sm:col-span-2">
        File (PDF, DOCX, Markdown or text, up to 50 MB)
        <input name="file" type="file" accept=".pdf,.docx,.md,.txt" required className="mt-1 block w-full text-sm" />
      </label>
      <label className="text-sm">
        What is it?
        <select name="role" className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Source and rights
        <input name="license" required placeholder="e.g. my own notes; licensed from …" className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {pending ? "Uploading…" : "Upload"}
        </button>
        {result.error && <p className="text-sm text-red-700">{result.error}</p>}
        {result.message && <p className="text-sm text-zinc-700">{result.message}</p>}
      </div>
    </form>
  );
}

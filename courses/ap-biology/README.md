# AP® Biology source materials

The unit outline in `course.json` is written in our own words. Source files are
not committed to this repository. Until the owner dashboard exists, put them in
a folder with a `manifest.json` and run `npm run generate` (see the main README):

```json
{
  "attestation": "I wrote these notes, or hold the rights to use them commercially and with AI tools.",
  "files": [
    { "file": "unit1-notes.md", "role": "own_notes", "license": "own work" },
    { "file": "practice-test.pdf", "role": "past_exam", "license": "own work" }
  ]
}
```

Roles: `syllabus`, `slides`, `textbook`, `past_exam`, `own_notes`. Files not in
the manifest are ignored. Past exams are never shown to the drafting model;
they are only used to catch generated questions that copy them.

Allowed sources:

- Your own notes, or notes written for you under a work-for-hire agreement.
- Material whose license allows commercial use **and** use with AI. Check both:
  many "free" textbooks do not allow either.

Not allowed:

- Any College Board material (Course and Exam Description, released free-response
  questions, practice exams). The College Board does not permit its content to be
  used with generative AI.
- OpenStax *Biology for AP® Courses* and *Biology 2e*: both are CC BY-NC-SA 4.0
  (non-commercial) and OpenStax requires permission for use in AI offerings.
  Usable only if OpenStax grants written permission.

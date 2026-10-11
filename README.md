# Study guide site

A paid study-guide website: it takes payments, grants access, builds courses
from uploaded materials, tracks progress, and generates flashcards and practice
exams. The first course is AP® Biology.

The design follows the project's *Course Generation Pipeline — Technical Spec*
and the *Stack and MVP plan* doc.

## Stack

| Layer | Choice |
| --- | --- |
| Web app | Next.js 16 (App Router, TypeScript), hosted on Vercel |
| Database, auth, storage | Supabase (Postgres + pgvector) |
| Background jobs | Trigger.dev |
| AI | Claude API (draft and re-solve models in `src/lib/ai/models.ts`) |
| Payments | Stripe Checkout, Billing, Customer Portal, Tax |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000
```

Database: create a Supabase project, then apply `supabase/migrations/` with the
Supabase CLI (`supabase link` then `supabase db push`).

Stripe: create two prices (monthly subscription, one-time semester pass), put
their ids in `.env.local`, and forward webhooks locally with
`stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

Jobs: `npm run trigger:dev` runs Trigger.dev tasks from `src/trigger/` locally.
Set `DATABASE_URL` and the Supabase keys in the Trigger.dev project's
environment variables too, since the tasks read the database and storage.

Owner access: `npm run make-owner -- you@example.com` creates the account if
needed and makes it an owner. Then sign in at `/sign-in?next=/owner` with the
emailed link. In Supabase, add `<site url>/auth/callback` to the allowed
redirect URLs (Authentication > URL Configuration).

## Setting up a course (owner pages)

`/owner` lists courses and sets up new ones from `courses/<slug>/course.json`.
Each course page has five steps: upload source files (they go straight to the
private `sources` bucket and are read in the background), confirm the outline,
choose modules and who sees them, confirm the rights statement, then generate.
Generation runs as a background job with one step per unit; the page shows
progress and estimated cost, and failed units can be retried without redoing
the rest. Generated items wait for review (flagged ones carry the reason).

## Generating a course (phase 1 scripts)

```bash
npm run generate -- --course ap-biology --sources ./my-sources --units 1,2 --questions 5
```

The sources folder holds your files (PDF, DOCX, Markdown or text) and a
`manifest.json` with the rights attestation and each file's role and license
(format in `courses/ap-biology/README.md`). Needs `ANTHROPIC_API_KEY`.

For each unit the script picks the most relevant source chunks, drafts the
guide and practice questions, re-solves every question with a second model
without the answer key, and checks every part for citations that really appear
in the sources and for near-copies of the sources. Results go to
`out/<course>/<timestamp>/`: one JSON file per unit with its flags, and
`report.md` with the flag rate, token use and estimated cost.

Options: `--mode materials_only` drops anything the sources don't support
(default `materials_first` keeps it and flags it), `--concurrency` sets how
many units run at once (default 4).

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs all four on every pull request. The database tests in `tests/db/` run
when `TEST_DATABASE_URL` points at a Postgres with pgvector (CI starts one);
locally, `npm run test:db` uses `postgres://postgres@localhost:5432/postgres`.

## Layout

| Path | What it holds |
| --- | --- |
| `courses/<slug>/course.json` | Course outline and module tiers, written in our own words |
| `supabase/migrations/` | Database schema (spec data model + progress tables) |
| `src/lib/access.ts` | The paywall rule |
| `src/lib/billing/` | Stripe client and Stripe → entitlement mapping |
| `src/lib/ai/` | Claude models, structured-call helper, item schemas and validation |
| `src/pipeline/` | Ingest, chunking, retrieval, unit generation, checks and run report |
| `scripts/` | Command-line entry points |
| `src/trigger/` | Background tasks |
| `src/lib/owner/` | Course setup, uploads and generation jobs (database access) |
| `src/lib/auth/` | Session and owner checks |
| `src/app/owner/` | Owner pages and their server actions |
| `src/app/api/` | Checkout, Stripe webhook and job progress routes |

## Rules that apply to all work here

- **No College Board material in the pipeline.** The College Board does not permit
  its content (course descriptions, released questions, practice exams) to be used
  with generative AI. See `courses/ap-biology/README.md` for allowed sources.
- **AP trademark.** Keep "AP" out of the brand name, domain and URLs. Title courses
  "<Brand>'s Guide to AP® Biology". Every page carries the disclaimer in
  `src/config/site.ts` (rendered by the footer).
- **Paywall is server-side.** Pro content and answer keys never reach a browser
  without an active entitlement. Only the Stripe webhook writes `entitlements`.
- **13+ only.** Accounts require a confirmed age of 13 or older.

## Status

Phase 2: owners sign in, upload sources and generate a course from the owner
pages; generated items are saved to the database. The phase 1 script still
works for trying sources offline.
Not built yet: review queue and publishing, student sign-up and paywall pages,
flashcards and progress UI. Scanned PDFs (OCR) and PPTX
files aren't supported yet.

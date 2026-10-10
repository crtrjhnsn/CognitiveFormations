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

CI runs all four on every pull request.

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
| `src/app/api/` | Checkout and Stripe webhook routes |

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

Phase 1: course generation runs as a script from a folder of source files.
Not built yet: saving generated items to the database, owner dashboard, review
queue, sign-in pages, flashcards and progress UI. Scanned PDFs (OCR) and PPTX
files aren't supported yet.

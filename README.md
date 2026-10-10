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
| `src/lib/ai/` | Claude models, item schemas and validation, drafting calls |
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

Phase 0–1 groundwork: schema, billing wiring, paywall rule, practice-question
drafting and validation, and the AP Biology outline. Not built yet: ingest,
owner dashboard, review queue, sign-in pages, flashcards and progress UI.

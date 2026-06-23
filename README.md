# PayTrack — rep-facing commission portal (Phase 2)

A small React app where each salesperson logs in and sees their own month:
units, front gross, commission, and every deal — pulled hourly from Tekion
via the Phase 1 pipeline. Managers see their store's team; admins see
everything. All of that is enforced by Postgres row-level security, not by
app code.

## Stack (deliberately small)

- **Vite + React + TypeScript** — builds to static files, no server to run
- **@supabase/supabase-js** — login + data queries against your Phase 1 database
- Plain CSS (`src/styles.css`) — no UI framework to fight with

## Run it locally

```
npm install
cp .env.example .env     # fill in your Supabase URL + ANON key
npm run dev              # opens http://localhost:5173
```

The anon key is the *publishable* one (Dashboard → Settings → API). It is
safe in the browser — RLS decides what each login can read. The
service_role key must never appear in this project.

## Deploy (free, ~10 minutes)

1. Push this folder to a GitHub repo.
2. vercel.com → New project → import the repo. Vercel auto-detects Vite.
3. Add the two environment variables (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`) in the Vercel project settings → deploy.
4. Supabase Dashboard → Authentication → URL Configuration: set **Site URL**
   to your Vercel URL and add it to **Redirect URLs** (login links and
   invites point here).

`vercel.json` is already set up so page refreshes on any route work.

## Onboarding a salesperson

1. Supabase → Authentication → Users → **Invite user** (their work email).
2. Table Editor → `profiles` → fill in their `rep_name` (exactly as Tekion
   prints it), `store_name`, and `role` (`rep` / `manager` / `admin`).
3. They click the invite link, land signed in, and can set a password at
   `/update-password` — or just use "Email me a login link" every time.

If a rep sees an empty dashboard, it's almost always a `rep_name` mismatch —
run query 5 in `reconciliation.sql` to see Tekion's exact spelling.

## What each role sees

| Role | Summary panel | Team list | Deals |
|---|---|---|---|
| rep | their own month | hidden | their own rows only |
| manager | team totals for their store | their store's reps (tap to filter) | their store |
| admin | totals across everything visible | all reps | all stores |

## Spiffs, corrections & enhancers (Phase 3)

Manual money never touches the `deals` table (the hourly loader would
overwrite it). It lives in `adjustments` — run `phase3_adjustments.sql`
in the Supabase SQL Editor to create it.

- **Managers and admins** get a "Spiffs & enhancers" section on the
  dashboard: add a flat dollar amount (spiff / correction / other) or an
  enhancer **percentage**, optionally tied to a deal number, with a note.
  Managers can only write entries for their own store; reps can only read
  their own. Every entry records who created it.
- **Percentages** are computed as pct × the rep's unit-weighted front gross
  for that month. Verify this against payroll's hand-calc the first month;
  if the pay plan uses a different base, enter flat dollar amounts instead.
- The summary panel shows **Projected pay = deal commission + spiffs &
  corrections + enhancers** with the breakdown underneath.
- Payroll's period-end numbers: query the `rep_month_pay` view, plus
  `select * from adjustments where month = '2026-06-01'` for the audit trail.

## Later candidates

- Auto-qualification of enhancers from the monthly criteria lists
- Manager pay plans (paid off different gross — data is already stored)
- Pay-period (vs calendar month) date ranges
- CSV export button for payroll

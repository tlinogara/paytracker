# PayTracker — store dashboard (views-based)

A React dashboard for the BH compensation system. Every number on screen is read
straight from the PayTracker Postgres **views** in Supabase — the app does no
commission math itself. Login gates access; an authenticated user sees the store
dashboard (KPI tiles, leaderboards, per-rep payroll, deals) and the read-only
enhancer-status page.

## Stack

- **Vite + React + TypeScript** — static build, no server
- **@supabase/supabase-js** — auth + reads against the PayTracker database
- Plain CSS (`src/styles.css`)

## What it reads (the backend contract)

| Screen | View |
|--------|------|
| KPI tiles | `v_store_stats` |
| Team grid + payroll breakdown | `v_payroll_summary` |
| Leaderboards | `v_leaderboard` (filter `metric`) |
| Deals table | `v_deals_detail` |
| Enhancer status | `v_enhancer_status` |

These are created by the PayTracker SQL migrations (`sql/01`–`05`). Make sure
`05_rls.sql` has `grant select` on all five views to `anon, authenticated`.
The app never writes; editing rates/rules/draws is done in the config tables
(`employees`, `pay_plans`, `enhancer_rules`, `pay_period_adjustments`, …).

## Run locally

```
npm install
cp .env.example .env     # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev              # http://localhost:5173
npm run build            # type-checks (tsc -b) then builds to dist/
```

The anon key is the publishable one (Dashboard → Settings → API) and is safe in
the browser — RLS + the granted views decide what is readable. The service_role
key must never appear here.

## Deploy (Vercel)

1. Push to GitHub.
2. vercel.com → New project → import the repo (auto-detects Vite).
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars → deploy.
4. Supabase → Authentication → URL Configuration: set Site URL to the Vercel URL
   and add it to Redirect URLs.

`vercel.json` already rewrites all routes to `index.html` so refreshes work.

## Auth

Invite users in Supabase → Authentication → Users. There are no per-rep row
restrictions in this build — every signed-in user sees the full store view, which
matches the store-wide grants on the `v_*` views. (To scope by rep later, add a
`profiles` table + RLS policies and filter the views by the caller.)

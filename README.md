# PayTrack

This package contains a React frontend, Supabase SQL files, and a Python ingestion script for replacing a spreadsheet based dealership commission workflow.

## Setup

1. Create a Supabase project.
2. Run the SQL files in order from `supabase/sql`.
3. Copy `.env.example` to `.env` and fill in the browser safe Supabase URL and anon key.
4. Run `npm install`.
5. Run `npm run dev`.

## Ingestion

For local RPA ingestion, copy `scripts/.env.example` to `scripts/.env` and use a service role key only on the trusted machine that runs the Tekion downloader.

```bash
python scripts/upload_tekion_csv.py path/to/deal_sales_log.csv --store-id <uuid>
```

## Permission model

Salespeople can read their own deals, commission lines, and KPIs.
Managers can read and adjust rows in their own store.
Payroll can import, refresh, and lock commission runs.
Admins can manage all stores, plans, employees, and rules.

## Calculation model

Tekion CSV rows go first into raw import tables. The SQL normalizer maps rows to deals and participants. The server side refresh function writes commission lines, and the React app only displays those calculated lines plus manager approved adjustments.

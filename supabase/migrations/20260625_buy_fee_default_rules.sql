create table if not exists public.buy_fee_default_rules (id uuid primary key default gen_random_uuid(), store_id uuid references public.stores(id) on delete cascade, effective_month date not null, high_acv_threshold numeric not null default 99999, low_acv_amount numeric not null default 500, high_acv_amount numeric not null default 1000, active boolean not null default true, created_at timestamptz not null default now());
create unique index if not exists buy_fee_default_rules_store_month_uidx on public.buy_fee_default_rules(store_id, effective_month) where store_id is not null;
create unique index if not exists buy_fee_default_rules_global_month_uidx on public.buy_fee_default_rules(effective_month) where store_id is null;
alter table public.buy_fee_default_rules enable row level security;
drop policy if exists buy_fee_default_rules_select on public.buy_fee_default_rules;
drop policy if exists buy_fee_default_rules_admin_manage on public.buy_fee_default_rules;
create policy buy_fee_default_rules_select on public.buy_fee_default_rules for select to authenticated using (true);
create policy buy_fee_default_rules_admin_manage on public.buy_fee_default_rules for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
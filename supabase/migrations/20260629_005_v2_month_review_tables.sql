create table if not exists public.brand_month_reviews (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  store_id uuid not null references public.stores(id) on delete cascade,
  brand text not null,
  status text not null default 'reviewed' check (status in ('pending','reviewed','returned')),
  note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_month_reviews (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  store_id uuid not null references public.stores(id) on delete cascade,
  status text not null default 'reviewed' check (status in ('pending','reviewed','returned')),
  note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, store_id)
);

alter table public.brand_month_reviews enable row level security;
alter table public.store_month_reviews enable row level security;

create unique index if not exists brand_month_reviews_month_store_brand_key
on public.brand_month_reviews (month, store_id, lower(brand));

create index if not exists brand_month_reviews_month_store_brand_idx
on public.brand_month_reviews (month, store_id, lower(brand));

create index if not exists store_month_reviews_month_store_idx
on public.store_month_reviews (month, store_id);

create policy brand_month_reviews_select_v2_scope
on public.brand_month_reviews
for select
to authenticated
using (
  current_app_role() in ('payroll_manager','admin')
  or can_access_store_v2(store_id)
  or can_access_brand_v2(store_id, brand)
);

create policy brand_month_reviews_manage_v2_scope
on public.brand_month_reviews
for all
to authenticated
using (
  current_app_role() in ('payroll_manager','admin')
  or can_access_store_v2(store_id)
  or can_access_brand_v2(store_id, brand)
)
with check (
  current_app_role() in ('payroll_manager','admin')
  or can_access_store_v2(store_id)
  or can_access_brand_v2(store_id, brand)
);

create policy store_month_reviews_select_v2_scope
on public.store_month_reviews
for select
to authenticated
using (
  current_app_role() in ('payroll_manager','admin')
  or can_access_store_v2(store_id)
);

create policy store_month_reviews_manage_v2_scope
on public.store_month_reviews
for all
to authenticated
using (
  current_app_role() in ('payroll_manager','admin')
  or can_access_store_v2(store_id)
)
with check (
  current_app_role() in ('payroll_manager','admin')
  or can_access_store_v2(store_id)
);

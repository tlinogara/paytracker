create table if not exists public.brand_month_reviews (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  store_id uuid not null references public.stores(id),
  brand text not null,
  status text not null default 'reviewed',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, store_id, brand)
);

create table if not exists public.store_month_reviews (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  store_id uuid not null references public.stores(id),
  status text not null default 'reviewed',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, store_id)
);

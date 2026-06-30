alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles add constraint profiles_role_check check (
  role = any (array[
    'rep',
    'manager',
    'payroll',
    'admin',
    'sales_rep',
    'brand_manager',
    'general_sales_manager',
    'payroll_manager'
  ]::text[])
);

create table if not exists public.user_store_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  access_role text not null default 'general_sales_manager' check (
    access_role = any (array['general_sales_manager', 'payroll_manager', 'admin']::text[])
  ),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, store_id, access_role)
);

create table if not exists public.user_brand_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  brand text not null,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, store_id, brand)
);

alter table public.user_store_access enable row level security;
alter table public.user_brand_access enable row level security;

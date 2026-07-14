create table if not exists public.brand_manager_directory (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  brand text not null,
  manager_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_name, brand, manager_name)
);

insert into public.brand_manager_directory (store_name, brand, manager_name) values
  ('Beverly Hills', 'McLaren', 'Vlad Pejcic'),
  ('Beverly Hills', 'Rolls Royce', 'Isaac Mansour'),
  ('Beverly Hills', 'Pagani', 'Steve Lewis'),
  ('Beverly Hills', 'Aston Martin', 'Michael Tesh'),
  ('Beverly Hills', 'Bentley', 'Michael Jernigan'),
  ('Beverly Hills', 'Lamborghini', 'Ray Mkrtchyan')
on conflict (store_name, brand, manager_name) do nothing;

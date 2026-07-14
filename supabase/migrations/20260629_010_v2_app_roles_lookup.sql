create table if not exists public.app_roles (
  key text primary key,
  label text not null,
  sort_order integer not null,
  description text,
  active boolean not null default true
);

insert into public.app_roles (key, label, sort_order, description) values
  ('rep', 'Legacy sales rep', 10, 'Legacy role kept for compatibility'),
  ('manager', 'Legacy manager', 20, 'Legacy role kept for compatibility'),
  ('payroll', 'Legacy payroll', 30, 'Legacy role kept for compatibility'),
  ('admin', 'Admin', 90, 'Full system access'),
  ('sales_rep', 'Sales rep', 11, 'Can see only their own deals and pay breakdown'),
  ('brand_manager', 'Brand manager', 21, 'Can see assigned brand teams'),
  ('general_sales_manager', 'General sales manager', 31, 'Can see assigned locations'),
  ('payroll_manager', 'Payroll manager', 41, 'Can see all locations and edit commission settings')
on conflict (key) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    description = excluded.description,
    active = excluded.active;

alter table public.profiles drop constraint if exists profiles_role_fkey;
alter table public.profiles add constraint profiles_role_fkey foreign key (role) references public.app_roles(key);

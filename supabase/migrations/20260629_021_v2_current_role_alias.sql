create or replace function public."current_role"()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role(), 'sales_rep');
$$;

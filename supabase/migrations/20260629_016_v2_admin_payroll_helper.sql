create or replace function public.is_admin_or_payroll()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'payroll_manager');
$$;

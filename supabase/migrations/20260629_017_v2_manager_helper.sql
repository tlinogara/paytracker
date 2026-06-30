create or replace function public.is_manager_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('brand_manager', 'general_sales_manager', 'payroll_manager', 'admin');
$$;

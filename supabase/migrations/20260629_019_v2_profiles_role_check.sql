alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles add constraint profiles_role_check
check (
  role = 'sales_rep'
  or role = 'brand_manager'
  or role = 'general_sales_manager'
  or role = 'payroll_manager'
  or role = 'admin'
);

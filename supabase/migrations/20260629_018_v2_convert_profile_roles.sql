update public.profiles
set role = case role
  when 'rep' then 'sales_rep'
  when 'manager' then 'general_sales_manager'
  when 'payroll' then 'payroll_manager'
  else role
end
where role in ('rep', 'manager', 'payroll');

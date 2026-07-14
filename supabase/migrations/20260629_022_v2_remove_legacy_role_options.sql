delete from public.app_roles
where key = any(array['rep', 'manager', 'payroll']::text[]);

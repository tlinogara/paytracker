drop policy if exists user_store_access_select_v2 on public.user_store_access;

create policy user_store_access_select_v2 on public.user_store_access
for select to authenticated
using (
  user_id = auth.uid()
  or public.current_app_role() in ('payroll_manager', 'admin')
);

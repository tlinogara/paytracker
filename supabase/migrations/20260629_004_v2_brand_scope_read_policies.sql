drop policy if exists user_brand_access_select_v2 on public.user_brand_access;

create policy user_brand_access_select_v2 on public.user_brand_access
for select to authenticated
using (
  user_id = auth.uid()
  or public.current_app_role() in ('payroll_manager', 'admin')
  or public.can_access_store_v2(store_id)
);

drop policy if exists adjustments_select_v2_scope on public.adjustments;
create policy adjustments_select_v2_scope on public.adjustments
for select to authenticated
using (
  public.current_app_role() in ('payroll_manager', 'admin')
  or public.can_access_store_v2(store_id)
  or public.can_access_employee_v2(employee_id)
);

drop policy if exists enhancer_rules_select_v2_scope on public.enhancer_rules;
create policy enhancer_rules_select_v2_scope on public.enhancer_rules
for select to authenticated
using (
  public.current_app_role() in ('payroll_manager', 'admin')
  or store_id is null
  or public.can_access_store_v2(store_id)
  or public.can_access_brand_v2(store_id, brand)
);

drop policy if exists priority_stock_select_v2_scope on public.priority_stock;
create policy priority_stock_select_v2_scope on public.priority_stock
for select to authenticated
using (
  public.current_app_role() in ('payroll_manager', 'admin')
  or store_id is null
  or public.can_access_store_v2(store_id)
);

drop policy if exists raw_import_files_select_v2_scope on public.raw_import_files;
create policy raw_import_files_select_v2_scope on public.raw_import_files
for select to authenticated
using (
  public.current_app_role() in ('payroll_manager', 'admin')
  or public.can_access_store_v2(store_id)
);

drop policy if exists raw_tekion_rows_select_v2_scope on public.raw_tekion_rows;
create policy raw_tekion_rows_select_v2_scope on public.raw_tekion_rows
for select to authenticated
using (
  exists (
    select 1 from public.raw_import_files f
    where f.id = raw_tekion_rows.import_file_id
      and (
        public.current_app_role() in ('payroll_manager', 'admin')
        or public.can_access_store_v2(f.store_id)
      )
  )
);

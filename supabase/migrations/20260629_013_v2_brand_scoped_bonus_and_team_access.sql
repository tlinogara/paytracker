alter table public.priority_stock add column if not exists brand text;

update public.priority_stock
set brand = case
  when upper(stock_number) in ('26ML509','225104','26ML491','224615','26ML514','228951','25ML479','224158','26ML499','224618','25ML461','221774','25ML497','221941','26ML492','224582','26ML498','224580','26ML520','229437','99517UC','9562UC','9471UC','9497UC') then 'McLaren'
  when upper(stock_number) in ('26A1947','26A1998','26A1954','25A1761','25A1910','26A1951','26A1953','25A1927','26A2147','25A0174','25A0175','26A2039','26A0176','26A0177','26A0178','26A0179','26A0180','26A0181','26A0188','CS695','9531UC') then 'Aston Martin'
  when upper(stock_number) in ('25L0084','25L0086','25L0026','25L0056') then 'Lamborghini'
  when upper(stock_number) in ('25B7500','25B7508','25B7509','25B7512','25B6307','D25B6309','25B6312','25B6317','25B6322','25B6324','25B6311','25B6326','25B6327','25B6331','25B6333','25B6339','D25B3620','25B3623','25B3624','25B3625','25B3621') then 'Bentley'
  else brand
end
where brand is null;

alter view public.manual_enhancer_status set (security_invoker = true);

drop policy if exists brand_rep_classifications_select on public.brand_rep_classifications;
drop policy if exists brand_rep_classifications_select_v2_scope on public.brand_rep_classifications;
create policy brand_rep_classifications_select_v2_scope on public.brand_rep_classifications
for select to authenticated
using (
  public.current_app_role() in ('payroll_manager','admin')
  or public.can_access_store_v2(store_id)
  or exists (
    select 1 from public.user_brand_access uba
    where uba.user_id = auth.uid()
      and uba.active
      and uba.store_id = brand_rep_classifications.store_id
      and lower(uba.brand) = lower(brand_rep_classifications.brand)
  )
);

drop policy if exists brand_rep_classifications_manage_v2_scope on public.brand_rep_classifications;
create policy brand_rep_classifications_manage_v2_scope on public.brand_rep_classifications
for all to authenticated
using (
  public.current_app_role() in ('payroll_manager','admin')
  or public.can_access_store_v2(store_id)
  or public.can_access_brand_v2(store_id, brand)
)
with check (
  public.current_app_role() in ('payroll_manager','admin')
  or public.can_access_store_v2(store_id)
  or public.can_access_brand_v2(store_id, brand)
);

drop policy if exists enhancer_rules_manage_v2_scope on public.enhancer_rules;
create policy enhancer_rules_manage_v2_scope on public.enhancer_rules
for all to authenticated
using (public.can_manage_bonus_v2(store_id, brand, null))
with check (public.can_manage_bonus_v2(store_id, brand, null));

drop policy if exists priority_stock_select_v2_scope on public.priority_stock;
create policy priority_stock_select_v2_scope on public.priority_stock
for select to authenticated
using (
  public.current_app_role() in ('payroll_manager','admin')
  or public.can_access_store_v2(store_id)
  or public.can_access_brand_v2(store_id, brand)
);

drop policy if exists priority_stock_manage_v2_scope on public.priority_stock;
create policy priority_stock_manage_v2_scope on public.priority_stock
for all to authenticated
using (
  public.current_app_role() in ('payroll_manager','admin')
  or public.can_access_store_v2(store_id)
  or public.can_access_brand_v2(store_id, brand)
)
with check (
  public.current_app_role() in ('payroll_manager','admin')
  or public.can_access_store_v2(store_id)
  or public.can_access_brand_v2(store_id, brand)
);

drop policy if exists adjustments_manage_v2_scope on public.adjustments;
create policy adjustments_manage_v2_scope on public.adjustments
for all to authenticated
using (
  public.current_app_role() in ('payroll_manager','admin')
  or public.can_access_store_v2(store_id)
  or public.can_access_employee_v2(employee_id)
)
with check (
  public.current_app_role() in ('payroll_manager','admin')
  or public.can_access_store_v2(store_id)
  or public.can_access_employee_v2(employee_id)
);

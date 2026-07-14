do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='pay_plans' and policyname='pay_plans_manage_v2_calculation_edit'
  ) then
    create policy pay_plans_manage_v2_calculation_edit
    on public.pay_plans
    for all
    to authenticated
    using (can_edit_calculations_v2())
    with check (can_edit_calculations_v2());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='unit_enhancement_tiers' and policyname='unit_enhancement_tiers_manage_v2_calculation_edit'
  ) then
    create policy unit_enhancement_tiers_manage_v2_calculation_edit
    on public.unit_enhancement_tiers
    for all
    to authenticated
    using (can_edit_calculations_v2())
    with check (can_edit_calculations_v2());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='mini_tiers' and policyname='mini_tiers_manage_v2_calculation_edit'
  ) then
    create policy mini_tiers_manage_v2_calculation_edit
    on public.mini_tiers
    for all
    to authenticated
    using (can_edit_calculations_v2())
    with check (can_edit_calculations_v2());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='buy_fee_rules' and policyname='buy_fee_rules_manage_v2_calculation_edit'
  ) then
    create policy buy_fee_rules_manage_v2_calculation_edit
    on public.buy_fee_rules
    for all
    to authenticated
    using (can_edit_calculations_v2())
    with check (can_edit_calculations_v2());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='trade_spiff_rules' and policyname='trade_spiff_rules_manage_v2_calculation_edit'
  ) then
    create policy trade_spiff_rules_manage_v2_calculation_edit
    on public.trade_spiff_rules
    for all
    to authenticated
    using (can_edit_calculations_v2())
    with check (can_edit_calculations_v2());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='adjustment_category_options' and policyname='adjustment_category_options_manage_v2_calculation_edit'
  ) then
    create policy adjustment_category_options_manage_v2_calculation_edit
    on public.adjustment_category_options
    for all
    to authenticated
    using (can_edit_calculations_v2())
    with check (can_edit_calculations_v2());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='raw_import_files' and policyname='raw_import_files_select_v2_scope'
  ) then
    create policy raw_import_files_select_v2_scope
    on public.raw_import_files
    for select
    to authenticated
    using (
      current_app_role() in ('payroll_manager','admin')
      or can_access_store_v2(store_id)
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='raw_import_files' and policyname='raw_import_files_insert_v2_payroll'
  ) then
    create policy raw_import_files_insert_v2_payroll
    on public.raw_import_files
    for insert
    to authenticated
    with check (current_app_role() in ('payroll_manager','admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='raw_tekion_rows' and policyname='raw_tekion_rows_select_v2_scope'
  ) then
    create policy raw_tekion_rows_select_v2_scope
    on public.raw_tekion_rows
    for select
    to authenticated
    using (
      exists (
        select 1 from public.raw_import_files f
        where f.id = raw_tekion_rows.import_file_id
          and (
            current_app_role() in ('payroll_manager','admin')
            or can_access_store_v2(f.store_id)
          )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='raw_tekion_rows' and policyname='raw_tekion_rows_insert_v2_payroll'
  ) then
    create policy raw_tekion_rows_insert_v2_payroll
    on public.raw_tekion_rows
    for insert
    to authenticated
    with check (
      current_app_role() in ('payroll_manager','admin')
      and exists (
        select 1 from public.raw_import_files f
        where f.id = raw_tekion_rows.import_file_id
      )
    );
  end if;
end $$;

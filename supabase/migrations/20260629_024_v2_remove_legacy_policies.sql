do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_manage_v2_admin'
  ) then
    create policy profiles_manage_v2_admin
    on public.profiles
    for all
    to authenticated
    using (current_app_role() = 'admin')
    with check (current_app_role() = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='employees' and policyname='employees_manage_v2_payroll_admin'
  ) then
    create policy employees_manage_v2_payroll_admin
    on public.employees
    for all
    to authenticated
    using (current_app_role() in ('payroll_manager','admin'))
    with check (current_app_role() in ('payroll_manager','admin'));
  end if;
end $$;

drop policy if exists profiles_admin_manage on public.profiles;
drop policy if exists profiles_self_select on public.profiles;
drop policy if exists employees_admin_manage on public.employees;
drop policy if exists employees_select on public.employees;

drop policy if exists sales_deals_select on public.sales_deals;
drop policy if exists deal_participants_select on public.deal_participants;
drop policy if exists commission_lines_select on public.commission_lines;
drop policy if exists commission_runs_select on public.commission_runs;

drop policy if exists adjustments_manage on public.adjustments;
drop policy if exists adjustments_select on public.adjustments;
drop policy if exists brand_rep_classifications_manage on public.brand_rep_classifications;
drop policy if exists enhancer_rules_manage on public.enhancer_rules;
drop policy if exists enhancer_rules_select on public.enhancer_rules;
drop policy if exists priority_stock_manage on public.priority_stock;
drop policy if exists priority_stock_select on public.priority_stock;

drop policy if exists raw_files_insert on public.raw_import_files;
drop policy if exists raw_files_select on public.raw_import_files;
drop policy if exists raw_rows_insert on public.raw_tekion_rows;
drop policy if exists raw_rows_select on public.raw_tekion_rows;

drop policy if exists pay_plans_admin_manage on public.pay_plans;
drop policy if exists pay_plans_select on public.pay_plans;
drop policy if exists unit_enhancement_tiers_admin_manage on public.unit_enhancement_tiers;
drop policy if exists unit_enhancement_tiers_select on public.unit_enhancement_tiers;
drop policy if exists mini_tiers_admin_manage on public.mini_tiers;
drop policy if exists mini_tiers_select on public.mini_tiers;
drop policy if exists buy_fee_rules_admin_manage on public.buy_fee_rules;
drop policy if exists buy_fee_rules_select on public.buy_fee_rules;
drop policy if exists trade_spiff_rules_admin_manage on public.trade_spiff_rules;
drop policy if exists trade_spiff_rules_select on public.trade_spiff_rules;
drop policy if exists adjustment_category_options_admin_manage on public.adjustment_category_options;
drop policy if exists adjustment_category_options_select on public.adjustment_category_options;

drop policy if exists profiles_select_v2_scope on public.profiles;
create policy profiles_select_v2_scope on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.current_app_role() in ('payroll_manager', 'admin')
  or public.can_access_store_v2(store_id)
  or public.can_access_employee_v2(employee_id)
);

drop policy if exists employees_select_v2_scope on public.employees;
create policy employees_select_v2_scope on public.employees
for select to authenticated
using (
  public.current_app_role() in ('payroll_manager', 'admin')
  or public.can_access_store_v2(store_id)
  or public.can_access_employee_v2(id)
);

drop policy if exists sales_deals_select_v2_scope on public.sales_deals;
create policy sales_deals_select_v2_scope on public.sales_deals
for select to authenticated
using (public.can_access_deal_v2(id, store_id));

drop policy if exists deal_participants_select_v2_scope on public.deal_participants;
create policy deal_participants_select_v2_scope on public.deal_participants
for select to authenticated
using (
  public.can_access_employee_v2(employee_id)
  or exists (
    select 1 from public.sales_deals d
    where d.id = deal_participants.deal_id
      and public.can_access_deal_v2(d.id, d.store_id)
  )
);

drop policy if exists commission_lines_select_v2_scope on public.commission_lines;
create policy commission_lines_select_v2_scope on public.commission_lines
for select to authenticated
using (
  public.can_access_employee_v2(employee_id)
  or exists (
    select 1 from public.commission_runs cr
    where cr.id = commission_lines.run_id
      and public.can_access_store_v2(cr.store_id)
  )
);

drop policy if exists commission_runs_select_v2_scope on public.commission_runs;
create policy commission_runs_select_v2_scope on public.commission_runs
for select to authenticated
using (
  public.current_app_role() in ('payroll_manager', 'admin')
  or public.can_access_store_v2(store_id)
);

create or replace function public.can_access_commission_run_v2(p_run_id uuid, p_store_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_app_role() in ('payroll_manager', 'admin') then
    return true;
  end if;

  if public.can_access_store_v2(p_store_id) then
    return true;
  end if;

  if p_run_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.commission_lines cl
    where cl.run_id = p_run_id
      and public.can_access_employee_v2(cl.employee_id)
  );
end;
$$;

drop policy if exists commission_runs_select_v2_scope on public.commission_runs;

create policy commission_runs_select_v2_scope on public.commission_runs
for select to authenticated
using (public.can_access_commission_run_v2(id, store_id));

drop policy if exists deal_participants_select_v2_scope on public.deal_participants;

create policy deal_participants_select_v2_scope on public.deal_participants
for select to authenticated
using (public.can_access_employee_v2(employee_id));

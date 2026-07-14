create or replace function public.set_manual_enhancer_approval(p_rule_id uuid, p_employee_id uuid, p_approved boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.enhancer_rules%rowtype;
  e public.employees%rowtype;
  store_name text;
  sid uuid;
  removed_count integer := 0;
  inserted_id uuid;
begin
  select * into r from public.enhancer_rules where id = p_rule_id and metric = 'manual';
  if not found then
    raise exception 'Manual enhancer rule not found.';
  end if;

  select * into e from public.employees where id = p_employee_id;
  if not found then
    raise exception 'Employee not found.';
  end if;

  sid := coalesce(r.store_id, e.store_id);

  if public.current_app_role() not in ('admin','payroll_manager') and not public.can_manage_bonus_v2(sid, r.brand, p_employee_id) then
    raise exception 'Access denied.';
  end if;

  select name into store_name from public.stores where id = sid;

  delete from public.adjustments a
  using public.enhancer_rules er
  where a.rule_id = er.id
    and a.employee_id = p_employee_id
    and a.month = r.month
    and a.category = 'enhancer'
    and er.metric = 'manual'
    and er.brand = r.brand
    and er.label = r.label
    and er.pct is not distinct from r.pct
    and er.flat_amount is not distinct from r.flat_amount;
  get diagnostics removed_count = row_count;

  if p_approved then
    insert into public.adjustments(month, store_id, store, employee_id, rep, category, amount, pct, rule_id, note)
    values (r.month, sid, coalesce(store_name, ''), e.id, e.display_name, 'enhancer', r.flat_amount, r.pct, r.id, concat(r.brand, ': ', r.label, ' manual review approved'))
    returning id into inserted_id;
  end if;

  perform public.refresh_commission_preview(r.month, sid);

  return jsonb_build_object('approved', p_approved, 'removed', removed_count, 'adjustment_id', inserted_id);
end;
$$;

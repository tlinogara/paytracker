create or replace view public.manual_enhancer_status as
with manual_rules as (
  select distinct on (er.month, er.store_id, er.brand, er.label, coalesce(er.pct, -999999), coalesce(er.flat_amount, -999999))
    er.id as rule_id,
    er.month,
    er.store_id as rule_store_id,
    er.brand,
    er.make_pattern,
    er.label,
    er.pct,
    er.flat_amount
  from public.enhancer_rules er
  where er.metric = 'manual'
  order by er.month, er.store_id, er.brand, er.label, coalesce(er.pct, -999999), coalesce(er.flat_amount, -999999), er.id
), rep_metrics as (
  select
    mr.rule_id,
    mr.month,
    coalesce(mr.rule_store_id, e.store_id) as store_id,
    mr.brand,
    mr.label,
    mr.pct,
    mr.flat_amount,
    e.id as employee_id,
    e.display_name as rep,
    s.name as dealer,
    coalesce(sum(case when d.make ilike mr.make_pattern then coalesce(d.front_gross, 0) * dp.split_pct else 0 end), 0) as brand_front_gross,
    coalesce(sum(case when coalesce(d.make, '') <> '' and coalesce(d.stock_number, '') <> '' then coalesce(d.front_gross, 0) * dp.split_pct else 0 end), 0) as total_commissionable_gross
  from manual_rules mr
  join public.employees e on mr.rule_store_id is null or e.store_id = mr.rule_store_id
  left join public.stores s on s.id = e.store_id
  left join public.deal_participants dp on dp.employee_id = e.id
  left join public.sales_deals d on d.id = dp.deal_id and date_trunc('month', d.contract_date)::date = mr.month
  group by mr.rule_id, mr.month, coalesce(mr.rule_store_id, e.store_id), mr.brand, mr.label, mr.pct, mr.flat_amount, e.id, e.display_name, s.name
), with_adjustments as (
  select
    rm.*,
    a.id as adjustment_id,
    (a.id is not null) as approved
  from rep_metrics rm
  left join lateral (
    select a.id
    from public.adjustments a
    join public.enhancer_rules er on er.id = a.rule_id
    where a.employee_id = rm.employee_id
      and a.month = rm.month
      and a.category = 'enhancer'
      and er.metric = 'manual'
      and er.brand = rm.brand
      and er.label = rm.label
      and er.pct is not distinct from rm.pct
      and er.flat_amount is not distinct from rm.flat_amount
    order by a.created_at desc, a.id desc
    limit 1
  ) a on true
)
select
  rule_id,
  month,
  store_id,
  brand,
  label,
  pct,
  flat_amount,
  employee_id,
  rep,
  dealer,
  brand_front_gross,
  total_commissionable_gross,
  round(case when flat_amount is not null then flat_amount else coalesce(pct, 0) * total_commissionable_gross / 100 end, 2) as proposed_amount,
  approved,
  adjustment_id
from with_adjustments
where brand_front_gross <> 0 or approved;

grant select on public.manual_enhancer_status to authenticated;

create or replace function public.set_manual_enhancer_approval(p_rule_id uuid, p_employee_id uuid, p_approved boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r public.enhancer_rules%rowtype;
  e public.employees%rowtype;
  store_name text;
  sid uuid;
  removed_count integer := 0;
  inserted_id uuid;
begin
  if public.current_role() <> 'admin' then
    raise exception 'Only admin users can change manual enhancer approvals.';
  end if;

  select * into r from public.enhancer_rules where id = p_rule_id and metric = 'manual';
  if not found then
    raise exception 'Manual enhancer rule not found.';
  end if;

  select * into e from public.employees where id = p_employee_id;
  if not found then
    raise exception 'Employee not found.';
  end if;

  sid := coalesce(r.store_id, e.store_id);
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
$function$;

grant execute on function public.set_manual_enhancer_approval(uuid, uuid, boolean) to authenticated;

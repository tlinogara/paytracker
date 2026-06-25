create or replace function public.refresh_commission_preview(p_month date default null, p_store_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target_month date;
  sid uuid;
  v_run_id uuid;
  base_count integer := 0;
  unit_count integer := 0;
  spiff_count integer := 0;
  trade_spiff_count integer := 0;
  buy_fee_count integer := 0;
  flat_adjustment_count integer := 0;
  pct_adjustment_count integer := 0;
begin
  target_month = date_trunc('month', coalesce(p_month, current_date))::date;
  sid = p_store_id;

  if sid is null and public.current_role() = 'manager' then
    sid = public.current_store_id();
  end if;

  if exists (
    select 1 from public.commission_runs cr
    where cr.month = target_month and cr.store_id is not distinct from sid and cr.status in ('locked', 'paid')
  ) then
    raise exception 'Commission run is locked or paid.';
  end if;

  select cr.id into v_run_id
  from public.commission_runs cr
  where cr.month = target_month and cr.store_id is not distinct from sid and cr.status = 'preview'
  order by cr.refreshed_at desc nulls last, cr.created_at desc, cr.id desc
  limit 1;

  if v_run_id is not null then
    delete from public.commission_lines cl
    where cl.run_id in (
      select cr.id from public.commission_runs cr
      where cr.month = target_month and cr.store_id is not distinct from sid and cr.status = 'preview' and cr.id <> v_run_id
    );
    delete from public.commission_runs cr
    where cr.month = target_month and cr.store_id is not distinct from sid and cr.status = 'preview' and cr.id <> v_run_id;
    update public.commission_runs set refreshed_at = now(), created_by = auth.uid() where id = v_run_id;
  else
    insert into public.commission_runs(month, store_id, status, created_by, refreshed_at)
    values (target_month, sid, 'preview', auth.uid(), now())
    returning id into v_run_id;
  end if;

  delete from public.commission_lines where run_id = v_run_id;

  with participants as (
    select d.id as deal_id, d.front_gross, d.stock_type, d.make, d.contract_date, d.store_id, d.raw_json, dp.employee_id, dp.split_pct,
      sum(dp.split_pct) over (partition by dp.employee_id) as total_units
    from public.sales_deals d
    join public.deal_participants dp on dp.deal_id = d.id
    where date_trunc('month', d.contract_date)::date = target_month
      and coalesce(d.make, '') <> ''
      and coalesce(d.stock_number, '') <> ''
      and dp.employee_id is not null
      and (sid is null or d.store_id = sid)
  ), calc as (
    select p.*, coalesce(pp.base_rate_pct, 10) as base_rate_pct, coalesce(pp.rate_cap_pct, 25) as rate_cap_pct,
      public.unit_rate_enhancement(p.total_units, target_month, p.store_id) as unit_rate_pct,
      public.mini_amount(p.total_units, target_month, p.store_id) as mini
    from participants p
    left join lateral public.default_pay_plan_for(p.employee_id, target_month) pp on true
  ), amounts as (
    select *,
      least(base_rate_pct + unit_rate_pct, rate_cap_pct) as total_rate_pct,
      least(base_rate_pct, least(base_rate_pct + unit_rate_pct, rate_cap_pct)) as effective_base_rate_pct,
      greatest(least(base_rate_pct + unit_rate_pct, rate_cap_pct) - least(base_rate_pct, least(base_rate_pct + unit_rate_pct, rate_cap_pct)), 0) as effective_unit_rate_pct,
      round(case when coalesce(front_gross, 0) < 0 then 0 else coalesce(front_gross, 0) * split_pct * least(base_rate_pct + unit_rate_pct, rate_cap_pct) / 100 end, 2) as total_pct_amount,
      round(case when coalesce(front_gross, 0) < 0 then 0 else coalesce(front_gross, 0) * split_pct * least(base_rate_pct, least(base_rate_pct + unit_rate_pct, rate_cap_pct)) / 100 end, 2) as base_pct_amount,
      round(mini * split_pct, 2) as mini_line_amount
    from calc
  )
  insert into public.commission_lines(run_id, employee_id, deal_id, line_type, amount, explanation, source_table, source_id)
  select v_run_id, employee_id, deal_id, 'deal_base',
    case when mini_line_amount > total_pct_amount then mini_line_amount else base_pct_amount end,
    case when mini_line_amount > total_pct_amount
      then concat('Mini ', mini, ' beat total percent commission ', total_rate_pct, '%.')
      else concat('Base ', effective_base_rate_pct, '% of commissionable gross. Total percent check ', total_rate_pct, '%.')
    end,
    'sales_deals', deal_id
  from amounts;
  get diagnostics base_count = row_count;

  with participants as (
    select d.id as deal_id, d.front_gross, d.stock_type, d.make, d.contract_date, d.store_id, d.raw_json, dp.employee_id, dp.split_pct,
      sum(dp.split_pct) over (partition by dp.employee_id) as total_units
    from public.sales_deals d
    join public.deal_participants dp on dp.deal_id = d.id
    where date_trunc('month', d.contract_date)::date = target_month
      and coalesce(d.make, '') <> ''
      and coalesce(d.stock_number, '') <> ''
      and dp.employee_id is not null
      and (sid is null or d.store_id = sid)
  ), calc as (
    select p.*, coalesce(pp.base_rate_pct, 10) as base_rate_pct, coalesce(pp.rate_cap_pct, 25) as rate_cap_pct,
      public.unit_rate_enhancement(p.total_units, target_month, p.store_id) as unit_rate_pct,
      public.mini_amount(p.total_units, target_month, p.store_id) as mini
    from participants p
    left join lateral public.default_pay_plan_for(p.employee_id, target_month) pp on true
  ), amounts as (
    select *,
      round(case when coalesce(front_gross, 0) < 0 then 0 else coalesce(front_gross, 0) * split_pct * least(base_rate_pct + unit_rate_pct, rate_cap_pct) / 100 end, 2) as total_pct_amount,
      round(case when coalesce(front_gross, 0) < 0 then 0 else coalesce(front_gross, 0) * split_pct * least(base_rate_pct, least(base_rate_pct + unit_rate_pct, rate_cap_pct)) / 100 end, 2) as base_pct_amount,
      round(mini * split_pct, 2) as mini_line_amount,
      greatest(least(base_rate_pct + unit_rate_pct, rate_cap_pct) - least(base_rate_pct, least(base_rate_pct + unit_rate_pct, rate_cap_pct)), 0) as effective_unit_rate_pct
    from calc
  ), unit_lines as (
    select deal_id, employee_id,
      case when mini_line_amount > total_pct_amount then 0 else total_pct_amount - base_pct_amount end as unit_amount,
      effective_unit_rate_pct
    from amounts
  )
  insert into public.commission_lines(run_id, employee_id, deal_id, line_type, amount, explanation, source_table, source_id)
  select v_run_id, employee_id, deal_id, 'unit_enhancement', unit_amount,
    concat('Unit sales commission enhancement ', effective_unit_rate_pct, '%. Rounded as total percent minus base percent.'),
    'sales_deals', deal_id
  from unit_lines
  where unit_amount <> 0;
  get diagnostics unit_count = row_count;

  with sale_participants as (
    select d.id as deal_id, d.raw_json, d.store_id, dp.employee_id, dp.split_pct
    from public.sales_deals d
    join public.deal_participants dp on dp.deal_id = d.id
    where date_trunc('month', d.contract_date)::date = target_month
      and coalesce(d.make, '') <> ''
      and coalesce(d.stock_number, '') <> ''
      and dp.employee_id is not null
      and (sid is null or d.store_id = sid)
  ), spiffs as (
    select deal_id, employee_id,
      round(coalesce(public.money_to_numeric(public.json_text_any(raw_json, array['Salesperson Spiff Amount'])), 0) * split_pct, 2) as amount
    from sale_participants
  )
  insert into public.commission_lines(run_id, employee_id, deal_id, line_type, amount, explanation, source_table, source_id)
  select v_run_id, employee_id, deal_id, 'spiff', amount, 'Tekion Salesperson Spiff Amount, split weighted.', 'sales_deals', deal_id
  from spiffs where amount <> 0;
  get diagnostics spiff_count = row_count;

  with sale_participants as (
    select d.id as deal_id, d.raw_json, d.store_id, dp.employee_id, dp.split_pct
    from public.sales_deals d
    join public.deal_participants dp on dp.deal_id = d.id
    where date_trunc('month', d.contract_date)::date = target_month
      and coalesce(d.make, '') <> ''
      and coalesce(d.stock_number, '') <> ''
      and dp.employee_id is not null
      and (sid is null or d.store_id = sid)
  ), trade_values as (
    select sp.deal_id, sp.employee_id, sp.store_id, sp.split_pct, v.acv
    from sale_participants sp
    cross join lateral (values
      (public.money_to_numeric(public.json_text_any(sp.raw_json, array['Trade 1 ACV']))),
      (public.money_to_numeric(public.json_text_any(sp.raw_json, array['Trade 2 ACV']))),
      (public.money_to_numeric(public.json_text_any(sp.raw_json, array['Trade 3 ACV'])))
    ) as v(acv)
    where v.acv is not null
  ), trade_spiffs as (
    select deal_id, employee_id,
      round(sum(public.trade_spiff_amount(acv, target_month, store_id) * split_pct), 2) as amount
    from trade_values
    group by deal_id, employee_id
  )
  insert into public.commission_lines(run_id, employee_id, deal_id, line_type, amount, explanation, source_table, source_id)
  select v_run_id, employee_id, deal_id, 'trade_spiff', amount, 'Auto trade spiff from Trade ACV thresholds, split weighted.', 'sales_deals', deal_id
  from trade_spiffs where amount <> 0;
  get diagnostics trade_spiff_count = row_count;

  with acquisition_participants as (
    select d.id as deal_id, d.vehicle, d.store_id, d.acquisition_acv, dp.employee_id, dp.split_pct
    from public.sales_deals d
    join public.deal_participants dp on dp.deal_id = d.id
    where date_trunc('month', d.contract_date)::date = target_month
      and coalesce(d.make, '') = ''
      and lower(coalesce(d.deal_type, '')) like '%acquisition%'
      and d.acquisition_acv is not null
      and dp.employee_id is not null
      and (sid is null or d.store_id = sid)
  )
  insert into public.commission_lines(run_id, employee_id, deal_id, line_type, amount, explanation, source_table, source_id)
  select v_run_id, employee_id, deal_id, 'buy_fee',
    round(public.buy_fee_amount(vehicle, acquisition_acv, target_month, store_id) * split_pct, 2),
    concat('Auto buy fee from acquisition vehicle ', coalesce(vehicle, 'unknown'), ' and ACV ', acquisition_acv, '. Split weighted.'),
    'sales_deals', deal_id
  from acquisition_participants;
  get diagnostics buy_fee_count = row_count;

  with resolved_adjustments as (
    select a.*, coalesce(a.employee_id, e.id) as resolved_employee_id, coalesce(a.store_id, e.store_id) as resolved_store_id
    from public.adjustments a
    left join public.employees e
      on (e.id = a.employee_id or (e.display_name = a.rep and (a.store_id is null or e.store_id is not distinct from a.store_id)))
    where a.month = target_month
  )
  insert into public.commission_lines(run_id, employee_id, deal_id, line_type, amount, explanation, source_table, source_id)
  select v_run_id, a.resolved_employee_id, d.id, a.category, round(coalesce(a.amount, 0), 2), a.note, 'adjustments', a.id
  from resolved_adjustments a
  left join public.sales_deals d on d.deal_number = a.deal_number
  where (sid is null or a.resolved_store_id = sid)
    and a.resolved_employee_id is not null
    and a.amount is not null
    and a.pct is null;
  get diagnostics flat_adjustment_count = row_count;

  with resolved_adjustments as (
    select a.*, coalesce(a.employee_id, e.id) as resolved_employee_id, coalesce(a.store_id, e.store_id) as resolved_store_id
    from public.adjustments a
    left join public.employees e
      on (e.id = a.employee_id or (e.display_name = a.rep and (a.store_id is null or e.store_id is not distinct from a.store_id)))
    where a.month = target_month
  )
  insert into public.commission_lines(run_id, employee_id, deal_id, line_type, amount, explanation, source_table, source_id)
  select v_run_id, a.resolved_employee_id, sd.id, a.category,
    trunc(coalesce(sd.front_gross, 0) * dp.split_pct * a.pct / 100, 2),
    concat(coalesce(a.note, a.category), ' · ', a.pct, '% allocated to deal front gross.'),
    'adjustments', a.id
  from resolved_adjustments a
  join public.deal_participants dp on dp.employee_id = a.resolved_employee_id
  join public.sales_deals sd on sd.id = dp.deal_id
  where (sid is null or a.resolved_store_id = sid)
    and a.resolved_employee_id is not null
    and a.pct is not null
    and date_trunc('month', sd.contract_date)::date = target_month
    and coalesce(sd.make, '') <> ''
    and coalesce(sd.stock_number, '') <> ''
    and (a.deal_number is null or sd.deal_number = a.deal_number);
  get diagnostics pct_adjustment_count = row_count;

  return jsonb_build_object('run_id', v_run_id, 'month', target_month, 'base_lines', base_count, 'unit_enhancement_lines', unit_count, 'tekion_spiff_lines', spiff_count, 'auto_trade_spiff_lines', trade_spiff_count, 'auto_buy_fee_lines', buy_fee_count, 'flat_adjustment_lines', flat_adjustment_count, 'pct_adjustment_lines', pct_adjustment_count, 'commission_lines', base_count + unit_count + spiff_count + trade_spiff_count + buy_fee_count + flat_adjustment_count + pct_adjustment_count);
end;
$function$;

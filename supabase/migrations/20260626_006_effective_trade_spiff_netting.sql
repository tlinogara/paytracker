do $$
declare
  src text;
  old_block text;
  new_block text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'refresh_commission_preview'
  limit 1;

  old_block := $old$
  ), tekion_spiffs as (
    select sp.deal_id, sp.employee_id, coalesce(public.money_to_numeric(public.json_text_any(sp.raw_json, array['Salesperson Spiff Amount'])), 0) * sp.split_pct as raw_amount, coalesce(ts.amount, 0) as trade_amount
    from sale_participants sp left join trade_spiffs ts on ts.deal_id = sp.deal_id and ts.employee_id = sp.employee_id
  )
  insert into public.commission_lines(run_id, employee_id, deal_id, line_type, amount, explanation, source_table, source_id)
  select v_run_id, employee_id, deal_id, 'spiff', greatest(raw_amount - trade_amount, 0), 'Tekion Salesperson Spiff Amount net of auto trade spiff when a trade ACV spiff is present.', 'sales_deals', deal_id
  from tekion_spiffs where greatest(raw_amount - trade_amount, 0) <> 0;
$old$;

  new_block := $new$
  ), trade_adjustments as (
    select d.id as deal_id, coalesce(a.employee_id, e.id) as employee_id, sum(coalesce(a.amount, 0)) as amount
    from public.adjustments a
    left join public.employees e on (e.id = a.employee_id or (e.display_name = a.rep and (a.store_id is null or e.store_id is not distinct from a.store_id)))
    join public.sales_deals d on d.deal_number = a.deal_number
    where a.month = target_month
      and a.amount is not null
      and a.pct is null
      and coalesce(a.employee_id, e.id) is not null
      and lower(replace(a.category, ' ', '_')) in ('trade_spiff','trade_spiff_correction','trade_in_spiff','trade_in_spiff_correction')
      and (sid is null or coalesce(a.store_id, e.store_id, d.store_id) = sid)
    group by d.id, coalesce(a.employee_id, e.id)
  ), tekion_spiffs as (
    select sp.deal_id, sp.employee_id,
      coalesce(public.money_to_numeric(public.json_text_any(sp.raw_json, array['Salesperson Spiff Amount'])), 0) * sp.split_pct as raw_amount,
      coalesce(ts.amount, 0) as auto_trade_amount,
      greatest(coalesce(ts.amount, 0) + coalesce(ta.amount, 0), 0) as effective_trade_amount
    from sale_participants sp
    left join trade_spiffs ts on ts.deal_id = sp.deal_id and ts.employee_id = sp.employee_id
    left join trade_adjustments ta on ta.deal_id = sp.deal_id and ta.employee_id = sp.employee_id
  ), net_spiffs as (
    select deal_id, employee_id,
      case
        when effective_trade_amount > 0 and raw_amount >= effective_trade_amount then raw_amount - effective_trade_amount
        when auto_trade_amount > 0 and raw_amount >= auto_trade_amount then raw_amount - auto_trade_amount
        else raw_amount
      end as amount
    from tekion_spiffs
  )
  insert into public.commission_lines(run_id, employee_id, deal_id, line_type, amount, explanation, source_table, source_id)
  select v_run_id, employee_id, deal_id, 'spiff', amount, 'Tekion Salesperson Spiff Amount net of effective trade spiff when included.', 'sales_deals', deal_id
  from net_spiffs where amount <> 0;
$new$;

  if position(old_block in src) = 0 then
    raise exception 'Expected Tekion spiff block was not found.';
  end if;

  src := replace(src, old_block, new_block);
  execute src;
end $$;

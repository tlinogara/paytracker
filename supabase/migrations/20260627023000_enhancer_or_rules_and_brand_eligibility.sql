alter table public.enhancer_rules
  add column if not exists or_metric text,
  add column if not exists or_threshold numeric;

alter table public.enhancer_rules
  drop constraint if exists enhancer_rules_or_metric_check;

alter table public.enhancer_rules
  add constraint enhancer_rules_or_metric_check
  check (
    (or_metric is null and or_threshold is null)
    or (
      or_metric = any (array[
        'new_units'::text,
        'used_units'::text,
        'total_units'::text,
        'priority_units'::text,
        'trades'::text,
        'acquisitions'::text,
        'trades_acquisitions'::text
      ])
      and or_threshold is not null
      and or_threshold > 0
      and metric <> 'manual'::text
    )
  );

create or replace view public.enhancer_status as
with base as (
  select
    er.id as rule_id,
    er.month,
    er.store_id as rule_store_id,
    e.store_id as employee_store_id,
    er.brand,
    er.label,
    er.pct,
    er.flat_amount,
    er.metric,
    er.threshold,
    er.or_metric,
    er.or_threshold,
    e.id as employee_id,
    e.display_name as rep,
    s.name as dealer,
    coalesce(sum(
      case
        when d.make ~~* er.make_pattern then coalesce(d.front_gross, 0::numeric) * dp.split_pct
        else 0::numeric
      end
    ), 0::numeric) as brand_front_gross,
    coalesce(sum(
      case
        when coalesce(d.make, ''::text) <> ''::text and coalesce(d.stock_number, ''::text) <> ''::text
          then coalesce(d.front_gross, 0::numeric) * dp.split_pct
        else 0::numeric
      end
    ), 0::numeric) as total_commissionable_gross,
    coalesce(sum(
      case
        when er.metric = 'new_units'::text
          and d.make ~~* er.make_pattern
          and lower(coalesce(d.stock_type, ''::text)) ~~ '%new%'::text then dp.split_pct
        when er.metric = 'used_units'::text
          and d.make ~~* er.make_pattern
          and lower(coalesce(d.stock_type, ''::text)) !~~ '%new%'::text then dp.split_pct
        when er.metric = 'total_units'::text
          and d.make ~~* er.make_pattern then dp.split_pct
        when er.metric = 'priority_units'::text
          and exists (
            select 1
            from public.priority_stock ps
            where ps.month = er.month
              and upper(trim(ps.stock_number)) = upper(trim(d.stock_number))
              and not (ps.store_id is distinct from er.store_id)
          ) then dp.split_pct
        when er.metric = 'trades'::text
          and d.make ~~* er.make_pattern then coalesce(d.trade_count, 0::numeric) * dp.split_pct
        when er.metric = 'acquisitions'::text
          and coalesce(d.make, ''::text) = ''::text then dp.split_pct
        when er.metric = 'trades_acquisitions'::text then
          (coalesce(d.trade_count, 0::numeric) * dp.split_pct)
          + case when coalesce(d.make, ''::text) = ''::text then dp.split_pct else 0::numeric end
        else 0::numeric
      end
    ), 0::numeric) as metric_value,
    coalesce(sum(
      case
        when er.or_metric = 'new_units'::text
          and d.make ~~* er.make_pattern
          and lower(coalesce(d.stock_type, ''::text)) ~~ '%new%'::text then dp.split_pct
        when er.or_metric = 'used_units'::text
          and d.make ~~* er.make_pattern
          and lower(coalesce(d.stock_type, ''::text)) !~~ '%new%'::text then dp.split_pct
        when er.or_metric = 'total_units'::text
          and d.make ~~* er.make_pattern then dp.split_pct
        when er.or_metric = 'priority_units'::text
          and exists (
            select 1
            from public.priority_stock ps
            where ps.month = er.month
              and upper(trim(ps.stock_number)) = upper(trim(d.stock_number))
              and not (ps.store_id is distinct from er.store_id)
          ) then dp.split_pct
        when er.or_metric = 'trades'::text
          and d.make ~~* er.make_pattern then coalesce(d.trade_count, 0::numeric) * dp.split_pct
        when er.or_metric = 'acquisitions'::text
          and coalesce(d.make, ''::text) = ''::text then dp.split_pct
        when er.or_metric = 'trades_acquisitions'::text then
          (coalesce(d.trade_count, 0::numeric) * dp.split_pct)
          + case when coalesce(d.make, ''::text) = ''::text then dp.split_pct else 0::numeric end
        else 0::numeric
      end
    ), 0::numeric) as or_metric_value
  from public.enhancer_rules er
  join public.employees e
    on (er.store_id is null or e.store_id = er.store_id)
   and (
     er.brand = 'All brands'::text
     or exists (
       select 1
       from public.brand_rep_classifications brc
       where brc.employee_id = e.id
         and brc.brand = er.brand
         and brc.active
         and (er.store_id is null or brc.store_id = er.store_id)
         and (brc.store_id is null or e.store_id is null or brc.store_id = e.store_id)
     )
   )
  left join public.stores s on s.id = e.store_id
  left join public.deal_participants dp on dp.employee_id = e.id
  left join public.sales_deals d
    on d.id = dp.deal_id
   and date_trunc('month'::text, d.contract_date::timestamp with time zone)::date = er.month
  where er.metric <> 'manual'::text
  group by
    er.id,
    er.month,
    er.store_id,
    e.store_id,
    er.brand,
    er.label,
    er.pct,
    er.flat_amount,
    er.metric,
    er.threshold,
    er.or_metric,
    er.or_threshold,
    e.id,
    e.display_name,
    s.name
), qualified as (
  select
    base.*,
    metric_value >= threshold as primary_qualified,
    or_metric is not null
      and or_threshold is not null
      and or_metric_value >= or_threshold as secondary_qualified
  from base
)
select
  rule_id,
  month,
  coalesce(rule_store_id, employee_store_id) as store_id,
  brand,
  label,
  pct,
  flat_amount,
  metric,
  threshold,
  employee_id,
  rep,
  dealer,
  metric_value,
  brand_front_gross,
  (primary_qualified or secondary_qualified) as qualified,
  round(
    case
      when flat_amount is not null then flat_amount *
        case
          when primary_qualified then metric_value
          when secondary_qualified then or_metric_value
          else greatest(metric_value, coalesce(or_metric_value, 0::numeric))
        end
      else (coalesce(pct, 0::numeric) * total_commissionable_gross) / 100::numeric
    end,
    2
  ) as proposed_amount,
  total_commissionable_gross,
  or_metric,
  or_threshold,
  or_metric_value
from qualified;

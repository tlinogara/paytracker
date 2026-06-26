create table if not exists public.brand_rep_assignments (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  store_id uuid references public.stores(id) on delete cascade,
  brand text not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(month, store_id, brand, employee_id)
);

alter table public.brand_rep_assignments enable row level security;

do $$ begin
  create policy brand_rep_assignments_select on public.brand_rep_assignments for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy brand_rep_assignments_admin on public.brand_rep_assignments for all to authenticated using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
exception when duplicate_object then null; end $$;

create or replace trigger brand_rep_assignments_touch
before update on public.brand_rep_assignments
for each row execute function public.touch_updated_at();

insert into public.brand_rep_assignments(month, store_id, brand, employee_id, active, note)
select date '2026-01-01', e.store_id, 'Lamborghini', e.id, true, 'January Lamborghini manual enhancer assigned rep.'
from public.employees e
where e.display_name in ('Hayden Kaplan','Julian Bowden','Sacha Passuello')
on conflict (month, store_id, brand, employee_id) do update set active = excluded.active, note = excluded.note, updated_at = now();

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
), assigned as (
  select
    mr.rule_id,
    mr.month,
    coalesce(mr.rule_store_id, bra.store_id, e.store_id) as store_id,
    mr.brand,
    mr.label,
    mr.pct,
    mr.flat_amount,
    e.id as employee_id,
    e.display_name as rep,
    s.name as dealer
  from manual_rules mr
  join public.brand_rep_assignments bra
    on bra.month = mr.month
   and bra.brand = mr.brand
   and bra.active
   and (mr.rule_store_id is null or bra.store_id = mr.rule_store_id)
  join public.employees e on e.id = bra.employee_id
  left join public.stores s on s.id = coalesce(mr.rule_store_id, bra.store_id, e.store_id)
), approved_existing as (
  select distinct
    er.id as rule_id,
    er.month,
    coalesce(er.store_id, a.store_id, e.store_id) as store_id,
    er.brand,
    er.label,
    er.pct,
    er.flat_amount,
    e.id as employee_id,
    e.display_name as rep,
    s.name as dealer
  from public.adjustments a
  join public.enhancer_rules er on er.id = a.rule_id and er.metric = 'manual'
  join public.employees e on e.id = a.employee_id
  left join public.stores s on s.id = coalesce(er.store_id, a.store_id, e.store_id)
  where a.category = 'enhancer'
), review_reps as (
  select * from assigned
  union
  select * from approved_existing
), rep_metrics as (
  select
    rr.rule_id,
    rr.month,
    rr.store_id,
    rr.brand,
    rr.label,
    rr.pct,
    rr.flat_amount,
    rr.employee_id,
    rr.rep,
    rr.dealer,
    coalesce(sum(case when d.make ilike mr.make_pattern then coalesce(d.front_gross, 0) * dp.split_pct else 0 end), 0) as brand_front_gross,
    coalesce(sum(case when coalesce(d.make, '') <> '' and coalesce(d.stock_number, '') <> '' then coalesce(d.front_gross, 0) * dp.split_pct else 0 end), 0) as total_commissionable_gross
  from review_reps rr
  join manual_rules mr on mr.rule_id = rr.rule_id
  left join public.deal_participants dp on dp.employee_id = rr.employee_id
  left join public.sales_deals d on d.id = dp.deal_id and date_trunc('month', d.contract_date)::date = rr.month
  group by rr.rule_id, rr.month, rr.store_id, rr.brand, rr.label, rr.pct, rr.flat_amount, rr.employee_id, rr.rep, rr.dealer
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
from with_adjustments;

grant select on public.manual_enhancer_status to authenticated;

create or replace view public.commission_line_detail as
with line_run_candidates as (
  select cl.id as line_id, cl.run_id, cr.month, coalesce(cr.store_id, e.store_id, d.store_id) as effective_store_id, cr.store_id as run_store_id, cl.employee_id, cr.status, cr.refreshed_at, cr.created_at, cr.id as current_sort_id
  from public.commission_lines cl
  join public.commission_runs cr on cr.id = cl.run_id
  left join public.employees e on e.id = cl.employee_id
  left join public.sales_deals d on d.id = cl.deal_id
  where cr.status = any(array['preview'::text,'locked'::text,'paid'::text])
), current_employee_runs as (
  select distinct on (month, effective_store_id, employee_id) run_id, month, effective_store_id, employee_id
  from line_run_candidates
  order by month, effective_store_id, employee_id, case when run_store_id is not null then 0 else 1 end, case status when 'locked' then 0 when 'paid' then 1 else 2 end, refreshed_at desc nulls last, created_at desc, current_sort_id desc
)
select cl.id, cl.run_id, cr.month, coalesce(cr.store_id, e.store_id, d.store_id) as store_id, cl.employee_id, coalesce(e.display_name, ''::text) as rep, d.deal_number, cl.line_type, cl.amount, cl.explanation, cl.source_table, cl.source_id, cl.created_at
from public.commission_lines cl
join public.commission_runs cr on cr.id = cl.run_id
left join public.employees e on e.id = cl.employee_id
left join public.sales_deals d on d.id = cl.deal_id
join current_employee_runs cer on cer.run_id = cl.run_id and cer.month = cr.month and not cer.effective_store_id is distinct from coalesce(cr.store_id, e.store_id, d.store_id) and not cer.employee_id is distinct from cl.employee_id;

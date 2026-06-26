insert into public.adjustments (month, store_id, store, employee_id, rep, category, amount, pct, note)
select date '2026-01-01', e.store_id, s.name, e.id, e.display_name, 'enhancer', null::numeric, 5.5000,
       'January Lamborghini total percent enhancement from commission sheet for mini decision and percent payout.'
from public.employees e
join public.stores s on s.id = e.store_id
where e.display_name = 'Julian Bowden'
  and not exists (
    select 1 from public.adjustments a
    where a.month = date '2026-01-01'
      and a.employee_id = e.id
      and a.category = 'enhancer'
      and a.pct = 5.5000
      and a.note = 'January Lamborghini total percent enhancement from commission sheet for mini decision and percent payout.'
  );

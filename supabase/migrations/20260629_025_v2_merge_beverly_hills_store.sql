do $$
declare
  canonical_store_id uuid;
  duplicate_store_id uuid;
begin
  select id into canonical_store_id
  from public.stores
  where lower(name) = lower('O''Gara Beverly Hills')
  order by created_at desc
  limit 1;

  select id into duplicate_store_id
  from public.stores
  where lower(name) = lower('Beverly Hills')
  order by created_at asc
  limit 1;

  if canonical_store_id is null then
    if duplicate_store_id is null then
      insert into public.stores (name, active)
      values ('O''Gara Beverly Hills', true)
      returning id into canonical_store_id;
    else
      update public.stores
      set name = 'O''Gara Beverly Hills', active = true
      where id = duplicate_store_id;
      canonical_store_id := duplicate_store_id;
      duplicate_store_id := null;
    end if;
  end if;

  if duplicate_store_id is not null and duplicate_store_id <> canonical_store_id then
    update public.adjustments set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.brand_month_reviews set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.brand_rep_assignments set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.brand_rep_classifications set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.buy_fee_default_rules set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.buy_fee_rules set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.commission_runs set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.employees set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.enhancer_rules set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.mini_tiers set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.pay_plans set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.priority_stock set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.profiles set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.raw_import_files set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.sales_deals set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.store_month_reviews set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.trade_spiff_rules set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.unit_enhancement_tiers set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.user_brand_access set store_id = canonical_store_id where store_id = duplicate_store_id;
    update public.user_store_access set store_id = canonical_store_id where store_id = duplicate_store_id;

    delete from public.stores where id = duplicate_store_id;
  end if;

  update public.stores
  set name = 'O''Gara Beverly Hills', active = true
  where id = canonical_store_id;

  update public.profiles
  set store_name = 'O''Gara Beverly Hills'
  where lower(coalesce(store_name, '')) in (lower('Beverly Hills'), lower('O''Gara Beverly Hills'));
end $$;

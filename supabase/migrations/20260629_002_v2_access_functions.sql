create or replace function public.normalize_app_role(p_role text)
returns text
language sql
immutable
as $$
  select case p_role
    when 'rep' then 'sales_rep'
    when 'manager' then 'general_sales_manager'
    when 'payroll' then 'payroll_manager'
    else p_role
  end;
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.normalize_app_role(p.role)
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.can_access_store_v2(p_store_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r text;
begin
  r := public.current_app_role();

  if r in ('payroll_manager', 'admin') then
    return true;
  end if;

  if p_store_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.store_id = p_store_id
      and public.normalize_app_role(p.role) = 'general_sales_manager'
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.user_store_access usa
    where usa.user_id = auth.uid()
      and usa.store_id = p_store_id
      and usa.active
  ) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.can_access_brand_v2(p_store_id uuid, p_brand text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.can_access_store_v2(p_store_id) then
    return true;
  end if;

  if p_store_id is null or nullif(trim(coalesce(p_brand, '')), '') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.user_brand_access uba
    where uba.user_id = auth.uid()
      and uba.store_id = p_store_id
      and lower(uba.brand) = lower(p_brand)
      and uba.active
  );
end;
$$;

create or replace function public.can_access_employee_v2(p_employee_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  own_employee_id uuid;
begin
  if p_employee_id is null then
    return false;
  end if;

  select p.employee_id into own_employee_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if own_employee_id = p_employee_id then
    return true;
  end if;

  if exists (
    select 1
    from public.employees e
    where e.id = p_employee_id
      and public.can_access_store_v2(e.store_id)
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.brand_rep_classifications brc
    join public.user_brand_access uba
      on uba.store_id = brc.store_id
     and lower(uba.brand) = lower(brc.brand)
     and uba.active
    where brc.employee_id = p_employee_id
      and brc.active
      and uba.user_id = auth.uid()
  ) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.can_access_deal_v2(p_deal_id uuid, p_store_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.can_access_store_v2(p_store_id) then
    return true;
  end if;

  if p_deal_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.deal_participants dp
    where dp.deal_id = p_deal_id
      and public.can_access_employee_v2(dp.employee_id)
  );
end;
$$;

create or replace function public.can_manage_bonus_v2(p_store_id uuid, p_brand text, p_employee_id uuid default null)
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

  if public.can_access_store_v2(p_store_id) and public.current_app_role() = 'general_sales_manager' then
    return true;
  end if;

  if public.can_access_brand_v2(p_store_id, p_brand) and public.current_app_role() = 'brand_manager' then
    if p_employee_id is null then
      return true;
    end if;
    return public.can_access_employee_v2(p_employee_id);
  end if;

  return false;
end;
$$;

create or replace function public.can_edit_calculations_v2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('payroll_manager', 'admin'), false);
$$;

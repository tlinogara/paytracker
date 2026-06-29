drop view if exists public.commission_line_detail;
drop view if exists public.rep_mtd;
drop view if exists public.deals;

alter table public.commission_lines alter column amount type numeric(18,6);

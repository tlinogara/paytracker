export type Role = "rep" | "manager" | "admin";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  rep_name: string | null;
  store_name: string | null;
  role: Role;
}

export interface RepMtd {
  rep: string;
  dealer: string | null;
  month: string; // ISO date, first of month
  deal_rows: number;
  units: number | null;
  new_units: number | null;
  used_units: number | null;
  front_gross_share: number | null;
  total_commission: number | null;
  split_deals: number | null;
}

export interface DealRow {
  deal_number: string;
  rep: string;
  contract_date: string | null;
  status: string | null;
  stock_type: string | null;
  customer: string | null;
  vehicle: string | null;
  front_gross: number | null;
  rep_unit_count: number | null;
  rep_commission: number | null;
  is_split_deal: boolean | null;
  salesperson: string | null;
  dealer: string | null;
}

export type Role = "rep" | "manager" | "payroll" | "admin";

export interface Store {
  id: string;
  name: string;
  active: boolean;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  rep_name: string | null;
  store_name: string | null;
  employee_id: string | null;
  store_id: string | null;
  role: Role;
}

export interface Employee {
  id: string;
  display_name: string;
  store_id: string | null;
  tekion_names?: string[];
  active: boolean;
}

export interface BrandRepAssignment {
  id: string;
  month: string;
  store_id: string | null;
  brand: string;
  employee_id: string;
  active: boolean;
  note: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RepMtd {
  employee_id: string | null;
  store_id: string | null;
  rep: string;
  dealer: string | null;
  month: string;
  deal_rows: number;
  units: number | null;
  new_units: number | null;
  used_units: number | null;
  front_gross_share: number | null;
  total_commission: number | null;
  split_deals: number | null;
}

export interface DealRow {
  deal_id: string | null;
  employee_id: string | null;
  store_id: string | null;
  deal_number: string;
  stock_number: string | null;
  rep: string;
  contract_date: string | null;
  status: string | null;
  stock_type: string | null;
  customer: string | null;
  vehicle: string | null;
  front_gross: number | null;
  rep_unit_count: number | null;
  rep_commission: number | null;
  spiffs: number | null;
  total_enhancers: number | null;
  trade_spiffs: number | null;
  is_split_deal: boolean | null;
  salesperson: string | null;
  dealer: string | null;
  make: string | null;
}

export type AdjCategory =
  | "spiff"
  | "enhancer"
  | "enhanced_mini"
  | "trade_spiff"
  | "buy_fee"
  | "correction"
  | "draw"
  | "prior_month"
  | "carryover"
  | "other";

export interface Adjustment {
  id: string;
  rep: string;
  store: string;
  employee_id: string | null;
  store_id: string | null;
  month: string;
  deal_number: string | null;
  category: AdjCategory;
  amount: number | null;
  pct: number | null;
  rate_pct: number | null;
  note: string | null;
  rule_id: string | null;
  created_at: string;
}

export type EnhancerMetric =
  | "new_units"
  | "used_units"
  | "total_units"
  | "priority_units"
  | "trades"
  | "acquisitions"
  | "trades_acquisitions"
  | "manual";

export type AutoEnhancerMetric = Exclude<EnhancerMetric, "manual">;

export interface EnhancerRule {
  id: string;
  month: string;
  store_id: string | null;
  brand: string;
  make_pattern: string;
  label: string;
  pct: number | null;
  flat_amount: number | null;
  metric: EnhancerMetric;
  threshold: number;
  or_metric: AutoEnhancerMetric | null;
  or_threshold: number | null;
}

export interface EnhancerStatus {
  rule_id: string;
  month: string;
  store_id: string | null;
  brand: string;
  label: string;
  pct: number | null;
  flat_amount: number | null;
  metric: AutoEnhancerMetric;
  threshold: number;
  rep: string;
  employee_id: string | null;
  dealer: string | null;
  metric_value: number | null;
  brand_front_gross: number | null;
  qualified: boolean;
  proposed_amount: number | null;
  total_commissionable_gross: number | null;
  or_metric: AutoEnhancerMetric | null;
  or_threshold: number | null;
  or_metric_value: number | null;
}

export interface CommissionLine {
  id: string;
  run_id: string;
  month: string;
  store_id: string | null;
  employee_id: string | null;
  rep: string;
  deal_number: string | null;
  line_type: string;
  amount: number;
  explanation: string | null;
  source_table: string | null;
  source_id: string | null;
  created_at: string;
}

export interface CommissionRun {
  id: string;
  month: string;
  store_id: string | null;
  store_name: string | null;
  status: "preview" | "locked" | "paid";
  created_at: string;
  refreshed_at: string | null;
  locked_at: string | null;
  locked_by: string | null;
}

export interface ImportFile {
  id: string;
  source: string;
  store_id: string | null;
  file_name: string;
  file_hash: string | null;
  row_count: number | null;
  imported_at: string;
}

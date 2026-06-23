// Shapes returned by the PayTracker SQL views (the read surface the app uses).
// Every field is the column name the corresponding v_* view exposes.

export interface StoreStats {
  report_month: string;
  total_comp: number | null;
  total_units: number | null;
  new_units: number | null;
  used_units: number | null;
  total_gross: number | null;
  front_gross: number | null;
  back_gross: number | null;
  total_pvr: number | null;
  front_pvr: number | null;
  back_pvr: number | null;
}

export interface PayrollRow {
  report_month: string;
  emp_no: string;
  display_name: string;
  pay_plan: string | null;
  new_units: number | null;
  used_units: number | null;
  total_units: number | null;
  front_gross: number | null;
  back_gross: number | null;
  total_gross: number | null;
  base_rate: number | null;
  effective_rate: number | null;
  base: number | null;
  flat_enhancers: number | null;
  spiffs: number | null;
  acq_bonus: number | null;
  enhancers: number | null;
  prior_month_adj: number | null;
  draw: number | null;
  prior_draw_balance: number | null;
  gross_pay: number | null;
  due: number | null;
}

export type LeaderboardMetric =
  | "new_units"
  | "used_units"
  | "total_units"
  | "front_pvr"
  | "back_pvr"
  | "total_pvr";

export interface LeaderboardRow {
  report_month: string;
  metric: LeaderboardMetric;
  name: string;
  value: number | null;
  rank: number;
}

// v_deals_detail aliases its columns to exactly these names, so DealsTable
// renders straight from the view with no per-column mapping.
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
  make: string | null;
}

export interface EnhancerStatusRow {
  report_month: string;
  emp_no: string;
  display_name: string;
  pay_plan: string | null;
  code: string;
  description: string | null;
  kind: string; // 'rate' | 'flat'
  rate: number | null;
  amount: number | null;
  trigger: string;
  achieved: boolean;
}

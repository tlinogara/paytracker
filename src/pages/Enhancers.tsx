import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMonth } from "../lib/useMonth";
import { supabase } from "../lib/supabase";
import { parseEnhancerText } from "../lib/parseEnhancers";
import type { DraftRule } from "../lib/parseEnhancers";
import type {
  Adjustment,
  AutoEnhancerMetric,
  EnhancerMetric,
  EnhancerRule,
  EnhancerStatus,
  Profile,
} from "../lib/types";
import { moneyExact, money, monthLabel, monthStartISO, units } from "../lib/format";
import Topbar from "../components/Topbar";
import MonthBar from "../components/MonthBar";
import Collapsible from "../components/Collapsible";

const ALL_BRANDS = "All brands";
const AUTO_METRICS: AutoEnhancerMetric[] = [
  "new_units",
  "used_units",
  "total_units",
  "priority_units",
  "trades",
  "acquisitions",
  "trades_acquisitions",
];
const METRIC_LABEL: Record<EnhancerMetric, string> = {
  new_units: "New units sold",
  used_units: "Used units sold",
  total_units: "Total units sold",
  priority_units: "Priority list units sold",
  trades: "Trade ins taken",
  acquisitions: "Acquisitions",
  trades_acquisitions: "Acquisitions plus trade ins",
  manual: "Manual review",
};

type EditDraft = {
  brand: string;
  label: string;
  metric: EnhancerMetric;
  threshold: string;
  or_metric: AutoEnhancerMetric | "";
  or_threshold: string;
  pct: string;
  flat_amount: string;
  confident: boolean;
};

type ManualEnhancerStatus = {
  rule_id: string;
  month: string;
  store_id: string | null;
  brand: string;
  label: string;
  pct: number | null;
  flat_amount: number | null;
  employee_id: string | null;
  rep: string;
  dealer: string | null;
  total_commissionable_gross: number | null;
  proposed_amount: number | null;
  approved: boolean;
  adjustment_id: string | null;
};

const toEditDraft = (d: DraftRule): EditDraft => ({
  brand: d.brand,
  label: d.label,
  metric: d.metric,
  threshold: String(d.threshold ?? ""),
  or_metric: d.or_metric ?? "",
  or_threshold: d.or_threshold == null ? "" : String(d.or_threshold),
  pct: d.pct == null || d.pct === 0 ? "" : String(d.pct),
  flat_amount: d.flat_amount == null ? "" : String(d.flat_amount),
  confident: d.confident,
});

const rateLabel = (row: Pick<EnhancerRule | ManualEnhancerStatus, "pct" | "flat_amount">) =>
  row.flat_amount != null ? moneyExact(row.flat_amount) : `${row.pct}%`;

function brandRank(brand: string): string {
  return brand === ALL_BRANDS ? "zzzzzz" : brand.toLocaleLowerCase();
}

function sortBrands<T extends string>(brands: T[]): T[] {
  return [...brands].sort((a, b) => brandRank(a).localeCompare(brandRank(b)));
}

function sortRules(rows: EnhancerRule[]): EnhancerRule[] {
  return [...rows].sort(
    (a, b) => brandRank(a.brand).localeCompare(brandRank(b.brand)) || a.label.localeCompare(b.label)
  );
}

function normalizeStockNumber(stock: string): string {
  return stock.trim().toUpperCase();
}

function conditionCounts(row: Pick<EnhancerRule, "metric" | "or_metric">): string {
  if (!row.or_metric) return METRIC_LABEL[row.metric];
  return `${METRIC_LABEL[row.metric]} or ${METRIC_LABEL[row.or_metric]}`;
}

function conditionNeed(row: Pick<EnhancerRule, "threshold" | "or_threshold">): string {
  if (row.or_threshold == null) return units(row.threshold);
  return `${units(row.threshold)} or ${units(row.or_threshold)}`;
}

function conditionProgress(row: EnhancerStatus): string {
  const primary = `${units(row.metric_value)}/${units(row.threshold)} ${METRIC_LABEL[row.metric].toLowerCase()}`;
  if (!row.or_metric || row.or_threshold == null) return primary;
  const secondary = `${units(row.or_metric_value)}/${units(row.or_threshold)} ${METRIC_LABEL[row.or_metric].toLowerCase()}`;
  return `${primary} or ${secondary}`;
}

function qualifyingMetricValue(row: EnhancerStatus): number | null {
  const primaryQualifies = (row.metric_value ?? 0) >= row.threshold;
  const secondaryQualifies = row.or_metric != null && row.or_threshold != null && (row.or_metric_value ?? 0) >= row.or_threshold;
  if (primaryQualifies) return row.metric_value;
  if (secondaryQualifies) return row.or_metric_value;
  return row.metric_value;
}

function metricOptions(includeManual: boolean) {
  return (
    <>
      <option value="new_units">New units</option>
      <option value="used_units">Used units</option>
      <option value="total_units">Total units</option>
      <option value="priority_units">Priority list</option>
      <option value="trades">Trade ins</option>
      <option value="acquisitions">Acquisitions</option>
      <option value="trades_acquisitions">Trades plus acq</option>
      {includeManual && <option value="manual">Manual review</option>}
    </>
  );
}

export default function Enhancers({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const { month, setMonth, isCurrentMonth } = useMonth();
  const [rules, setRules] = useState<EnhancerRule[]>([]);
  const [status, setStatus] = useState<EnhancerStatus[]>([]);
  const [manualReview, setManualReview] = useState<ManualEnhancerStatus[]>([]);
  const [approved, setApproved] = useState<Adjustment[]>([]);
  const [stocks, setStocks] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [label, setLabel] = useState("");
  const [pct, setPct] = useState("");
  const [flatAmount, setFlatAmount] = useState("");
  const [metric, setMetric] = useState<EnhancerMetric>("used_units");
  const [threshold, setThreshold] = useState("");
  const [orMetric, setOrMetric] = useState<AutoEnhancerMetric | "">("");
  const [orThreshold, setOrThreshold] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualBusyKey, setManualBusyKey] = useState<string | null>(null);
  const [ruleBrand, setRuleBrand] = useState("");
  const [stockPaste, setStockPaste] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [drafts, setDrafts] = useState<EditDraft[] | null>(null);
  const monthISO = monthStartISO(month);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile((data as Profile) ?? null));
    supabase
      .from("brand_list")
      .select("*")
      .order("n", { ascending: false })
      .then(({ data }) =>
        setBrands(sortBrands(((data ?? []) as { brand: string }[]).map((b) => b.brand)))
      );
  }, [session.user.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [rulesRes, statusRes, manualRes, apprRes, stockRes] = await Promise.all([
      supabase.from("enhancer_rules").select("*").eq("month", monthISO).order("brand").order("label"),
      supabase
        .from("enhancer_status")
        .select("*")
        .eq("month", monthISO)
        .eq("qualified", true)
        .order("brand")
        .order("rep"),
      supabase
        .from("manual_enhancer_status")
        .select("*")
        .eq("month", monthISO)
        .order("brand")
        .order("label")
        .order("rep"),
      supabase.from("adjustments").select("*").eq("month", monthISO).not("rule_id", "is", null),
      supabase.from("priority_stock").select("stock_number").eq("month", monthISO).order("stock_number"),
    ]);
    const e = rulesRes.error || statusRes.error || manualRes.error || apprRes.error || stockRes.error;
    if (e) setErr(e.message);
    setRules(sortRules((rulesRes.data ?? []) as EnhancerRule[]));
    setStatus(
      ((statusRes.data ?? []) as EnhancerStatus[]).sort(
        (a, b) => brandRank(a.brand).localeCompare(brandRank(b.brand)) || a.rep.localeCompare(b.rep)
      )
    );
    setManualReview(
      ((manualRes.data ?? []) as ManualEnhancerStatus[]).sort(
        (a, b) =>
          brandRank(a.brand).localeCompare(brandRank(b.brand)) ||
          a.label.localeCompare(b.label) ||
          a.rep.localeCompare(b.rep)
      )
    );
    setApproved((apprRes.data ?? []) as Adjustment[]);
    setStocks(
      sortBrands(
        ((stockRes.data ?? []) as { stock_number: string }[])
          .map((s) => normalizeStockNumber(s.stock_number))
          .filter(Boolean)
      )
    );
    setLoading(false);
  }, [monthISO]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = profile?.role === "manager" || profile?.role === "payroll" || profile?.role === "admin";
  const brandOptions = useMemo(() => sortBrands(brands.filter((b) => b !== ALL_BRANDS)), [brands]);
  const standardRules = useMemo(() => rules.filter((r) => r.metric !== "manual"), [rules]);
  const manualRules = useMemo(() => rules.filter((r) => r.metric === "manual"), [rules]);
  const ruleBrands = useMemo(
    () => sortBrands(Array.from(new Set<string>(standardRules.map((r) => r.brand)))),
    [standardRules]
  );
  const visibleRules = useMemo(
    () => (ruleBrand ? standardRules.filter((r) => r.brand === ruleBrand) : standardRules),
    [standardRules, ruleBrand]
  );
  const approvedKeys = useMemo(() => new Set(approved.map((a) => `${a.rule_id}|${a.rep}`)), [approved]);
  const pending = status.filter((s) => !approvedKeys.has(`${s.rule_id}|${s.rep}`));
  const manualApprovedCount = manualReview.filter((r) => r.approved).length;
  const manualReviewGroups = useMemo(() => {
    const rowsByBrand = new Map<string, ManualEnhancerStatus[]>();
    for (const row of manualReview) {
      if (!rowsByBrand.has(row.brand)) rowsByBrand.set(row.brand, []);
      rowsByBrand.get(row.brand)!.push(row);
    }
    for (const rows of rowsByBrand.values()) {
      rows.sort((a, b) => a.label.localeCompare(b.label) || a.rep.localeCompare(b.rep));
    }
    return sortBrands(Array.from(new Set<string>([...manualRules.map((r) => r.brand), ...manualReview.map((r) => r.brand)]))).map(
      (b) => [b, rowsByBrand.get(b) ?? []] as const
    );
  }, [manualReview, manualRules]);

  async function approve(s: EnhancerStatus) {
    setErr(null);
    setOk(null);
    const isFlat = s.flat_amount != null;
    const note = isFlat
      ? `${s.brand}: ${s.label} · ${conditionProgress(s)} qualified · ${moneyExact(s.flat_amount)} per unit`
      : `${s.brand}: ${s.label} · ${conditionProgress(s)} qualified · ${s.pct}% of ${money(s.total_commissionable_gross)} total commissionable gross`;
    const { error } = await supabase.from("adjustments").insert({
      rep: s.rep,
      store: s.dealer ?? profile?.store_name ?? "unknown",
      employee_id: s.employee_id,
      store_id: s.store_id,
      month: monthISO,
      category: "enhancer",
      amount: isFlat ? s.proposed_amount ?? 0 : null,
      pct: isFlat ? null : s.pct,
      rate_pct: isFlat ? null : s.pct,
      note,
      rule_id: s.rule_id,
    });
    if (error) setErr(error.message);
    else load();
  }

  async function setManualApproval(row: ManualEnhancerStatus, approvedValue: boolean) {
    setErr(null);
    setOk(null);
    if (!row.employee_id) {
      setErr("This manual review row is missing an employee id.");
      return;
    }
    const key = `${row.rule_id}|${row.employee_id}`;
    setManualBusyKey(key);
    const { error } = await supabase.rpc("set_manual_enhancer_approval", {
      p_rule_id: row.rule_id,
      p_employee_id: row.employee_id,
      p_approved: approvedValue,
    });
    setManualBusyKey(null);
    if (error) setErr(error.message);
    else {
      setOk(`${row.rep} ${approvedValue ? "approved" : "removed"} for ${row.brand}: ${row.label}.`);
      load();
    }
  }

  async function addRule(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const p = pct.trim() === "" ? null : Number(pct);
    const flat = flatAmount.trim() === "" ? null : Number(flatAmount);
    const t = metric === "manual" ? 1 : Number(threshold);
    const orT = orThreshold.trim() === "" ? null : Number(orThreshold);
    if (!brand || !label.trim() || Number.isNaN(t) || ((p == null) === (flat == null))) {
      setErr("Brand, rule, threshold, and either a percent or dollar amount are required.");
      return;
    }
    if (metric === "manual" && orMetric) {
      setErr("Manual rules cannot use an OR condition.");
      return;
    }
    if ((orMetric && (orT == null || Number.isNaN(orT) || orT <= 0)) || (!orMetric && orThreshold.trim() !== "")) {
      setErr("Choose an OR count type and a positive OR threshold, or clear both OR fields.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("enhancer_rules").insert({
      month: monthISO,
      store_id: profile?.store_id ?? null,
      brand,
      make_pattern: brand === ALL_BRANDS ? "%" : `%${brand}%`,
      label: label.trim(),
      pct: p,
      flat_amount: flat,
      metric,
      threshold: t,
      or_metric: orMetric || null,
      or_threshold: orMetric ? orT : null,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setLabel("");
      setPct("");
      setFlatAmount("");
      setThreshold("");
      setOrMetric("");
      setOrThreshold("");
      setOk("Enhancer rule added.");
      load();
    }
  }

  async function removeRule(id: string) {
    setErr(null);
    setOk(null);
    const { error } = await supabase.from("enhancer_rules").delete().eq("id", id);
    if (error) {
      setErr(error.message.includes("foreign key") ? "This rule already has approved payouts. Remove the payouts first." : error.message);
    } else load();
  }

  async function removeManualRule(rule: EnhancerRule) {
    setErr(null);
    setOk(null);
    if (!window.confirm(`Remove manual enhancer rule: ${rule.brand} · ${rule.label}? This also removes approvals for that rule.`)) return;
    setBusy(true);
    const deleteAdjustments = await supabase.from("adjustments").delete().eq("rule_id", rule.id);
    if (deleteAdjustments.error) {
      setBusy(false);
      setErr(deleteAdjustments.error.message);
      return;
    }
    const deleteRule = await supabase.from("enhancer_rules").delete().eq("id", rule.id);
    setBusy(false);
    if (deleteRule.error) setErr(deleteRule.error.message);
    else {
      setOk("Manual enhancer rule removed.");
      load();
    }
  }

  async function saveDrafts(rows: EditDraft[]) {
    setErr(null);
    setOk(null);
    for (const d of rows) {
      const p = Number(d.pct);
      const flat = Number(d.flat_amount);
      const hasPct = d.pct.trim() !== "" && p > 0;
      const hasFlat = d.flat_amount.trim() !== "" && flat > 0;
      const hasOr = d.or_metric !== "" || d.or_threshold.trim() !== "";
      const orT = Number(d.or_threshold);
      if (!d.label.trim() || (hasPct && hasFlat) || (!hasPct && !hasFlat && d.metric !== "manual")) {
        setErr("Every draft needs one payout type and a description.");
        return;
      }
      if (d.metric === "manual" && hasOr) {
        setErr(`"${d.label.slice(0, 40)}" is manual, so it cannot use an OR condition.`);
        return;
      }
      if (hasOr && (!d.or_metric || d.or_threshold.trim() === "" || Number.isNaN(orT) || orT <= 0)) {
        setErr(`"${d.label.slice(0, 40)}" needs both OR count type and OR threshold.`);
        return;
      }
    }
    setBusy(true);
    const payload = rows.map((d) => {
      const flat = d.flat_amount.trim() !== "" && Number(d.flat_amount) > 0 ? Number(d.flat_amount) : null;
      return {
        month: monthISO,
        store_id: profile?.store_id ?? null,
        brand: d.brand,
        make_pattern: d.brand === ALL_BRANDS ? "%" : `%${d.brand}%`,
        label: d.label.trim(),
        pct: flat != null ? null : Number(d.pct) || null,
        flat_amount: flat,
        metric: d.metric,
        threshold: d.metric === "manual" ? 1 : Math.max(1, Number(d.threshold) || 1),
        or_metric: d.or_metric || null,
        or_threshold: d.or_metric ? Math.max(1, Number(d.or_threshold) || 1) : null,
      };
    });
    const { error } = await supabase.from("enhancer_rules").insert(payload);
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setDrafts(null);
      setPasteText("");
      setOk("Draft rules saved.");
      load();
    }
  }

  async function addStock(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const parsed = stockPaste
      .split(/[\s,;]+/)
      .map(normalizeStockNumber)
      .filter(Boolean);
    if (parsed.length === 0) return;

    const existing = new Set(stocks.map(normalizeStockNumber));
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    const fresh: string[] = [];
    for (const stockNumber of parsed) {
      if (seen.has(stockNumber) || existing.has(stockNumber)) {
        duplicates.add(stockNumber);
      } else {
        seen.add(stockNumber);
        fresh.push(stockNumber);
      }
    }

    if (fresh.length === 0) {
      setErr(`Duplicate stock number(s): ${Array.from(duplicates).join(", ")}. Nothing was added.`);
      return;
    }

    const rows = fresh.map((stock_number) => ({
      month: monthISO,
      store_id: profile?.store_id ?? null,
      stock_number,
    }));
    const { error } = await supabase.from("priority_stock").upsert(rows, { onConflict: "month,store_id,stock_number" });
    if (error) setErr(error.message);
    else {
      setStockPaste("");
      setOk(
        duplicates.size > 0
          ? `Added ${fresh.length} stock number(s). Skipped duplicate(s): ${Array.from(duplicates).join(", ")}.`
          : `Added ${fresh.length} stock number(s).`
      );
      load();
    }
  }

  async function removeStock(stockNumber: string) {
    setErr(null);
    setOk(null);
    const { error } = await supabase.from("priority_stock").delete().eq("month", monthISO).eq("stock_number", stockNumber);
    if (error) setErr(error.message);
    else setStocks((prev) => prev.filter((s) => normalizeStockNumber(s) !== normalizeStockNumber(stockNumber)));
  }

  async function clearStock() {
    setErr(null);
    setOk(null);
    if (!window.confirm(`Clear all priority stock numbers for ${monthLabel(month)}?`)) return;
    const { error } = await supabase.from("priority_stock").delete().eq("month", monthISO);
    if (error) setErr(error.message);
    else {
      setOk("Priority list cleared.");
      load();
    }
  }

  return (
    <>
      <Topbar profile={profile} />
      <main className="page">
        <MonthBar month={month} isCurrentMonth={isCurrentMonth} setMonth={setMonth} labelSuffix="enhancers" />
        {err && <div className="notice">{err}</div>}
        {ok && <div className="form-msg ok">{ok}</div>}
        {!canEdit && profile && (
          <div className="notice">You can view enhancer rules here. Approvals and edits are for managers, payroll, and admins.</div>
        )}

        <Collapsible title={`Rules for ${monthLabel(month)}`} count={`${rules.length} rule(s)`}>
          {canEdit && drafts == null && (
            <form
              className="adj-form stock-form"
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parseEnhancerText(pasteText);
                if (parsed.length === 0) setErr("Could not find rule lines. Paste brand headings and payout lines.");
                else {
                  setErr(null);
                  setDrafts(parsed.map(toEditDraft));
                }
              }}
            >
              <div className="field grow">
                <label htmlFor="paste">Paste enhancer sheet text</label>
                <textarea id="paste" rows={4} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
              </div>
              <button className="btn-primary slim" type="submit">Parse rules</button>
            </form>
          )}

          {canEdit && drafts == null && (
            <form className="adj-form" onSubmit={addRule}>
              <div className="field">
                <label htmlFor="er-brand">Brand</label>
                <select id="er-brand" required value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="" disabled>Choose…</option>
                  {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                  <option value={ALL_BRANDS}>{ALL_BRANDS}</option>
                </select>
              </div>
              <div className="field grow">
                <label htmlFor="er-label">Rule</label>
                <input id="er-label" required value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="er-metric">Counts</label>
                <select id="er-metric" value={metric} onChange={(e) => setMetric(e.target.value as EnhancerMetric)}>
                  {metricOptions(true)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="er-th">Need</label>
                <input id="er-th" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={metric === "manual"} />
              </div>
              <div className="field">
                <label htmlFor="er-or-metric">OR counts</label>
                <select id="er-or-metric" value={orMetric} disabled={metric === "manual"} onChange={(e) => setOrMetric(e.target.value as AutoEnhancerMetric | "")}>
                  <option value="">No OR</option>
                  {AUTO_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="er-or-th">OR need</label>
                <input id="er-or-th" inputMode="decimal" value={orThreshold} onChange={(e) => setOrThreshold(e.target.value)} disabled={metric === "manual" || !orMetric} />
              </div>
              <div className="field">
                <label htmlFor="er-pct">Rate %</label>
                <input id="er-pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="er-flat">$/unit</label>
                <input id="er-flat" inputMode="decimal" value={flatAmount} onChange={(e) => setFlatAmount(e.target.value)} />
              </div>
              <button className="btn-primary slim" disabled={busy} type="submit">{busy ? "Saving…" : "Add rule"}</button>
            </form>
          )}

          {canEdit && drafts != null && (
            <div className="draft-review">
              <div className="draft-head">{drafts.length} draft rule(s). Review flagged rows before saving.</div>
              <div className="tablewrap">
                <table className="deals adj">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Brand</th>
                      <th>Rule</th>
                      <th>Counts</th>
                      <th className="r">Need</th>
                      <th>OR counts</th>
                      <th className="r">OR need</th>
                      <th className="r">%</th>
                      <th className="r">$/unit</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d, i) => {
                      const upd = (patch: Partial<EditDraft>) =>
                        setDrafts((prev) => prev!.map((x, j) => (j === i ? { ...x, ...patch, confident: true } : x)));
                      return (
                        <tr key={`${d.label}-${i}`} className={d.confident ? "" : "flagged"}>
                          <td>{d.confident ? "" : "⚠"}</td>
                          <td>
                            <select value={d.brand} onChange={(e) => upd({ brand: e.target.value })}>
                              {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                              <option value={ALL_BRANDS}>{ALL_BRANDS}</option>
                            </select>
                          </td>
                          <td><input className="desc" value={d.label} onChange={(e) => upd({ label: e.target.value })} /></td>
                          <td>
                            <select value={d.metric} onChange={(e) => upd({ metric: e.target.value as EnhancerMetric })}>
                              {metricOptions(true)}
                            </select>
                          </td>
                          <td className="r">
                            <input className="mini" value={d.metric === "manual" ? "" : d.threshold} disabled={d.metric === "manual"} onChange={(e) => upd({ threshold: e.target.value })} />
                          </td>
                          <td>
                            <select value={d.or_metric} disabled={d.metric === "manual"} onChange={(e) => upd({ or_metric: e.target.value as AutoEnhancerMetric | "", or_threshold: e.target.value ? d.or_threshold : "" })}>
                              <option value="">No OR</option>
                              {AUTO_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
                            </select>
                          </td>
                          <td className="r">
                            <input className="mini" value={d.or_metric ? d.or_threshold : ""} disabled={d.metric === "manual" || !d.or_metric} onChange={(e) => upd({ or_threshold: e.target.value })} />
                          </td>
                          <td className="r"><input className="mini" value={d.pct} onChange={(e) => upd({ pct: e.target.value })} /></td>
                          <td className="r"><input className="mini" value={d.flat_amount} onChange={(e) => upd({ flat_amount: e.target.value })} /></td>
                          <td className="r"><button type="button" className="btn-del" onClick={() => setDrafts((prev) => prev!.filter((_, j) => j !== i))}>Drop</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="draft-actions">
                <button className="btn-primary slim" disabled={busy} onClick={() => saveDrafts(drafts)}>{busy ? "Saving…" : `Save ${drafts.length} rule(s)`}</button>
                <button className="btn-step wide" onClick={() => setDrafts(null)}>Cancel</button>
              </div>
            </div>
          )}

          {standardRules.length > 0 && (
            <Collapsible title="Saved rules" count={`${visibleRules.length} of ${standardRules.length}`}>
              {ruleBrands.length > 1 && (
                <div className="brand-filter">
                  <button className={`fchip ${ruleBrand === "" ? "active" : ""}`} onClick={() => setRuleBrand("")}>All</button>
                  {ruleBrands.map((b) => <button key={b} className={`fchip ${ruleBrand === b ? "active" : ""}`} onClick={() => setRuleBrand(b)}>{b}</button>)}
                </div>
              )}
              <div className="tablewrap">
                <table className="deals adj">
                  <thead>
                    <tr>
                      <th>Brand</th>
                      <th>Rule</th>
                      <th>Counts</th>
                      <th className="r">Need</th>
                      <th className="r">Rate</th>
                      {canEdit && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRules.map((r) => (
                      <tr key={r.id}>
                        <td>{r.brand}</td>
                        <td className="note-cell">{r.label}</td>
                        <td>{conditionCounts(r)}</td>
                        <td className="r num">{conditionNeed(r)}</td>
                        <td className="r money pos">{rateLabel(r)}</td>
                        {canEdit && <td className="r"><button className="btn-del" onClick={() => removeRule(r.id)}>Remove</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Collapsible>
          )}
        </Collapsible>

        <Collapsible title="Priority list" count={`${stocks.length} stock number(s)`}>
          {canEdit && (
            <form className="adj-form stock-form" onSubmit={addStock}>
              <div className="field grow">
                <label htmlFor="ps-paste">Paste stock numbers</label>
                <textarea id="ps-paste" rows={2} value={stockPaste} onChange={(e) => setStockPaste(e.target.value)} />
              </div>
              <button className="btn-primary slim" type="submit">Add to list</button>
              {stocks.length > 0 && <button className="btn-del tall" type="button" onClick={clearStock}>Clear all</button>}
            </form>
          )}
          {stocks.length > 0 && (
            <div className="chip-list">
              {stocks.map((s) => <span className="chip" key={s}>{s}{canEdit && <button className="chip-x" onClick={() => removeStock(s)}>×</button>}</span>)}
            </div>
          )}
        </Collapsible>

        {(manualRules.length > 0 || manualReview.length > 0) && (
          <Collapsible title="Manual review" count={`${manualApprovedCount}/${manualReview.length} approved`} defaultOpen={false}>
            {manualRules.length > 0 && (
              <div className="tablewrap">
                <table className="deals adj">
                  <thead>
                    <tr>
                      <th>Brand</th>
                      <th>Manual enhancer rule</th>
                      <th className="r">Rate</th>
                      {canEdit && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {manualRules.map((r) => (
                      <tr key={r.id}>
                        <td>{r.brand}</td>
                        <td className="note-cell">{r.label}</td>
                        <td className="r money pos">{rateLabel(r)}</td>
                        {canEdit && <td className="r"><button className="btn-del" disabled={busy} onClick={() => removeManualRule(r)}>Remove rule</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="tablewrap">
              <table className="deals adj manual-review">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Manual enhancer</th>
                    <th>Rep</th>
                    <th className="r">Rate</th>
                    <th className="r">Proposed</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {manualReviewGroups.map(([brandName, rows]) => {
                    const approvedForBrand = rows.filter((row) => row.approved).length;
                    return (
                      <Fragment key={brandName}>
                        <tr className="group-row"><td colSpan={6}><span>{brandName}</span><small>{approvedForBrand}/{rows.length} approved</small></td></tr>
                        {rows.length === 0 ? (
                          <tr><td></td><td colSpan={5} className="muted">No classified reps for this brand.</td></tr>
                        ) : rows.map((row) => {
                          const key = `${row.rule_id}|${row.employee_id ?? row.rep}`;
                          const rowBusy = manualBusyKey === key || busy;
                          return (
                            <tr key={key}>
                              <td></td>
                              <td className="note-cell">{row.label}</td>
                              <td>{row.rep}</td>
                              <td className="r money pos">{rateLabel(row)}</td>
                              <td className="r money pos">{moneyExact(row.proposed_amount)}</td>
                              <td className="action-cell">
                                {canEdit ? (
                                  <>
                                    <button type="button" className={row.approved ? "btn-approve" : "btn-secondary"} disabled={rowBusy || row.approved} onClick={() => setManualApproval(row, true)}>Yes</button>
                                    <button type="button" className={row.approved ? "btn-secondary" : "btn-del"} disabled={rowBusy || !row.approved} onClick={() => setManualApproval(row, false)}>No</button>
                                  </>
                                ) : row.approved ? "Yes" : "No"}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                  {manualReviewGroups.length === 0 && <tr><td colSpan={6} className="muted">No manual review rows. Use the Brands tab to classify reps.</td></tr>}
                </tbody>
              </table>
            </div>
          </Collapsible>
        )}

        <Collapsible title="Pending approvals" count={loading ? "checking…" : `${pending.length} qualified, unpaid`}>
          {pending.length === 0 ? (
            <div className="tablewrap"><div className="empty">{loading ? "Checking qualification…" : "No newly qualified enhancer payouts."}</div></div>
          ) : (
            <div className="pend-list">
              {pending.map((s) => (
                <div className="pend-card" key={`${s.rule_id}|${s.rep}`}>
                  <div className="pend-main">
                    <span className="name">{s.rep}</span>
                    <span className="rule"><span className="badge cat-enhancer">{s.brand}</span> {s.label}</span>
                    <span className="why num">
                      {conditionProgress(s)} ✓ · {s.flat_amount != null
                        ? `${moneyExact(s.flat_amount)} × ${units(qualifyingMetricValue(s))} = ${moneyExact(s.proposed_amount)}`
                        : `${s.pct}% × ${money(s.total_commissionable_gross)} total gross`}
                    </span>
                  </div>
                  {canEdit && <button className="btn-approve" onClick={() => approve(s)}>Approve {moneyExact(s.proposed_amount)}</button>}
                </div>
              ))}
            </div>
          )}
        </Collapsible>
      </main>
    </>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMonth } from "../lib/useMonth";
import { supabase } from "../lib/supabase";
import { parseEnhancerText } from "../lib/parseEnhancers";
import type { DraftRule } from "../lib/parseEnhancers";
import type { Adjustment, BrandRepAssignment, Employee, EnhancerMetric, EnhancerRule, EnhancerStatus, Profile } from "../lib/types";
import { moneyExact, money, monthLabel, monthStartISO, units } from "../lib/format";
import Topbar from "../components/Topbar";
import MonthBar from "../components/MonthBar";
import Collapsible from "../components/Collapsible";

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

const ALL_BRANDS = "All brands";

type EditDraft = {
  brand: string;
  label: string;
  metric: EnhancerMetric;
  threshold: string;
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

function toEditDraft(d: DraftRule): EditDraft {
  return {
    brand: d.brand,
    label: d.label,
    metric: d.metric,
    threshold: String(d.threshold ?? ""),
    pct: d.pct == null || d.pct === 0 ? "" : String(d.pct),
    flat_amount: d.flat_amount == null ? "" : String(d.flat_amount),
    confident: d.confident,
  };
}

function rateLabel(row: Pick<EnhancerRule | ManualEnhancerStatus, "pct" | "flat_amount">): string {
  return row.flat_amount != null ? moneyExact(row.flat_amount) : `${row.pct}%`;
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [brandAssignments, setBrandAssignments] = useState<BrandRepAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [label, setLabel] = useState("");
  const [pct, setPct] = useState("");
  const [flatAmount, setFlatAmount] = useState("");
  const [metric, setMetric] = useState<EnhancerMetric>("used_units");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualBusyKey, setManualBusyKey] = useState<string | null>(null);
  const [ruleBrand, setRuleBrand] = useState<string>("");
  const [stockPaste, setStockPaste] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [drafts, setDrafts] = useState<EditDraft[] | null>(null);
  const [assignBrand, setAssignBrand] = useState("");
  const [assignEmployeeId, setAssignEmployeeId] = useState("");

  const monthISO = monthStartISO(month);

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => setProfile((data as Profile) ?? null));
    supabase.from("brand_list").select("*").order("n", { ascending: false }).then(({ data }) => setBrands(((data ?? []) as { brand: string }[]).map((b) => b.brand)));
  }, [session.user.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [rulesRes, statusRes, manualRes, apprRes, stockRes, assignmentRes, employeeRes] = await Promise.all([
      supabase.from("enhancer_rules").select("*").eq("month", monthISO).order("brand").order("label"),
      supabase.from("enhancer_status").select("*").eq("month", monthISO).eq("qualified", true).order("brand").order("rep"),
      supabase.from("manual_enhancer_status").select("*").eq("month", monthISO).order("brand").order("label").order("rep"),
      supabase.from("adjustments").select("*").eq("month", monthISO).not("rule_id", "is", null),
      supabase.from("priority_stock").select("stock_number").eq("month", monthISO).order("stock_number"),
      supabase.from("brand_rep_assignments").select("*").eq("month", monthISO).eq("active", true).order("brand"),
      supabase.from("employees").select("id,display_name,store_id,active").eq("active", true).order("display_name"),
    ]);
    const e = rulesRes.error || statusRes.error || manualRes.error || apprRes.error || stockRes.error || assignmentRes.error || employeeRes.error;
    if (e) setErr(e.message);
    setRules((rulesRes.data ?? []) as EnhancerRule[]);
    setStatus((statusRes.data ?? []) as EnhancerStatus[]);
    setManualReview((manualRes.data ?? []) as ManualEnhancerStatus[]);
    setApproved((apprRes.data ?? []) as Adjustment[]);
    setStocks(((stockRes.data ?? []) as { stock_number: string }[]).map((s) => s.stock_number));
    setBrandAssignments((assignmentRes.data ?? []) as BrandRepAssignment[]);
    setEmployees((employeeRes.data ?? []) as Employee[]);
    setLoading(false);
  }, [monthISO]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = profile?.role === "manager" || profile?.role === "payroll" || profile?.role === "admin";
  const approvedKeys = useMemo(() => new Set(approved.map((a) => `${a.rule_id}|${a.rep}`)), [approved]);
  const standardRules = useMemo(() => rules.filter((r) => r.metric !== "manual"), [rules]);
  const manualRules = useMemo(() => rules.filter((r) => r.metric === "manual"), [rules]);
  const ruleBrands = useMemo(() => Array.from(new Set(standardRules.map((r) => r.brand))).sort(), [standardRules]);
  const visibleRules = useMemo(() => (ruleBrand ? standardRules.filter((r) => r.brand === ruleBrand) : standardRules), [standardRules, ruleBrand]);
  const pending = status.filter((s) => !approvedKeys.has(`${s.rule_id}|${s.rep}`));
  const manualApprovedCount = manualReview.filter((r) => r.approved).length;
  const brandOptions = useMemo(() => brands.filter((b) => b !== ALL_BRANDS), [brands]);
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const activeAssignments = useMemo(() => brandAssignments.filter((a) => a.active), [brandAssignments]);
  const assignmentsByBrand = useMemo(() => {
    const grouped = new Map<string, BrandRepAssignment[]>();
    for (const b of brandOptions) grouped.set(b, []);
    for (const a of activeAssignments) {
      if (!grouped.has(a.brand)) grouped.set(a.brand, []);
      grouped.get(a.brand)!.push(a);
    }
    for (const rows of grouped.values()) {
      rows.sort((a, b) => (employeeById.get(a.employee_id)?.display_name ?? "").localeCompare(employeeById.get(b.employee_id)?.display_name ?? ""));
    }
    return grouped;
  }, [activeAssignments, brandOptions, employeeById]);
  const manualReviewGroups = useMemo(() => {
    const rowsByBrand = new Map<string, ManualEnhancerStatus[]>();
    for (const row of manualReview) {
      if (!rowsByBrand.has(row.brand)) rowsByBrand.set(row.brand, []);
      rowsByBrand.get(row.brand)!.push(row);
    }
    for (const rows of rowsByBrand.values()) rows.sort((a, b) => a.label.localeCompare(b.label) || a.rep.localeCompare(b.rep));
    const manualBrands = Array.from(new Set([...manualRules.map((r) => r.brand), ...manualReview.map((r) => r.brand)])).sort();
    return manualBrands.map((b) => [b, rowsByBrand.get(b) ?? []] as const);
  }, [manualReview, manualRules]);

  async function approve(s: EnhancerStatus) {
    setErr(null);
    setOk(null);
    const isFlat = s.flat_amount != null;
    const amount = s.proposed_amount ?? 0;
    const note = isFlat
      ? `${s.brand}: ${s.label} · ${units(s.metric_value)}/${units(s.threshold)} qualified · ${moneyExact(s.flat_amount)} per unit`
      : `${s.brand}: ${s.label} · ${units(s.metric_value)}/${units(s.threshold)} qualified · ${s.pct}% of ${money(s.total_commissionable_gross)} total commissionable gross`;
    const { error } = await supabase.from("adjustments").insert({
      rep: s.rep,
      store: s.dealer ?? profile?.store_name ?? "unknown",
      employee_id: s.employee_id,
      store_id: s.store_id,
      month: monthISO,
      category: "enhancer",
      amount: isFlat ? amount : null,
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
    if (!brand || !label.trim() || Number.isNaN(t) || ((p == null) === (flat == null))) {
      setErr("Brand, rule, threshold, and either a percent or dollar amount are required.");
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
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setLabel("");
      setPct("");
      setFlatAmount("");
      setThreshold("");
      setOk("Enhancer rule added.");
      load();
    }
  }

  async function removeRule(id: string) {
    setErr(null);
    setOk(null);
    const { error } = await supabase.from("enhancer_rules").delete().eq("id", id);
    if (error) setErr(error.message.includes("foreign key") ? "This rule already has approved payouts. Remove the payouts first." : error.message);
    else load();
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
      if (!d.label.trim() || (hasPct && hasFlat) || (!hasPct && !hasFlat && d.metric !== "manual")) {
        setErr("Every draft needs one payout type and a description.");
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
    const nos = stockPaste.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (nos.length === 0) return;
    const rows = [...new Set(nos)].map((stock_number) => ({ month: monthISO, store_id: profile?.store_id ?? null, stock_number }));
    const { error } = await supabase.from("priority_stock").upsert(rows, { onConflict: "month,store_id,stock_number" });
    if (error) setErr(error.message);
    else {
      setStockPaste("");
      load();
    }
  }

  async function removeStock(stockNumber: string) {
    setErr(null);
    setOk(null);
    const { error } = await supabase.from("priority_stock").delete().eq("month", monthISO).eq("stock_number", stockNumber);
    if (error) setErr(error.message);
    else setStocks((prev) => prev.filter((s) => s !== stockNumber));
  }

  async function assignRepToBrand(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (!assignBrand || !assignEmployeeId) {
      setErr("Choose both a brand and a rep.");
      return;
    }
    const employee = employeeById.get(assignEmployeeId);
    if (!employee) {
      setErr("Rep not found.");
      return;
    }
    if (activeAssignments.some((a) => a.brand === assignBrand && a.employee_id === assignEmployeeId)) {
      setErr(`${employee.display_name} is already assigned to ${assignBrand}.`);
      return;
    }
    const storeId = profile?.role === "manager" ? profile.store_id : employee.store_id ?? profile?.store_id ?? null;
    if (!storeId) {
      setErr("This assignment needs a store id.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("brand_rep_assignments").upsert({
      month: monthISO,
      store_id: storeId,
      brand: assignBrand,
      employee_id: assignEmployeeId,
      active: true,
    }, { onConflict: "month,store_id,brand,employee_id" });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setOk(`${employee.display_name} assigned to ${assignBrand}.`);
      setAssignEmployeeId("");
      load();
    }
  }

  async function removeBrandAssignment(row: BrandRepAssignment) {
    setErr(null);
    setOk(null);
    setBusy(true);
    const { error } = await supabase.from("brand_rep_assignments").update({ active: false }).eq("id", row.id);
    setBusy(false);
    if (error) setErr(error.message);
    else {
      const employeeName = employeeById.get(row.employee_id)?.display_name ?? "Rep";
      setOk(`${employeeName} removed from ${row.brand}.`);
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
        {!canEdit && profile && <div className="notice">You can view enhancer rules here. Approvals and edits are for managers, payroll, and admins.</div>}
        <Collapsible title={`Rules for ${monthLabel(month)}`} count={`${rules.length} rule(s)`}>
          {canEdit && drafts == null && (
            <form className="adj-form stock-form" onSubmit={(e) => { e.preventDefault(); const parsed = parseEnhancerText(pasteText); if (parsed.length === 0) setErr("Could not find rule lines. Paste brand headings and payout lines."); else { setErr(null); setDrafts(parsed.map(toEditDraft)); } }}>
              <div className="field grow"><label htmlFor="paste">Paste enhancer sheet text</label><textarea id="paste" rows={4} value={pasteText} onChange={(e) => setPasteText(e.target.value)} /></div>
              <button className="btn-primary slim" type="submit">Parse rules</button>
            </form>
          )}
          {canEdit && drafts == null && (
            <form className="adj-form" onSubmit={addRule}>
              <div className="field"><label htmlFor="er-brand">Brand</label><select id="er-brand" required value={brand} onChange={(e) => setBrand(e.target.value)}><option value="" disabled>Choose…</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}<option value={ALL_BRANDS}>{ALL_BRANDS}</option></select></div>
              <div className="field grow"><label htmlFor="er-label">Rule</label><input id="er-label" required value={label} onChange={(e) => setLabel(e.target.value)} /></div>
              <div className="field"><label htmlFor="er-metric">Counts</label><select id="er-metric" value={metric} onChange={(e) => setMetric(e.target.value as EnhancerMetric)}><option value="new_units">New units</option><option value="used_units">Used units</option><option value="total_units">Total units</option><option value="priority_units">Priority list</option><option value="trades">Trade ins</option><option value="acquisitions">Acquisitions</option><option value="trades_acquisitions">Trades plus acq</option><option value="manual">Manual review</option></select></div>
              <div className="field"><label htmlFor="er-th">Need</label><input id="er-th" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={metric === "manual"} /></div>
              <div className="field"><label htmlFor="er-pct">Rate %</label><input id="er-pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></div>
              <div className="field"><label htmlFor="er-flat">$/unit</label><input id="er-flat" inputMode="decimal" value={flatAmount} onChange={(e) => setFlatAmount(e.target.value)} /></div>
              <button className="btn-primary slim" disabled={busy} type="submit">{busy ? "Saving…" : "Add rule"}</button>
            </form>
          )}
          {canEdit && drafts != null && (
            <div className="draft-review">
              <div className="draft-head">{drafts.length} draft rule(s). Review flagged rows before saving.</div>
              <div className="tablewrap"><table className="deals adj"><thead><tr><th></th><th>Brand</th><th>Rule</th><th>Counts</th><th className="r">Need</th><th className="r">%</th><th className="r">$/unit</th><th></th></tr></thead><tbody>{drafts.map((d, i) => {
                const upd = (patch: Partial<EditDraft>) => setDrafts((prev) => prev!.map((x, j) => j === i ? { ...x, ...patch, confident: true } : x));
                return <tr key={`${d.label}-${i}`} className={d.confident ? "" : "flagged"}><td>{d.confident ? "" : "⚠"}</td><td><select value={d.brand} onChange={(e) => upd({ brand: e.target.value })}>{brands.map((b) => <option key={b} value={b}>{b}</option>)}<option value={ALL_BRANDS}>{ALL_BRANDS}</option></select></td><td><input className="desc" value={d.label} onChange={(e) => upd({ label: e.target.value })} /></td><td><select value={d.metric} onChange={(e) => upd({ metric: e.target.value as EnhancerMetric })}><option value="new_units">New</option><option value="used_units">Used</option><option value="total_units">Total</option><option value="priority_units">Priority</option><option value="trades">Trades</option><option value="acquisitions">Acq</option><option value="trades_acquisitions">Trades plus acq</option><option value="manual">Manual</option></select></td><td className="r"><input className="mini" value={d.metric === "manual" ? "" : d.threshold} disabled={d.metric === "manual"} onChange={(e) => upd({ threshold: e.target.value })} /></td><td className="r"><input className="mini" value={d.pct} onChange={(e) => upd({ pct: e.target.value })} /></td><td className="r"><input className="mini" value={d.flat_amount} onChange={(e) => upd({ flat_amount: e.target.value })} /></td><td className="r"><button type="button" className="btn-del" onClick={() => setDrafts((prev) => prev!.filter((_, j) => j !== i))}>Drop</button></td></tr>;
              })}</tbody></table></div>
              <div className="draft-actions"><button className="btn-primary slim" disabled={busy} onClick={() => saveDrafts(drafts)}>{busy ? "Saving…" : `Save ${drafts.length} rule(s)`}</button><button className="btn-step wide" onClick={() => setDrafts(null)}>Cancel</button></div>
            </div>
          )}
          {standardRules.length > 0 && (
            <Collapsible title="Saved rules" count={`${visibleRules.length} of ${standardRules.length}`}>
              {ruleBrands.length > 1 && <div className="brand-filter"><button className={`fchip ${ruleBrand === "" ? "active" : ""}`} onClick={() => setRuleBrand("")}>All</button>{ruleBrands.map((b) => <button key={b} className={`fchip ${ruleBrand === b ? "active" : ""}`} onClick={() => setRuleBrand(b)}>{b}</button>)}</div>}
              <div className="tablewrap"><table className="deals adj"><thead><tr><th>Brand</th><th>Rule</th><th>Counts</th><th className="r">Need</th><th className="r">Rate</th>{canEdit && <th></th>}</tr></thead><tbody>{visibleRules.map((r) => <tr key={r.id}><td>{r.brand}</td><td className="note-cell">{r.label}</td><td>{METRIC_LABEL[r.metric]}</td><td className="r num">{units(r.threshold)}</td><td className="r money pos">{rateLabel(r)}</td>{canEdit && <td className="r"><button className="btn-del" onClick={() => removeRule(r.id)}>Remove</button></td>}</tr>)}</tbody></table></div>
            </Collapsible>
          )}
        </Collapsible>

        <Collapsible title="Brand rep classifications" count={`${activeAssignments.length} assigned`} defaultOpen={false}>
          {canEdit && <form className="adj-form rep-brand-form" onSubmit={assignRepToBrand}><div className="field"><label htmlFor="assign-brand">Brand</label><select id="assign-brand" required value={assignBrand} onChange={(e) => setAssignBrand(e.target.value)}><option value="" disabled>Choose…</option>{brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}</select></div><div className="field grow"><label htmlFor="assign-rep">Rep</label><select id="assign-rep" required value={assignEmployeeId} onChange={(e) => setAssignEmployeeId(e.target.value)}><option value="" disabled>Choose…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.display_name}</option>)}</select></div><button className="btn-primary slim" disabled={busy} type="submit">Assign rep</button></form>}
          <div className="brand-rep-grid">
            {brandOptions.map((b) => {
              const rows = assignmentsByBrand.get(b) ?? [];
              return <div className="brand-rep-card" key={b}><div className="brand-rep-head"><span>{b}</span><small>{rows.length} rep(s)</small></div>{rows.length === 0 ? <div className="mini-empty">No reps assigned.</div> : <div className="chip-list compact">{rows.map((row) => <span className="chip" key={row.id}>{employeeById.get(row.employee_id)?.display_name ?? "Unknown rep"}{canEdit && <button className="chip-x" disabled={busy} onClick={() => removeBrandAssignment(row)}>×</button>}</span>)}</div>}</div>;
            })}
          </div>
        </Collapsible>

        <Collapsible title="Priority list" count={`${stocks.length} stock number(s)`}>
          {stocks.length > 0 && <div className="chip-list">{stocks.map((s) => <span className="chip" key={s}>{s}{canEdit && <button className="chip-x" onClick={() => removeStock(s)}>×</button>}</span>)}</div>}
          {canEdit && <form className="adj-form stock-form" onSubmit={addStock}><div className="field grow"><label htmlFor="ps-paste">Paste stock numbers</label><textarea id="ps-paste" rows={2} value={stockPaste} onChange={(e) => setStockPaste(e.target.value)} /></div><button className="btn-primary slim" type="submit">Add to list</button></form>}
        </Collapsible>

        {(manualRules.length > 0 || manualReview.length > 0) && (
          <Collapsible title="Manual review" count={`${manualApprovedCount}/${manualReview.length} approved`} defaultOpen={false}>
            {manualRules.length > 0 && (
              <div className="tablewrap"><table className="deals adj"><thead><tr><th>Brand</th><th>Manual enhancer rule</th><th className="r">Rate</th>{canEdit && <th></th>}</tr></thead><tbody>{manualRules.map((r) => <tr key={r.id}><td>{r.brand}</td><td className="note-cell">{r.label}</td><td className="r money pos">{rateLabel(r)}</td>{canEdit && <td className="r"><button className="btn-del" disabled={busy} onClick={() => removeManualRule(r)}>Remove rule</button></td>}</tr>)}</tbody></table></div>
            )}
            <div className="tablewrap"><table className="deals adj manual-review"><thead><tr><th>Brand</th><th>Manual enhancer</th><th>Rep</th><th className="r">Rate</th><th className="r">Proposed</th><th>Approved</th></tr></thead><tbody>{manualReviewGroups.map(([brandName, rows]) => {
              const approvedForBrand = rows.filter((row) => row.approved).length;
              return <Fragment key={brandName}><tr className="group-row"><td colSpan={6}><span>{brandName}</span><small>{approvedForBrand}/{rows.length} approved</small></td></tr>{rows.length === 0 ? <tr><td></td><td colSpan={5} className="muted">No classified reps for this brand.</td></tr> : rows.map((row) => {
                const key = `${row.rule_id}|${row.employee_id ?? row.rep}`;
                const rowBusy = manualBusyKey === key || busy;
                return <tr key={key}><td></td><td className="note-cell">{row.label}</td><td>{row.rep}</td><td className="r money pos">{rateLabel(row)}</td><td className="r money pos">{moneyExact(row.proposed_amount)}</td><td className="action-cell">{canEdit ? <><button type="button" className={row.approved ? "btn-approve" : "btn-secondary"} disabled={rowBusy || row.approved} onClick={() => setManualApproval(row, true)}>Yes</button><button type="button" className={row.approved ? "btn-secondary" : "btn-del"} disabled={rowBusy || !row.approved} onClick={() => setManualApproval(row, false)}>No</button></> : row.approved ? "Yes" : "No"}</td></tr>;
              })}</Fragment>;
            })}{manualReviewGroups.length === 0 && <tr><td colSpan={6} className="muted">No manual review rows. Assign brand reps to show spreadsheet-style manual enhancer approvals.</td></tr>}</tbody></table></div>
          </Collapsible>
        )}

        <Collapsible title="Pending approvals" count={loading ? "checking…" : `${pending.length} qualified, unpaid`}>
          {pending.length === 0 ? <div className="tablewrap"><div className="empty">{loading ? "Checking qualification…" : "No newly qualified enhancer payouts."}</div></div> : <div className="pend-list">{pending.map((s) => <div className="pend-card" key={`${s.rule_id}|${s.rep}`}><div className="pend-main"><span className="name">{s.rep}</span><span className="rule"><span className="badge cat-enhancer">{s.brand}</span> {s.label}</span><span className="why num">{units(s.metric_value)}/{units(s.threshold)} {METRIC_LABEL[s.metric].toLowerCase()} ✓ · {s.flat_amount != null ? `${moneyExact(s.flat_amount)} × ${units(s.metric_value)} = ${moneyExact(s.proposed_amount)}` : `${s.pct}% × ${money(s.total_commissionable_gross)} total gross`}</span></div>{canEdit && <button className="btn-approve" onClick={() => approve(s)}>Approve {moneyExact(s.proposed_amount)}</button>}</div>)}</div>}
        </Collapsible>
      </main>
    </>
  );
}

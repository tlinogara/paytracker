import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMonth } from "../lib/useMonth";
import { supabase } from "../lib/supabase";
import { parseEnhancerText } from "../lib/parseEnhancers";
import type { DraftRule } from "../lib/parseEnhancers";
import type { Adjustment, EnhancerMetric, EnhancerRule, EnhancerStatus, Profile, RepMtd } from "../lib/types";
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

export default function Enhancers({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const { month, setMonth, isCurrentMonth } = useMonth();
  const [rules, setRules] = useState<EnhancerRule[]>([]);
  const [status, setStatus] = useState<EnhancerStatus[]>([]);
  const [approved, setApproved] = useState<Adjustment[]>([]);
  const [stocks, setStocks] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [mtdReps, setMtdReps] = useState<RepMtd[]>([]);
  const [manualRep, setManualRep] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [label, setLabel] = useState("");
  const [pct, setPct] = useState("");
  const [flatAmount, setFlatAmount] = useState("");
  const [metric, setMetric] = useState<EnhancerMetric>("used_units");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);
  const [ruleBrand, setRuleBrand] = useState<string>("");
  const [stockPaste, setStockPaste] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [drafts, setDrafts] = useState<EditDraft[] | null>(null);

  const monthISO = monthStartISO(month);

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => setProfile((data as Profile) ?? null));
    supabase.from("brand_list").select("*").order("n", { ascending: false }).then(({ data }) => setBrands(((data ?? []) as { brand: string }[]).map((b) => b.brand)));
  }, [session.user.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [rulesRes, statusRes, apprRes, stockRes, repRes] = await Promise.all([
      supabase.from("enhancer_rules").select("*").eq("month", monthISO).order("brand").order("label"),
      supabase.from("enhancer_status").select("*").eq("month", monthISO).eq("qualified", true).order("brand").order("rep"),
      supabase.from("adjustments").select("*").eq("month", monthISO).not("rule_id", "is", null),
      supabase.from("priority_stock").select("stock_number").eq("month", monthISO).order("stock_number"),
      supabase.from("rep_mtd").select("*").eq("month", monthISO).order("rep"),
    ]);
    const e = rulesRes.error || statusRes.error || apprRes.error || stockRes.error || repRes.error;
    if (e) setErr(e.message);
    setRules((rulesRes.data ?? []) as EnhancerRule[]);
    setStatus((statusRes.data ?? []) as EnhancerStatus[]);
    setApproved((apprRes.data ?? []) as Adjustment[]);
    setStocks(((stockRes.data ?? []) as { stock_number: string }[]).map((s) => s.stock_number));
    setMtdReps((repRes.data ?? []) as RepMtd[]);
    setLoading(false);
  }, [monthISO]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = profile?.role === "manager" || profile?.role === "payroll" || profile?.role === "admin";
  const approvedKeys = useMemo(() => new Set(approved.map((a) => `${a.rule_id}|${a.rep}`)), [approved]);
  const ruleBrands = useMemo(() => Array.from(new Set(rules.map((r) => r.brand))).sort(), [rules]);
  const visibleRules = useMemo(() => (ruleBrand ? rules.filter((r) => r.brand === ruleBrand) : rules), [rules, ruleBrand]);
  const pending = status.filter((s) => !approvedKeys.has(`${s.rule_id}|${s.rep}`));
  const manualRules = rules.filter((r) => r.metric === "manual");

  async function approve(s: EnhancerStatus) {
    setErr(null);
    const amount = s.proposed_amount ?? 0;
    const note = s.flat_amount != null
      ? `${s.brand}: ${s.label} · ${units(s.metric_value)}/${units(s.threshold)} qualified · ${moneyExact(s.flat_amount)} per unit`
      : `${s.brand}: ${s.label} · ${units(s.metric_value)}/${units(s.threshold)} qualified · ${s.pct}% of ${money(s.brand_front_gross)}`;
    const { error } = await supabase.from("adjustments").insert({
      rep: s.rep,
      store: s.dealer ?? profile?.store_name ?? "unknown",
      employee_id: s.employee_id,
      store_id: s.store_id,
      month: monthISO,
      category: "enhancer",
      amount,
      pct: null,
      rate_pct: s.flat_amount != null ? null : s.pct,
      note,
      rule_id: s.rule_id,
    });
    if (error) setErr(error.message);
    else load();
  }

  async function approveManual(r: EnhancerRule) {
    setErr(null);
    const rep = manualRep[r.id];
    if (!rep) {
      setErr("Pick a salesperson for that rule first.");
      return;
    }
    const repRow = mtdReps.find((m) => m.rep === rep);
    if (approvedKeys.has(`${r.id}|${rep}`)) {
      setErr(`${rep} already has an approved entry for that rule this month.`);
      return;
    }
    const isFlat = r.flat_amount != null;
    const { error } = await supabase.from("adjustments").insert({
      rep,
      store: repRow?.dealer ?? profile?.store_name ?? "unknown",
      employee_id: repRow?.employee_id ?? null,
      store_id: repRow?.store_id ?? r.store_id ?? null,
      month: monthISO,
      category: "enhancer",
      amount: isFlat ? r.flat_amount : null,
      pct: isFlat ? null : r.pct,
      rate_pct: null,
      note: `${r.brand}: ${r.label} manual review approved`,
      rule_id: r.id,
    });
    if (error) setErr(error.message);
    else load();
  }

  async function addRule(e: FormEvent) {
    e.preventDefault();
    setErr(null);
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
      load();
    }
  }

  async function removeRule(id: string) {
    setErr(null);
    const { error } = await supabase.from("enhancer_rules").delete().eq("id", id);
    if (error) setErr(error.message.includes("foreign key") ? "This rule already has approved payouts. Remove the payouts first." : error.message);
    else load();
  }

  async function saveDrafts(rows: EditDraft[]) {
    setErr(null);
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
      load();
    }
  }

  async function addStock(e: FormEvent) {
    e.preventDefault();
    setErr(null);
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
    const { error } = await supabase.from("priority_stock").delete().eq("month", monthISO).eq("stock_number", stockNumber);
    if (error) setErr(error.message);
    else setStocks((prev) => prev.filter((s) => s !== stockNumber));
  }

  return (
    <>
      <Topbar profile={profile} />
      <main className="page">
        <MonthBar month={month} isCurrentMonth={isCurrentMonth} setMonth={setMonth} labelSuffix="enhancers" />
        {err && <div className="notice">{err}</div>}
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
              return <tr key={`${d.label}-${i}`} className={d.confident ? "" : "flagged"}><td>{d.confident ? "" : "⚠"}</td><td><select value={d.brand} onChange={(e) => upd({ brand: e.target.value })}>{brands.map((b) => <option key={b} value={b}>{b}</option>)}<option value={ALL_BRANDS}>{ALL_BRANDS}</option></select></td><td><input className="desc" value={d.label} onChange={(e) => upd({ label: e.target.value })} /></td><td><select value={d.metric} onChange={(e) => upd({ metric: e.target.value as EnhancerMetric })}><option value="new_units">New</option><option value="used_units">Used</option><option value="total_units">Total</option><option value="priority_units">Priority</option><option value="trades">Trades</option><option value="acquisitions">Acq</option><option value="trades_acquisitions">Trades plus acq</option><option value="manual">Manual</option></select></td><td className="r"><input className="mini" value={d.metric === "manual" ? "" : d.threshold} disabled={d.metric === "manual"} onChange={(e) => upd({ threshold: e.target.value })} /></td><td className="r"><input className="mini" value={d.pct} onChange={(e) => upd({ pct: e.target.value })} /></td><td className="r"><input className="mini" value={d.flat_amount} onChange={(e) => upd({ flat_amount: e.target.value })} /></td><td className="r"><button className="btn-del" onClick={() => setDrafts((prev) => prev!.filter((_, j) => j !== i))}>Drop</button></td></tr>;
            })}</tbody></table></div>
            <div className="draft-actions"><button className="btn-primary slim" disabled={busy} onClick={() => saveDrafts(drafts)}>{busy ? "Saving…" : `Save ${drafts.length} rule(s)`}</button><button className="btn-step wide" onClick={() => setDrafts(null)}>Cancel</button></div>
          </div>
        )}
        {rules.length > 0 && (
          <Collapsible title="Saved rules" count={`${visibleRules.length} of ${rules.length}`}>
            {ruleBrands.length > 1 && <div className="brand-filter"><button className={`fchip ${ruleBrand === "" ? "active" : ""}`} onClick={() => setRuleBrand("")}>All</button>{ruleBrands.map((b) => <button key={b} className={`fchip ${ruleBrand === b ? "active" : ""}`} onClick={() => setRuleBrand(b)}>{b}</button>)}</div>}
            <div className="tablewrap"><table className="deals adj"><thead><tr><th>Brand</th><th>Rule</th><th>Counts</th><th className="r">Need</th><th className="r">Rate</th>{canEdit && <th></th>}</tr></thead><tbody>{visibleRules.map((r) => <tr key={r.id}><td>{r.brand}</td><td className="note-cell">{r.label}</td><td>{METRIC_LABEL[r.metric]}</td><td className="r num">{r.metric === "manual" ? "—" : units(r.threshold)}</td><td className="r money pos">{r.flat_amount != null ? `${moneyExact(r.flat_amount)}/unit` : `${r.pct}%`}</td>{canEdit && <td className="r"><button className="btn-del" onClick={() => removeRule(r.id)}>Remove</button></td>}</tr>)}</tbody></table></div>
          </Collapsible>
        )}
        </Collapsible>

        <Collapsible title="Priority list" count={`${stocks.length} stock number(s)`}>
        {stocks.length > 0 && <div className="chip-list">{stocks.map((s) => <span className="chip" key={s}>{s}{canEdit && <button className="chip-x" onClick={() => removeStock(s)}>×</button>}</span>)}</div>}
        {canEdit && <form className="adj-form stock-form" onSubmit={addStock}><div className="field grow"><label htmlFor="ps-paste">Paste stock numbers</label><textarea id="ps-paste" rows={2} value={stockPaste} onChange={(e) => setStockPaste(e.target.value)} /></div><button className="btn-primary slim" type="submit">Add to list</button></form>}
        </Collapsible>
        {manualRules.length > 0 && (
          <Collapsible title="Manual review" count="pick a rep and approve" defaultOpen={false}>
            <div className="tablewrap"><table className="deals adj"><thead><tr><th>Brand</th><th>Rule</th><th className="r">Rate</th>{canEdit && <th>Salesperson</th>}{canEdit && <th></th>}</tr></thead><tbody>{manualRules.map((r) => <tr key={r.id}><td>{r.brand}</td><td className="note-cell">{r.label}</td><td className="r money pos">{r.flat_amount != null ? moneyExact(r.flat_amount) : `${r.pct}%`}</td>{canEdit && <td><select value={manualRep[r.id] ?? ""} onChange={(e) => setManualRep((p) => ({ ...p, [r.id]: e.target.value }))}><option value="" disabled>Choose…</option>{mtdReps.map((m) => <option key={m.rep} value={m.rep}>{m.rep}</option>)}</select></td>}{canEdit && <td className="r"><button className="btn-approve" onClick={() => approveManual(r)}>Approve</button></td>}</tr>)}</tbody></table></div>
          </Collapsible>
        )}
        <Collapsible title="Pending approvals" count={loading ? "checking…" : `${pending.length} qualified, unpaid`}>
          {pending.length === 0 ? <div className="tablewrap"><div className="empty">{loading ? "Checking qualification…" : "No newly qualified enhancer payouts."}</div></div> : <div className="pend-list">{pending.map((s) => <div className="pend-card" key={`${s.rule_id}|${s.rep}`}><div className="pend-main"><span className="name">{s.rep}</span><span className="rule"><span className="badge cat-enhancer">{s.brand}</span> {s.label}</span><span className="why num">{units(s.metric_value)}/{units(s.threshold)} {METRIC_LABEL[s.metric].toLowerCase()} ✓ · {s.flat_amount != null ? `${moneyExact(s.flat_amount)} × ${units(s.metric_value)} = ${moneyExact(s.proposed_amount)}` : `${s.pct}% × ${money(s.brand_front_gross)}`}</span></div>{canEdit && <button className="btn-approve" onClick={() => approve(s)}>Approve {moneyExact(s.proposed_amount)}</button>}</div>)}</div>}
        </Collapsible>
      </main>
    </>
  );
}

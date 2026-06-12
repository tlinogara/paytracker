import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMonth } from "../lib/useMonth";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  Adjustment,
  EnhancerMetric,
  EnhancerRule,
  EnhancerStatus,
  Profile,
} from "../lib/types";
import {
  moneyExact,
  money,
  monthLabel,
  monthStartISO,
  units,
} from "../lib/format";

const METRIC_LABEL: Record<EnhancerMetric, string> = {
  new_units: "New units sold",
  used_units: "Used units sold",
  total_units: "Total units sold",
  priority_units: "Priority-list units sold",
  trades: "Trade-ins taken",
  acquisitions: "Acquisitions",
  trades_acquisitions: "Acquisitions + trade-ins",
  manual: "Manual review (not auto-counted)",
};

const ALL_BRANDS = "All brands";

export default function Enhancers({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const { month, monthParam, setMonth, isCurrentMonth } = useMonth();
  const [rules, setRules] = useState<EnhancerRule[]>([]);
  const [status, setStatus] = useState<EnhancerStatus[]>([]);
  const [approved, setApproved] = useState<Adjustment[]>([]);
  const [stocks, setStocks] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Rule form
  const [brand, setBrand] = useState("");
  const [label, setLabel] = useState("");
  const [pct, setPct] = useState("");
  const [metric, setMetric] = useState<EnhancerMetric>("used_units");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);

  // Priority stock form
  const [stockPaste, setStockPaste] = useState("");

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
        setBrands(((data ?? []) as { brand: string }[]).map((b) => b.brand))
      );
  }, [session.user.id]);

  const monthISO = monthStartISO(month);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [rulesRes, statusRes, apprRes, stockRes] = await Promise.all([
      supabase
        .from("enhancer_rules")
        .select("*")
        .eq("month", monthISO)
        .order("brand")
        .order("label"),
      supabase
        .from("enhancer_status")
        .select("*")
        .eq("month", monthISO)
        .eq("qualified", true)
        .order("brand")
        .order("rep"),
      supabase
        .from("adjustments")
        .select("*")
        .eq("month", monthISO)
        .not("rule_id", "is", null),
      supabase
        .from("priority_stock")
        .select("stock_no")
        .eq("month", monthISO)
        .order("stock_no"),
    ]);
    const e =
      rulesRes.error || statusRes.error || apprRes.error || stockRes.error;
    if (e) setErr(e.message);
    setRules((rulesRes.data ?? []) as EnhancerRule[]);
    setStatus((statusRes.data ?? []) as EnhancerStatus[]);
    setApproved((apprRes.data ?? []) as Adjustment[]);
    setStocks(
      ((stockRes.data ?? []) as { stock_no: string }[]).map((s) => s.stock_no)
    );
    setLoading(false);
  }, [monthISO]);

  useEffect(() => {
    load();
  }, [load]);

  const approvedKeys = useMemo(
    () => new Set(approved.map((a) => `${a.rule_id}|${a.rep}`)),
    [approved]
  );

  const pending = status.filter(
    (s) => !approvedKeys.has(`${s.rule_id}|${s.rep}`)
  );
  const manualRules = rules.filter((r) => r.metric === "manual");

  async function approve(s: EnhancerStatus) {
    setErr(null);
    const amount = s.proposed_amount ?? 0;
    const note =
      `${s.brand}: ${s.label} — ${units(s.metric_value)}/${units(s.threshold)} ` +
      `qualified; +${s.pct}% × ${money(s.brand_front_gross)} ${s.brand} front gross`;
    const { error } = await supabase.from("adjustments").insert({
      rep: s.rep,
      store: s.dealer ?? profile?.store_name ?? "unknown",
      month: monthISO,
      category: "enhancer",
      amount,
      pct: null,
      note,
      rule_id: s.rule_id,
    });
    if (error) setErr(error.message);
    else load();
  }

  async function addRule(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const p = Number(pct);
    const t = metric === "manual" ? 1 : Number(threshold);
    if (!brand || !label.trim() || Number.isNaN(p) || Number.isNaN(t)) {
      setErr("Brand, description, % and threshold are all required.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("enhancer_rules").insert({
      month: monthISO,
      brand,
      make_pattern: brand === ALL_BRANDS ? "%" : `%${brand}%`,
      label: label.trim(),
      pct: p,
      metric,
      threshold: t,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setLabel("");
      setPct("");
      setThreshold("");
      load();
    }
  }

  async function removeRule(id: string) {
    setErr(null);
    const { error } = await supabase
      .from("enhancer_rules")
      .delete()
      .eq("id", id);
    if (error)
      setErr(
        error.message.includes("violates foreign key")
          ? "This rule already has approved payouts. Remove those adjustments first."
          : error.message
      );
    else load();
  }

  async function addStock(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const nos = stockPaste
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (nos.length === 0) return;
    const rows = [...new Set(nos)].map((stock_no) => ({
      month: monthISO,
      stock_no,
    }));
    const { error } = await supabase
      .from("priority_stock")
      .upsert(rows, { onConflict: "month,stock_no" });
    if (error) setErr(error.message);
    else {
      setStockPaste("");
      load();
    }
  }

  async function removeStock(stock_no: string) {
    setErr(null);
    const { error } = await supabase
      .from("priority_stock")
      .delete()
      .eq("month", monthISO)
      .eq("stock_no", stock_no);
    if (error) setErr(error.message);
    else setStocks((prev) => prev.filter((s) => s !== stock_no));
  }

  async function clearStock() {
    setErr(null);
    const { error } = await supabase
      .from("priority_stock")
      .delete()
      .eq("month", monthISO);
    if (error) setErr(error.message);
    else load();
  }

  const canEdit = profile?.role === "manager" || profile?.role === "admin";

  return (
    <>
      <header className="topbar">
        <span className="wordmark">
          Pay<span>Track</span>
        </span>
        <div className="topbar-user">
          <Link
            className="btn-ghost"
            to={`/${isCurrentMonth ? "" : `?month=${monthParam}`}`}
          >
            Dashboard
          </Link>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="page">
        <div className="monthbar">
          <div className="month-nav">
            <button
              className="btn-step"
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              ‹
            </button>
            <span className="label">{monthLabel(month)} enhancers</span>
            <button
              className="btn-step"
              aria-label="Next month"
              disabled={isCurrentMonth}
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              ›
            </button>
          </div>
        </div>

        {err && <div className="notice">{err}</div>}
        {!canEdit && profile && (
          <div className="notice">
            You can view enhancer rules here; approvals and edits are for
            managers and payroll.
          </div>
        )}

        {/* ----- 1. Rules ----- */}
        <div className="section-head">
          <h2>Rules for {monthLabel(month)}</h2>
          <span className="count">{rules.length} rule(s)</span>
        </div>
        {rules.length === 0 && !canEdit && (
          <div className="tablewrap">
            <div className="empty">No rules entered for this month yet.</div>
          </div>
        )}
        {rules.length > 0 && (
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
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.brand}</td>
                    <td className="note-cell">{r.label}</td>
                    <td>{METRIC_LABEL[r.metric]}</td>
                    <td className="r num">
                      {r.metric === "manual" ? "—" : units(r.threshold)}
                    </td>
                    <td className="r money pos">+{r.pct}%</td>
                    {canEdit && (
                      <td className="r">
                        <button
                          className="btn-del"
                          onClick={() => removeRule(r.id)}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && (
          <form className="adj-form" onSubmit={addRule}>
            <div className="field">
              <label htmlFor="er-brand">Brand</label>
              <select
                id="er-brand"
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
                <option value={ALL_BRANDS}>{ALL_BRANDS}</option>
              </select>
            </div>
            <div className="field grow">
              <label htmlFor="er-label">Rule (from the monthly sheet)</label>
              <input
                id="er-label"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Sell 2 used McLaren including LBO"
              />
            </div>
            <div className="field">
              <label htmlFor="er-metric">Counts</label>
              <select
                id="er-metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value as EnhancerMetric)}
              >
                <option value="new_units">New units</option>
                <option value="used_units">Used units</option>
                <option value="total_units">Total units</option>
                <option value="priority_units">Priority-list units</option>
                <option value="trades">Trade-ins</option>
                <option value="acquisitions">Acquisitions</option>
                <option value="trades_acquisitions">
                  Trades + acquisitions
                </option>
                <option value="manual">Manual review</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="er-th">Need</label>
              <input
                id="er-th"
                inputMode="decimal"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="2"
                disabled={metric === "manual"}
              />
            </div>
            <div className="field">
              <label htmlFor="er-pct">Rate %</label>
              <input
                id="er-pct"
                inputMode="decimal"
                required
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="3"
              />
            </div>
            <button className="btn-primary slim" disabled={busy} type="submit">
              {busy ? "Saving…" : "Add rule"}
            </button>
          </form>
        )}

        {/* ----- 2. Priority / magenta list ----- */}
        <div className="section-head">
          <h2>Priority / magenta list</h2>
          <span className="count">
            {stocks.length} stock number(s) for {monthLabel(month)}
          </span>
        </div>
        {stocks.length > 0 && (
          <div className="chip-list">
            {stocks.map((s) => (
              <span className="chip" key={s}>
                {s}
                {canEdit && (
                  <button
                    className="chip-x"
                    aria-label={`Remove ${s}`}
                    onClick={() => removeStock(s)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {canEdit && (
          <form className="adj-form stock-form" onSubmit={addStock}>
            <div className="field grow">
              <label htmlFor="ps-paste">
                Paste stock numbers (spaces, commas, or one per line)
              </label>
              <textarea
                id="ps-paste"
                rows={2}
                value={stockPaste}
                onChange={(e) => setStockPaste(e.target.value)}
                placeholder={"26ML543 26ML517 25B6324B"}
              />
            </div>
            <button className="btn-primary slim" type="submit">
              Add to list
            </button>
            {stocks.length > 0 && (
              <button
                className="btn-del tall"
                type="button"
                onClick={clearStock}
              >
                Clear month
              </button>
            )}
          </form>
        )}

        {/* ----- 3. Manual review reminders ----- */}
        {manualRules.length > 0 && (
          <>
            <div className="section-head">
              <h2>Manual review</h2>
              <span className="count">
                pay these via Spiffs &amp; enhancers on the dashboard
              </span>
            </div>
            <div className="tablewrap">
              <table className="deals adj">
                <tbody>
                  {manualRules.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="badge cat-enhancer">{r.brand}</span>
                      </td>
                      <td className="note-cell">{r.label}</td>
                      <td className="r money pos">+{r.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ----- 4. Pending approvals (bottom) ----- */}
        <div className="section-head">
          <h2>Pending approvals</h2>
          <span className="count">
            {loading ? "checking…" : `${pending.length} qualified, unpaid`}
          </span>
        </div>
        {pending.length === 0 ? (
          <div className="tablewrap">
            <div className="empty">
              {loading
                ? "Checking qualification…"
                : rules.length === 0
                  ? "No rules entered for this month yet — add them above from the monthly enhancer sheet."
                  : "Nobody newly qualified right now. Recheck after the next hourly data load."}
            </div>
          </div>
        ) : (
          <div className="pend-list">
            {pending.map((s) => (
              <div className="pend-card" key={`${s.rule_id}|${s.rep}`}>
                <div className="pend-main">
                  <span className="name">{s.rep}</span>
                  <span className="rule">
                    <span className="badge cat-enhancer">{s.brand}</span>{" "}
                    {s.label}
                  </span>
                  <span className="why num">
                    {units(s.metric_value)}/{units(s.threshold)}{" "}
                    {METRIC_LABEL[s.metric].toLowerCase()} ✓ · +{s.pct}% ×{" "}
                    {money(s.brand_front_gross)} {s.brand} gross
                  </span>
                </div>
                {canEdit && (
                  <button className="btn-approve" onClick={() => approve(s)}>
                    Approve {moneyExact(s.proposed_amount)}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

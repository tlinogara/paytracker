import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMonth } from "../lib/useMonth";
import { monthLabel, monthStartISO } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import Topbar from "../components/Topbar";
import MonthBar from "../components/MonthBar";
import Collapsible from "../components/Collapsible";

const GLOBAL_STORE = "global";

type SaveResult = { error: { message: string } | null };
type Store = { id: string; name: string; active: boolean };
type StoreOption = { key: string; label: string; ids: string[] };
type PayPlan = { id: string; name: string; brand: string | null; base_rate_pct: number; rate_cap_pct: number; active: boolean };
type UnitTier = { id: string; min_units: number; rate_pct: number; label: string | null; active: boolean };
type MiniTier = { id: string; min_units: number; amount: number; label: string | null; active: boolean };
type BuyFeeRule = { id: string; store_id: string | null; effective_month: string; brand: string; make_pattern: string; amount: number; active: boolean };
type CategoryOption = { key: string; label: string; default_amount: number | null; default_pct: number | null; active: boolean; sort_order: number };

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function amountInput(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const parsed = Number(value);
  return Number.isNaN(parsed) ? "" : parsed.toFixed(2);
}

function cleanKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function canonicalStoreLabel(name: string): string {
  return name.toLowerCase().includes("beverly hills") ? "Beverly Hills" : name;
}

function normalizeRole(role: string | null | undefined): string {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return role ?? "sales_rep";
}

function inputValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
}

function inputChecked(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
}

function activeCount(rows: Array<{ active: boolean }>): number {
  return rows.filter((row) => row.active).length;
}

function countLabel(rows: Array<{ active: boolean }>, noun: string): string {
  const active = activeCount(rows);
  return `${active} active · ${rows.length} ${noun}${rows.length === 1 ? "" : "s"}`;
}

export default function Calculations({ session }: { session: Session }) {
  const { month, setMonth, isCurrentMonth } = useMonth();
  const monthISO = monthStartISO(month);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeScope, setStoreScope] = useState(GLOBAL_STORE);
  const [plans, setPlans] = useState<PayPlan[]>([]);
  const [unitTiers, setUnitTiers] = useState<UnitTier[]>([]);
  const [miniTiers, setMiniTiers] = useState<MiniTier[]>([]);
  const [buyFeeRules, setBuyFeeRules] = useState<BuyFeeRule[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [planName, setPlanName] = useState("Salesperson plan");
  const [planBrand, setPlanBrand] = useState("");
  const [baseRate, setBaseRate] = useState("10");
  const [capRate, setCapRate] = useState("25");
  const [unitMin, setUnitMin] = useState("");
  const [unitRate, setUnitRate] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [miniMin, setMiniMin] = useState("");
  const [miniAmount, setMiniAmount] = useState("");
  const [miniLabel, setMiniLabel] = useState("");
  const [buyBrand, setBuyBrand] = useState("");
  const [buyPattern, setBuyPattern] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [catKey, setCatKey] = useState("");
  const [catLabel, setCatLabel] = useState("");
  const [catAmount, setCatAmount] = useState("");
  const [catPct, setCatPct] = useState("");

  const storeOptions = useMemo(() => {
    const grouped = new Map<string, StoreOption>();
    for (const store of stores) {
      const label = canonicalStoreLabel(store.name);
      const current = grouped.get(label);
      if (current) current.ids.push(store.id);
      else grouped.set(label, { key: label, label, ids: [store.id] });
    }
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [stores]);

  const scopedStoreIds = useMemo(() => {
    if (storeScope === GLOBAL_STORE) return [];
    return storeOptions.find((option) => option.key === storeScope)?.ids ?? [];
  }, [storeOptions, storeScope]);

  const scopedStoreId = scopedStoreIds[0] ?? null;
  const role = normalizeRole(profile?.role);
  const canEdit = role === "payroll_manager" || role === "admin";
  const isGlobalScope = storeScope === GLOBAL_STORE;
  const selectedScopeLabel = isGlobalScope ? "Global defaults" : storeScope;
  const totalRules = plans.length + unitTiers.length + miniTiers.length + buyFeeRules.length + categories.length;

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data, error }) => {
      if (error) setErr(error.message);
      else setProfile(data as Profile);
    });
  }, [session.user.id]);

  useEffect(() => {
    supabase.from("stores").select("*").order("name").then(({ data, error }) => {
      if (error) setErr(error.message);
      else setStores((data ?? []) as Store[]);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const scope = scopedStoreIds;
    const planQuery = scope.length === 0
      ? supabase.from("pay_plans").select("*").is("store_id", null).order("name")
      : scope.length === 1
        ? supabase.from("pay_plans").select("*").eq("store_id", scope[0]).order("name")
        : supabase.from("pay_plans").select("*").in("store_id", scope).order("name");
    const unitQuery = scope.length === 0
      ? supabase.from("unit_enhancement_tiers").select("*").eq("effective_month", monthISO).is("store_id", null).order("min_units")
      : scope.length === 1
        ? supabase.from("unit_enhancement_tiers").select("*").eq("effective_month", monthISO).eq("store_id", scope[0]).order("min_units")
        : supabase.from("unit_enhancement_tiers").select("*").eq("effective_month", monthISO).in("store_id", scope).order("min_units");
    const miniQuery = scope.length === 0
      ? supabase.from("mini_tiers").select("*").eq("effective_month", monthISO).is("store_id", null).order("min_units")
      : scope.length === 1
        ? supabase.from("mini_tiers").select("*").eq("effective_month", monthISO).eq("store_id", scope[0]).order("min_units")
        : supabase.from("mini_tiers").select("*").eq("effective_month", monthISO).in("store_id", scope).order("min_units");
    const buyFeeQuery = scope.length === 0
      ? supabase.from("buy_fee_rules").select("*").eq("effective_month", monthISO).is("store_id", null).order("brand")
      : scope.length === 1
        ? supabase.from("buy_fee_rules").select("*").eq("effective_month", monthISO).eq("store_id", scope[0]).order("brand")
        : supabase.from("buy_fee_rules").select("*").eq("effective_month", monthISO).in("store_id", scope).order("brand");

    const [planRes, unitRes, miniRes, buyFeeRes, catRes] = await Promise.all([
      planQuery,
      unitQuery,
      miniQuery,
      buyFeeQuery,
      supabase.from("adjustment_category_options").select("*").order("sort_order"),
    ]);

    const firstError = planRes.error || unitRes.error || miniRes.error || buyFeeRes.error || catRes.error;
    if (firstError) setErr(firstError.message);
    setPlans((planRes.data ?? []) as PayPlan[]);
    setUnitTiers((unitRes.data ?? []) as UnitTier[]);
    setMiniTiers((miniRes.data ?? []) as MiniTier[]);
    setBuyFeeRules((buyFeeRes.data ?? []) as BuyFeeRule[]);
    setCategories((catRes.data ?? []) as CategoryOption[]);
    setLoading(false);
  }, [monthISO, scopedStoreIds]);

  useEffect(() => { load(); }, [load]);

  async function save(action: () => PromiseLike<SaveResult>, message: string) {
    setBusy(true);
    setErr(null);
    setOk(null);
    const { error } = await action();
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setOk(message);
      await load();
    }
  }

  async function remove(label: string, action: () => PromiseLike<SaveResult>, message: string) {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    await save(action, message);
  }

  async function addPlan(event: FormEvent) {
    event.preventDefault();
    await save(
      () => supabase.from("pay_plans").insert({
        name: planName.trim(),
        store_id: scopedStoreId,
        brand: planBrand.trim() || null,
        base_rate_pct: Number(baseRate),
        rate_cap_pct: Number(capRate),
        active: true,
      }),
      "Commission plan added.",
    );
  }

  async function savePlan(plan: PayPlan) {
    await save(
      () => supabase.from("pay_plans").update({
        name: inputValue(`plan-name-${plan.id}`),
        brand: inputValue(`plan-brand-${plan.id}`) || null,
        base_rate_pct: Number(inputValue(`plan-base-${plan.id}`)),
        rate_cap_pct: Number(inputValue(`plan-cap-${plan.id}`)),
        active: inputChecked(`plan-active-${plan.id}`),
      }).eq("id", plan.id),
      "Commission plan saved.",
    );
  }

  async function addUnitTier(event: FormEvent) {
    event.preventDefault();
    await save(
      () => supabase.from("unit_enhancement_tiers").insert({
        store_id: scopedStoreId,
        effective_month: monthISO,
        min_units: Number(unitMin),
        rate_pct: Number(unitRate),
        label: unitLabel.trim() || null,
        active: true,
      }),
      "Unit rate tier added.",
    );
    setUnitMin("");
    setUnitRate("");
    setUnitLabel("");
  }

  async function saveUnitTier(tier: UnitTier) {
    await save(
      () => supabase.from("unit_enhancement_tiers").update({
        min_units: Number(inputValue(`unit-min-${tier.id}`)),
        rate_pct: Number(inputValue(`unit-rate-${tier.id}`)),
        label: inputValue(`unit-label-${tier.id}`) || null,
        active: inputChecked(`unit-active-${tier.id}`),
      }).eq("id", tier.id),
      "Unit rate tier saved.",
    );
  }

  async function addMiniTier(event: FormEvent) {
    event.preventDefault();
    await save(
      () => supabase.from("mini_tiers").insert({
        store_id: scopedStoreId,
        effective_month: monthISO,
        min_units: Number(miniMin),
        amount: Number(miniAmount),
        label: miniLabel.trim() || null,
        active: true,
      }),
      "Mini tier added.",
    );
    setMiniMin("");
    setMiniAmount("");
    setMiniLabel("");
  }

  async function saveMiniTier(tier: MiniTier) {
    await save(
      () => supabase.from("mini_tiers").update({
        min_units: Number(inputValue(`mini-min-${tier.id}`)),
        amount: Number(inputValue(`mini-amount-${tier.id}`)),
        label: inputValue(`mini-label-${tier.id}`) || null,
        active: inputChecked(`mini-active-${tier.id}`),
      }).eq("id", tier.id),
      "Mini tier saved.",
    );
  }

  async function addBuyFeeRule(event: FormEvent) {
    event.preventDefault();
    const brand = buyBrand.trim();
    const pattern = buyPattern.trim() || `%${brand}%`;
    await save(
      () => supabase.from("buy_fee_rules").insert({
        store_id: scopedStoreId,
        effective_month: monthISO,
        brand,
        make_pattern: pattern,
        amount: Number(buyAmount),
        active: true,
      }),
      "Buy fee rule added.",
    );
    setBuyBrand("");
    setBuyPattern("");
    setBuyAmount("");
  }

  async function saveBuyFeeRule(rule: BuyFeeRule) {
    await save(
      () => supabase.from("buy_fee_rules").update({
        brand: inputValue(`buy-brand-${rule.id}`),
        make_pattern: inputValue(`buy-pattern-${rule.id}`),
        amount: Number(inputValue(`buy-amount-${rule.id}`)),
        active: inputChecked(`buy-active-${rule.id}`),
      }).eq("id", rule.id),
      "Buy fee rule saved.",
    );
  }

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    const key = cleanKey(catKey || catLabel);
    await save(
      () => supabase.from("adjustment_category_options").upsert({
        key,
        label: catLabel.trim(),
        default_amount: numberOrNull(catAmount),
        default_pct: numberOrNull(catPct),
        active: true,
        sort_order: categories.length * 10 + 10,
      }),
      "Adjustment category saved.",
    );
    setCatKey("");
    setCatLabel("");
    setCatAmount("");
    setCatPct("");
  }

  async function saveCategory(category: CategoryOption) {
    await save(
      () => supabase.from("adjustment_category_options").update({
        label: inputValue(`cat-label-${category.key}`),
        default_amount: numberOrNull(inputValue(`cat-amount-${category.key}`)),
        default_pct: numberOrNull(inputValue(`cat-pct-${category.key}`)),
        active: inputChecked(`cat-active-${category.key}`),
      }).eq("key", category.key),
      "Adjustment category saved.",
    );
  }

  return (
    <>
      <Topbar profile={profile} />
      <main className="page rules-page">
        <header className="page-heading">
          <div>
            <span className="eyebrow">Payroll administration</span>
            <h1>Commission rules</h1>
            <p>Manage the rates, thresholds, minis, fees, and manual adjustment choices used to calculate salesperson commissions.</p>
          </div>
          <div className="page-context">
            <span>Editing</span>
            <strong>{selectedScopeLabel}</strong>
            <small>{monthLabel(month)}</small>
          </div>
        </header>

        <div className="rules-toolbar">
          <MonthBar month={month} isCurrentMonth={isCurrentMonth} setMonth={setMonth} labelSuffix="commission rules" />
          <section className="rules-scope-panel" aria-label="Rule scope">
            <div className="rules-scope-copy">
              <span className={`scope-badge ${isGlobalScope ? "global" : "location"}`}>{isGlobalScope ? "Global" : "Location"}</span>
              <div>
                <strong>{selectedScopeLabel}</strong>
                <p>{isGlobalScope ? "Defaults used when a location does not have its own rule." : "Rules saved here apply only to this location."}</p>
              </div>
            </div>
            <label className="rules-scope-control" htmlFor="calc-store">
              <span>Rule scope</span>
              <select id="calc-store" value={storeScope} onChange={(event) => { setStoreScope(event.target.value); setOk(null); }}>
                <option value={GLOBAL_STORE}>Global defaults</option>
                {storeOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
          </section>
        </div>

        {err && <div className="notice">Could not update commission rules. {err}</div>}
        {ok && <div className="form-msg ok">{ok}</div>}
        {profile && !canEdit && <div className="notice">Only payroll managers and admins can edit commission rules.</div>}

        {canEdit && (
          <>
            <section className="rules-summary-grid" aria-label="Commission rule summary">
              <div className="rule-summary-card"><span>Plans</span><strong>{plans.length}</strong><small>{activeCount(plans)} active</small></div>
              <div className="rule-summary-card"><span>Unit tiers</span><strong>{unitTiers.length}</strong><small>{activeCount(unitTiers)} active</small></div>
              <div className="rule-summary-card"><span>Mini tiers</span><strong>{miniTiers.length}</strong><small>{activeCount(miniTiers)} active</small></div>
              <div className="rule-summary-card"><span>Buy fees</span><strong>{buyFeeRules.length}</strong><small>{activeCount(buyFeeRules)} active</small></div>
              <div className="rule-summary-card"><span>Adjustment types</span><strong>{categories.length}</strong><small>{activeCount(categories)} active</small></div>
            </section>

            {loading && <div className="rules-loading">Loading rules for {selectedScopeLabel}…</div>}
            {!loading && totalRules === 0 && (
              <div className="notice rules-empty-notice">No rules are configured for {selectedScopeLabel} in {monthLabel(month)}. Use the add forms below to create them.</div>
            )}

            <Collapsible title="Base commission plans" count={countLabel(plans, "plan")}>
              <div className="rule-section-copy">
                <p>Set the starting commission percentage and maximum rate. Leave Brand blank when the plan applies to every brand in this scope.</p>
                <span>Plans are not month specific.</span>
              </div>
              {plans.length > 0 ? (
                <div className="tablewrap">
                  <table className="deals adj rules-table">
                    <thead><tr><th>Plan name</th><th>Brand</th><th className="r">Base rate</th><th className="r">Rate cap</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {plans.map((plan) => (
                        <tr key={plan.id}>
                          <td><input id={`plan-name-${plan.id}`} defaultValue={plan.name} aria-label={`${plan.name} plan name`} /></td>
                          <td><input id={`plan-brand-${plan.id}`} defaultValue={plan.brand ?? ""} placeholder="All brands" aria-label={`${plan.name} brand`} /></td>
                          <td className="r"><div className="input-suffix"><input className="mini" id={`plan-base-${plan.id}`} inputMode="decimal" defaultValue={plan.base_rate_pct} aria-label={`${plan.name} base rate`} /><span>%</span></div></td>
                          <td className="r"><div className="input-suffix"><input className="mini" id={`plan-cap-${plan.id}`} inputMode="decimal" defaultValue={plan.rate_cap_pct} aria-label={`${plan.name} rate cap`} /><span>%</span></div></td>
                          <td className="toggle-cell"><label className="status-toggle"><input id={`plan-active-${plan.id}`} type="checkbox" defaultChecked={plan.active} /><span>Enabled</span></label></td>
                          <td className="rule-actions"><button type="button" className="btn-approve" disabled={busy} onClick={() => savePlan(plan)}>Save changes</button><button type="button" className="btn-del" disabled={busy} onClick={() => remove(plan.name, () => supabase.from("pay_plans").delete().eq("id", plan.id), "Commission plan deleted.")}>Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="rule-empty">No commission plans exist for this scope.</div>}
              <form className="rule-add-card plan-form" onSubmit={addPlan}>
                <div className="rule-add-head"><div><span>Add rule</span><h3>New commission plan</h3></div><small>Saved to {selectedScopeLabel}</small></div>
                <div className="rule-add-fields">
                  <div className="field grow"><label htmlFor="new-plan-name">Plan name</label><input id="new-plan-name" required value={planName} onChange={(event) => setPlanName(event.target.value)} /></div>
                  <div className="field"><label htmlFor="new-plan-brand">Brand</label><input id="new-plan-brand" value={planBrand} onChange={(event) => setPlanBrand(event.target.value)} placeholder="Optional" /></div>
                  <div className="field"><label htmlFor="new-plan-base">Base rate %</label><input id="new-plan-base" required inputMode="decimal" value={baseRate} onChange={(event) => setBaseRate(event.target.value)} /></div>
                  <div className="field"><label htmlFor="new-plan-cap">Rate cap %</label><input id="new-plan-cap" required inputMode="decimal" value={capRate} onChange={(event) => setCapRate(event.target.value)} /></div>
                  <button className="btn-primary slim" disabled={busy} type="submit">Add plan</button>
                </div>
              </form>
            </Collapsible>

            <Collapsible title="Unit rate enhancement" count={countLabel(unitTiers, "tier")}>
              <div className="rule-section-copy">
                <p>Add the percentage points earned when a salesperson reaches a minimum unit count. Tiers should be entered from the lowest threshold to the highest.</p>
                <span>{monthLabel(month)} · {selectedScopeLabel}</span>
              </div>
              {unitTiers.length > 0 ? (
                <div className="tablewrap">
                  <table className="deals adj rules-table compact-rules-table">
                    <thead><tr><th className="r">Minimum units</th><th className="r">Added rate</th><th>Display label</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {unitTiers.map((tier) => (
                        <tr key={tier.id}>
                          <td className="r"><input className="mini" id={`unit-min-${tier.id}`} inputMode="decimal" defaultValue={tier.min_units} aria-label="Minimum units" /></td>
                          <td className="r"><div className="input-suffix"><input className="mini" id={`unit-rate-${tier.id}`} inputMode="decimal" defaultValue={tier.rate_pct} aria-label="Added rate" /><span>%</span></div></td>
                          <td><input id={`unit-label-${tier.id}`} defaultValue={tier.label ?? ""} placeholder="Example: 10 units" aria-label="Tier label" /></td>
                          <td className="toggle-cell"><label className="status-toggle"><input id={`unit-active-${tier.id}`} type="checkbox" defaultChecked={tier.active} /><span>Enabled</span></label></td>
                          <td className="rule-actions"><button type="button" className="btn-approve" disabled={busy} onClick={() => saveUnitTier(tier)}>Save changes</button><button type="button" className="btn-del" disabled={busy} onClick={() => remove(`the ${tier.min_units} unit tier`, () => supabase.from("unit_enhancement_tiers").delete().eq("id", tier.id), "Unit rate tier deleted.")}>Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="rule-empty">No unit rate tiers are configured for this month and scope.</div>}
              <form className="rule-add-card unit-form" onSubmit={addUnitTier}>
                <div className="rule-add-head"><div><span>Add rule</span><h3>New unit rate tier</h3></div><small>{monthLabel(month)}</small></div>
                <div className="rule-add-fields">
                  <div className="field"><label htmlFor="new-unit-min">Minimum units</label><input id="new-unit-min" required inputMode="decimal" value={unitMin} onChange={(event) => setUnitMin(event.target.value)} /></div>
                  <div className="field"><label htmlFor="new-unit-rate">Added rate %</label><input id="new-unit-rate" required inputMode="decimal" value={unitRate} onChange={(event) => setUnitRate(event.target.value)} /></div>
                  <div className="field grow"><label htmlFor="new-unit-label">Display label</label><input id="new-unit-label" value={unitLabel} onChange={(event) => setUnitLabel(event.target.value)} placeholder="Optional" /></div>
                  <button className="btn-primary slim" disabled={busy} type="submit">Add tier</button>
                </div>
              </form>
            </Collapsible>

            <Collapsible title="Enhanced minis" count={countLabel(miniTiers, "tier")}>
              <div className="rule-section-copy">
                <p>Set the minimum commission amount paid per eligible deal after the salesperson reaches a unit threshold.</p>
                <span>{monthLabel(month)} · {selectedScopeLabel}</span>
              </div>
              {miniTiers.length > 0 ? (
                <div className="tablewrap">
                  <table className="deals adj rules-table compact-rules-table">
                    <thead><tr><th className="r">Minimum units</th><th className="r">Mini amount</th><th>Display label</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {miniTiers.map((tier) => (
                        <tr key={tier.id}>
                          <td className="r"><input className="mini" id={`mini-min-${tier.id}`} inputMode="decimal" defaultValue={tier.min_units} aria-label="Minimum units" /></td>
                          <td className="r"><div className="input-prefix"><span>$</span><input className="mini" id={`mini-amount-${tier.id}`} inputMode="decimal" defaultValue={amountInput(tier.amount)} aria-label="Mini amount" /></div></td>
                          <td><input id={`mini-label-${tier.id}`} defaultValue={tier.label ?? ""} placeholder="Example: 10 plus units" aria-label="Mini tier label" /></td>
                          <td className="toggle-cell"><label className="status-toggle"><input id={`mini-active-${tier.id}`} type="checkbox" defaultChecked={tier.active} /><span>Enabled</span></label></td>
                          <td className="rule-actions"><button type="button" className="btn-approve" disabled={busy} onClick={() => saveMiniTier(tier)}>Save changes</button><button type="button" className="btn-del" disabled={busy} onClick={() => remove(`the ${tier.min_units} unit mini tier`, () => supabase.from("mini_tiers").delete().eq("id", tier.id), "Mini tier deleted.")}>Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="rule-empty">No enhanced mini tiers are configured for this month and scope.</div>}
              <form className="rule-add-card mini-form" onSubmit={addMiniTier}>
                <div className="rule-add-head"><div><span>Add rule</span><h3>New enhanced mini tier</h3></div><small>{monthLabel(month)}</small></div>
                <div className="rule-add-fields">
                  <div className="field"><label htmlFor="new-mini-min">Minimum units</label><input id="new-mini-min" required inputMode="decimal" value={miniMin} onChange={(event) => setMiniMin(event.target.value)} /></div>
                  <div className="field"><label htmlFor="new-mini-amount">Mini amount</label><input id="new-mini-amount" required inputMode="decimal" value={miniAmount} onChange={(event) => setMiniAmount(event.target.value)} placeholder="1500.00" /></div>
                  <div className="field grow"><label htmlFor="new-mini-label">Display label</label><input id="new-mini-label" value={miniLabel} onChange={(event) => setMiniLabel(event.target.value)} placeholder="Optional" /></div>
                  <button className="btn-primary slim" disabled={busy} type="submit">Add mini tier</button>
                </div>
              </form>
            </Collapsible>

            <Collapsible title="Buy fees" count={countLabel(buyFeeRules, "rule")}>
              <div className="rule-section-copy">
                <p>Pay a fixed amount when an acquisition matches the vehicle make pattern. The match uses SQL wildcards, so %McLaren% matches any make containing McLaren.</p>
                <span>{monthLabel(month)} · {selectedScopeLabel}</span>
              </div>
              {buyFeeRules.length > 0 ? (
                <div className="tablewrap">
                  <table className="deals adj rules-table">
                    <thead><tr><th>Brand</th><th>Vehicle make match</th><th className="r">Fee amount</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {buyFeeRules.map((rule) => (
                        <tr key={rule.id}>
                          <td><input id={`buy-brand-${rule.id}`} defaultValue={rule.brand} aria-label="Buy fee brand" /></td>
                          <td><input className="rule-pattern" id={`buy-pattern-${rule.id}`} defaultValue={rule.make_pattern} aria-label="Vehicle make match" /></td>
                          <td className="r"><div className="input-prefix"><span>$</span><input className="mini" id={`buy-amount-${rule.id}`} inputMode="decimal" defaultValue={amountInput(rule.amount)} aria-label="Buy fee amount" /></div></td>
                          <td className="toggle-cell"><label className="status-toggle"><input id={`buy-active-${rule.id}`} type="checkbox" defaultChecked={rule.active} /><span>Enabled</span></label></td>
                          <td className="rule-actions"><button type="button" className="btn-approve" disabled={busy} onClick={() => saveBuyFeeRule(rule)}>Save changes</button><button type="button" className="btn-del" disabled={busy} onClick={() => remove(`${rule.brand} buy fee`, () => supabase.from("buy_fee_rules").delete().eq("id", rule.id), "Buy fee rule deleted.")}>Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="rule-empty">No buy fee rules are configured for this month and scope.</div>}
              <form className="rule-add-card buy-form" onSubmit={addBuyFeeRule}>
                <div className="rule-add-head"><div><span>Add rule</span><h3>New buy fee</h3></div><small>{monthLabel(month)}</small></div>
                <div className="rule-add-fields">
                  <div className="field"><label htmlFor="new-buy-brand">Brand</label><input id="new-buy-brand" required value={buyBrand} onChange={(event) => setBuyBrand(event.target.value)} placeholder="McLaren" /></div>
                  <div className="field grow"><label htmlFor="new-buy-pattern">Vehicle make match</label><input id="new-buy-pattern" value={buyPattern} onChange={(event) => setBuyPattern(event.target.value)} placeholder="Defaults to %Brand%" /></div>
                  <div className="field"><label htmlFor="new-buy-amount">Fee amount</label><input id="new-buy-amount" required inputMode="decimal" value={buyAmount} onChange={(event) => setBuyAmount(event.target.value)} placeholder="1500.00" /></div>
                  <button className="btn-primary slim" disabled={busy} type="submit">Add buy fee</button>
                </div>
              </form>
            </Collapsible>

            <Collapsible title="Adjustment categories" count={countLabel(categories, "category")}>
              <div className="rule-section-copy">
                <p>These choices appear in the manual Spiffs, bonuses, and adjustments form. Prefill values are optional suggestions and can still be changed when the adjustment is entered.</p>
                <span>Global across all locations and months</span>
              </div>
              {categories.length > 0 ? (
                <div className="tablewrap">
                  <table className="deals adj rules-table category-rules-table">
                    <thead><tr><th>System key</th><th>Display label</th><th className="r">Default amount</th><th className="r">Default rate</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {categories.map((category) => (
                        <tr key={category.key}>
                          <td><code className="rule-key">{category.key}</code></td>
                          <td><input id={`cat-label-${category.key}`} defaultValue={category.label} aria-label={`${category.label} display label`} /></td>
                          <td className="r"><div className="input-prefix"><span>$</span><input className="mini" id={`cat-amount-${category.key}`} inputMode="decimal" defaultValue={amountInput(category.default_amount)} placeholder="Blank" aria-label={`${category.label} default amount`} /></div></td>
                          <td className="r"><div className="input-suffix"><input className="mini" id={`cat-pct-${category.key}`} inputMode="decimal" defaultValue={category.default_pct ?? ""} placeholder="Blank" aria-label={`${category.label} default rate`} /><span>%</span></div></td>
                          <td className="toggle-cell"><label className="status-toggle"><input id={`cat-active-${category.key}`} type="checkbox" defaultChecked={category.active} /><span>Enabled</span></label></td>
                          <td className="rule-actions"><button type="button" className="btn-approve" disabled={busy} onClick={() => saveCategory(category)}>Save changes</button><button type="button" className="btn-del" disabled={busy} onClick={() => remove(`${category.label} category`, () => supabase.from("adjustment_category_options").delete().eq("key", category.key), "Adjustment category deleted.")}>Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="rule-empty">No manual adjustment categories exist.</div>}
              <form className="rule-add-card category-form" onSubmit={addCategory}>
                <div className="rule-add-head"><div><span>Add option</span><h3>New adjustment category</h3></div><small>Available everywhere</small></div>
                <div className="rule-add-fields">
                  <div className="field"><label htmlFor="new-cat-key">System key</label><input id="new-cat-key" value={catKey} onChange={(event) => setCatKey(event.target.value)} placeholder="Created from label if blank" /></div>
                  <div className="field grow"><label htmlFor="new-cat-label">Display label</label><input id="new-cat-label" required value={catLabel} onChange={(event) => setCatLabel(event.target.value)} /></div>
                  <div className="field"><label htmlFor="new-cat-amount">Default amount</label><input id="new-cat-amount" inputMode="decimal" value={catAmount} onChange={(event) => setCatAmount(event.target.value)} placeholder="Optional" /></div>
                  <div className="field"><label htmlFor="new-cat-pct">Default rate %</label><input id="new-cat-pct" inputMode="decimal" value={catPct} onChange={(event) => setCatPct(event.target.value)} placeholder="Optional" /></div>
                  <button className="btn-primary slim" disabled={busy} type="submit">Add category</button>
                </div>
              </form>
            </Collapsible>
          </>
        )}
      </main>
    </>
  );
}

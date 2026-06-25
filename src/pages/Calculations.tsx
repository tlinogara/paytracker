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
type CategoryOption = { key: string; label: string; default_amount: number | null; default_pct: number | null; active: boolean; sort_order: number };

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function cleanKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function canonicalStoreLabel(name: string): string {
  return name.toLowerCase().includes("beverly hills") ? "Beverly Hills" : name;
}

function inputValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
}

function inputChecked(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
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
  const isAdmin = profile?.role === "admin";

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
    const [planRes, unitRes, miniRes, catRes] = await Promise.all([
      planQuery,
      unitQuery,
      miniQuery,
      supabase.from("adjustment_category_options").select("*").order("sort_order"),
    ]);
    const firstError = planRes.error || unitRes.error || miniRes.error || catRes.error;
    if (firstError) setErr(firstError.message);
    setPlans((planRes.data ?? []) as PayPlan[]);
    setUnitTiers((unitRes.data ?? []) as UnitTier[]);
    setMiniTiers((miniRes.data ?? []) as MiniTier[]);
    setCategories((catRes.data ?? []) as CategoryOption[]);
    setLoading(false);
  }, [monthISO, scopedStoreIds]);

  useEffect(() => {
    load();
  }, [load]);

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

  async function addPlan(e: FormEvent) {
    e.preventDefault();
    await save(() => supabase.from("pay_plans").insert({ name: planName, store_id: scopedStoreId, brand: planBrand || null, base_rate_pct: Number(baseRate), rate_cap_pct: Number(capRate), active: true }), "Plan added.");
  }

  async function savePlan(plan: PayPlan) {
    await save(() => supabase.from("pay_plans").update({ name: inputValue(`plan-name-${plan.id}`), brand: inputValue(`plan-brand-${plan.id}`) || null, base_rate_pct: Number(inputValue(`plan-base-${plan.id}`)), rate_cap_pct: Number(inputValue(`plan-cap-${plan.id}`)), active: inputChecked(`plan-active-${plan.id}`) }).eq("id", plan.id), "Plan saved.");
  }

  async function addUnitTier(e: FormEvent) {
    e.preventDefault();
    await save(() => supabase.from("unit_enhancement_tiers").insert({ store_id: scopedStoreId, effective_month: monthISO, min_units: Number(unitMin), rate_pct: Number(unitRate), label: unitLabel || null, active: true }), "Unit tier added.");
    setUnitMin(""); setUnitRate(""); setUnitLabel("");
  }

  async function saveUnitTier(tier: UnitTier) {
    await save(() => supabase.from("unit_enhancement_tiers").update({ min_units: Number(inputValue(`unit-min-${tier.id}`)), rate_pct: Number(inputValue(`unit-rate-${tier.id}`)), label: inputValue(`unit-label-${tier.id}`) || null, active: inputChecked(`unit-active-${tier.id}`) }).eq("id", tier.id), "Unit tier saved.");
  }

  async function addMiniTier(e: FormEvent) {
    e.preventDefault();
    await save(() => supabase.from("mini_tiers").insert({ store_id: scopedStoreId, effective_month: monthISO, min_units: Number(miniMin), amount: Number(miniAmount), label: miniLabel || null, active: true }), "Mini tier added.");
    setMiniMin(""); setMiniAmount(""); setMiniLabel("");
  }

  async function saveMiniTier(tier: MiniTier) {
    await save(() => supabase.from("mini_tiers").update({ min_units: Number(inputValue(`mini-min-${tier.id}`)), amount: Number(inputValue(`mini-amount-${tier.id}`)), label: inputValue(`mini-label-${tier.id}`) || null, active: inputChecked(`mini-active-${tier.id}`) }).eq("id", tier.id), "Mini tier saved.");
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    const key = cleanKey(catKey || catLabel);
    await save(() => supabase.from("adjustment_category_options").upsert({ key, label: catLabel, default_amount: numberOrNull(catAmount), default_pct: numberOrNull(catPct), active: true, sort_order: categories.length * 10 + 10 }), "Category saved.");
    setCatKey(""); setCatLabel(""); setCatAmount(""); setCatPct("");
  }

  async function saveCategory(category: CategoryOption) {
    await save(() => supabase.from("adjustment_category_options").update({ label: inputValue(`cat-label-${category.key}`), default_amount: numberOrNull(inputValue(`cat-amount-${category.key}`)), default_pct: numberOrNull(inputValue(`cat-pct-${category.key}`)), active: inputChecked(`cat-active-${category.key}`) }).eq("key", category.key), "Category saved.");
  }

  return (
    <>
      <Topbar profile={profile} />
      <main className="page">
        <MonthBar month={month} isCurrentMonth={isCurrentMonth} setMonth={setMonth} labelSuffix="calculations" />
        {err && <div className="notice">{err}</div>}
        {ok && <div className="form-msg ok">{ok}</div>}
        {profile && !isAdmin && <div className="notice">Calculations are visible to admin users only.</div>}
        {isAdmin && (
          <>
            <div className="action-row"><div className="field"><label htmlFor="calc-store">Store scope</label><select id="calc-store" value={storeScope} onChange={(e) => setStoreScope(e.target.value)}><option value={GLOBAL_STORE}>Global default</option>{storeOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div><div className="field grow"><label>Effective month</label><div className="calc-readout">{monthLabel(month)}</div></div></div>
            <Collapsible title="Base commission plans" count={`${plans.length} plan(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th>Name</th><th>Brand</th><th className="r">Base %</th><th className="r">Cap %</th><th>Active</th><th></th></tr></thead><tbody>{plans.map((p) => <tr key={p.id}><td><input id={`plan-name-${p.id}`} defaultValue={p.name} /></td><td><input id={`plan-brand-${p.id}`} defaultValue={p.brand ?? ""} /></td><td className="r"><input className="mini" id={`plan-base-${p.id}`} defaultValue={p.base_rate_pct} /></td><td className="r"><input className="mini" id={`plan-cap-${p.id}`} defaultValue={p.rate_cap_pct} /></td><td><input id={`plan-active-${p.id}`} type="checkbox" defaultChecked={p.active} /></td><td className="action-cell"><button type="button" className="btn-approve" disabled={busy} onClick={() => savePlan(p)}>Save</button><button type="button" className="btn-del" disabled={busy} onClick={() => save(() => supabase.from("pay_plans").delete().eq("id", p.id), "Plan removed.")}>Remove</button></td></tr>)}</tbody></table></div><form className="adj-form stock-form" onSubmit={addPlan}><div className="field"><label>Name</label><input value={planName} onChange={(e) => setPlanName(e.target.value)} /></div><div className="field"><label>Brand optional</label><input value={planBrand} onChange={(e) => setPlanBrand(e.target.value)} /></div><div className="field"><label>Base %</label><input value={baseRate} onChange={(e) => setBaseRate(e.target.value)} /></div><div className="field"><label>Cap %</label><input value={capRate} onChange={(e) => setCapRate(e.target.value)} /></div><button className="btn-primary slim" disabled={busy} type="submit">Add plan</button></form></Collapsible>
            <Collapsible title="Unit rate enhancement" count={`${unitTiers.length} tier(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th className="r">Min units</th><th className="r">Rate %</th><th>Label</th><th>Active</th><th></th></tr></thead><tbody>{unitTiers.map((t) => <tr key={t.id}><td className="r"><input className="mini" id={`unit-min-${t.id}`} defaultValue={t.min_units} /></td><td className="r"><input className="mini" id={`unit-rate-${t.id}`} defaultValue={t.rate_pct} /></td><td><input id={`unit-label-${t.id}`} defaultValue={t.label ?? ""} /></td><td><input id={`unit-active-${t.id}`} type="checkbox" defaultChecked={t.active} /></td><td className="action-cell"><button type="button" className="btn-approve" disabled={busy} onClick={() => saveUnitTier(t)}>Save</button><button type="button" className="btn-del" disabled={busy} onClick={() => save(() => supabase.from("unit_enhancement_tiers").delete().eq("id", t.id), "Unit tier removed.")}>Remove</button></td></tr>)}</tbody></table></div><form className="adj-form stock-form" onSubmit={addUnitTier}><div className="field"><label>Min units</label><input value={unitMin} onChange={(e) => setUnitMin(e.target.value)} /></div><div className="field"><label>Rate %</label><input value={unitRate} onChange={(e) => setUnitRate(e.target.value)} /></div><div className="field grow"><label>Label</label><input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} /></div><button className="btn-primary slim" disabled={busy} type="submit">Add tier</button></form></Collapsible>
            <Collapsible title="Minis" count={`${miniTiers.length} tier(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th className="r">Min units</th><th className="r">Amount</th><th>Label</th><th>Active</th><th></th></tr></thead><tbody>{miniTiers.map((t) => <tr key={t.id}><td className="r"><input className="mini" id={`mini-min-${t.id}`} defaultValue={t.min_units} /></td><td className="r"><input className="mini" id={`mini-amount-${t.id}`} defaultValue={t.amount} /></td><td><input id={`mini-label-${t.id}`} defaultValue={t.label ?? ""} /></td><td><input id={`mini-active-${t.id}`} type="checkbox" defaultChecked={t.active} /></td><td className="action-cell"><button type="button" className="btn-approve" disabled={busy} onClick={() => saveMiniTier(t)}>Save</button><button type="button" className="btn-del" disabled={busy} onClick={() => save(() => supabase.from("mini_tiers").delete().eq("id", t.id), "Mini tier removed.")}>Remove</button></td></tr>)}</tbody></table></div><form className="adj-form stock-form" onSubmit={addMiniTier}><div className="field"><label>Min units</label><input value={miniMin} onChange={(e) => setMiniMin(e.target.value)} /></div><div className="field"><label>Amount</label><input value={miniAmount} onChange={(e) => setMiniAmount(e.target.value)} /></div><div className="field grow"><label>Label</label><input value={miniLabel} onChange={(e) => setMiniLabel(e.target.value)} /></div><button className="btn-primary slim" disabled={busy} type="submit">Add mini</button></form></Collapsible>
            <Collapsible title="Adjustment categories" count={`${categories.length} category option(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th>Key</th><th>Label</th><th className="r">Default $</th><th className="r">Default %</th><th>Active</th><th></th></tr></thead><tbody>{categories.map((c) => <tr key={c.key}><td className="num">{c.key}</td><td><input id={`cat-label-${c.key}`} defaultValue={c.label} /></td><td className="r"><input className="mini" id={`cat-amount-${c.key}`} defaultValue={c.default_amount ?? ""} /></td><td className="r"><input className="mini" id={`cat-pct-${c.key}`} defaultValue={c.default_pct ?? ""} /></td><td><input id={`cat-active-${c.key}`} type="checkbox" defaultChecked={c.active} /></td><td className="action-cell"><button type="button" className="btn-approve" disabled={busy} onClick={() => saveCategory(c)}>Save</button><button type="button" className="btn-del" disabled={busy} onClick={() => save(() => supabase.from("adjustment_category_options").delete().eq("key", c.key), "Category removed.")}>Remove</button></td></tr>)}</tbody></table></div><form className="adj-form stock-form" onSubmit={addCategory}><div className="field"><label>Key</label><input value={catKey} onChange={(e) => setCatKey(e.target.value)} /></div><div className="field"><label>Label</label><input value={catLabel} onChange={(e) => setCatLabel(e.target.value)} /></div><div className="field"><label>Default $</label><input value={catAmount} onChange={(e) => setCatAmount(e.target.value)} /></div><div className="field"><label>Default %</label><input value={catPct} onChange={(e) => setCatPct(e.target.value)} /></div><button className="btn-primary slim" disabled={busy} type="submit">Save category</button></form></Collapsible>
          </>
        )}
        {isAdmin && loading && <div className="loading">Loading calculations…</div>}
      </main>
    </>
  );
}

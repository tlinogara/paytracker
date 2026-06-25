import { useCallback, useEffect, useState } from "react";
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

  const scopedStoreId = storeScope === GLOBAL_STORE ? null : storeScope;
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data, error }) => {
      if (error) setErr(error.message);
      else setProfile(data as Profile);
    });
  }, [session.user.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const storeId = storeScope === GLOBAL_STORE ? null : storeScope;
    const planQuery = storeId == null
      ? supabase.from("pay_plans").select("*").is("store_id", null).order("name")
      : supabase.from("pay_plans").select("*").eq("store_id", storeId).order("name");
    const unitQuery = storeId == null
      ? supabase.from("unit_enhancement_tiers").select("*").eq("effective_month", monthISO).is("store_id", null).order("min_units")
      : supabase.from("unit_enhancement_tiers").select("*").eq("effective_month", monthISO).eq("store_id", storeId).order("min_units");
    const miniQuery = storeId == null
      ? supabase.from("mini_tiers").select("*").eq("effective_month", monthISO).is("store_id", null).order("min_units")
      : supabase.from("mini_tiers").select("*").eq("effective_month", monthISO).eq("store_id", storeId).order("min_units");
    const [storeRes, planRes, unitRes, miniRes, catRes] = await Promise.all([
      supabase.from("stores").select("*").order("name"),
      planQuery,
      unitQuery,
      miniQuery,
      supabase.from("adjustment_category_options").select("*").order("sort_order"),
    ]);
    const firstError = storeRes.error || planRes.error || unitRes.error || miniRes.error || catRes.error;
    if (firstError) setErr(firstError.message);
    setStores((storeRes.data ?? []) as Store[]);
    setPlans((planRes.data ?? []) as PayPlan[]);
    setUnitTiers((unitRes.data ?? []) as UnitTier[]);
    setMiniTiers((miniRes.data ?? []) as MiniTier[]);
    setCategories((catRes.data ?? []) as CategoryOption[]);
    setLoading(false);
  }, [monthISO, storeScope]);

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

  async function addUnitTier(e: FormEvent) {
    e.preventDefault();
    await save(() => supabase.from("unit_enhancement_tiers").insert({ store_id: scopedStoreId, effective_month: monthISO, min_units: Number(unitMin), rate_pct: Number(unitRate), label: unitLabel || null, active: true }), "Unit tier added.");
    setUnitMin(""); setUnitRate(""); setUnitLabel("");
  }

  async function addMiniTier(e: FormEvent) {
    e.preventDefault();
    await save(() => supabase.from("mini_tiers").insert({ store_id: scopedStoreId, effective_month: monthISO, min_units: Number(miniMin), amount: Number(miniAmount), label: miniLabel || null, active: true }), "Mini tier added.");
    setMiniMin(""); setMiniAmount(""); setMiniLabel("");
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    const key = cleanKey(catKey || catLabel);
    await save(() => supabase.from("adjustment_category_options").upsert({ key, label: catLabel, default_amount: numberOrNull(catAmount), default_pct: numberOrNull(catPct), active: true, sort_order: categories.length * 10 + 10 }), "Category saved.");
    setCatKey(""); setCatLabel(""); setCatAmount(""); setCatPct("");
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
            <div className="action-row"><div className="field"><label htmlFor="calc-store">Store scope</label><select id="calc-store" value={storeScope} onChange={(e) => setStoreScope(e.target.value)}><option value={GLOBAL_STORE}>Global default</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="field grow"><label>Effective month</label><div className="calc-readout">{monthLabel(month)}</div></div></div>
            <Collapsible title="Base commission plans" count={`${plans.length} plan(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th>Name</th><th>Brand</th><th className="r">Base %</th><th className="r">Cap %</th><th>Active</th></tr></thead><tbody>{plans.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.brand ?? "—"}</td><td className="r num">{p.base_rate_pct}</td><td className="r num">{p.rate_cap_pct}</td><td>{p.active ? "Yes" : "No"}</td></tr>)}</tbody></table></div><form className="adj-form stock-form" onSubmit={addPlan}><div className="field"><label>Name</label><input value={planName} onChange={(e) => setPlanName(e.target.value)} /></div><div className="field"><label>Brand optional</label><input value={planBrand} onChange={(e) => setPlanBrand(e.target.value)} /></div><div className="field"><label>Base %</label><input value={baseRate} onChange={(e) => setBaseRate(e.target.value)} /></div><div className="field"><label>Cap %</label><input value={capRate} onChange={(e) => setCapRate(e.target.value)} /></div><button className="btn-primary slim" disabled={busy} type="submit">Add plan</button></form></Collapsible>
            <Collapsible title="Unit rate enhancement" count={`${unitTiers.length} tier(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th className="r">Min units</th><th className="r">Rate %</th><th>Label</th><th>Active</th></tr></thead><tbody>{unitTiers.map((t) => <tr key={t.id}><td className="r num">{t.min_units}</td><td className="r num">{t.rate_pct}</td><td>{t.label ?? "—"}</td><td>{t.active ? "Yes" : "No"}</td></tr>)}</tbody></table></div><form className="adj-form stock-form" onSubmit={addUnitTier}><div className="field"><label>Min units</label><input value={unitMin} onChange={(e) => setUnitMin(e.target.value)} /></div><div className="field"><label>Rate %</label><input value={unitRate} onChange={(e) => setUnitRate(e.target.value)} /></div><div className="field grow"><label>Label</label><input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} /></div><button className="btn-primary slim" disabled={busy} type="submit">Add tier</button></form></Collapsible>
            <Collapsible title="Minis" count={`${miniTiers.length} tier(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th className="r">Min units</th><th className="r">Amount</th><th>Label</th><th>Active</th></tr></thead><tbody>{miniTiers.map((t) => <tr key={t.id}><td className="r num">{t.min_units}</td><td className="r num">{t.amount}</td><td>{t.label ?? "—"}</td><td>{t.active ? "Yes" : "No"}</td></tr>)}</tbody></table></div><form className="adj-form stock-form" onSubmit={addMiniTier}><div className="field"><label>Min units</label><input value={miniMin} onChange={(e) => setMiniMin(e.target.value)} /></div><div className="field"><label>Amount</label><input value={miniAmount} onChange={(e) => setMiniAmount(e.target.value)} /></div><div className="field grow"><label>Label</label><input value={miniLabel} onChange={(e) => setMiniLabel(e.target.value)} /></div><button className="btn-primary slim" disabled={busy} type="submit">Add mini</button></form></Collapsible>
            <Collapsible title="Adjustment categories" count={`${categories.length} category option(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th>Key</th><th>Label</th><th className="r">Default $</th><th className="r">Default %</th><th>Active</th></tr></thead><tbody>{categories.map((c) => <tr key={c.key}><td className="num">{c.key}</td><td>{c.label}</td><td className="r num">{c.default_amount ?? "—"}</td><td className="r num">{c.default_pct ?? "—"}</td><td>{c.active ? "Yes" : "No"}</td></tr>)}</tbody></table></div><form className="adj-form stock-form" onSubmit={addCategory}><div className="field"><label>Key</label><input value={catKey} onChange={(e) => setCatKey(e.target.value)} /></div><div className="field"><label>Label</label><input value={catLabel} onChange={(e) => setCatLabel(e.target.value)} /></div><div className="field"><label>Default $</label><input value={catAmount} onChange={(e) => setCatAmount(e.target.value)} /></div><div className="field"><label>Default %</label><input value={catPct} onChange={(e) => setCatPct(e.target.value)} /></div><button className="btn-primary slim" disabled={busy} type="submit">Save category</button></form></Collapsible>
          </>
        )}
        {isAdmin && loading && <div className="loading">Loading calculations…</div>}
      </main>
    </>
  );
}

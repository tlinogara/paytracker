import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMonth } from "../lib/useMonth";
import { monthLabel, monthStartISO } from "../lib/format";
import { supabase } from "../lib/supabase";
import Topbar from "../components/Topbar";
import MonthBar from "../components/MonthBar";
import Collapsible from "../components/Collapsible";

const GLOBAL = "__global__";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  store_id: string | null;
  store_name: string | null;
};

type Store = {
  id: string;
  name: string;
  active: boolean;
};

type PayPlan = {
  id: string;
  name: string;
  store_id: string | null;
  brand: string | null;
  base_rate_pct: number;
  rate_cap_pct: number;
  active: boolean;
};

type UnitTier = {
  id: string;
  store_id: string | null;
  effective_month: string;
  min_units: number;
  rate_pct: number;
  label: string | null;
  active: boolean;
};

type MiniTier = {
  id: string;
  store_id: string | null;
  effective_month: string;
  min_units: number;
  amount: number;
  label: string | null;
  active: boolean;
};

type CategoryOption = {
  key: string;
  label: string;
  default_amount: number | null;
  default_pct: number | null;
  active: boolean;
  sort_order: number;
};

type PlanDraft = {
  name: string;
  brand: string;
  base_rate_pct: string;
  rate_cap_pct: string;
};

type UnitDraft = {
  min_units: string;
  rate_pct: string;
  label: string;
};

type MiniDraft = {
  min_units: string;
  amount: string;
  label: string;
};

type CategoryDraft = {
  key: string;
  label: string;
  default_amount: string;
  default_pct: string;
};

function amountOrNull(value: string): number | null {
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
  const [selectedStoreId, setSelectedStoreId] = useState(GLOBAL);
  const [plans, setPlans] = useState<PayPlan[]>([]);
  const [unitTiers, setUnitTiers] = useState<UnitTier[]>([]);
  const [miniTiers, setMiniTiers] = useState<MiniTier[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft>({ name: "Salesperson plan", brand: "", base_rate_pct: "10", rate_cap_pct: "25" });
  const [unitDraft, setUnitDraft] = useState<UnitDraft>({ min_units: "", rate_pct: "", label: "" });
  const [miniDraft, setMiniDraft] = useState<MiniDraft>({ min_units: "", amount: "", label: "" });
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>({ key: "", label: "", default_amount: "", default_pct: "" });

  const scopedStoreId = selectedStoreId === GLOBAL ? null : selectedStoreId;
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
    const storeId = selectedStoreId === GLOBAL ? null : selectedStoreId;

    let planQuery = supabase.from("pay_plans").select("*").order("name");
    let unitQuery = supabase.from("unit_enhancement_tiers").select("*").eq("effective_month", monthISO).order("min_units");
    let miniQuery = supabase.from("mini_tiers").select("*").eq("effective_month", monthISO).order("min_units");
    if (storeId == null) {
      planQuery = planQuery.is("store_id", null);
      unitQuery = unitQuery.is("store_id", null);
      miniQuery = miniQuery.is("store_id", null);
    } else {
      planQuery = planQuery.eq("store_id", storeId);
      unitQuery = unitQuery.eq("store_id", storeId);
      miniQuery = miniQuery.eq("store_id", storeId);
    }

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
  }, [monthISO, selectedStoreId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runSave<T>(action: () => Promise<{ error: { message: string } | null }>, message: string) {
    setBusy(true);
    setErr(null);
    setOk(null);
    const { error } = await action();
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setOk(message);
      load();
    }
  }

  async function createPlan(e: FormEvent) {
    e.preventDefault();
    const base = Number(planDraft.base_rate_pct);
    const cap = Number(planDraft.rate_cap_pct);
    if (!planDraft.name.trim() || Number.isNaN(base) || Number.isNaN(cap)) {
      setErr("Plan name, base rate, and cap are required.");
      return;
    }
    await runSave(
      () => supabase.from("pay_plans").insert({
        name: planDraft.name.trim(),
        store_id: scopedStoreId,
        brand: planDraft.brand.trim() || null,
        base_rate_pct: base,
        rate_cap_pct: cap,
        active: true,
      }),
      "Pay plan added."
    );
    setPlanDraft({ name: "Salesperson plan", brand: "", base_rate_pct: "10", rate_cap_pct: "25" });
  }

  async function updatePlan(id: string, patch: Partial<PayPlan>) {
    await runSave(() => supabase.from("pay_plans").update(patch).eq("id", id), "Pay plan saved.");
  }

  async function createUnitTier(e: FormEvent) {
    e.preventDefault();
    const minUnits = Number(unitDraft.min_units);
    const rate = Number(unitDraft.rate_pct);
    if (Number.isNaN(minUnits) || Number.isNaN(rate)) {
      setErr("Minimum units and rate are required.");
      return;
    }
    await runSave(
      () => supabase.from("unit_enhancement_tiers").insert({ store_id: scopedStoreId, effective_month: monthISO, min_units: minUnits, rate_pct: rate, label: unitDraft.label.trim() || null, active: true }),
      "Unit enhancement tier added."
    );
    setUnitDraft({ min_units: "", rate_pct: "", label: "" });
  }

  async function updateUnitTier(id: string, patch: Partial<UnitTier>) {
    await runSave(() => supabase.from("unit_enhancement_tiers").update(patch).eq("id", id), "Unit enhancement tier saved.");
  }

  async function removeUnitTier(id: string) {
    await runSave(() => supabase.from("unit_enhancement_tiers").delete().eq("id", id), "Unit enhancement tier removed.");
  }

  async function createMiniTier(e: FormEvent) {
    e.preventDefault();
    const minUnits = Number(miniDraft.min_units);
    const amount = Number(miniDraft.amount);
    if (Number.isNaN(minUnits) || Number.isNaN(amount)) {
      setErr("Minimum units and mini amount are required.");
      return;
    }
    await runSave(
      () => supabase.from("mini_tiers").insert({ store_id: scopedStoreId, effective_month: monthISO, min_units: minUnits, amount, label: miniDraft.label.trim() || null, active: true }),
      "Mini tier added."
    );
    setMiniDraft({ min_units: "", amount: "", label: "" });
  }

  async function updateMiniTier(id: string, patch: Partial<MiniTier>) {
    await runSave(() => supabase.from("mini_tiers").update(patch).eq("id", id), "Mini tier saved.");
  }

  async function removeMiniTier(id: string) {
    await runSave(() => supabase.from("mini_tiers").delete().eq("id", id), "Mini tier removed.");
  }

  async function createCategory(e: FormEvent) {
    e.preventDefault();
    const key = cleanKey(categoryDraft.key || categoryDraft.label);
    if (!key || !categoryDraft.label.trim()) {
      setErr("Category key and label are required.");
      return;
    }
    await runSave(
      () => supabase.from("adjustment_category_options").insert({ key, label: categoryDraft.label.trim(), default_amount: amountOrNull(categoryDraft.default_amount), default_pct: amountOrNull(categoryDraft.default_pct), active: true, sort_order: categories.length * 10 + 10 }),
      "Adjustment category added."
    );
    setCategoryDraft({ key: "", label: "", default_amount: "", default_pct: "" });
  }

  async function updateCategory(key: string, patch: Partial<CategoryOption>) {
    await runSave(() => supabase.from("adjustment_category_options").update(patch).eq("key", key), "Adjustment category saved.");
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
            <div className="action-row">
              <div className="field">
                <label htmlFor="calc-store">Store scope</label>
                <select id="calc-store" value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
                  <option value={GLOBAL}>Global default</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field grow">
                <label>Effective month</label>
                <div className="calc-readout">{monthLabel(month)}</div>
              </div>
            </div>

            <Collapsible title="Base commission plans" count={`${plans.length} plan(s)`}>
              <div className="tablewrap">
                <table className="deals adj">
                  <thead><tr><th>Name</th><th>Brand</th><th className="r">Base %</th><th className="r">Cap %</th><th>Active</th></tr></thead>
                  <tbody>{plans.map((p) => <tr key={p.id}><td><input defaultValue={p.name} onBlur={(e) => updatePlan(p.id, { name: e.currentTarget.value })} /></td><td><input defaultValue={p.brand ?? ""} onBlur={(e) => updatePlan(p.id, { brand: e.currentTarget.value || null })} /></td><td className="r"><input className="mini" defaultValue={p.base_rate_pct} onBlur={(e) => updatePlan(p.id, { base_rate_pct: Number(e.currentTarget.value) })} /></td><td className="r"><input className="mini" defaultValue={p.rate_cap_pct} onBlur={(e) => updatePlan(p.id, { rate_cap_pct: Number(e.currentTarget.value) })} /></td><td><input type="checkbox" checked={p.active} onChange={(e) => updatePlan(p.id, { active: e.currentTarget.checked })} /></td></tr>)}</tbody>
                </table>
              </div>
              <form className="adj-form stock-form" onSubmit={createPlan}>
                <div className="field"><label>Name</label><input value={planDraft.name} onChange={(e) => setPlanDraft((p) => ({ ...p, name: e.target.value }))} /></div>
                <div className="field"><label>Brand optional</label><input value={planDraft.brand} onChange={(e) => setPlanDraft((p) => ({ ...p, brand: e.target.value }))} /></div>
                <div className="field"><label>Base %</label><input inputMode="decimal" value={planDraft.base_rate_pct} onChange={(e) => setPlanDraft((p) => ({ ...p, base_rate_pct: e.target.value }))} /></div>
                <div className="field"><label>Cap %</label><input inputMode="decimal" value={planDraft.rate_cap_pct} onChange={(e) => setPlanDraft((p) => ({ ...p, rate_cap_pct: e.target.value }))} /></div>
                <button className="btn-primary slim" disabled={busy} type="submit">Add plan</button>
              </form>
            </Collapsible>

            <Collapsible title="Unit rate enhancement" count={`${unitTiers.length} tier(s)`}>
              <div className="tablewrap"><table className="deals adj"><thead><tr><th className="r">Min units</th><th className="r">Rate %</th><th>Label</th><th>Active</th><th></th></tr></thead><tbody>{unitTiers.map((t) => <tr key={t.id}><td className="r"><input className="mini" defaultValue={t.min_units} onBlur={(e) => updateUnitTier(t.id, { min_units: Number(e.currentTarget.value) })} /></td><td className="r"><input className="mini" defaultValue={t.rate_pct} onBlur={(e) => updateUnitTier(t.id, { rate_pct: Number(e.currentTarget.value) })} /></td><td><input defaultValue={t.label ?? ""} onBlur={(e) => updateUnitTier(t.id, { label: e.currentTarget.value || null })} /></td><td><input type="checkbox" checked={t.active} onChange={(e) => updateUnitTier(t.id, { active: e.currentTarget.checked })} /></td><td className="r"><button className="btn-del" onClick={() => removeUnitTier(t.id)}>Remove</button></td></tr>)}</tbody></table></div>
              <form className="adj-form stock-form" onSubmit={createUnitTier}><div className="field"><label>Min units</label><input inputMode="decimal" value={unitDraft.min_units} onChange={(e) => setUnitDraft((p) => ({ ...p, min_units: e.target.value }))} /></div><div className="field"><label>Rate %</label><input inputMode="decimal" value={unitDraft.rate_pct} onChange={(e) => setUnitDraft((p) => ({ ...p, rate_pct: e.target.value }))} /></div><div className="field grow"><label>Label</label><input value={unitDraft.label} onChange={(e) => setUnitDraft((p) => ({ ...p, label: e.target.value }))} /></div><button className="btn-primary slim" disabled={busy} type="submit">Add tier</button></form>
            </Collapsible>

            <Collapsible title="Minis" count={`${miniTiers.length} tier(s)`}>
              <div className="tablewrap"><table className="deals adj"><thead><tr><th className="r">Min units</th><th className="r">Amount</th><th>Label</th><th>Active</th><th></th></tr></thead><tbody>{miniTiers.map((t) => <tr key={t.id}><td className="r"><input className="mini" defaultValue={t.min_units} onBlur={(e) => updateMiniTier(t.id, { min_units: Number(e.currentTarget.value) })} /></td><td className="r"><input className="mini" defaultValue={t.amount} onBlur={(e) => updateMiniTier(t.id, { amount: Number(e.currentTarget.value) })} /></td><td><input defaultValue={t.label ?? ""} onBlur={(e) => updateMiniTier(t.id, { label: e.currentTarget.value || null })} /></td><td><input type="checkbox" checked={t.active} onChange={(e) => updateMiniTier(t.id, { active: e.currentTarget.checked })} /></td><td className="r"><button className="btn-del" onClick={() => removeMiniTier(t.id)}>Remove</button></td></tr>)}</tbody></table></div>
              <form className="adj-form stock-form" onSubmit={createMiniTier}><div className="field"><label>Min units</label><input inputMode="decimal" value={miniDraft.min_units} onChange={(e) => setMiniDraft((p) => ({ ...p, min_units: e.target.value }))} /></div><div className="field"><label>Amount $</label><input inputMode="decimal" value={miniDraft.amount} onChange={(e) => setMiniDraft((p) => ({ ...p, amount: e.target.value }))} /></div><div className="field grow"><label>Label</label><input value={miniDraft.label} onChange={(e) => setMiniDraft((p) => ({ ...p, label: e.target.value }))} /></div><button className="btn-primary slim" disabled={busy} type="submit">Add mini</button></form>
            </Collapsible>

            <Collapsible title="Adjustment categories" count={`${categories.length} category option(s)`}>
              <div className="tablewrap"><table className="deals adj"><thead><tr><th>Key</th><th>Label</th><th className="r">Default $</th><th className="r">Default %</th><th>Active</th></tr></thead><tbody>{categories.map((c) => <tr key={c.key}><td className="num">{c.key}</td><td><input defaultValue={c.label} onBlur={(e) => updateCategory(c.key, { label: e.currentTarget.value })} /></td><td className="r"><input className="mini" defaultValue={c.default_amount ?? ""} onBlur={(e) => updateCategory(c.key, { default_amount: amountOrNull(e.currentTarget.value) })} /></td><td className="r"><input className="mini" defaultValue={c.default_pct ?? ""} onBlur={(e) => updateCategory(c.key, { default_pct: amountOrNull(e.currentTarget.value) })} /></td><td><input type="checkbox" checked={c.active} onChange={(e) => updateCategory(c.key, { active: e.currentTarget.checked })} /></td></tr>)}</tbody></table></div>
              <form className="adj-form stock-form" onSubmit={createCategory}><div className="field"><label>Key</label><input value={categoryDraft.key} onChange={(e) => setCategoryDraft((p) => ({ ...p, key: e.target.value }))} /></div><div className="field"><label>Label</label><input value={categoryDraft.label} onChange={(e) => setCategoryDraft((p) => ({ ...p, label: e.target.value }))} /></div><div className="field"><label>Default $</label><input inputMode="decimal" value={categoryDraft.default_amount} onChange={(e) => setCategoryDraft((p) => ({ ...p, default_amount: e.target.value }))} /></div><div className="field"><label>Default %</label><input inputMode="decimal" value={categoryDraft.default_pct} onChange={(e) => setCategoryDraft((p) => ({ ...p, default_pct: e.target.value }))} /></div><button className="btn-primary slim" disabled={busy} type="submit">Add category</button></form>
            </Collapsible>
          </>
        )}
        {isAdmin && loading && <div className="loading">Loading calculations…</div>}
      </main>
    </>
  );
}

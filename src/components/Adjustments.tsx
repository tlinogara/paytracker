import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { Adjustment, RepMtd } from "../lib/types";
import { moneyExact, shortDate } from "../lib/format";

type CategoryOption = {
  key: string;
  label: string;
  default_amount: number | null;
  default_pct: number | null;
  active: boolean;
  sort_order: number;
};

const FALLBACK_CATEGORIES: CategoryOption[] = [
  { key: "spiff", label: "Spiff", default_amount: null, default_pct: null, active: true, sort_order: 10 },
  { key: "enhancer", label: "Enhancer", default_amount: null, default_pct: null, active: true, sort_order: 20 },
  { key: "enhanced_mini", label: "Enhanced Mini", default_amount: null, default_pct: null, active: true, sort_order: 30 },
  { key: "trade_spiff", label: "Trade Spiff", default_amount: null, default_pct: null, active: true, sort_order: 40 },
  { key: "buy_fee", label: "Buy Fee", default_amount: null, default_pct: null, active: true, sort_order: 50 },
  { key: "correction", label: "Correction", default_amount: null, default_pct: null, active: true, sort_order: 60 },
  { key: "draw", label: "Draw", default_amount: null, default_pct: null, active: true, sort_order: 70 },
  { key: "prior_month", label: "Prior Month Adjustment", default_amount: null, default_pct: null, active: true, sort_order: 80 },
  { key: "carryover", label: "Carryover", default_amount: null, default_pct: null, active: true, sort_order: 90 },
  { key: "other", label: "Other", default_amount: null, default_pct: null, active: true, sort_order: 100 },
];

function numberInput(value: number | null | undefined): string {
  if (value == null) return "";
  return Number(value).toString();
}

export default function Adjustments({
  entries,
  canEdit,
  monthISO,
  reps,
  fgsByRep,
  defaultStore,
  selectedRep,
  onChanged,
}: {
  entries: Adjustment[];
  canEdit: boolean;
  monthISO: string;
  reps: RepMtd[];
  fgsByRep: Map<string, number>;
  defaultStore: string | null;
  selectedRep: string | null;
  onChanged: () => void;
}) {
  const [categories, setCategories] = useState<CategoryOption[]>(FALLBACK_CATEGORIES);
  const [rep, setRep] = useState(selectedRep ?? "");
  const [category, setCategory] = useState("spiff");
  const [amount, setAmount] = useState("");
  const [pct, setPct] = useState("");
  const [dealNumber, setDealNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const repValue = selectedRep ?? rep;

  useEffect(() => {
    supabase
      .from("adjustment_category_options")
      .select("key,label,default_amount,default_pct,active,sort_order")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        const active = ((data ?? []) as CategoryOption[]).filter((row) => row.key && row.label);
        if (active.length > 0) setCategories(active);
      });
  }, []);

  useEffect(() => {
    if (!categories.some((c) => c.key === category)) {
      setCategory(categories[0]?.key ?? "other");
    }
  }, [categories, category]);

  const categoryByKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories]);

  function setCategoryAndDefaults(nextKey: string) {
    setCategory(nextKey);
    const next = categoryByKey.get(nextKey);
    if (!next) return;
    if (amount.trim() === "" && pct.trim() === "") {
      setAmount(numberInput(next.default_amount));
      setPct(numberInput(next.default_pct));
    }
  }

  function categoryLabel(key: string): string {
    return categoryByKey.get(key)?.label ?? FALLBACK_CATEGORIES.find((c) => c.key === key)?.label ?? key;
  }

  function enhancerDollars(a: Adjustment): number {
    if (a.pct == null) return a.amount ?? 0;
    return Math.round(((a.pct / 100) * (fgsByRep.get(a.rep) ?? 0)) * 100) / 100;
  }

  async function refreshPreview(storeId: string | null | undefined) {
    const { error } = await supabase.rpc("refresh_commission_preview", {
      p_month: monthISO,
      p_store_id: storeId ?? null,
    });
    if (error) throw error;
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const amt = amount.trim() === "" ? null : Number(amount);
    const p = pct.trim() === "" ? null : Number(pct);
    if ((amt == null) === (p == null)) {
      setErr("Enter a dollar amount or a percentage, not both.");
      return;
    }
    if ((amt != null && Number.isNaN(amt)) || (p != null && Number.isNaN(p))) {
      setErr("That number does not parse. Check the amount or percent field.");
      return;
    }
    const theRep = repValue.trim();
    const repRow = reps.find((r) => r.rep === theRep);
    const store = defaultStore ?? repRow?.dealer ?? null;
    if (!theRep || !store) {
      setErr("Pick a salesperson and make sure the account has a store.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("adjustments").insert({
      rep: theRep,
      store,
      employee_id: repRow?.employee_id ?? null,
      store_id: repRow?.store_id ?? null,
      month: monthISO,
      deal_number: dealNumber.trim() || null,
      category,
      amount: amt,
      pct: p,
      note: note.trim() || null,
    });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    try {
      await refreshPreview(repRow?.store_id ?? null);
    } catch (refreshError) {
      setBusy(false);
      setErr(refreshError instanceof Error ? refreshError.message : "The adjustment saved, but commission refresh failed.");
      return;
    }
    setBusy(false);
    setAmount("");
    setPct("");
    setDealNumber("");
    setNote("");
    onChanged();
  }

  async function remove(a: Adjustment) {
    setErr(null);
    const { error } = await supabase.from("adjustments").delete().eq("id", a.id);
    if (error) {
      setErr(error.message);
      return;
    }
    try {
      await refreshPreview(a.store_id ?? null);
      onChanged();
    } catch (refreshError) {
      setErr(refreshError instanceof Error ? refreshError.message : "The entry was removed, but commission refresh failed.");
    }
  }

  return (
    <>
      {err && <div className="notice">{err}</div>}
      {canEdit && (
        <form className="adj-form" onSubmit={add}>
          <div className="field">
            <label htmlFor="adj-rep">Salesperson</label>
            <input id="adj-rep" list="rep-options" required value={repValue} onChange={(e) => setRep(e.target.value)} />
            <datalist id="rep-options">
              {reps.map((r) => <option key={r.rep} value={r.rep} />)}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="adj-cat">Type</label>
            <select id="adj-cat" value={category} onChange={(e) => setCategoryAndDefaults(e.target.value)}>
              {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="adj-amt">Amount $</label><input id="adj-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500 or -250" /></div>
          <div className="field"><label htmlFor="adj-pct">or %</label><input id="adj-pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="1.25" /></div>
          <div className="field"><label htmlFor="adj-deal">Deal #</label><input id="adj-deal" value={dealNumber} onChange={(e) => setDealNumber(e.target.value)} /></div>
          <div className="field grow"><label htmlFor="adj-note">Note</label><input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason or source" /></div>
          <button className="btn-primary slim" disabled={busy} type="submit">{busy ? "Saving…" : "Add entry"}</button>
        </form>
      )}
      {entries.length === 0 ? (
        <div className="tablewrap">
          <div className="empty">No manual entries for this month{selectedRep ? ` for ${selectedRep}` : ""}.</div>
        </div>
      ) : (
        <div className="tablewrap">
          <table className="deals adj">
            <thead>
              <tr>
                <th>Rep</th>
                <th>Type</th>
                <th className="r">Value</th>
                <th>Deal</th>
                <th>Note</th>
                <th>Entered</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((a) => {
                const displayAmount = a.pct != null ? enhancerDollars(a) : a.amount ?? 0;
                return (
                  <tr key={a.id}>
                    <td>{a.rep}</td>
                    <td><span className={`badge cat-${a.category}`}>{categoryLabel(a.category)}</span></td>
                    <td className={`r money ${displayAmount < 0 ? "neg" : "pos"}`}>
                      {a.pct != null ? <>{a.pct}% <span className="deal-no">≈ {moneyExact(displayAmount)}</span></> : moneyExact(a.amount)}
                    </td>
                    <td>{a.deal_number ? <span className="deal-no">#{a.deal_number}</span> : "—"}</td>
                    <td className="note-cell">{a.note || "—"}</td>
                    <td className="num">{shortDate(a.created_at.slice(0, 10))}</td>
                    {canEdit && <td className="r"><button className="btn-del" onClick={() => remove(a)}>Remove</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

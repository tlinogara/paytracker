import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { Adjustment, AdjCategory, RepMtd } from "../lib/types";
import { moneyExact, shortDate } from "../lib/format";

const CATEGORY_LABEL: Record<string, string> = {
  spiff: "Spiff",
  enhancer: "Enhancer",
  enhanced_mini: "Enhanced Mini",
  trade_spiff: "Trade Spiff",
  buy_fee: "Buy Fee",
  correction: "Correction",
  other: "Other",
};

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
  const [rep, setRep] = useState(selectedRep ?? "");
  const [category, setCategory] = useState("spiff");
  const [amount, setAmount] = useState("");
  const [pct, setPct] = useState("");
  const [dealNumber, setDealNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const repValue = selectedRep ?? rep;

  function enhancerDollars(a: Adjustment): number {
    if (a.pct == null) return a.amount ?? 0;
    return Math.round(((a.pct / 100) * (fgsByRep.get(a.rep) ?? 0)) * 100) / 100;
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
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setAmount("");
    setPct("");
    setDealNumber("");
    setNote("");
    onChanged();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("adjustments").delete().eq("id", id);
    if (error) setErr(error.message);
    else onChanged();
  }

  return (
    <>
      {err && <div className="notice">{err}</div>}
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
              {entries.map((a) => (
                <tr key={a.id}>
                  <td>{a.rep}</td>
                  <td><span className={`badge cat-${a.category}`}>{CATEGORY_LABEL[a.category] ?? a.category}</span></td>
                  <td className="r money pos">
                    {a.pct != null ? <>{a.pct}% <span className="deal-no">≈ {moneyExact(enhancerDollars(a))}</span></> : moneyExact(a.amount)}
                  </td>
                  <td>{a.deal_number ? <span className="deal-no">#{a.deal_number}</span> : "—"}</td>
                  <td className="note-cell">{a.note || "—"}</td>
                  <td className="num">{shortDate(a.created_at.slice(0, 10))}</td>
                  {canEdit && <td className="r"><button className="btn-del" onClick={() => remove(a.id)}>Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
            <select id="adj-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="spiff">Spiff</option>
              <option value="enhancer">Enhancer</option>
              <option value="enhanced_mini">Enhanced Mini</option>
              <option value="trade_spiff">Trade Spiff</option>
              <option value="buy_fee">Buy Fee</option>
              <option value="correction">Correction</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field"><label htmlFor="adj-amt">Amount $</label><input id="adj-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" /></div>
          <div className="field"><label htmlFor="adj-pct">or %</label><input id="adj-pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="1.25" /></div>
          <div className="field"><label htmlFor="adj-deal">Deal #</label><input id="adj-deal" value={dealNumber} onChange={(e) => setDealNumber(e.target.value)} /></div>
          <div className="field grow"><label htmlFor="adj-note">Note</label><input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason or source" /></div>
          <button className="btn-primary slim" disabled={busy} type="submit">{busy ? "Saving…" : "Add entry"}</button>
        </form>
      )}
    </>
  );
}

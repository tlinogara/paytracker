import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { Adjustment, AdjCategory } from "../lib/types";
import { moneyExact, shortDate } from "../lib/format";

const CATEGORY_LABEL: Record<AdjCategory, string> = {
  spiff: "Spiff",
  enhancer: "Enhancer",
  correction: "Correction",
  other: "Other",
};

export default function Adjustments({
  entries,
  canEdit,
  monthISO,
  reps,
  defaultStore,
  selectedRep,
  onChanged,
}: {
  entries: Adjustment[];
  canEdit: boolean;
  monthISO: string;
  reps: string[];
  defaultStore: string | null;
  selectedRep: string | null;
  onChanged: () => void;
}) {
  const [rep, setRep] = useState(selectedRep ?? "");
  const [category, setCategory] = useState<AdjCategory>("spiff");
  const [amount, setAmount] = useState("");
  const [pct, setPct] = useState("");
  const [dealNumber, setDealNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep the form's rep in sync when a manager taps a different rep.
  const repValue = selectedRep ?? rep;

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const amt = amount.trim() === "" ? null : Number(amount);
    const p = pct.trim() === "" ? null : Number(pct);
    if ((amt == null) === (p == null)) {
      setErr("Enter a dollar amount OR a percentage — exactly one.");
      return;
    }
    if ((amt != null && Number.isNaN(amt)) || (p != null && Number.isNaN(p))) {
      setErr("That number doesn't parse. Check the amount/percent fields.");
      return;
    }
    const theRep = repValue.trim();
    if (!theRep) {
      setErr("Pick a salesperson.");
      return;
    }
    const store = defaultStore ?? null;
    if (!store) {
      setErr(
        "Your profile has no store set — ask the admin to fill in store_name on your profile."
      );
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("adjustments").insert({
      rep: theRep,
      store,
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
          <div className="empty">
            No manual entries for this month{selectedRep ? ` for ${selectedRep}` : ""}.
            {canEdit ? " Add the first one below." : ""}
          </div>
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
                // A rate (rate_pct from an approved rule, or a manual pct) folds
                // into the rep's per-deal commission rate and is paid by the
                // engine — mini-aware. Flat dollars are added on top as-is.
                const rate = a.rate_pct ?? a.pct;
                const isRate = rate != null;
                return (
                  <tr key={a.id}>
                    <td>{a.rep}</td>
                    <td>
                      <span className={`badge cat-${a.category}`}>
                        {CATEGORY_LABEL[a.category]}
                      </span>
                    </td>
                    <td className="r money pos">
                      {isRate ? (
                        <>
                          +{rate}%{" "}
                          <span className="deal-no">in rate</span>
                        </>
                      ) : (
                        moneyExact(a.amount)
                      )}
                    </td>
                    <td>
                      {a.deal_number ? (
                        <span className="deal-no">#{a.deal_number}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="note-cell">{a.note || "—"}</td>
                    <td className="num">{shortDate(a.created_at.slice(0, 10))}</td>
                    {canEdit && (
                      <td className="r">
                        <button
                          className="btn-del"
                          aria-label="Delete entry"
                          onClick={() => remove(a.id)}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <form className="adj-form" onSubmit={add}>
          <div className="field">
            <label htmlFor="adj-rep">Salesperson</label>
            <input
              id="adj-rep"
              list="rep-options"
              required
              value={repValue}
              onChange={(e) => setRep(e.target.value)}
              placeholder="Exactly as on the deal log"
            />
            <datalist id="rep-options">
              {reps.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="adj-cat">Type</label>
            <select
              id="adj-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as AdjCategory)}
            >
              <option value="spiff">Spiff</option>
              <option value="enhancer">Enhancer</option>
              <option value="correction">Correction</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="adj-amt">Amount $</label>
            <input
              id="adj-amt"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500 or -150"
            />
          </div>
          <div className="field">
            <label htmlFor="adj-pct">or % (folds into rate)</label>
            <input
              id="adj-pct"
              inputMode="decimal"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="1.25"
            />
          </div>
          <div className="field">
            <label htmlFor="adj-deal">Deal # (optional)</label>
            <input
              id="adj-deal"
              value={dealNumber}
              onChange={(e) => setDealNumber(e.target.value)}
            />
          </div>
          <div className="field grow">
            <label htmlFor="adj-note">Note</label>
            <input
              id="adj-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. May McLaren enhancer, 2 priority-list cars"
            />
          </div>
          <button className="btn-primary slim" disabled={busy} type="submit">
            {busy ? "Saving…" : "Add entry"}
          </button>
        </form>
      )}
    </>
  );
}

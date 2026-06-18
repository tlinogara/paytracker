import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { PayPlan } from "../lib/types";

const ALL_STORES = "All stores";

// Manager/admin editor for the base commission rate and mini (floor) used by
// the per-deal engine. No plan for a rep/store falls back to 10% / $1,500,
// which matches every 2026 O'Gara plan — so this is only needed to record an
// exception (a different base rate, or a $1,750 mini).
export default function PayPlans({
  monthISO,
  monthName,
  stores,
  reps,
  defaultStore,
  isAdmin,
}: {
  monthISO: string;
  monthName: string;
  stores: string[];
  reps: string[];
  defaultStore: string | null;
  isAdmin: boolean;
}) {
  const [plans, setPlans] = useState<PayPlan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [store, setStore] = useState<string>(defaultStore ?? "");
  const [rep, setRep] = useState("");
  const [basePct, setBasePct] = useState("10");
  const [mini, setMini] = useState("1500");

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase
      .from("pay_plans")
      .select("*")
      .eq("month", monthISO)
      .order("store_name", { nullsFirst: true })
      .order("rep_name", { nullsFirst: true });
    if (error) setErr(error.message);
    else setPlans((data ?? []) as PayPlan[]);
  }, [monthISO]);

  useEffect(() => {
    load();
  }, [load]);

  const storeOptions = useMemo(() => {
    const set = new Set(stores.filter(Boolean));
    if (defaultStore) set.add(defaultStore);
    return [...set].sort();
  }, [stores, defaultStore]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const bp = Number(basePct);
    const mn = Number(mini);
    if (Number.isNaN(bp) || Number.isNaN(mn) || bp < 0 || mn < 0) {
      setErr("Base % and mini must be valid non-negative numbers.");
      return;
    }
    const storeVal =
      store === ALL_STORES ? null : store.trim() === "" ? null : store.trim();
    if (!isAdmin && !storeVal) {
      setErr("Managers must choose their store (only admins can set an all-stores plan).");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("pay_plans").upsert(
      {
        month: monthISO,
        store_name: storeVal,
        rep_name: rep.trim() || null,
        base_pct: bp,
        mini: mn,
      },
      { onConflict: "month,store_name,rep_name" }
    );
    setBusy(false);
    if (error) {
      setErr(
        error.message.includes("duplicate") || error.message.includes("conflict")
          ? "A plan for that exact scope already exists this month — remove it first to change it."
          : error.message
      );
      return;
    }
    setRep("");
    setBasePct("10");
    setMini("1500");
    load();
  }

  async function remove(id: string) {
    setErr(null);
    const { error } = await supabase.from("pay_plans").delete().eq("id", id);
    if (error) setErr(error.message);
    else setPlans((p) => p.filter((x) => x.id !== id));
  }

  return (
    <>
      <div className="section-head">
        <h2>Pay plans</h2>
        <span className="count">base rate &amp; mini for {monthName}</span>
      </div>
      {err && <div className="notice">{err}</div>}

      <div className="tablewrap">
        <table className="deals adj">
          <thead>
            <tr>
              <th>Store</th>
              <th>Rep</th>
              <th className="r">Base %</th>
              <th className="r">Mini</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{ALL_STORES}</td>
              <td>Everyone</td>
              <td className="r num">10%</td>
              <td className="r money">$1,500</td>
              <td className="r">
                <span className="deal-no">default</span>
              </td>
            </tr>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>{p.store_name ?? ALL_STORES}</td>
                <td>{p.rep_name ?? "Store default"}</td>
                <td className="r num">{p.base_pct}%</td>
                <td className="r money">
                  {p.mini.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  })}
                </td>
                <td className="r">
                  <button className="btn-del" onClick={() => remove(p.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="adj-form" onSubmit={add}>
        <div className="field">
          <label htmlFor="pp-store">Store</label>
          <input
            id="pp-store"
            list="pp-store-options"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            placeholder={isAdmin ? "or All stores" : "your store"}
          />
          <datalist id="pp-store-options">
            {isAdmin && <option value={ALL_STORES} />}
            {storeOptions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="pp-rep">Rep (optional)</label>
          <input
            id="pp-rep"
            list="pp-rep-options"
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            placeholder="blank = store default"
          />
          <datalist id="pp-rep-options">
            {reps.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="pp-base">Base %</label>
          <input
            id="pp-base"
            inputMode="decimal"
            value={basePct}
            onChange={(e) => setBasePct(e.target.value)}
            placeholder="10"
          />
        </div>
        <div className="field">
          <label htmlFor="pp-mini">Mini $</label>
          <input
            id="pp-mini"
            inputMode="decimal"
            value={mini}
            onChange={(e) => setMini(e.target.value)}
            placeholder="1500"
          />
        </div>
        <div className="field grow">
          <label>&nbsp;</label>
          <span className="starter-note">
            Most specific match wins: rep + store beats store, which beats all
            stores. No plan = 10% base, $1,500 mini.
          </span>
        </div>
        <button className="btn-primary slim" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save plan"}
        </button>
      </form>
    </>
  );
}

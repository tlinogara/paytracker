import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export type ManualEnhancerRow = {
  rule_id: string;
  month: string;
  store_id: string;
  brand: string;
  label: string;
  pct: number | null;
  flat_amount: number | null;
  employee_id: string;
  rep: string;
  dealer: string | null;
  brand_front_gross: number;
  total_commissionable_gross: number;
  proposed_amount: number;
  approved: boolean;
  adjustment_id: string | null;
};

type Props = {
  monthISO: string;
  scopedStoreIds: string[];
  disabled?: boolean;
  onChanged?: () => Promise<void> | void;
};

function pctLabel(row: ManualEnhancerRow) {
  if (row.pct != null) return `${Number(row.pct).toFixed(2)}%`;
  if (row.flat_amount != null) return money.format(Number(row.flat_amount));
  return "";
}

export default function ManualEnhancerReview({ monthISO, scopedStoreIds, disabled, onChanged }: Props) {
  const [rows, setRows] = useState<ManualEnhancerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    let query = supabase
      .from("manual_enhancer_status")
      .select("*")
      .eq("month", monthISO)
      .order("brand")
      .order("label")
      .order("rep");
    if (scopedStoreIds.length === 1) query = query.eq("store_id", scopedStoreIds[0]);
    else if (scopedStoreIds.length > 1) query = query.in("store_id", scopedStoreIds);
    const { data, error } = await query;
    if (error) setErr(error.message);
    else setRows((data ?? []) as ManualEnhancerRow[]);
    setLoading(false);
  }, [monthISO, scopedStoreIds]);

  useEffect(() => {
    void load();
  }, [load]);

  const approvedCount = useMemo(() => rows.filter((row) => row.approved).length, [rows]);

  async function setApproval(row: ManualEnhancerRow, approved: boolean) {
    const key = `${row.rule_id}:${row.employee_id}`;
    setBusyKey(key);
    setErr(null);
    setOk(null);
    const { error } = await supabase.rpc("set_manual_enhancer_approval", {
      p_rule_id: row.rule_id,
      p_employee_id: row.employee_id,
      p_approved: approved,
    });
    setBusyKey(null);
    if (error) {
      setErr(error.message);
      return;
    }
    setOk(`${row.rep} ${approved ? "approved" : "removed"} for ${row.brand}: ${row.label}.`);
    await load();
    await onChanged?.();
  }

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>Manual enhancer review</h2>
          <p className="muted">Toggle manual brand enhancers by rep. Yes creates the enhancer adjustment; No removes it and refreshes commissions.</p>
        </div>
        <span className="pill">{approvedCount}/{rows.length} approved</span>
      </div>
      {err && <div className="notice">{err}</div>}
      {ok && <div className="form-msg ok">{ok}</div>}
      {loading ? <div className="loading">Loading manual enhancers…</div> : null}
      <div className="tablewrap">
        <table className="deals adj">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Manual enhancer</th>
              <th>Rep</th>
              <th className="r">Rate</th>
              <th className="r">Proposed</th>
              <th className="r">Brand gross</th>
              <th>Approved</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = `${row.rule_id}:${row.employee_id}`;
              const rowBusy = disabled || busyKey === key;
              return (
                <tr key={key}>
                  <td>{row.brand}</td>
                  <td>{row.label}</td>
                  <td>{row.rep}</td>
                  <td className="r">{pctLabel(row)}</td>
                  <td className="r">{money.format(Number(row.proposed_amount ?? 0))}</td>
                  <td className="r">{money.format(Number(row.brand_front_gross ?? 0))}</td>
                  <td className="action-cell">
                    <button type="button" className={row.approved ? "btn-approve" : "btn-secondary"} disabled={rowBusy || row.approved} onClick={() => setApproval(row, true)}>Yes</button>
                    <button type="button" className={!row.approved ? "btn-del" : "btn-secondary"} disabled={rowBusy || !row.approved} onClick={() => setApproval(row, false)}>No</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading ? <tr><td colSpan={7} className="muted">No manual enhancer rows for this month and store scope.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

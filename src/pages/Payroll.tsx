import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { useMonth } from "../lib/useMonth";
import type { CommissionRun, Profile, RepMtd } from "../lib/types";
import { formatPacificDateTime, moneyExact, monthLabel, monthStartISO, units } from "../lib/format";
import Topbar from "../components/Topbar";
import MonthBar from "../components/MonthBar";
import Collapsible from "../components/Collapsible";

function appRole(role: string | null | undefined) {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return role ?? "sales_rep";
}

export default function Payroll({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const { month, setMonth, isCurrentMonth } = useMonth();
  const [runs, setRuns] = useState<CommissionRun[]>([]);
  const [mtd, setMtd] = useState<RepMtd[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const monthISO = monthStartISO(month);
  const role = appRole(profile?.role);
  const canPayroll = role === "payroll_manager" || role === "admin";
  const canUnlock = role === "admin";

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => setProfile((data as Profile) ?? null));
  }, [session.user.id]);

  async function load() {
    const [runRes, mtdRes] = await Promise.all([
      supabase.from("commission_runs").select("*").eq("month", monthISO).order("created_at", { ascending: false }),
      supabase.from("rep_mtd").select("*").eq("month", monthISO).order("total_commission", { ascending: false }),
    ]);
    if (runRes.error) setErr(runRes.error.message); else setRuns((runRes.data ?? []) as CommissionRun[]);
    if (mtdRes.error) setErr(mtdRes.error.message); else setMtd((mtdRes.data ?? []) as RepMtd[]);
  }

  useEffect(() => { load(); }, [monthISO]);

  async function refresh() {
    setBusy(true); setErr(null); setOk(null);
    const { error } = await supabase.rpc("refresh_commission_preview", { p_month: monthISO, p_store_id: null });
    setBusy(false);
    if (error) setErr(error.message); else { setOk(`Refreshed ${monthLabel(month)} commission preview.`); load(); }
  }

  async function lockRun(id: string) {
    setBusy(true); setErr(null); setOk(null);
    const { error } = await supabase.rpc("lock_commission_run", { p_run_id: id });
    setBusy(false);
    if (error) setErr(error.message); else { setOk("Commission run locked."); load(); }
  }

  async function unlockRun(id: string) {
    setBusy(true); setErr(null); setOk(null);
    const { error } = await supabase.rpc("unlock_commission_run", { p_run_id: id });
    setBusy(false);
    if (error) setErr(error.message); else { setOk("Commission run unlocked."); load(); }
  }

  return <><Topbar profile={profile} /><main className="page"><MonthBar month={month} isCurrentMonth={isCurrentMonth} setMonth={setMonth} labelSuffix="payroll" />{err && <div className="notice">{err}</div>}{ok && <div className="form-msg ok">{ok}</div>}{!canPayroll && profile && <div className="notice">Only payroll managers and admins can refresh or lock commission runs.</div>}<Collapsible title="Payroll actions" count={canUnlock ? "admin unlock enabled" : "refresh preview"}>{canPayroll ? <div className="action-row"><button className="btn-primary slim" disabled={busy} onClick={refresh}>{busy ? "Working…" : "Refresh preview"}</button></div> : <div className="tablewrap"><div className="empty">No payroll actions are available for this role.</div></div>}</Collapsible><Collapsible title="Commission runs" count={`${runs.length} run(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th>Store</th><th>Status</th><th>Refreshed</th><th>Locked</th>{canPayroll && <th></th>}</tr></thead><tbody>{runs.map((r) => <tr key={r.id}><td>{r.store_name ?? "All stores"}</td><td><span className={`badge cat-${r.status === "locked" ? "enhancer" : "other"}`}>{r.status}</span></td><td className="num">{formatPacificDateTime(r.refreshed_at)}</td><td className="num">{formatPacificDateTime(r.locked_at)}</td>{canPayroll && <td className="r action-cell">{r.status === "preview" && <button className="btn-approve" disabled={busy} onClick={() => lockRun(r.id)}>Lock</button>}{canUnlock && r.status !== "preview" && <button className="btn-del" disabled={busy} onClick={() => unlockRun(r.id)}>Unlock</button>}</td>}</tr>)}</tbody></table></div></Collapsible><Collapsible title="Payroll summary" count={`${mtd.length} rep(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th>Rep</th><th>Store</th><th className="r">Units</th><th className="r">New</th><th className="r">Used</th><th className="r">Front gross</th><th className="r">Commission</th></tr></thead><tbody>{mtd.map((r) => <tr key={`${r.employee_id}-${r.month}`}><td>{r.rep}</td><td>{r.dealer ?? "—"}</td><td className="r num">{units(r.units)}</td><td className="r num">{units(r.new_units)}</td><td className="r num">{units(r.used_units)}</td><td className="r money">{moneyExact(r.front_gross_share)}</td><td className="r money pos">{moneyExact(r.total_commission)}</td></tr>)}</tbody></table></div></Collapsible></main></>;
}

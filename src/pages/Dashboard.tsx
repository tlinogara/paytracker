import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMonth } from "../lib/useMonth";
import { supabase } from "../lib/supabase";
import type { Adjustment, CommissionLine, DealRow, Profile, RepMtd } from "../lib/types";
import { money, moneyExact, monthLabel, monthStartISO, nextMonthISO, units } from "../lib/format";
import Topbar from "../components/Topbar";
import MonthBar from "../components/MonthBar";
import DealsTable from "../components/DealsTable";
import Adjustments from "../components/Adjustments";
import Collapsible from "../components/Collapsible";

const DEAL_COLUMNS = "deal_id, employee_id, store_id, deal_number, rep, contract_date, status, stock_type, customer, vehicle, front_gross, rep_unit_count, rep_commission, is_split_deal, salesperson, dealer, make";

export default function Dashboard({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const { month, monthParam, setMonth, isCurrentMonth } = useMonth();
  const [mtd, setMtd] = useState<RepMtd[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [lines, setLines] = useState<CommissionLine[]>([]);
  const [selectedRep, setSelectedRep] = useState<string | null>(null);
  const [showAllReps, setShowAllReps] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataErr, setDataErr] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) setProfileErr(error.message);
        else setProfile(data as Profile);
      });
  }, [session.user.id]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setDataErr(null);
    const start = monthStartISO(month);
    const end = nextMonthISO(month);
    const mtdQuery = supabase.from("rep_mtd").select("*").eq("month", start).order("total_commission", { ascending: false });
    let dealsQuery = supabase.from("deals").select(DEAL_COLUMNS).gte("contract_date", start).lt("contract_date", end).neq("rep", "").order("contract_date", { ascending: false }).limit(1000);
    let adjQuery = supabase.from("adjustments").select("*").eq("month", start).order("created_at", { ascending: false });
    let lineQuery = supabase.from("commission_line_detail").select("*").eq("month", start).order("created_at", { ascending: false }).limit(500);
    if (selectedRep) {
      dealsQuery = dealsQuery.eq("rep", selectedRep);
      adjQuery = adjQuery.eq("rep", selectedRep);
      lineQuery = lineQuery.eq("rep", selectedRep);
    }
    const [mtdRes, dealsRes, adjRes, lineRes] = await Promise.all([mtdQuery, dealsQuery, adjQuery, lineQuery]);
    if (mtdRes.error) setDataErr(mtdRes.error.message);
    else setMtd((mtdRes.data ?? []) as RepMtd[]);
    if (dealsRes.error) setDataErr(dealsRes.error.message);
    else setDeals((dealsRes.data ?? []) as DealRow[]);
    if (adjRes.error) setDataErr(adjRes.error.message);
    else setAdjustments((adjRes.data ?? []) as Adjustment[]);
    if (lineRes.error) setDataErr(lineRes.error.message);
    else setLines((lineRes.data ?? []) as CommissionLine[]);
    setLoading(false);
  }, [month, selectedRep]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isManagerView = profile?.role === "manager" || profile?.role === "payroll" || profile?.role === "admin";

  const scoped = useMemo(() => {
    const rows = selectedRep ? mtd.filter((r) => r.rep === selectedRep) : mtd;
    const sum = (f: (r: RepMtd) => number | null) => rows.reduce((a, r) => a + (f(r) ?? 0), 0);
    return {
      units: sum((r) => r.units),
      newUnits: sum((r) => r.new_units),
      usedUnits: sum((r) => r.used_units),
      frontGross: sum((r) => r.front_gross_share),
      commission: sum((r) => r.total_commission),
      reps: rows.length,
    };
  }, [mtd, selectedRep]);

  const fgsByRep = useMemo(() => {
    const out = new Map<string, number>();
    for (const r of mtd) out.set(r.rep, r.front_gross_share ?? 0);
    return out;
  }, [mtd]);

  const acqUnits = useMemo(() => deals.reduce((a, d) => a + (!d.make || !d.make.trim() ? (d.rep_unit_count ?? 0) : 0), 0), [deals]);

  const formStore = profile?.store_name || (selectedRep ? mtd.find((r) => r.rep === selectedRep)?.dealer ?? null : null) || (mtd.length > 0 ? mtd[0].dealer : null);
  const scopeLabel = selectedRep ? selectedRep : profile?.role === "rep" ? (profile.rep_name ?? "") : `Team · ${scoped.reps} rep${scoped.reps === 1 ? "" : "s"}`;

  return (
    <>
      <Topbar profile={profile} />
      <main className="page">
        {profileErr && <div className="notice">Could not load your profile. {profileErr}</div>}
        {dataErr && <div className="notice">Could not load data. {dataErr}</div>}
        {profile?.role === "rep" && profile && !profile.employee_id && <div className="notice">Your login is not linked to an employee record yet.</div>}
        <MonthBar month={month} isCurrentMonth={isCurrentMonth} setMonth={setMonth} />
        {selectedRep && <button className="btn-step wide" onClick={() => setSelectedRep(null)}>Clear filter: {selectedRep}</button>}
        <section className="sticker" aria-label="Month summary">
          <div className="sticker-head">
            <span className="sticker-title">{isCurrentMonth ? "Month to date" : monthLabel(month)}</span>
            <span className="sticker-sub">{scopeLabel}{profile?.store_name ? ` · ${profile.store_name}` : ""} · server calculated</span>
          </div>
          <div className="sticker-body">
            <div className="cell hero"><div className="k">Commission</div><div className="v">{moneyExact(scoped.commission)}</div></div>
            <div className="cell"><div className="k">Units</div><div className="v">{units(scoped.units)}</div></div>
            <div className="cell"><div className="k">New</div><div className="v">{units(scoped.newUnits)}</div></div>
            <div className="cell"><div className="k">Used</div><div className="v">{units(scoped.usedUnits)}</div></div>
            <div className="cell"><div className="k">Acq</div><div className="v">{units(acqUnits)}</div></div>
            <div className="cell"><div className="k">Front gross</div><div className="v">{money(scoped.frontGross)}<small>unit weighted</small></div></div>
          </div>
        </section>
        {isManagerView && mtd.length > 0 && (
          <>
            <div className="section-head"><h2>Team</h2><span className="count">tap a rep to filter</span></div>
            <div className="team-grid">
              {(showAllReps ? mtd : mtd.slice(0, 8)).map((r) => (
                <button key={r.rep} className={`team-card ${selectedRep === r.rep ? "active" : ""}`} onClick={() => setSelectedRep(selectedRep === r.rep ? null : r.rep)}>
                  <span className="name">{r.rep}</span>
                  <span className="meta">{units(r.units)} u · <b>{money(r.total_commission)}</b></span>
                </button>
              ))}
            </div>
            {mtd.length > 8 && <button className="btn-showall" onClick={() => setShowAllReps((v) => !v)}>{showAllReps ? "Show fewer" : `Show all ${mtd.length} reps`}</button>}
          </>
        )}
        <div className="section-head"><h2>Deals</h2><span className="count">{loading ? "loading…" : `${deals.length} row(s)`}</span></div>
        {loading ? <div className="tablewrap"><div className="loading">Loading deals…</div></div> : <DealsTable deals={deals} showRep={isManagerView && !selectedRep} />}
        {(isManagerView || adjustments.length > 0) && (
          <Collapsible title="Spiffs and adjustments" count={isManagerView ? "manager entered inputs" : "entered by management"} defaultOpen={false}>
            <Adjustments key={`${monthStartISO(month)}-${selectedRep ?? "all"}`} entries={adjustments} canEdit={isManagerView} monthISO={monthStartISO(month)} reps={mtd} fgsByRep={fgsByRep} defaultStore={formStore} selectedRep={selectedRep} onChanged={loadData} />
          </Collapsible>
        )}
        <Collapsible title="Commission line audit" count={`${lines.length} line(s)`} defaultOpen={false}>
          <div className="tablewrap">
            <table className="deals adj">
              <thead><tr><th>Rep</th><th>Type</th><th>Deal</th><th>Explanation</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {lines.map((l) => <tr key={l.id}><td>{l.rep}</td><td>{l.line_type}</td><td>{l.deal_number ?? "—"}</td><td className="note-cell">{l.explanation ?? "—"}</td><td className="r money pos">{moneyExact(l.amount)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Collapsible>
        {!isCurrentMonth && <div className="notice">Viewing archive month {monthParam}. Locked months can only be changed by payroll or admin.</div>}
      </main>
    </>
  );
}

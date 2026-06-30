import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useMonth } from "../lib/useMonth";
import { supabase } from "../lib/supabase";
import type { Adjustment, CommissionLine, DealRow, Profile, RepMtd } from "../lib/types";
import { isNewStock, money, moneyExact, monthLabel, monthStartISO, nextMonthISO, units } from "../lib/format";
import Topbar from "../components/Topbar";
import MonthBar from "../components/MonthBar";
import DealsTable from "../components/DealsTable";
import Adjustments from "../components/Adjustments";
import Collapsible from "../components/Collapsible";

const DEAL_COLUMNS = "*";

function normalizedRole(role: string | null | undefined): string {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return role ?? "sales_rep";
}

function isAcquisitionRow(d: DealRow): boolean {
  return !d.make || !d.make.trim();
}

function emptyRepRow(rep: string, month: string): RepMtd {
  return { employee_id: null, store_id: null, rep, dealer: null, month, deal_rows: 0, units: 0, new_units: 0, used_units: 0, front_gross_share: 0, total_commission: 0, split_deals: 0 };
}

export default function Dashboard({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const { month, monthParam, setMonth, isCurrentMonth } = useMonth();
  const [mtd, setMtd] = useState<RepMtd[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [allDeals, setAllDeals] = useState<DealRow[]>([]);
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

  const role = normalizedRole(profile?.role);
  const isSalesRep = role === "sales_rep";
  const isManagerView = ["brand_manager", "general_sales_manager", "payroll_manager", "admin"].includes(role);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setDataErr(null);

    const start = monthStartISO(month);
    const end = nextMonthISO(month);
    let mtdQuery = supabase.from("rep_mtd").select("*").eq("month", start).order("total_commission", { ascending: false });
    let allDealsQuery = supabase.from("deals").select(DEAL_COLUMNS).gte("contract_date", start).lt("contract_date", end).neq("rep", "").order("contract_date", { ascending: false }).limit(1000);
    let dealsQuery = supabase.from("deals").select(DEAL_COLUMNS).gte("contract_date", start).lt("contract_date", end).neq("rep", "").order("contract_date", { ascending: false }).limit(1000);
    let adjQuery = supabase.from("adjustments").select("*").eq("month", start).order("created_at", { ascending: false });
    let lineQuery = supabase.from("commission_line_detail").select("*").eq("month", start).order("created_at", { ascending: false }).limit(500);

    if (isSalesRep) {
      if (!profile.employee_id) {
        setMtd([]);
        setAllDeals([]);
        setDeals([]);
        setAdjustments([]);
        setLines([]);
        setLoading(false);
        return;
      }
      mtdQuery = mtdQuery.eq("employee_id", profile.employee_id);
      allDealsQuery = allDealsQuery.eq("employee_id", profile.employee_id);
      dealsQuery = dealsQuery.eq("employee_id", profile.employee_id);
      adjQuery = adjQuery.eq("employee_id", profile.employee_id);
      lineQuery = lineQuery.eq("employee_id", profile.employee_id);
    }

    if (selectedRep && !isSalesRep) {
      dealsQuery = dealsQuery.eq("rep", selectedRep);
      adjQuery = adjQuery.eq("rep", selectedRep);
      lineQuery = lineQuery.eq("rep", selectedRep);
    }

    const [mtdRes, allDealsRes, dealsRes, adjRes, lineRes] = await Promise.all([mtdQuery, allDealsQuery, dealsQuery, adjQuery, lineQuery]);
    if (mtdRes.error) setDataErr(mtdRes.error.message); else setMtd((mtdRes.data ?? []) as RepMtd[]);
    if (allDealsRes.error) setDataErr(allDealsRes.error.message); else setAllDeals((allDealsRes.data ?? []) as DealRow[]);
    if (dealsRes.error) setDataErr(dealsRes.error.message); else setDeals((dealsRes.data ?? []) as DealRow[]);
    if (adjRes.error) setDataErr(adjRes.error.message); else setAdjustments((adjRes.data ?? []) as Adjustment[]);
    if (lineRes.error) setDataErr(lineRes.error.message); else setLines((lineRes.data ?? []) as CommissionLine[]);
    setLoading(false);
  }, [isSalesRep, month, profile, selectedRep]);

  useEffect(() => { loadData(); }, [loadData]);

  const repRows = useMemo(() => {
    const start = monthStartISO(month);
    const byRep = new Map<string, RepMtd>();
    const dealSummary = new Map<string, RepMtd>();

    for (const d of allDeals) {
      if (!d.rep) continue;
      const row = dealSummary.get(d.rep) ?? emptyRepRow(d.rep, start);
      row.employee_id = row.employee_id ?? d.employee_id;
      row.store_id = row.store_id ?? d.store_id;
      row.dealer = row.dealer ?? d.dealer;
      row.deal_rows = (row.deal_rows ?? 0) + 1;
      row.total_commission = (row.total_commission ?? 0) + (d.rep_commission ?? 0);
      row.split_deals = (row.split_deals ?? 0) + (d.is_split_deal ? 1 : 0);
      if (!isAcquisitionRow(d)) {
        const unitCount = d.rep_unit_count ?? 0;
        row.units = (row.units ?? 0) + unitCount;
        row.front_gross_share = (row.front_gross_share ?? 0) + (d.front_gross ?? 0);
        const stockKind = isNewStock(d.stock_type);
        if (stockKind === true) row.new_units = (row.new_units ?? 0) + unitCount;
        if (stockKind === false) row.used_units = (row.used_units ?? 0) + unitCount;
      }
      dealSummary.set(d.rep, row);
    }

    for (const r of mtd) {
      if (!r.rep) continue;
      const fallback = dealSummary.get(r.rep);
      byRep.set(r.rep, { ...r, employee_id: r.employee_id ?? fallback?.employee_id ?? null, store_id: r.store_id ?? fallback?.store_id ?? null, dealer: r.dealer ?? fallback?.dealer ?? null, deal_rows: (r.deal_rows ?? 0) || fallback?.deal_rows || 0, units: (r.units ?? 0) || fallback?.units || 0, new_units: (r.new_units ?? 0) || fallback?.new_units || 0, used_units: (r.used_units ?? 0) || fallback?.used_units || 0, front_gross_share: (r.front_gross_share ?? 0) || fallback?.front_gross_share || 0, total_commission: (r.total_commission ?? 0) || fallback?.total_commission || 0, split_deals: (r.split_deals ?? 0) || fallback?.split_deals || 0 });
    }
    for (const [rep, row] of dealSummary) if (!byRep.has(rep)) byRep.set(rep, row);
    return Array.from(byRep.values()).sort((a, b) => (b.total_commission ?? 0) - (a.total_commission ?? 0) || a.rep.localeCompare(b.rep));
  }, [allDeals, month, mtd]);

  const scoped = useMemo(() => {
    const rows = selectedRep && !isSalesRep ? repRows.filter((r) => r.rep === selectedRep) : repRows;
    const visibleDeals = selectedRep && !isSalesRep ? allDeals.filter((d) => d.rep === selectedRep) : allDeals;
    const dealCommission = visibleDeals.reduce((a, d) => a + (d.rep_commission ?? 0), 0);
    const sum = (f: (r: RepMtd) => number | null) => rows.reduce((a, r) => a + (f(r) ?? 0), 0);
    const summaryCommission = sum((r) => r.total_commission);
    return { units: sum((r) => r.units), newUnits: sum((r) => r.new_units), usedUnits: sum((r) => r.used_units), frontGross: sum((r) => r.front_gross_share), commission: summaryCommission || dealCommission, reps: rows.length };
  }, [allDeals, isSalesRep, repRows, selectedRep]);

  const fgsByRep = useMemo(() => { const out = new Map<string, number>(); for (const r of repRows) out.set(r.rep, r.front_gross_share ?? 0); return out; }, [repRows]);
  const acqUnits = useMemo(() => deals.reduce((a, d) => a + (isAcquisitionRow(d) ? (d.rep_unit_count ?? 0) : 0), 0), [deals]);
  const formStore = profile?.store_name || (selectedRep ? repRows.find((r) => r.rep === selectedRep)?.dealer ?? null : null) || (repRows.length > 0 ? repRows[0].dealer : null);
  const scopeLabel = selectedRep && !isSalesRep ? selectedRep : isSalesRep ? (profile?.rep_name ?? repRows[0]?.rep ?? "My deals") : `Team · ${scoped.reps} rep${scoped.reps === 1 ? "" : "s"}`;
  const dealCommissionTotal = useMemo(() => allDeals.reduce((a, d) => a + (d.rep_commission ?? 0), 0), [allDeals]);
  const hasRowsWithoutSummary = (mtd.length === 0 && allDeals.length > 0) || (scoped.commission === 0 && dealCommissionTotal !== 0);

  return <><Topbar profile={profile} /><main className="page">{profileErr && <div className="notice">Could not load your profile. {profileErr}</div>}{dataErr && <div className="notice">Could not load data. {dataErr}</div>}{isSalesRep && profile && !profile.employee_id && <div className="notice">Your login is not linked to an employee record yet.</div>}{hasRowsWithoutSummary && <div className="notice">Deal rows loaded, but no commission summary rows were found for this month. The dashboard is showing a fallback summary from visible deal rows. Run Payroll refresh or check employee mappings if commissions still show zero.</div>}<MonthBar month={month} isCurrentMonth={isCurrentMonth} setMonth={setMonth} />{selectedRep && !isSalesRep && <button className="btn-step wide" onClick={() => setSelectedRep(null)}>Clear filter: {selectedRep}</button>}<Collapsible title={isCurrentMonth ? "Month to date" : monthLabel(month)} count={scopeLabel}><section className="sticker" aria-label="Month summary"><div className="sticker-head"><span className="sticker-title">{isCurrentMonth ? "Month to date" : monthLabel(month)}</span><span className="sticker-sub">{scopeLabel}{profile?.store_name ? ` · ${profile.store_name}` : ""} · server calculated</span></div><div className="sticker-body"><div className="cell hero"><div className="k">Commission</div><div className="v">{moneyExact(scoped.commission)}</div></div><div className="cell"><div className="k">Units</div><div className="v">{units(scoped.units)}</div></div><div className="cell"><div className="k">New</div><div className="v">{units(scoped.newUnits)}</div></div><div className="cell"><div className="k">Used</div><div className="v">{units(scoped.usedUnits)}</div></div><div className="cell"><div className="k">Acq</div><div className="v">{units(acqUnits)}</div></div><div className="cell"><div className="k">Front gross</div><div className="v">{money(scoped.frontGross)}<small>unit weighted</small></div></div></div></section></Collapsible>{isManagerView && repRows.length > 0 && <Collapsible title="Salespeople" count="tap a salesperson to filter"><div className="team-grid">{(showAllReps ? repRows : repRows.slice(0, 8)).map((r) => <button key={r.rep} className={`team-card ${selectedRep === r.rep ? "active" : ""}`} onClick={() => setSelectedRep(selectedRep === r.rep ? null : r.rep)}><span className="name">{r.rep}</span><span className="meta">{units(r.units)} u · <b>{money(r.total_commission)}</b></span></button>)}</div>{repRows.length > 8 && <button className="btn-showall" onClick={() => setShowAllReps((v) => !v)}>{showAllReps ? "Show fewer" : `Show all ${repRows.length} salespeople`}</button>}</Collapsible>}<Collapsible title="Deals" count={loading ? "loading…" : `${deals.length} row(s)`}>{loading ? <div className="tablewrap"><div className="loading">Loading deals…</div></div> : <DealsTable deals={deals} showRep={isManagerView && !selectedRep} />}</Collapsible>{(isManagerView || adjustments.length > 0) && <Collapsible title="Spiffs and adjustments" count={isManagerView ? "manager entered inputs" : "entered by management"} defaultOpen={false}><Adjustments key={`${monthStartISO(month)}-${selectedRep ?? "all"}`} entries={adjustments} canEdit={isManagerView} monthISO={monthStartISO(month)} reps={repRows} fgsByRep={fgsByRep} defaultStore={formStore} selectedRep={selectedRep} onChanged={loadData} /></Collapsible>}<Collapsible title="Commission line audit" count={`${lines.length} line(s)`} defaultOpen={false}><div className="tablewrap"><table className="deals adj"><thead><tr><th>Rep</th><th>Type</th><th>Deal</th><th>Explanation</th><th className="r">Amount</th></tr></thead><tbody>{lines.map((l) => <tr key={l.id}><td>{l.rep}</td><td>{l.line_type}</td><td>{l.deal_number ?? "—"}</td><td className="note-cell">{l.explanation ?? "—"}</td><td className="r money pos">{moneyExact(l.amount)}</td></tr>)}</tbody></table></div></Collapsible>{!isCurrentMonth && <div className="notice">Viewing archive month {monthParam}. Locked months can only be changed by payroll or admin.</div>}</main></>;
}

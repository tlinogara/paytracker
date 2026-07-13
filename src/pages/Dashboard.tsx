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

function isAcquisitionRow(deal: DealRow): boolean {
  return !deal.make || !deal.make.trim();
}

function emptyRepRow(rep: string, month: string): RepMtd {
  return {
    employee_id: null,
    store_id: null,
    rep,
    dealer: null,
    month,
    deal_rows: 0,
    units: 0,
    new_units: 0,
    used_units: 0,
    front_gross_share: 0,
    total_commission: 0,
    split_deals: 0,
  };
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
  const [repSearch, setRepSearch] = useState("");
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
    let adjustmentQuery = supabase.from("adjustments").select("*").eq("month", start).order("created_at", { ascending: false });
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
      adjustmentQuery = adjustmentQuery.eq("employee_id", profile.employee_id);
      lineQuery = lineQuery.eq("employee_id", profile.employee_id);
    }

    if (selectedRep && !isSalesRep) {
      dealsQuery = dealsQuery.eq("rep", selectedRep);
      adjustmentQuery = adjustmentQuery.eq("rep", selectedRep);
      lineQuery = lineQuery.eq("rep", selectedRep);
    }

    const [mtdRes, allDealsRes, dealsRes, adjustmentRes, lineRes] = await Promise.all([
      mtdQuery,
      allDealsQuery,
      dealsQuery,
      adjustmentQuery,
      lineQuery,
    ]);

    if (mtdRes.error) setDataErr(mtdRes.error.message);
    else setMtd((mtdRes.data ?? []) as RepMtd[]);

    if (allDealsRes.error) setDataErr(allDealsRes.error.message);
    else setAllDeals((allDealsRes.data ?? []) as DealRow[]);

    if (dealsRes.error) setDataErr(dealsRes.error.message);
    else setDeals((dealsRes.data ?? []) as DealRow[]);

    if (adjustmentRes.error) setDataErr(adjustmentRes.error.message);
    else setAdjustments((adjustmentRes.data ?? []) as Adjustment[]);

    if (lineRes.error) setDataErr(lineRes.error.message);
    else setLines((lineRes.data ?? []) as CommissionLine[]);

    setLoading(false);
  }, [isSalesRep, month, profile, selectedRep]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const repRows = useMemo(() => {
    const start = monthStartISO(month);
    const byRep = new Map<string, RepMtd>();
    const dealSummary = new Map<string, RepMtd>();

    for (const deal of allDeals) {
      if (!deal.rep) continue;
      const row = dealSummary.get(deal.rep) ?? emptyRepRow(deal.rep, start);
      row.employee_id = row.employee_id ?? deal.employee_id;
      row.store_id = row.store_id ?? deal.store_id;
      row.dealer = row.dealer ?? deal.dealer;
      row.deal_rows = (row.deal_rows ?? 0) + 1;
      row.total_commission = (row.total_commission ?? 0) + (deal.rep_commission ?? 0);
      row.split_deals = (row.split_deals ?? 0) + (deal.is_split_deal ? 1 : 0);

      if (!isAcquisitionRow(deal)) {
        const unitCount = deal.rep_unit_count ?? 0;
        row.units = (row.units ?? 0) + unitCount;
        row.front_gross_share = (row.front_gross_share ?? 0) + (deal.front_gross ?? 0);
        const stockKind = isNewStock(deal.stock_type);
        if (stockKind === true) row.new_units = (row.new_units ?? 0) + unitCount;
        if (stockKind === false) row.used_units = (row.used_units ?? 0) + unitCount;
      }

      dealSummary.set(deal.rep, row);
    }

    for (const row of mtd) {
      if (!row.rep) continue;
      const fallback = dealSummary.get(row.rep);
      byRep.set(row.rep, {
        ...row,
        employee_id: row.employee_id ?? fallback?.employee_id ?? null,
        store_id: row.store_id ?? fallback?.store_id ?? null,
        dealer: row.dealer ?? fallback?.dealer ?? null,
        deal_rows: (row.deal_rows ?? 0) || fallback?.deal_rows || 0,
        units: (row.units ?? 0) || fallback?.units || 0,
        new_units: (row.new_units ?? 0) || fallback?.new_units || 0,
        used_units: (row.used_units ?? 0) || fallback?.used_units || 0,
        front_gross_share: (row.front_gross_share ?? 0) || fallback?.front_gross_share || 0,
        total_commission: (row.total_commission ?? 0) || fallback?.total_commission || 0,
        split_deals: (row.split_deals ?? 0) || fallback?.split_deals || 0,
      });
    }

    for (const [rep, row] of dealSummary) {
      if (!byRep.has(rep)) byRep.set(rep, row);
    }

    return Array.from(byRep.values()).sort(
      (left, right) => (right.total_commission ?? 0) - (left.total_commission ?? 0) || left.rep.localeCompare(right.rep),
    );
  }, [allDeals, month, mtd]);

  const scoped = useMemo(() => {
    const rows = selectedRep && !isSalesRep ? repRows.filter((row) => row.rep === selectedRep) : repRows;
    const visibleDeals = selectedRep && !isSalesRep ? allDeals.filter((deal) => deal.rep === selectedRep) : allDeals;
    const dealCommission = visibleDeals.reduce((total, deal) => total + (deal.rep_commission ?? 0), 0);
    const sum = (field: (row: RepMtd) => number | null) => rows.reduce((total, row) => total + (field(row) ?? 0), 0);
    const summaryCommission = sum((row) => row.total_commission);

    return {
      units: sum((row) => row.units),
      newUnits: sum((row) => row.new_units),
      usedUnits: sum((row) => row.used_units),
      frontGross: sum((row) => row.front_gross_share),
      commission: summaryCommission || dealCommission,
      reps: rows.length,
    };
  }, [allDeals, isSalesRep, repRows, selectedRep]);

  const filteredRepRows = useMemo(() => {
    const query = repSearch.trim().toLowerCase();
    if (!query) return repRows;
    return repRows.filter((row) => row.rep.toLowerCase().includes(query) || (row.dealer ?? "").toLowerCase().includes(query));
  }, [repRows, repSearch]);

  const displayedRepRows = repSearch.trim() || showAllReps ? filteredRepRows : filteredRepRows.slice(0, 8);
  const fgsByRep = useMemo(() => {
    const result = new Map<string, number>();
    for (const row of repRows) result.set(row.rep, row.front_gross_share ?? 0);
    return result;
  }, [repRows]);
  const acqUnits = useMemo(
    () => deals.reduce((total, deal) => total + (isAcquisitionRow(deal) ? (deal.rep_unit_count ?? 0) : 0), 0),
    [deals],
  );
  const formStore = profile?.store_name
    || (selectedRep ? repRows.find((row) => row.rep === selectedRep)?.dealer ?? null : null)
    || (repRows.length > 0 ? repRows[0].dealer : null);
  const scopeLabel = selectedRep && !isSalesRep
    ? selectedRep
    : isSalesRep
      ? (profile?.rep_name ?? repRows[0]?.rep ?? "My deals")
      : `Team · ${scoped.reps} rep${scoped.reps === 1 ? "" : "s"}`;
  const summaryTitle = isSalesRep ? "My commission" : selectedRep ? `${selectedRep} commission` : "Team commission";
  const periodTitle = isCurrentMonth ? "Month to date" : monthLabel(month);
  const dealCommissionTotal = useMemo(
    () => allDeals.reduce((total, deal) => total + (deal.rep_commission ?? 0), 0),
    [allDeals],
  );
  const hasRowsWithoutSummary = (mtd.length === 0 && allDeals.length > 0)
    || (scoped.commission === 0 && dealCommissionTotal !== 0);

  return (
    <>
      <Topbar profile={profile} />
      <main className="page">
        <header className="page-heading">
          <div>
            <span className="eyebrow">Commission workspace</span>
            <h1>Commissions</h1>
            <p>Review pay, units, deals, and manager adjustments for the selected month.</p>
          </div>
          <div className="page-context">
            <span>Viewing</span>
            <strong>{scopeLabel}</strong>
          </div>
        </header>

        {profileErr && <div className="notice">Could not load your profile. {profileErr}</div>}
        {dataErr && <div className="notice">Could not load data. {dataErr}</div>}
        {isSalesRep && profile && !profile.employee_id && (
          <div className="notice">Your login is not linked to a salesperson record yet. Ask an admin to link it in Users &amp; access.</div>
        )}
        {hasRowsWithoutSummary && (
          <div className="notice">Deals loaded, but the saved commission summary is missing. The totals below are being calculated from the visible deals.</div>
        )}

        <section className="commission-toolbar" aria-label="Commission filters">
          <MonthBar month={month} isCurrentMonth={isCurrentMonth} setMonth={setMonth} />
          {selectedRep && !isSalesRep && (
            <button className="clear-filter" onClick={() => setSelectedRep(null)}>
              Clear salesperson filter
              <strong>{selectedRep}</strong>
            </button>
          )}
        </section>

        <section className="sticker commission-summary" aria-label={`${summaryTitle} summary`}>
          <div className="sticker-head">
            <div>
              <span className="sticker-title">{summaryTitle}</span>
              <div className="summary-period">{periodTitle}</div>
            </div>
            <span className="sticker-sub">
              {scopeLabel}{profile?.store_name ? ` · ${profile.store_name}` : ""} · calculated from current data
            </span>
          </div>
          <div className="sticker-body">
            <div className="cell hero">
              <div className="k">Commission</div>
              <div className="v">{moneyExact(scoped.commission)}</div>
            </div>
            <div className="cell">
              <div className="k">Total units</div>
              <div className="v">{units(scoped.units)}</div>
            </div>
            <div className="cell">
              <div className="k">New</div>
              <div className="v">{units(scoped.newUnits)}</div>
            </div>
            <div className="cell">
              <div className="k">Used</div>
              <div className="v">{units(scoped.usedUnits)}</div>
            </div>
            <div className="cell">
              <div className="k">Acquisitions</div>
              <div className="v">{units(acqUnits)}</div>
            </div>
            <div className="cell">
              <div className="k">Front gross</div>
              <div className="v">{money(scoped.frontGross)}<small>salesperson share</small></div>
            </div>
          </div>
        </section>

        {isManagerView && (
          <section className="panel-section">
            <div className="section-head section-head-static">
              <div className="section-head-copy">
                <h2>Salespeople</h2>
                <p>Choose a salesperson to filter the summary, deals, adjustments, and calculation details.</p>
              </div>
              <span className="count">{repRows.length} total</span>
            </div>
            <div className="team-panel">
              <div className="team-toolbar">
                <label className="search-field">
                  <span>Find salesperson</span>
                  <input value={repSearch} onChange={(event) => setRepSearch(event.target.value)} placeholder="Search by name or location" />
                </label>
                {selectedRep && (
                  <button className="btn-secondary" onClick={() => setSelectedRep(null)}>Show full team</button>
                )}
              </div>

              {displayedRepRows.length > 0 ? (
                <div className="team-grid">
                  {displayedRepRows.map((row) => (
                    <button
                      key={row.rep}
                      className={`team-card ${selectedRep === row.rep ? "active" : ""}`}
                      aria-pressed={selectedRep === row.rep}
                      onClick={() => setSelectedRep(selectedRep === row.rep ? null : row.rep)}
                    >
                      <span className="name">{row.rep}</span>
                      <span className="team-location">{row.dealer || "Location not assigned"}</span>
                      <span className="meta">{units(row.units)} units · <b>{money(row.total_commission)}</b></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty compact">No salespeople match your search.</div>
              )}

              {!repSearch.trim() && filteredRepRows.length > 8 && (
                <button className="btn-showall" onClick={() => setShowAllReps((value) => !value)}>
                  {showAllReps ? "Show fewer salespeople" : `Show all ${filteredRepRows.length} salespeople`}
                </button>
              )}
            </div>
          </section>
        )}

        <Collapsible title="Deals included" count={loading ? "Loading" : `${deals.length} rows`}>
          {loading ? (
            <div className="tablewrap"><div className="loading">Loading deals…</div></div>
          ) : deals.length > 0 ? (
            <DealsTable deals={deals} showRep={isManagerView && !selectedRep} />
          ) : (
            <div className="empty-card">No deals were found for this selection and month.</div>
          )}
        </Collapsible>

        {(isManagerView || adjustments.length > 0) && (
          <Collapsible
            title="Spiffs, bonuses, and adjustments"
            count={adjustments.length > 0 ? `${adjustments.length} entries` : "Manager inputs"}
            defaultOpen={false}
          >
            <p className="section-intro">Add or review manual items that change the salesperson commission total.</p>
            <Adjustments
              key={`${monthStartISO(month)}-${selectedRep ?? "all"}`}
              entries={adjustments}
              canEdit={isManagerView}
              monthISO={monthStartISO(month)}
              reps={repRows}
              fgsByRep={fgsByRep}
              defaultStore={formStore}
              selectedRep={selectedRep}
              onChanged={loadData}
            />
          </Collapsible>
        )}

        <Collapsible title="Calculation details" count={`${lines.length} lines`} defaultOpen={false}>
          <p className="section-intro">Use this section when you need to verify how the commission total was built.</p>
          {lines.length > 0 ? (
            <div className="tablewrap">
              <table className="deals adj">
                <thead>
                  <tr><th>Salesperson</th><th>Type</th><th>Deal</th><th>Explanation</th><th className="r">Amount</th></tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.rep}</td>
                      <td>{line.line_type}</td>
                      <td>{line.deal_number ?? "None"}</td>
                      <td className="note-cell">{line.explanation ?? "No explanation"}</td>
                      <td className="r money pos">{moneyExact(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-card">No calculation lines were found for this selection.</div>
          )}
        </Collapsible>

        {!isCurrentMonth && (
          <div className="notice archive-notice">Viewing archive month {monthParam}. Only payroll managers and admins can change a locked month.</div>
        )}
      </main>
    </>
  );
}

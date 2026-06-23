import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMonth } from "../lib/useMonth";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { DealRow, PayrollRow, StoreStats } from "../lib/types";
import { money, moneyExact, monthLabel, monthStartISO, units } from "../lib/format";
import DealsTable from "../components/DealsTable";
import PayrollTable from "../components/PayrollTable";
import Leaderboards from "../components/Leaderboards";
import Collapsible from "../components/Collapsible";

const DEAL_COLUMNS =
  "deal_number, rep, contract_date, status, stock_type, customer, vehicle, " +
  "front_gross, rep_unit_count, rep_commission, is_split_deal, salesperson, dealer, make";

export default function Dashboard({ session }: { session: Session }) {
  const { month, monthParam, setMonth, isCurrentMonth } = useMonth();
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [selectedRep, setSelectedRep] = useState<string | null>(null);
  const [showAllReps, setShowAllReps] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataErr, setDataErr] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setDataErr(null);
    const start = monthStartISO(month);

    const statsQuery = supabase
      .from("v_store_stats")
      .select("*")
      .eq("report_month", start)
      .maybeSingle();

    const payrollQuery = supabase
      .from("v_payroll_summary")
      .select("*")
      .eq("report_month", start)
      .order("gross_pay", { ascending: false });

    let dealsQuery = supabase
      .from("v_deals_detail")
      .select(DEAL_COLUMNS)
      .eq("report_month", start)
      .order("contract_date", { ascending: false })
      .limit(2000);
    if (selectedRep) dealsQuery = dealsQuery.eq("rep", selectedRep);

    const [statsRes, payrollRes, dealsRes] = await Promise.all([
      statsQuery,
      payrollQuery,
      dealsQuery,
    ]);

    if (statsRes.error) setDataErr(statsRes.error.message);
    else setStats((statsRes.data as StoreStats | null) ?? null);
    if (payrollRes.error) setDataErr(payrollRes.error.message);
    else setPayroll((payrollRes.data ?? []) as PayrollRow[]);
    if (dealsRes.error) setDataErr(dealsRes.error.message);
    else setDeals((dealsRes.data ?? []) as unknown as DealRow[]);
    setLoading(false);
  }, [month, selectedRep]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const repRow = useMemo(
    () => (selectedRep ? payroll.find((r) => r.display_name === selectedRep) ?? null : null),
    [payroll, selectedRep]
  );

  return (
    <>
      <header className="topbar">
        <span className="wordmark">
          Pay<span>Track</span>
        </span>
        <div className="topbar-user">
          <Link
            className="btn-ghost"
            to={`/enhancers${isCurrentMonth ? "" : `?month=${monthParam}`}`}
          >
            Enhancers
          </Link>
          <span className="who">{session.user.email}</span>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="page">
        {dataErr && <div className="notice">Couldn't load data: {dataErr}</div>}

        <div className="monthbar">
          <div className="month-nav">
            <button
              className="btn-step"
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              ‹
            </button>
            <span className="label">{monthLabel(month)}</span>
            <button
              className="btn-step"
              aria-label="Next month"
              disabled={isCurrentMonth}
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              ›
            </button>
          </div>
          {selectedRep && (
            <button
              className="btn-step"
              style={{ width: "auto", padding: "0 12px", fontSize: 13 }}
              onClick={() => setSelectedRep(null)}
            >
              ✕ Clear filter: {selectedRep}
            </button>
          )}
        </div>

        <section className="sticker" aria-label="Month summary">
          <div className="sticker-head">
            <span className="sticker-title">
              {isCurrentMonth ? "Month to date" : monthLabel(month)}
            </span>
            <span className="sticker-sub">
              {selectedRep ? selectedRep : "Store totals"} · O'Gara Beverly Hills
            </span>
          </div>

          {repRow ? (
            <div className="sticker-body">
              <div className="cell hero">
                <div className="k">Gross pay</div>
                <div className="v">{moneyExact(repRow.gross_pay)}</div>
              </div>
              <div className="cell">
                <div className="k">Units</div>
                <div className="v">{units(repRow.total_units)}</div>
              </div>
              <div className="cell">
                <div className="k">New</div>
                <div className="v">{units(repRow.new_units)}</div>
              </div>
              <div className="cell">
                <div className="k">Used</div>
                <div className="v">{units(repRow.used_units)}</div>
              </div>
              <div className="cell">
                <div className="k">Front gross</div>
                <div className="v">{money(repRow.front_gross)}</div>
              </div>
              <div className="cell">
                <div className="k">Eff. rate</div>
                <div className="v">
                  {repRow.effective_rate != null
                    ? `${(repRow.effective_rate * 100).toFixed(2)}%`
                    : "—"}
                </div>
              </div>
              <div className="cell">
                <div className="k">Due</div>
                <div className="v">{moneyExact(repRow.due)}</div>
              </div>
            </div>
          ) : (
            <div className="sticker-body">
              <div className="cell hero">
                <div className="k">Total comp</div>
                <div className="v">{money(stats?.total_comp)}</div>
              </div>
              <div className="cell">
                <div className="k">Total units</div>
                <div className="v">{units(stats?.total_units)}</div>
              </div>
              <div className="cell">
                <div className="k">New</div>
                <div className="v">{units(stats?.new_units)}</div>
              </div>
              <div className="cell">
                <div className="k">Used</div>
                <div className="v">{units(stats?.used_units)}</div>
              </div>
              <div className="cell">
                <div className="k">Total gross</div>
                <div className="v">{money(stats?.total_gross)}</div>
              </div>
              <div className="cell">
                <div className="k">Front gross</div>
                <div className="v">{money(stats?.front_gross)}</div>
              </div>
              <div className="cell">
                <div className="k">Back gross</div>
                <div className="v">{money(stats?.back_gross)}</div>
              </div>
              <div className="cell">
                <div className="k">Total PVR</div>
                <div className="v">{money(stats?.total_pvr)}</div>
              </div>
              <div className="cell">
                <div className="k">Front PVR</div>
                <div className="v">{money(stats?.front_pvr)}</div>
              </div>
              <div className="cell">
                <div className="k">Back PVR</div>
                <div className="v">{money(stats?.back_pvr)}</div>
              </div>
            </div>
          )}
        </section>

        {payroll.length > 0 && (
          <>
            <div className="section-head">
              <h2>Team</h2>
              <span className="count">tap a rep to filter</span>
            </div>
            <div className="team-grid">
              {(showAllReps ? payroll : payroll.slice(0, 8)).map((r) => (
                <button
                  key={r.emp_no}
                  className={`team-card ${selectedRep === r.display_name ? "active" : ""}`}
                  onClick={() =>
                    setSelectedRep(
                      selectedRep === r.display_name ? null : r.display_name
                    )
                  }
                >
                  <span className="name">{r.display_name}</span>
                  <span className="meta">
                    {units(r.total_units)} u · <b>{money(r.gross_pay)}</b>
                  </span>
                </button>
              ))}
            </div>
            {payroll.length > 8 && (
              <button
                className="btn-showall"
                onClick={() => setShowAllReps((v) => !v)}
              >
                {showAllReps ? "Show fewer" : `Show all ${payroll.length} reps`}
              </button>
            )}
          </>
        )}

        <Leaderboards monthISO={monthStartISO(month)} />

        <Collapsible
          title="Payroll breakdown"
          count={`${payroll.length} rep(s) · base + enhancers + spiffs + bonuses`}
          defaultOpen={false}
        >
          <PayrollTable
            rows={
              selectedRep
                ? payroll.filter((r) => r.display_name === selectedRep)
                : payroll
            }
          />
        </Collapsible>

        <div className="section-head">
          <h2>Deals</h2>
          <span className="count">
            {loading ? "loading…" : `${deals.length} row(s)`}
          </span>
        </div>
        {loading ? (
          <div className="tablewrap">
            <div className="loading">Loading deals…</div>
          </div>
        ) : (
          <DealsTable deals={deals} showRep={!selectedRep} />
        )}
      </main>
    </>
  );
}

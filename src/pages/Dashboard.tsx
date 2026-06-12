import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMonth } from "../lib/useMonth";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Adjustment, DealRow, Profile, RepMtd } from "../lib/types";
import {
  money,
  moneyExact,
  monthLabel,
  monthStartISO,
  nextMonthISO,
  units,
} from "../lib/format";
import DealsTable from "../components/DealsTable";
import Adjustments from "../components/Adjustments";

const DEAL_COLUMNS =
  "deal_number, rep, contract_date, status, stock_type, customer, vehicle, " +
  "front_gross, rep_unit_count, rep_commission, is_split_deal, salesperson, dealer, make";

export default function Dashboard({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const { month, monthParam, setMonth, isCurrentMonth } = useMonth();
  const [mtd, setMtd] = useState<RepMtd[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
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

    const mtdQuery = supabase
      .from("rep_mtd")
      .select("*")
      .eq("month", start)
      .order("total_commission", { ascending: false });

    let dealsQuery = supabase
      .from("deals")
      .select(DEAL_COLUMNS)
      .gte("contract_date", start)
      .lt("contract_date", end)
      .neq("rep", "")
      .order("contract_date", { ascending: false })
      .limit(1000);
    if (selectedRep) dealsQuery = dealsQuery.eq("rep", selectedRep);

    let adjQuery = supabase
      .from("adjustments")
      .select("*")
      .eq("month", start)
      .order("created_at", { ascending: false });
    if (selectedRep) adjQuery = adjQuery.eq("rep", selectedRep);

    const [mtdRes, dealsRes, adjRes] = await Promise.all([
      mtdQuery,
      dealsQuery,
      adjQuery,
    ]);
    if (mtdRes.error) setDataErr(mtdRes.error.message);
    else setMtd((mtdRes.data ?? []) as RepMtd[]);
    if (dealsRes.error) setDataErr(dealsRes.error.message);
    else setDeals((dealsRes.data ?? []) as unknown as DealRow[]);
    if (adjRes.error) setDataErr(adjRes.error.message);
    else setAdjustments((adjRes.data ?? []) as Adjustment[]);
    setLoading(false);
  }, [month, selectedRep]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isManagerView = profile?.role === "manager" || profile?.role === "admin";

  // Sticker scope: a single rep's row when scoped, otherwise team totals.
  const scoped = useMemo(() => {
    const rows = selectedRep ? mtd.filter((r) => r.rep === selectedRep) : mtd;
    const sum = (f: (r: RepMtd) => number | null) =>
      rows.reduce((a, r) => a + (f(r) ?? 0), 0);
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
    const m = new Map<string, number>();
    for (const r of mtd) m.set(r.rep, r.front_gross_share ?? 0);
    return m;
  }, [mtd]);

  const overlay = useMemo(() => {
    let flat = 0;
    let enhancer = 0;
    let ratePct = 0;
    for (const a of adjustments) {
      if (a.pct != null) {
        // Percentage-style enhancer entry (manual % spiff)
        ratePct += a.pct;
        enhancer += (a.pct / 100) * (fgsByRep.get(a.rep) ?? 0);
      } else if (a.category === "enhancer") {
        // Flat enhancers (incl. one-click approvals). Their rule rate, if
        // any, is recorded on rate_pct; flat-cash rules leave it null.
        ratePct += a.rate_pct ?? 0;
        enhancer += a.amount ?? 0;
      } else {
        flat += a.amount ?? 0;
      }
    }
    enhancer = Math.round(enhancer * 100) / 100;
    flat = Math.round(flat * 100) / 100;
    // "Enh %" = sum of the rule rates the rep qualified for (e.g. 3% + 2%).
    // 2-decimal precision so 5.2% / 5.25% display correctly.
    const totalPct = Math.round(ratePct * 100) / 100;
    return { flat, enhancer, totalPct, any: adjustments.length > 0 };
  }, [adjustments, fgsByRep]);

  const acqUnits = useMemo(
    () =>
      deals.reduce(
        (a, d) =>
          a + (!d.make || !d.make.trim() ? (d.rep_unit_count ?? 0) : 0),
        0
      ),
    [deals]
  );

  const projected =
    Math.round((scoped.commission + overlay.flat + overlay.enhancer) * 100) /
    100;


  const formStore =
    profile?.store_name ||
    (selectedRep ? mtd.find((r) => r.rep === selectedRep)?.dealer ?? null : null) ||
    (mtd.length > 0 ? mtd[0].dealer : null);

  const scopeLabel = selectedRep
    ? selectedRep
    : profile?.role === "rep"
      ? (profile.rep_name ?? "")
      : `Team · ${scoped.reps} rep${scoped.reps === 1 ? "" : "s"}`;

  return (
    <>
      <header className="topbar">
        <span className="wordmark">
          Pay<span>Track</span>
        </span>
        <div className="topbar-user">
          {isManagerView && (
            <Link
              className="btn-ghost"
              to={`/enhancers${isCurrentMonth ? "" : `?month=${monthParam}`}`}
            >
              Enhancers
            </Link>
          )}
          <span className="who">
            {profile?.full_name || profile?.email || session.user.email}
            {profile?.role && profile.role !== "rep" ? ` · ${profile.role}` : ""}
          </span>
          <button
            className="btn-ghost"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="page">
        {profileErr && (
          <div className="notice">
            Couldn't load your profile ({profileErr}). Ask payroll to check
            your account setup.
          </div>
        )}
        {profile?.role === "rep" && profile && !profile.rep_name && (
          <div className="notice">
            Your login isn't linked to a salesperson record yet, so no deals
            will show. Ask payroll to link your account.
          </div>
        )}
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
            <button className="btn-step" style={{ width: "auto", padding: "0 12px", fontSize: 13 }} onClick={() => setSelectedRep(null)}>
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
              {scopeLabel}
              {profile?.store_name ? ` · ${profile.store_name}` : ""} · updates
              hourly
            </span>
          </div>
          <div className="sticker-body">
            <div className="cell hero">
              <div className="k">
                {overlay.any ? "Projected pay" : "Commission"}
              </div>
              <div className="v">
                {moneyExact(overlay.any ? projected : scoped.commission)}
              </div>
            </div>
            <div className="cell">
              <div className="k">Units</div>
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
              <div className="k">Acq</div>
              <div className="v">{units(acqUnits)}</div>
            </div>
            <div className="cell">
              <div className="k">Front gross</div>
              <div className="v">
                {money(scoped.frontGross)} <small>unit-wtd</small>
              </div>
            </div>
            <div className="cell">
              <div className="k">Enh %</div>
              <div className="v">
                {overlay.totalPct > 0 ? `${overlay.totalPct.toFixed(2)}%` : "—"}
                <small>qualified rules</small>
              </div>
            </div>
          </div>
          {overlay.any && (
            <div className="sticker-breakdown">
              <div className="bcell">
                <span className="k">Deal commission</span>
                <span className="v">{moneyExact(scoped.commission)}</span>
              </div>
              <div className="bcell">
                <span className="k">Spiffs &amp; corrections</span>
                <span className="v">{moneyExact(overlay.flat)}</span>
              </div>
              <div className="bcell">
                <span className="k">
                  Enhancers
                  {overlay.totalPct > 0 ? ` (${overlay.totalPct.toFixed(2)}%)` : ""}
                </span>
                <span className="v">{moneyExact(overlay.enhancer)}</span>
              </div>
            </div>
          )}
        </section>

        {isManagerView && mtd.length > 0 && (
          <>
            <div className="section-head">
              <h2>Team</h2>
              <span className="count">tap a rep to filter</span>
            </div>
            <div className="team-grid">
              {(showAllReps ? mtd : mtd.slice(0, 8)).map((r) => (
                <button
                  key={r.rep}
                  className={`team-card ${selectedRep === r.rep ? "active" : ""}`}
                  onClick={() =>
                    setSelectedRep(selectedRep === r.rep ? null : r.rep)
                  }
                >
                  <span className="name">{r.rep}</span>
                  <span className="meta">
                    {units(r.units)} u · <b>{money(r.total_commission)}</b>
                  </span>
                </button>
              ))}
            </div>
            {mtd.length > 8 && (
              <button
                className="btn-showall"
                onClick={() => setShowAllReps((v) => !v)}
              >
                {showAllReps
                  ? "Show fewer"
                  : `Show all ${mtd.length} reps`}
              </button>
            )}
          </>
        )}

        {(isManagerView || adjustments.length > 0) && (
          <>
            <div className="section-head">
              <h2>Spiffs &amp; enhancers</h2>
              <span className="count">
                {isManagerView
                  ? "manual entries on top of the deal log"
                  : "entered by your manager or payroll"}
              </span>
            </div>
            <Adjustments
              key={`${monthStartISO(month)}-${selectedRep ?? "all"}`}
              entries={adjustments}
              canEdit={isManagerView}
              monthISO={monthStartISO(month)}
              reps={mtd.map((r) => r.rep)}
              fgsByRep={fgsByRep}
              defaultStore={formStore}
              selectedRep={selectedRep}
              onChanged={loadData}
            />
          </>
        )}

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
          <DealsTable deals={deals} showRep={isManagerView && !selectedRep} />
        )}
      </main>
    </>
  );
}

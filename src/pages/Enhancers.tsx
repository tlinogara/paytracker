import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useMonth } from "../lib/useMonth";
import { supabase } from "../lib/supabase";
import type { EnhancerStatusRow } from "../lib/types";
import { moneyExact, monthLabel, monthStartISO } from "../lib/format";
import Collapsible from "../components/Collapsible";

function payout(r: EnhancerStatusRow): string {
  if (r.kind === "rate") return `+${((r.rate ?? 0) * 100).toFixed(2)}%`;
  return `${moneyExact(r.amount)}`;
}

export default function Enhancers({ session }: { session: Session }) {
  const { month, monthParam, setMonth, isCurrentMonth } = useMonth();
  const [rows, setRows] = useState<EnhancerStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [onlyAchieved, setOnlyAchieved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    supabase
      .from("v_enhancer_status")
      .select("*")
      .eq("report_month", monthStartISO(month))
      .order("display_name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErr(error.message);
        else setRows((data ?? []) as EnhancerStatusRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  // Group rule status by rep.
  const byRep = useMemo(() => {
    const m = new Map<string, EnhancerStatusRow[]>();
    for (const r of rows) {
      if (onlyAchieved && !r.achieved) continue;
      const arr = m.get(r.display_name) ?? [];
      arr.push(r);
      m.set(r.display_name, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, onlyAchieved]);

  return (
    <>
      <header className="topbar">
        <span className="wordmark">
          Pay<span>Track</span>
        </span>
        <div className="topbar-user">
          <Link
            className="btn-ghost"
            to={`/${isCurrentMonth ? "" : `?month=${monthParam}`}`}
          >
            Dashboard
          </Link>
          <span className="who">{session.user.email}</span>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="page">
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
          <button
            className={`btn-step ${onlyAchieved ? "active" : ""}`}
            style={{ width: "auto", padding: "0 12px", fontSize: 13 }}
            onClick={() => setOnlyAchieved((v) => !v)}
          >
            {onlyAchieved ? "Showing qualified only" : "Show qualified only"}
          </button>
        </div>

        <div className="section-head">
          <h2>Enhancer status</h2>
          <span className="count">
            {loading ? "loading…" : `${byRep.length} rep(s)`}
          </span>
        </div>

        {err && <div className="notice">Couldn't load enhancers: {err}</div>}

        {!loading && byRep.length === 0 && (
          <div className="tablewrap">
            <div className="empty">
              No enhancer rules apply this month. Add rules to the
              <code> enhancer_rules </code> table in Supabase to see qualification
              here.
            </div>
          </div>
        )}

        {byRep.map(([rep, ruleRows]) => {
          const totalPct = ruleRows
            .filter((r) => r.achieved && r.kind === "rate")
            .reduce((a, r) => a + (r.rate ?? 0), 0);
          return (
            <Collapsible
              key={rep}
              title={rep}
              count={
                totalPct > 0
                  ? `+${(totalPct * 100).toFixed(2)}% qualified`
                  : `${ruleRows.filter((r) => r.achieved).length} qualified`
              }
              defaultOpen={false}
            >
              <div className="tablewrap">
                <table className="deals">
                  <thead>
                    <tr>
                      <th>Rule</th>
                      <th>Trigger</th>
                      <th className="r">Payout</th>
                      <th className="r">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ruleRows.map((r) => (
                      <tr key={r.code}>
                        <td className="note-cell">{r.description ?? r.code}</td>
                        <td>{r.trigger}</td>
                        <td className="r money pos">{payout(r)}</td>
                        <td className="r">
                          <span className={`badge ${r.achieved ? "new" : "used"}`}>
                            {r.achieved ? "Qualified" : "Not yet"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Collapsible>
          );
        })}
      </main>
    </>
  );
}

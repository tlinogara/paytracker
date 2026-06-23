import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { LeaderboardMetric, LeaderboardRow } from "../lib/types";
import { money, units } from "../lib/format";

const BOARDS: { metric: LeaderboardMetric; title: string; kind: "units" | "money" }[] = [
  { metric: "new_units", title: "New Units", kind: "units" },
  { metric: "used_units", title: "Used Units", kind: "units" },
  { metric: "total_units", title: "Total Units", kind: "units" },
  { metric: "front_pvr", title: "Front Gross", kind: "money" },
  { metric: "back_pvr", title: "Back Gross", kind: "money" },
  { metric: "total_pvr", title: "Total Gross", kind: "money" },
];

export default function Leaderboards({ monthISO }: { monthISO: string }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("v_leaderboard")
      .select("*")
      .eq("report_month", monthISO)
      .order("rank", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErr(error.message);
        else setRows((data ?? []) as LeaderboardRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [monthISO]);

  if (err) return <div className="notice">Couldn't load leaderboards: {err}</div>;
  if (rows.length === 0) return null;

  return (
    <>
      <div className="section-head">
        <h2>Leaderboards</h2>
        <span className="count">top 10 per metric</span>
      </div>
      <div className="lb-grid">
        {BOARDS.map((b) => {
          const board = rows
            .filter((r) => r.metric === b.metric)
            .slice(0, 10);
          return (
            <div className="lb-card" key={b.metric}>
              <div className="lb-title">{b.title}</div>
              <table className="deals">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Name</th>
                    <th className="r">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((r) => (
                    <tr key={`${b.metric}-${r.name}`}>
                      <td className="num">{r.rank}</td>
                      <td>{r.name}</td>
                      <td className="r num">
                        {b.kind === "money" ? money(r.value) : units(r.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}

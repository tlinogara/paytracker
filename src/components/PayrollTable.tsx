import type { PayrollRow } from "../lib/types";
import { money, moneyExact, units } from "../lib/format";

function pct(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(2)}%`;
}

export default function PayrollTable({ rows }: { rows: PayrollRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="tablewrap">
        <div className="empty">No payroll rows for this month yet.</div>
      </div>
    );
  }
  return (
    <div className="tablewrap">
      <table className="deals">
        <thead>
          <tr>
            <th>Rep</th>
            <th>Plan</th>
            <th className="r">Units</th>
            <th className="r">Front gross</th>
            <th className="r">Rate</th>
            <th className="r">Base</th>
            <th className="r">Enhancers</th>
            <th className="r">Draw</th>
            <th className="r">Gross pay</th>
            <th className="r">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.emp_no}>
              <td>{r.display_name}</td>
              <td>{r.pay_plan ?? "—"}</td>
              <td className="r num">{units(r.total_units)}</td>
              <td className="r money">{money(r.front_gross)}</td>
              <td className="r num">{pct(r.effective_rate)}</td>
              <td className="r money">{moneyExact(r.base)}</td>
              <td className="r money pos">{moneyExact(r.enhancers)}</td>
              <td className="r money">{moneyExact(r.draw)}</td>
              <td className="r money">{moneyExact(r.gross_pay)}</td>
              <td className={`r money ${(r.due ?? 0) < 0 ? "neg" : "pos"}`}>
                {moneyExact(r.due)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

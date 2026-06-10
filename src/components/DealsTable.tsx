import type { DealRow } from "../lib/types";
import { isNewStock, moneyExact, money, shortDate, units } from "../lib/format";

export default function DealsTable({
  deals,
  showRep,
}: {
  deals: DealRow[];
  showRep: boolean;
}) {
  if (deals.length === 0) {
    return (
      <div className="tablewrap">
        <div className="empty">
          No deals recorded for this month yet. Data refreshes hourly from the
          deal log.
        </div>
      </div>
    );
  }

  return (
    <div className="tablewrap">
      <table className="deals">
        <thead>
          <tr>
            <th>Date</th>
            <th>Deal</th>
            {showRep && <th>Rep</th>}
            <th>Customer / vehicle</th>
            <th>N/U</th>
            <th className="r">Unit</th>
            <th className="r">Front gross</th>
            <th className="r">My commission</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const isNew = isNewStock(d.stock_type);
            const comm = d.rep_commission ?? 0;
            const fg = d.front_gross;
            return (
              <tr key={`${d.deal_number}-${d.rep}`}>
                <td className="num">{shortDate(d.contract_date)}</td>
                <td>
                  <span className="deal-no">#{d.deal_number}</span>
                </td>
                {showRep && <td>{d.rep || "—"}</td>}
                <td>
                  {d.customer || "—"}
                  <br />
                  <span className="veh">{d.vehicle || ""}</span>
                </td>
                <td>
                  {isNew == null ? (
                    "—"
                  ) : (
                    <span className={`badge ${isNew ? "new" : "used"}`}>
                      {isNew ? "New" : "Used"}
                    </span>
                  )}
                </td>
                <td className="r num">{units(d.rep_unit_count)}</td>
                <td className={`r money ${fg != null && fg < 0 ? "neg" : ""}`}>
                  {money(fg)}
                </td>
                <td className={`r money ${comm < 0 ? "neg" : "pos"}`}>
                  {moneyExact(comm)}
                </td>
                <td>
                  {d.is_split_deal && (
                    <span className="badge split" title={d.salesperson ?? ""}>
                      Split
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

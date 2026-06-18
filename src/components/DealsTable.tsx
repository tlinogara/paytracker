import { useMemo, useState } from "react";
import type { DealRow } from "../lib/types";
import { isNewStock, moneyExact, money, shortDate, units } from "../lib/format";

type SortKey =
  | "date"
  | "deal"
  | "rep"
  | "customer"
  | "nu"
  | "unit"
  | "front"
  | "comm";

type Dir = "asc" | "desc";

const ACCESSORS: Record<SortKey, (d: DealRow) => string | number | null> = {
  date: (d) => d.contract_date,
  deal: (d) => {
    const n = Number(d.deal_number);
    return Number.isNaN(n) ? d.deal_number : n;
  },
  rep: (d) => d.rep?.toLowerCase() ?? null,
  customer: (d) => d.customer?.toLowerCase() ?? null,
  nu: (d) => d.stock_type?.toLowerCase() ?? null,
  unit: (d) => d.rep_unit_count,
  front: (d) => d.front_gross,
  comm: (d) => d.rep_commission,
};

function compare(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls always sink to the bottom
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function Th({
  label,
  k,
  sort,
  onSort,
  right,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: Dir };
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === k;
  return (
    <th className={`sth${right ? " r" : ""}`} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
      <button className={`sort ${active ? "active" : ""}`} onClick={() => onSort(k)}>
        {label}
        <span className="arrow">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

export default function DealsTable({
  deals,
  showRep,
}: {
  deals: DealRow[];
  showRep: boolean;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({
    key: "date",
    dir: "desc",
  });

  function onSort(k: SortKey) {
    setSort((s) =>
      s.key === k
        ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: k, dir: k === "unit" || k === "front" || k === "comm" || k === "date" ? "desc" : "asc" }
    );
  }

  const sorted = useMemo(() => {
    const acc = ACCESSORS[sort.key];
    const arr = [...deals].sort((a, b) => {
      const c = compare(acc(a), acc(b));
      return sort.dir === "asc" ? c : -c;
    });
    return arr;
  }, [deals, sort]);

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
            <Th label="Date" k="date" sort={sort} onSort={onSort} />
            <Th label="Deal" k="deal" sort={sort} onSort={onSort} />
            {showRep && <Th label="Rep" k="rep" sort={sort} onSort={onSort} />}
            <Th label="Customer / vehicle" k="customer" sort={sort} onSort={onSort} />
            <Th label="N/U" k="nu" sort={sort} onSort={onSort} />
            <Th label="Unit" k="unit" sort={sort} onSort={onSort} right />
            <Th label="Front gross" k="front" sort={sort} onSort={onSort} right />
            <Th label="My commission" k="comm" sort={sort} onSort={onSort} right />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => {
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
                  {!d.make || !d.make.trim() ? (
                    <span className="badge acq">Acq</span>
                  ) : isNew == null ? (
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
                  {d.enhancer_dollars != null && d.enhancer_dollars > 0 && (
                    <span className="deal-no"> incl. {moneyExact(d.enhancer_dollars)} enh</span>
                  )}
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

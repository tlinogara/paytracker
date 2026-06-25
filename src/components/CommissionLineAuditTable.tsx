import { useMemo, useState } from "react";
import type { CommissionLine } from "../lib/types";
import { moneyExact } from "../lib/format";

type SortKey = "rep" | "type" | "deal" | "explanation" | "amount";
type Dir = "asc" | "desc";

type SortState = { key: SortKey; dir: Dir };

const ACCESSORS: Record<SortKey, (line: CommissionLine) => string | number | null> = {
  rep: (line) => line.rep?.toLowerCase() ?? null,
  type: (line) => line.line_type?.toLowerCase() ?? null,
  deal: (line) => {
    if (!line.deal_number) return null;
    const parsed = Number(line.deal_number);
    return Number.isNaN(parsed) ? line.deal_number : parsed;
  },
  explanation: (line) => line.explanation?.toLowerCase() ?? null,
  amount: (line) => line.amount,
};

function compare(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function defaultDir(key: SortKey): Dir {
  return key === "amount" ? "desc" : "asc";
}

function Th({ label, k, sort, onSort, right }: { label: string; k: SortKey; sort: SortState; onSort: (k: SortKey) => void; right?: boolean }) {
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

export default function CommissionLineAuditTable({ lines }: { lines: CommissionLine[] }) {
  const [sort, setSort] = useState<SortState>({ key: "deal", dir: "asc" });

  function onSort(key: SortKey) {
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) });
  }

  const sorted = useMemo(() => {
    const accessor = ACCESSORS[sort.key];
    return [...lines].sort((a, b) => {
      const result = compare(accessor(a), accessor(b));
      if (result !== 0) return sort.dir === "asc" ? result : -result;
      return compare(ACCESSORS.rep(a), ACCESSORS.rep(b));
    });
  }, [lines, sort]);

  return (
    <div className="tablewrap">
      <table className="deals adj">
        <thead>
          <tr>
            <Th label="Rep" k="rep" sort={sort} onSort={onSort} />
            <Th label="Type" k="type" sort={sort} onSort={onSort} />
            <Th label="Deal" k="deal" sort={sort} onSort={onSort} />
            <Th label="Explanation" k="explanation" sort={sort} onSort={onSort} />
            <Th label="Amount" k="amount" sort={sort} onSort={onSort} right />
          </tr>
        </thead>
        <tbody>
          {sorted.map((line) => (
            <tr key={line.id}>
              <td>{line.rep}</td>
              <td>{line.line_type}</td>
              <td>{line.deal_number ?? "—"}</td>
              <td className="note-cell">{line.explanation ?? "—"}</td>
              <td className={`r money ${line.amount < 0 ? "neg" : "pos"}`}>{moneyExact(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

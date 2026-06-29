import { useMemo, useState } from "react";
import type { DealRow } from "../lib/types";
import { isNewStock, moneyExact, shortDate, units } from "../lib/format";

type DealWithCalc = DealRow & { base_commission?: number | null; unit_enhancement?: number | null };
type SortKey = "date" | "deal" | "stock" | "rep" | "customer" | "make" | "nu" | "unit" | "front" | "base" | "unit_enh" | "spiffs" | "enhancers" | "trade_spiffs" | "comm";
type Dir = "asc" | "desc";

const ACCESSORS: Record<SortKey, (d: DealWithCalc) => string | number | null> = {
  date: (d) => d.contract_date,
  deal: (d) => { const n = Number(d.deal_number); return Number.isNaN(n) ? d.deal_number : n; },
  stock: (d) => d.stock_number?.toLowerCase() ?? null,
  rep: (d) => d.rep?.toLowerCase() ?? null,
  customer: (d) => d.customer?.toLowerCase() ?? null,
  make: (d) => d.make?.toLowerCase() ?? null,
  nu: (d) => d.stock_type?.toLowerCase() ?? null,
  unit: (d) => d.rep_unit_count,
  front: (d) => d.front_gross,
  base: (d) => d.base_commission ?? null,
  unit_enh: (d) => d.unit_enhancement ?? null,
  spiffs: (d) => d.spiffs,
  enhancers: (d) => d.total_enhancers,
  trade_spiffs: (d) => d.trade_spiffs,
  comm: (d) => d.rep_commission,
};

function compare(a: string | number | null, b: string | number | null): number { if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; if (typeof a === "number" && typeof b === "number") return a - b; return String(a).localeCompare(String(b)); }
function isMoneySort(k: SortKey): boolean { return k === "unit" || k === "front" || k === "base" || k === "unit_enh" || k === "spiffs" || k === "enhancers" || k === "trade_spiffs" || k === "comm" || k === "date"; }
function Th({ label, k, sort, onSort, right }: { label: string; k: SortKey; sort: { key: SortKey; dir: Dir }; onSort: (k: SortKey) => void; right?: boolean }) { const active = sort.key === k; return <th className={`sth${right ? " r" : ""}`} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}><button className={`sort ${active ? "active" : ""}`} onClick={() => onSort(k)}>{label}<span className="arrow">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span></button></th>; }

export default function DealsTable({ deals, showRep }: { deals: DealRow[]; showRep: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "date", dir: "desc" });
  function onSort(k: SortKey) { setSort((s) => s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: isMoneySort(k) ? "desc" : "asc" }); }
  const sorted = useMemo(() => { const acc = ACCESSORS[sort.key]; return [...(deals as DealWithCalc[])].sort((a, b) => { const c = compare(acc(a), acc(b)); return sort.dir === "asc" ? c : -c; }); }, [deals, sort]);
  if (deals.length === 0) return <div className="tablewrap"><div className="empty">No deals recorded for this month yet. Data refreshes from the Tekion deal log.</div></div>;
  return <div className="tablewrap deals-wrap"><table className="deals deals-main"><thead><tr><Th label="Date" k="date" sort={sort} onSort={onSort} /><Th label="Deal" k="deal" sort={sort} onSort={onSort} /><Th label="Stock" k="stock" sort={sort} onSort={onSort} />{showRep && <Th label="Rep" k="rep" sort={sort} onSort={onSort} />}<Th label="Customer / vehicle" k="customer" sort={sort} onSort={onSort} /><Th label="Brand" k="make" sort={sort} onSort={onSort} /><Th label="Type" k="nu" sort={sort} onSort={onSort} /><Th label="Unit" k="unit" sort={sort} onSort={onSort} right /><Th label="Front" k="front" sort={sort} onSort={onSort} right /><Th label="Base" k="base" sort={sort} onSort={onSort} right /><Th label="Unit enh" k="unit_enh" sort={sort} onSort={onSort} right /><Th label="Spiff" k="spiffs" sort={sort} onSort={onSort} right /><Th label="Enh" k="enhancers" sort={sort} onSort={onSort} right /><Th label="Trade" k="trade_spiffs" sort={sort} onSort={onSort} right /><Th label="Comm" k="comm" sort={sort} onSort={onSort} right /><th className="split-col"></th></tr></thead><tbody>{sorted.map((d) => { const isNew = isNewStock(d.stock_type); const base = d.base_commission ?? 0; const unitEnh = d.unit_enhancement ?? 0; const comm = d.rep_commission ?? 0; const spiffs = d.spiffs ?? 0; const enhancers = d.total_enhancers ?? 0; const tradeSpiffs = d.trade_spiffs ?? 0; const fg = d.front_gross; return <tr key={`${d.deal_number}-${d.stock_number ?? "no-stock"}-${d.rep}`}><td className="num date-col">{shortDate(d.contract_date)}</td><td><span className="deal-no">#{d.deal_number}</span></td><td><span className="deal-no">{d.stock_number || "—"}</span></td>{showRep && <td className="rep-col">{d.rep || "—"}</td>}<td className="cust-col">{d.customer || "—"}<br /><span className="veh">{d.vehicle || ""}</span></td><td className="brand-col">{d.make?.trim() || "—"}</td><td>{!d.make || !d.make.trim() ? <span className="badge acq">Acq</span> : isNew == null ? "—" : <span className={`badge ${isNew ? "new" : "used"}`}>{isNew ? "New" : "Used"}</span>}</td><td className="r num">{units(d.rep_unit_count)}</td><td className={`r money ${fg != null && fg < 0 ? "neg" : ""}`}>{moneyExact(fg)}</td><td className={`r money ${base < 0 ? "neg" : base > 0 ? "pos" : ""}`}>{moneyExact(base)}</td><td className={`r money ${unitEnh < 0 ? "neg" : unitEnh > 0 ? "pos" : ""}`}>{moneyExact(unitEnh)}</td><td className={`r money ${spiffs < 0 ? "neg" : spiffs > 0 ? "pos" : ""}`}>{moneyExact(spiffs)}</td><td className={`r money ${enhancers < 0 ? "neg" : enhancers > 0 ? "pos" : ""}`}>{moneyExact(enhancers)}</td><td className={`r money ${tradeSpiffs < 0 ? "neg" : tradeSpiffs > 0 ? "pos" : ""}`}>{moneyExact(tradeSpiffs)}</td><td className={`r money ${comm < 0 ? "neg" : "pos"}`}>{moneyExact(comm)}</td><td>{d.is_split_deal && <span className="badge split" title={d.salesperson ?? ""}>Split</span>}</td></tr>; })}</tbody></table></div>;
}

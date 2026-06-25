type Dir = "asc" | "desc";

type SortState = { index: number; dir: Dir };

const SORT_LABELS = ["Rep", "Type", "Deal", "Explanation", "Amount"];
const DEFAULT_SORT: SortState = { index: 2, dir: "asc" };

function cellValue(row: HTMLTableRowElement, index: number): string | number | null {
  const text = row.cells[index]?.textContent?.trim() ?? "";
  if (!text || text === "—") return null;
  if (index === 2) {
    const parsed = Number(text.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(parsed) ? text.toLowerCase() : parsed;
  }
  if (index === 4) {
    const parsed = Number(text.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return text.toLowerCase();
}

function compare(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function findAuditTables(): HTMLTableElement[] {
  return Array.from(document.querySelectorAll<HTMLTableElement>("table.deals.adj")).filter((table) => {
    const labels = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim().replace(/[▲▼↕]/g, "") ?? "");
    return SORT_LABELS.every((label, index) => labels[index] === label);
  });
}

function applySort(table: HTMLTableElement, state: SortState): void {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const rows = Array.from(tbody.rows);
  rows.sort((a, b) => {
    const result = compare(cellValue(a, state.index), cellValue(b, state.index));
    return state.dir === "asc" ? result : -result;
  });
  for (const row of rows) tbody.appendChild(row);
  Array.from(table.querySelectorAll("thead th")).forEach((th, index) => {
    const button = th.querySelector("button");
    if (!button) return;
    const label = SORT_LABELS[index];
    button.textContent = `${label} ${state.index === index ? (state.dir === "asc" ? "▲" : "▼") : "↕"}`;
  });
}

function wireAuditTable(table: HTMLTableElement): void {
  if (table.dataset.auditSortable === "true") return;
  table.dataset.auditSortable = "true";
  let state = DEFAULT_SORT;
  Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th")).forEach((th, index) => {
    const label = SORT_LABELS[index];
    th.classList.add("sth");
    if (index === 4) th.classList.add("r");
    th.innerHTML = "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sort";
    button.textContent = `${label} ${state.index === index ? "▲" : "↕"}`;
    button.addEventListener("click", () => {
      state = state.index === index ? { index, dir: state.dir === "asc" ? "desc" : "asc" } : { index, dir: index === 4 ? "desc" : "asc" };
      applySort(table, state);
    });
    th.appendChild(button);
  });
  applySort(table, state);
}

function refreshAuditSorting(): void {
  for (const table of findAuditTables()) wireAuditTable(table);
}

if (typeof window !== "undefined") {
  window.addEventListener("load", refreshAuditSorting);
  const observer = new MutationObserver(refreshAuditSorting);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

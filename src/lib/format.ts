const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return usd.format(n);
}

export function moneyExact(n: number | null | undefined): string {
  if (n == null) return "—";
  return usdCents.format(n);
}

export function units(n: number | null | undefined): string {
  if (n == null) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function monthStartISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function nextMonthISO(d: Date): string {
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return monthStartISO(n);
}

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  return `${String(m).padStart(2, "0")}/${String(day).padStart(2, "0")}/${y}`;
}

export function isNewStock(stockType: string | null): boolean | null {
  if (!stockType) return null;
  const s = stockType.toLowerCase();
  if (s.includes("new")) return true;
  if (s.includes("used") || s.includes("pre")) return false;
  return null;
}

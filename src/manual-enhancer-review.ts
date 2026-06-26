import { supabase } from "./lib/supabase";

type Store = { id: string; name: string };
type ManualRow = {
  rule_id: string;
  month: string;
  store_id: string;
  brand: string;
  label: string;
  pct: number | null;
  flat_amount: number | null;
  employee_id: string;
  rep: string;
  proposed_amount: number | null;
  brand_front_gross: number | null;
  approved: boolean;
};

const ROOT_ID = "manual-enhancer-review-root";
const MONTH_STORAGE_KEY = "paytrack:selectedMonth";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

let storesCache: Store[] | null = null;
let mounted = false;
let lastKey = "";

function monthISO(): string {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("month") || window.sessionStorage.getItem(MONTH_STORAGE_KEY) || "";
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function canonicalStoreLabel(name: string): string {
  return name.toLowerCase().includes("beverly hills") ? "Beverly Hills" : name;
}

async function stores(): Promise<Store[]> {
  if (storesCache) return storesCache;
  const { data } = await supabase.from("stores").select("id,name").order("name");
  storesCache = (data ?? []) as Store[];
  return storesCache;
}

async function scopedStoreIds(): Promise<string[]> {
  const select = document.getElementById("calc-store") as HTMLSelectElement | null;
  const scope = select?.value ?? "global";
  if (scope === "global") return [];
  const all = await stores();
  return all.filter((store) => canonicalStoreLabel(store.name) === scope).map((store) => store.id);
}

function pctText(row: ManualRow): string {
  if (row.pct != null) return `${Number(row.pct).toFixed(2)}%`;
  if (row.flat_amount != null) return money.format(Number(row.flat_amount));
  return "";
}

function skeleton(root: HTMLElement): void {
  root.innerHTML = `<section class="card"><div class="section-head"><div><h2>Manual enhancer review</h2><p class="muted">Toggle manual brand enhancers by rep. Yes creates the enhancer adjustment; No removes it and refreshes commissions.</p></div><span class="pill">Loading…</span></div><div class="loading">Loading manual enhancers…</div></section>`;
}

function render(root: HTMLElement, rows: ManualRow[], message = ""): void {
  const approved = rows.filter((row) => row.approved).length;
  const body = rows.map((row) => {
    const key = `${row.rule_id}:${row.employee_id}`;
    return `<tr data-key="${key}"><td>${row.brand}</td><td>${row.label}</td><td>${row.rep}</td><td class="r">${pctText(row)}</td><td class="r">${money.format(Number(row.proposed_amount ?? 0))}</td><td class="r">${money.format(Number(row.brand_front_gross ?? 0))}</td><td class="action-cell"><button type="button" class="${row.approved ? "btn-approve" : "btn-secondary"}" data-manual-yes="${key}" ${row.approved ? "disabled" : ""}>Yes</button><button type="button" class="${row.approved ? "btn-secondary" : "btn-del"}" data-manual-no="${key}" ${row.approved ? "" : "disabled"}>No</button></td></tr>`;
  }).join("");
  root.innerHTML = `<section class="card"><div class="section-head"><div><h2>Manual enhancer review</h2><p class="muted">Toggle manual brand enhancers by rep. Yes creates the enhancer adjustment; No removes it and refreshes commissions.</p></div><span class="pill">${approved}/${rows.length} approved</span></div>${message ? `<div class="form-msg ok">${message}</div>` : ""}<div class="tablewrap"><table class="deals adj"><thead><tr><th>Brand</th><th>Manual enhancer</th><th>Rep</th><th class="r">Rate</th><th class="r">Proposed</th><th class="r">Brand gross</th><th>Approved</th></tr></thead><tbody>${body || `<tr><td colspan="7" class="muted">No manual enhancer rows for this month and store scope.</td></tr>`}</tbody></table></div></section>`;
}

async function fetchRows(): Promise<ManualRow[]> {
  const ids = await scopedStoreIds();
  let query = supabase.from("manual_enhancer_status").select("*").eq("month", monthISO()).order("brand").order("label").order("rep");
  if (ids.length === 1) query = query.eq("store_id", ids[0]);
  else if (ids.length > 1) query = query.in("store_id", ids);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ManualRow[];
}

async function load(root: HTMLElement, message = ""): Promise<void> {
  skeleton(root);
  try {
    const rows = await fetchRows();
    render(root, rows, message);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    root.innerHTML = `<section class="card"><div class="notice">${msg}</div></section>`;
  }
}

function install(root: HTMLElement): void {
  if (mounted) return;
  mounted = true;
  root.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement | null;
    const yes = target?.getAttribute("data-manual-yes");
    const no = target?.getAttribute("data-manual-no");
    const key = yes || no;
    if (!key) return;
    const [ruleId, employeeId] = key.split(":");
    root.querySelectorAll("button").forEach((button) => (button as HTMLButtonElement).disabled = true);
    const { error } = await supabase.rpc("set_manual_enhancer_approval", { p_rule_id: ruleId, p_employee_id: employeeId, p_approved: Boolean(yes) });
    if (error) {
      root.innerHTML = `<section class="card"><div class="notice">${error.message}</div></section>`;
      return;
    }
    await load(root, yes ? "Manual enhancer approved." : "Manual enhancer removed.");
  });
}

async function mount(): Promise<void> {
  if (!window.location.pathname.includes("calculations")) return;
  const page = document.querySelector("main.page");
  const storeSelect = document.getElementById("calc-store") as HTMLSelectElement | null;
  if (!page || !storeSelect) return;
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    const actionRow = page.querySelector(".action-row");
    if (actionRow?.parentElement) actionRow.insertAdjacentElement("afterend", root);
    else page.prepend(root);
  }
  install(root);
  const key = `${monthISO()}:${storeSelect.value}`;
  if (key === lastKey && root.innerHTML) return;
  lastKey = key;
  await load(root);
  if (!storeSelect.dataset.manualEnhancerListener) {
    storeSelect.dataset.manualEnhancerListener = "true";
    storeSelect.addEventListener("change", () => {
      lastKey = "";
      void mount();
    });
  }
}

const observer = new MutationObserver(() => void mount());
observer.observe(document.documentElement, { childList: true, subtree: true });
void mount();

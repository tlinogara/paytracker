import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Employee, Profile } from "../lib/types";
import Topbar from "../components/Topbar";
import Collapsible from "../components/Collapsible";

const ALL_BRANDS = "All brands";

function normalizedRole(role: string | null | undefined): string {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return role ?? "sales_rep";
}

function brandRank(brand: string): string {
  return brand === ALL_BRANDS ? "zzzzzz" : brand.toLocaleLowerCase();
}

function sortBrands(brands: string[]): string[] {
  return [...brands].sort((a, b) => brandRank(a).localeCompare(brandRank(b)));
}

type BrandRepClassification = {
  id: string;
  store_id: string | null;
  brand: string;
  employee_id: string;
  active: boolean;
  note: string | null;
};

type BrandAccess = {
  brand: string;
  store_id: string | null;
};

export default function BrandReps({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [brandAccess, setBrandAccess] = useState<BrandAccess[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [classifications, setClassifications] = useState<BrandRepClassification[]>([]);
  const [brand, setBrand] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [activeBrand, setActiveBrand] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const profileRes = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setProfile((profileRes.data as Profile) ?? null);
      const brandRes = await supabase.from("brand_list").select("brand,n").order("n", { ascending: false });
      setAllBrands(sortBrands(((brandRes.data ?? []) as { brand: string }[]).map((b) => b.brand).filter((b) => b !== ALL_BRANDS)));
      const accessRes = await supabase.from("user_brand_access").select("brand,store_id").eq("active", true).eq("user_id", session.user.id);
      setBrandAccess(((accessRes.data ?? []) as BrandAccess[]).filter((r) => r.brand));
    }
    loadProfile();
  }, [session.user.id]);

  const role = normalizedRole(profile?.role);
  const isBrandManager = role === "brand_manager";
  const canEdit = ["brand_manager", "general_sales_manager", "payroll_manager", "admin"].includes(role);

  const visibleBrands = useMemo(() => {
    if (isBrandManager) return sortBrands(Array.from(new Set(brandAccess.map((r) => r.brand))));
    return allBrands;
  }, [allBrands, brandAccess, isBrandManager]);

  useEffect(() => {
    if (visibleBrands.length === 1) {
      setActiveBrand(visibleBrands[0]);
      setBrand(visibleBrands[0]);
    } else if (activeBrand && !visibleBrands.includes(activeBrand)) {
      setActiveBrand("");
    }
  }, [activeBrand, visibleBrands]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setErr(null);

    let employeeQuery = supabase.from("employees").select("id,display_name,store_id,active").eq("active", true).order("display_name");
    let classificationQuery = supabase.from("brand_rep_classifications").select("*").eq("active", true).order("brand");

    const brandFilter = activeBrand ? [activeBrand] : visibleBrands;
    if (brandFilter.length > 0) classificationQuery = classificationQuery.in("brand", brandFilter);
    if (role === "general_sales_manager" && profile.store_id) employeeQuery = employeeQuery.eq("store_id", profile.store_id);

    const [employeeRes, classificationRes] = await Promise.all([employeeQuery, classificationQuery]);
    const e = employeeRes.error || classificationRes.error;
    if (e) setErr(e.message);
    setEmployees((employeeRes.data ?? []) as Employee[]);
    setClassifications(
      ((classificationRes.data ?? []) as BrandRepClassification[]).sort(
        (a, b) => brandRank(a.brand).localeCompare(brandRank(b.brand))
      )
    );
    setLoading(false);
  }, [activeBrand, profile, role, visibleBrands]);

  useEffect(() => { load(); }, [load]);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const grouped = useMemo(() => {
    const map = new Map<string, BrandRepClassification[]>();
    const groupBrands = activeBrand ? [activeBrand] : visibleBrands;
    for (const b of groupBrands) map.set(b, []);
    for (const row of classifications) {
      if (!groupBrands.includes(row.brand)) continue;
      if (!map.has(row.brand)) map.set(row.brand, []);
      map.get(row.brand)!.push(row);
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => (employeeById.get(a.employee_id)?.display_name ?? "").localeCompare(employeeById.get(b.employee_id)?.display_name ?? ""));
    }
    return map;
  }, [activeBrand, classifications, employeeById, visibleBrands]);

  function storeIdFor(employee: Employee) {
    if (isBrandManager) return brandAccess.find((r) => r.brand === brand)?.store_id ?? profile?.store_id ?? employee.store_id ?? null;
    return role === "general_sales_manager" ? profile?.store_id ?? employee.store_id ?? null : employee.store_id ?? profile?.store_id ?? null;
  }

  async function addClassification(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const employee = employeeById.get(employeeId);
    if (!brand || !employee) {
      setErr("Choose both a brand and a rep.");
      return;
    }
    if (!visibleBrands.includes(brand)) {
      setErr("This brand is outside your access scope.");
      return;
    }
    const storeId = storeIdFor(employee);
    if (!storeId) {
      setErr("This rep needs a store before they can be classified.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("brand_rep_classifications").upsert({
      store_id: storeId,
      brand,
      employee_id: employee.id,
      active: true,
    }, { onConflict: "store_id,brand,employee_id" });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setOk(`${employee.display_name} added to ${brand}.`);
      setEmployeeId("");
      load();
    }
  }

  async function moveClassification(row: BrandRepClassification, nextBrand: string) {
    if (nextBrand === row.brand) return;
    if (!visibleBrands.includes(nextBrand)) {
      setErr("This brand is outside your access scope.");
      return;
    }
    setErr(null);
    setOk(null);
    const employee = employeeById.get(row.employee_id);
    if (!employee) {
      setErr("Rep not found.");
      return;
    }
    setBusy(true);
    const insertRes = await supabase.from("brand_rep_classifications").upsert({
      store_id: row.store_id ?? storeIdFor(employee),
      brand: nextBrand,
      employee_id: row.employee_id,
      active: true,
    }, { onConflict: "store_id,brand,employee_id" });
    const removeRes = insertRes.error ? insertRes : await supabase.from("brand_rep_classifications").update({ active: false }).eq("id", row.id);
    setBusy(false);
    if (removeRes.error) setErr(removeRes.error.message);
    else {
      setOk(`${employee.display_name} moved to ${nextBrand}.`);
      load();
    }
  }

  async function removeClassification(row: BrandRepClassification) {
    setErr(null);
    setOk(null);
    setBusy(true);
    const { error } = await supabase.from("brand_rep_classifications").update({ active: false }).eq("id", row.id);
    setBusy(false);
    if (error) setErr(error.message);
    else {
      const employeeName = employeeById.get(row.employee_id)?.display_name ?? "Rep";
      setOk(`${employeeName} removed from ${row.brand}.`);
      load();
    }
  }

  const availableEmployees = employees.filter((e) => !activeBrand || !(grouped.get(activeBrand) ?? []).some((row) => row.employee_id === e.id));

  return (
    <>
      <Topbar profile={profile} />
      <main className="page">
        <div className="section-head"><h2>Team Setup</h2><span className="count">{loading ? "loading…" : `${classifications.length} active assignment(s)`}</span></div>
        {err && <div className="notice">{err}</div>}
        {ok && <div className="form-msg ok">{ok}</div>}
        {!canEdit && profile && <div className="notice">You can view brand rep classifications here. Edits are for managers, payroll, and admins.</div>}
        {visibleBrands.length > 1 && <div className="brand-filter"><button className={`fchip ${activeBrand === "" ? "active" : ""}`} onClick={() => setActiveBrand("")}>All accessible brands</button>{visibleBrands.map((b) => <button key={b} className={`fchip ${activeBrand === b ? "active" : ""}`} onClick={() => { setActiveBrand(b); setBrand(b); }}>{b}</button>)}</div>}
        {isBrandManager && visibleBrands.length === 0 && <div className="notice">No brand access has been assigned to this account yet.</div>}
        <Collapsible title="Add or change classifications" count={activeBrand || "accessible brands"} defaultOpen>
          {canEdit && <form className="adj-form stock-form" onSubmit={addClassification}><div className="field"><label htmlFor="brand-rep-brand">Brand</label><select id="brand-rep-brand" required value={brand} onChange={(e) => setBrand(e.target.value)}><option value="" disabled>Choose…</option>{visibleBrands.map((b) => <option key={b} value={b}>{b}</option>)}</select></div><div className="field grow"><label htmlFor="brand-rep-employee">Rep</label><select id="brand-rep-employee" required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="" disabled>Choose…</option>{availableEmployees.map((e) => <option key={e.id} value={e.id}>{e.display_name}</option>)}</select></div><button className="btn-primary slim" disabled={busy} type="submit">Add rep</button></form>}
          <div className="tablewrap"><table className="deals adj"><thead><tr><th>Brand</th><th>Rep</th>{canEdit && <th>Move to brand</th>}{canEdit && <th></th>}</tr></thead><tbody>{Array.from(grouped.entries()).flatMap(([b, rows]) => {
            if (rows.length === 0) return [<tr key={`${b}-empty`}><td>{b}</td><td className="muted" colSpan={canEdit ? 3 : 1}>No reps assigned.</td></tr>];
            return rows.map((row, idx) => <tr key={row.id}><td>{idx === 0 ? b : ""}</td><td>{employeeById.get(row.employee_id)?.display_name ?? "Rep not visible"}</td>{canEdit && <td><select disabled={busy} value={row.brand} onChange={(e) => moveClassification(row, e.target.value)}>{visibleBrands.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>}{canEdit && <td className="r"><button className="btn-del" disabled={busy} onClick={() => removeClassification(row)}>Remove</button></td>}</tr>);
          })}</tbody></table></div>
        </Collapsible>
      </main>
    </>
  );
}

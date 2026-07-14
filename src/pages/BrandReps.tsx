import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Employee, Profile } from "../lib/types";
import Topbar from "../components/Topbar";

const ALL_BRANDS = "All brands";

function normalizedRole(role: string | null | undefined): string {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return role ?? "sales_rep";
}

function roleLabel(role: string): string {
  if (role === "brand_manager") return "Brand manager";
  if (role === "general_sales_manager") return "General sales manager";
  if (role === "payroll_manager") return "Payroll manager";
  if (role === "admin") return "Admin";
  return "Sales rep";
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
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const [profileRes, brandRes, accessRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", session.user.id).single(),
        supabase.from("brand_list").select("brand,n").order("n", { ascending: false }),
        supabase.from("user_brand_access").select("brand,store_id").eq("active", true).eq("user_id", session.user.id),
      ]);

      const firstError = profileRes.error || brandRes.error || accessRes.error;
      if (firstError) setErr(firstError.message);
      setProfile((profileRes.data as Profile) ?? null);
      setAllBrands(sortBrands(((brandRes.data ?? []) as { brand: string }[]).map((row) => row.brand).filter((value) => value !== ALL_BRANDS)));
      setBrandAccess(((accessRes.data ?? []) as BrandAccess[]).filter((row) => row.brand));
    }

    loadProfile();
  }, [session.user.id]);

  const role = normalizedRole(profile?.role);
  const isBrandManager = role === "brand_manager";
  const canEdit = ["brand_manager", "general_sales_manager", "payroll_manager", "admin"].includes(role);

  const visibleBrands = useMemo(() => {
    if (isBrandManager) return sortBrands(Array.from(new Set(brandAccess.map((row) => row.brand))));
    return allBrands;
  }, [allBrands, brandAccess, isBrandManager]);

  useEffect(() => {
    if (visibleBrands.length === 1) {
      setActiveBrand(visibleBrands[0]);
      setBrand(visibleBrands[0]);
    } else {
      if (activeBrand && !visibleBrands.includes(activeBrand)) setActiveBrand("");
      if (brand && !visibleBrands.includes(brand)) setBrand("");
    }
  }, [activeBrand, brand, visibleBrands]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setErr(null);

    let employeeQuery = supabase.from("employees").select("id,display_name,store_id,active").eq("active", true).order("display_name");
    let classificationQuery = supabase.from("brand_rep_classifications").select("*").eq("active", true).order("brand");

    if (role === "general_sales_manager" && profile.store_id) employeeQuery = employeeQuery.eq("store_id", profile.store_id);
    if (visibleBrands.length > 0) classificationQuery = classificationQuery.in("brand", visibleBrands);
    if (isBrandManager && visibleBrands.length === 0) {
      setEmployees([]);
      setClassifications([]);
      setLoading(false);
      return;
    }

    const [employeeRes, classificationRes] = await Promise.all([employeeQuery, classificationQuery]);
    const firstError = employeeRes.error || classificationRes.error;
    if (firstError) setErr(firstError.message);

    setEmployees((employeeRes.data ?? []) as Employee[]);
    setClassifications(
      ((classificationRes.data ?? []) as BrandRepClassification[]).sort(
        (a, b) => brandRank(a.brand).localeCompare(brandRank(b.brand)),
      ),
    );
    setLoading(false);
  }, [isBrandManager, profile, role, visibleBrands]);

  useEffect(() => {
    load();
  }, [load]);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const currentBrand of visibleBrands) counts.set(currentBrand, 0);
    for (const row of classifications) counts.set(row.brand, (counts.get(row.brand) ?? 0) + 1);
    return counts;
  }, [classifications, visibleBrands]);

  const assignedEmployeeIds = useMemo(
    () => new Set(classifications.map((row) => row.employee_id)),
    [classifications],
  );

  const unassignedEmployees = useMemo(
    () => employees.filter((employee) => !assignedEmployeeIds.has(employee.id)),
    [assignedEmployeeIds, employees],
  );

  const filteredAssignments = useMemo(() => {
    const query = assignmentSearch.trim().toLocaleLowerCase();
    return classifications.filter((row) => {
      if (activeBrand && row.brand !== activeBrand) return false;
      if (!query) return true;
      const name = employeeById.get(row.employee_id)?.display_name ?? "";
      return `${name} ${row.brand}`.toLocaleLowerCase().includes(query);
    });
  }, [activeBrand, assignmentSearch, classifications, employeeById]);

  const groupedAssignments = useMemo(() => {
    const brands = activeBrand ? [activeBrand] : visibleBrands;
    return brands.map((currentBrand) => ({
      brand: currentBrand,
      rows: filteredAssignments
        .filter((row) => row.brand === currentBrand)
        .sort((a, b) => {
          const aName = employeeById.get(a.employee_id)?.display_name ?? "";
          const bName = employeeById.get(b.employee_id)?.display_name ?? "";
          return aName.localeCompare(bName);
        }),
    }));
  }, [activeBrand, employeeById, filteredAssignments, visibleBrands]);

  const availableEmployees = useMemo(() => {
    if (!brand) return [];
    const alreadyAssigned = new Set(
      classifications.filter((row) => row.brand === brand).map((row) => row.employee_id),
    );
    const query = employeeSearch.trim().toLocaleLowerCase();
    return employees.filter((employee) => {
      if (alreadyAssigned.has(employee.id)) return false;
      return !query || employee.display_name.toLocaleLowerCase().includes(query);
    });
  }, [brand, classifications, employeeSearch, employees]);

  useEffect(() => {
    if (employeeId && !availableEmployees.some((employee) => employee.id === employeeId)) setEmployeeId("");
  }, [availableEmployees, employeeId]);

  function storeIdFor(employee: Employee, targetBrand: string): string | null {
    if (isBrandManager) {
      return brandAccess.find((row) => row.brand === targetBrand)?.store_id ?? profile?.store_id ?? employee.store_id ?? null;
    }
    if (role === "general_sales_manager") return profile?.store_id ?? employee.store_id ?? null;
    return employee.store_id ?? profile?.store_id ?? null;
  }

  async function addClassification(event: FormEvent) {
    event.preventDefault();
    setErr(null);
    setOk(null);

    const employee = employeeById.get(employeeId);
    if (!brand || !employee) {
      setErr("Choose a brand and salesperson before adding the assignment.");
      return;
    }
    if (!visibleBrands.includes(brand)) {
      setErr("This brand is outside your access scope.");
      return;
    }

    const storeId = storeIdFor(employee, brand);
    if (!storeId) {
      setErr("This salesperson needs a location before they can be assigned to a team.");
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
      setEmployeeSearch("");
      await load();
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
      setErr("Salesperson record not found.");
      return;
    }

    const storeId = row.store_id ?? storeIdFor(employee, nextBrand);
    if (!storeId) {
      setErr("This salesperson needs a location before they can be moved.");
      return;
    }

    setBusy(true);
    const insertRes = await supabase.from("brand_rep_classifications").upsert({
      store_id: storeId,
      brand: nextBrand,
      employee_id: row.employee_id,
      active: true,
    }, { onConflict: "store_id,brand,employee_id" });
    const removeRes = insertRes.error
      ? insertRes
      : await supabase.from("brand_rep_classifications").update({ active: false }).eq("id", row.id);
    setBusy(false);

    if (removeRes.error) setErr(removeRes.error.message);
    else {
      setOk(`${employee.display_name} moved to ${nextBrand}.`);
      await load();
    }
  }

  async function removeClassification(row: BrandRepClassification) {
    const employeeName = employeeById.get(row.employee_id)?.display_name ?? "This salesperson";
    if (!window.confirm(`Remove ${employeeName} from ${row.brand}?`)) return;

    setErr(null);
    setOk(null);
    setBusy(true);
    const { error } = await supabase.from("brand_rep_classifications").update({ active: false }).eq("id", row.id);
    setBusy(false);

    if (error) setErr(error.message);
    else {
      setOk(`${employeeName} removed from ${row.brand}.`);
      await load();
    }
  }

  function selectBrand(nextBrand: string) {
    setActiveBrand(nextBrand);
    if (nextBrand) setBrand(nextBrand);
    setAssignmentSearch("");
  }

  const selectedTeamLabel = activeBrand || "All brand teams";
  const assignedPeopleCount = assignedEmployeeIds.size;

  return (
    <>
      <Topbar profile={profile} />
      <main className="page team-setup-page">
        <header className="page-heading team-page-heading">
          <div>
            <span className="eyebrow">Administration</span>
            <h1>Team setup</h1>
            <p>Assign salespeople to the brand teams that control commission visibility, bonus review, and brand level reporting.</p>
          </div>
          <div className="page-context">
            <span>Your access</span>
            <strong>{roleLabel(role)}</strong>
          </div>
        </header>

        {err && <div className="notice">{err}</div>}
        {ok && <div className="form-msg ok">{ok}</div>}
        {!canEdit && profile && <div className="notice">You can review team assignments here. Editing is available to managers, payroll managers, and admins.</div>}
        {isBrandManager && visibleBrands.length === 0 && <div className="notice">No brand access has been assigned to this account yet.</div>}

        {visibleBrands.length > 0 && (
          <>
            <section className="team-summary-grid" aria-label="Team setup summary">
              <div className="team-summary-card">
                <span>Brand teams</span>
                <strong>{visibleBrands.length}</strong>
                <small>Available in your scope</small>
              </div>
              <div className="team-summary-card">
                <span>Assigned people</span>
                <strong>{assignedPeopleCount}</strong>
                <small>On at least one brand team</small>
              </div>
              <div className={`team-summary-card ${unassignedEmployees.length > 0 ? "attention" : ""}`}>
                <span>Not on a team</span>
                <strong>{unassignedEmployees.length}</strong>
                <small>{unassignedEmployees.length > 0 ? "Review before commissions" : "Everyone is assigned"}</small>
              </div>
              <div className="team-summary-card">
                <span>Assignments</span>
                <strong>{classifications.length}</strong>
                <small>People may belong to multiple brands</small>
              </div>
            </section>

            <div className="team-setup-note">
              <strong>Why this matters</strong>
              <span>Only salespeople assigned here appear under their brand team in commissions and bonus workflows.</span>
            </div>

            <div className="team-setup-layout">
              <aside className="team-brand-sidebar">
                <div className="team-sidebar-head">
                  <div>
                    <span className="eyebrow">Filter</span>
                    <h2>Brand teams</h2>
                  </div>
                  <span>{visibleBrands.length}</span>
                </div>

                <div className="team-brand-list">
                  <button
                    type="button"
                    className={`team-brand-option ${activeBrand === "" ? "active" : ""}`}
                    onClick={() => selectBrand("")}
                  >
                    <span className="team-brand-mark">A</span>
                    <span className="team-brand-copy">
                      <strong>All teams</strong>
                      <small>{classifications.length} assignments</small>
                    </span>
                  </button>
                  {visibleBrands.map((currentBrand) => {
                    const count = assignmentCounts.get(currentBrand) ?? 0;
                    return (
                      <button
                        type="button"
                        key={currentBrand}
                        className={`team-brand-option ${activeBrand === currentBrand ? "active" : ""}`}
                        onClick={() => selectBrand(currentBrand)}
                      >
                        <span className="team-brand-mark">{currentBrand.charAt(0).toUpperCase()}</span>
                        <span className="team-brand-copy">
                          <strong>{currentBrand}</strong>
                          <small>{count} {count === 1 ? "person" : "people"}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="unassigned-panel">
                  <div className="unassigned-head">
                    <strong>Not on any team</strong>
                    <span>{unassignedEmployees.length}</span>
                  </div>
                  {unassignedEmployees.length > 0 ? (
                    <div className="unassigned-list">
                      {unassignedEmployees.slice(0, 8).map((employee) => (
                        <button
                          type="button"
                          key={employee.id}
                          onClick={() => {
                            setEmployeeId(employee.id);
                            setEmployeeSearch(employee.display_name);
                          }}
                        >
                          <span>{employee.display_name.charAt(0).toUpperCase()}</span>
                          <strong>{employee.display_name}</strong>
                        </button>
                      ))}
                      {unassignedEmployees.length > 8 && <small>Plus {unassignedEmployees.length - 8} more. Use search to find them.</small>}
                    </div>
                  ) : (
                    <p>Every active salesperson is assigned to at least one team.</p>
                  )}
                </div>
              </aside>

              <div className="team-workspace">
                <section className="team-workspace-card team-assign-card">
                  <div className="team-card-heading">
                    <div>
                      <span className="eyebrow">Add assignment</span>
                      <h2>Place a salesperson on a team</h2>
                      <p>Choose the brand first, then select an active salesperson who is not already on that team.</p>
                    </div>
                    {brand && <span className="badge new">{brand}</span>}
                  </div>

                  {canEdit ? (
                    <form className="team-assign-form" onSubmit={addClassification}>
                      <label className="field">
                        <span>Brand team</span>
                        <select required value={brand} onChange={(event) => setBrand(event.target.value)}>
                          <option value="" disabled>Choose a brand</option>
                          {visibleBrands.map((currentBrand) => <option key={currentBrand} value={currentBrand}>{currentBrand}</option>)}
                        </select>
                      </label>
                      <label className="field team-person-search">
                        <span>Find salesperson</span>
                        <input
                          value={employeeSearch}
                          onChange={(event) => setEmployeeSearch(event.target.value)}
                          placeholder={brand ? "Search active salespeople" : "Choose a brand first"}
                          disabled={!brand}
                        />
                      </label>
                      <label className="field team-person-select">
                        <span>Salesperson</span>
                        <select
                          required
                          value={employeeId}
                          onChange={(event) => setEmployeeId(event.target.value)}
                          disabled={!brand}
                        >
                          <option value="">{brand ? "Choose a salesperson" : "Choose a brand first"}</option>
                          {availableEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}
                        </select>
                      </label>
                      <button className="btn-primary slim" disabled={busy || !brand || !employeeId} type="submit">
                        {busy ? "Saving…" : "Add to team"}
                      </button>
                    </form>
                  ) : (
                    <div className="empty-card">You do not have permission to change team assignments.</div>
                  )}

                  {brand && availableEmployees.length === 0 && !loading && (
                    <div className="team-form-hint">No matching unassigned salespeople remain for {brand}.</div>
                  )}
                </section>

                <section className="team-workspace-card team-roster-card">
                  <div className="team-card-heading roster-heading">
                    <div>
                      <span className="eyebrow">Current assignments</span>
                      <h2>{selectedTeamLabel}</h2>
                      <p>Move a salesperson to another brand or remove them from the selected team.</p>
                    </div>
                    <label className="search-field compact-search">
                      <span>Search assignments</span>
                      <input
                        value={assignmentSearch}
                        onChange={(event) => setAssignmentSearch(event.target.value)}
                        placeholder="Name or brand"
                      />
                    </label>
                  </div>

                  {loading ? (
                    <div className="loading">Loading team assignments…</div>
                  ) : (
                    <div className="team-roster-groups">
                      {groupedAssignments.map((group) => (
                        <section className="team-roster-group" key={group.brand}>
                          <div className="team-group-heading">
                            <div>
                              <span className="team-brand-mark">{group.brand.charAt(0).toUpperCase()}</span>
                              <div>
                                <h3>{group.brand}</h3>
                                <p>{group.rows.length} {group.rows.length === 1 ? "person" : "people"} shown</p>
                              </div>
                            </div>
                            <span>{assignmentCounts.get(group.brand) ?? 0} total</span>
                          </div>

                          {group.rows.length > 0 ? (
                            <div className="team-roster-list">
                              {group.rows.map((row) => {
                                const employee = employeeById.get(row.employee_id);
                                const employeeName = employee?.display_name ?? "Salesperson not visible";
                                return (
                                  <div className="team-roster-row" key={row.id}>
                                    <span className="team-person-avatar">{employeeName.charAt(0).toUpperCase()}</span>
                                    <div className="team-person-copy">
                                      <strong>{employeeName}</strong>
                                      <span>Assigned to {row.brand}</span>
                                    </div>
                                    {canEdit && (
                                      <div className="team-row-actions">
                                        <label>
                                          <span>Move to</span>
                                          <select
                                            disabled={busy}
                                            value={row.brand}
                                            onChange={(event) => moveClassification(row, event.target.value)}
                                          >
                                            {visibleBrands.map((option) => <option key={option} value={option}>{option}</option>)}
                                          </select>
                                        </label>
                                        <button className="btn-del" disabled={busy} type="button" onClick={() => removeClassification(row)}>Remove</button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="team-empty-group">
                              {assignmentSearch.trim() ? "No assignments match your search." : `No salespeople are assigned to ${group.brand}.`}
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

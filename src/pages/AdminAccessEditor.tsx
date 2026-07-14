import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { Employee, Profile, Role } from "../lib/types";

const ROLE_OPTIONS: Array<{ value: Role; label: string; description: string }> = [
  { value: "sales_rep", label: "Sales rep", description: "Sees only their own deals and pay breakdown." },
  { value: "brand_manager", label: "Brand manager", description: "Sees the brand and location combinations assigned below." },
  { value: "general_sales_manager", label: "General sales manager", description: "Sees their primary location and any additional locations assigned below." },
  { value: "payroll_manager", label: "Payroll manager", description: "Sees all locations and can manage imports, month close, and commission rules." },
  { value: "admin", label: "Admin", description: "Has full access to every location, user, and setting." },
];

type Store = { id: string; name: string; active: boolean | null };
type Brand = { brand: string };
type SaveResult = { error: { message: string } | null };

export type StoreAccessRow = {
  id: string;
  user_id: string;
  store_id: string | null;
  access_role: string | null;
  active: boolean | null;
  note: string | null;
  stores?: { name: string | null } | null;
};

export type BrandAccessRow = {
  id: string;
  user_id: string;
  store_id: string | null;
  brand: string | null;
  active: boolean | null;
  note: string | null;
  stores?: { name: string | null } | null;
};

function normalizeRole(role: string | null | undefined): Role {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return (role ?? "sales_rep") as Role;
}

function roleInfo(role: Role) {
  return ROLE_OPTIONS.find((option) => option.value === role) ?? ROLE_OPTIONS[0];
}

export default function AdminAccessEditor({
  profile,
  storeAccess,
  brandAccess,
  scopeSummary,
  onSaved,
}: {
  profile: Profile | null;
  storeAccess: StoreAccessRow[];
  brandAccess: BrandAccessRow[];
  scopeSummary: string;
  onSaved: () => Promise<void>;
}) {
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("sales_rep");
  const [storeId, setStoreId] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const [scopeStoreId, setScopeStoreId] = useState("");
  const [scopeBrandStoreId, setScopeBrandStoreId] = useState("");
  const [scopeBrand, setScopeBrand] = useState("");

  useEffect(() => {
    async function loadOptions() {
      const [storeRes, employeeRes, brandRes] = await Promise.all([
        supabase.from("stores").select("id,name,active").order("name"),
        supabase.from("employees").select("id,display_name,store_id,tekion_names,active").eq("active", true).order("display_name"),
        supabase.from("brand_list").select("brand").order("brand"),
      ]);

      if (storeRes.error) setErr(storeRes.error.message);
      else {
        const nextStores = ((storeRes.data ?? []) as Store[]).filter((store) => store.active !== false);
        setStores(nextStores);
        setScopeStoreId((current) => current || nextStores[0]?.id || "");
        setScopeBrandStoreId((current) => current || nextStores[0]?.id || "");
      }

      if (employeeRes.error) setErr(employeeRes.error.message);
      else setEmployees((employeeRes.data ?? []) as Employee[]);

      if (brandRes.error) setErr(brandRes.error.message);
      else {
        const nextBrands = (brandRes.data ?? []) as Brand[];
        setBrands(nextBrands);
        setScopeBrand((current) => current || nextBrands[0]?.brand || "");
      }
    }

    loadOptions();
  }, []);

  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name || profile.rep_name || "");
    setEmail(profile.email || "");
    setRole(normalizeRole(profile.role));
    setStoreId(profile.store_id || "");
    setEmployeeId(profile.employee_id || "");
    setErr(null);
    setOk(null);
  }, [profile]);

  const selectedRole = roleInfo(role);
  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId) ?? null,
    [employeeId, employees],
  );
  const assignedStoreIds = useMemo(
    () => new Set(storeAccess.map((row) => row.store_id).filter((value): value is string => Boolean(value))),
    [storeAccess],
  );
  const availableStoreScopes = stores.filter((store) => !assignedStoreIds.has(store.id));
  const assignedBrandKeys = useMemo(
    () => new Set(brandAccess.map((row) => `${row.store_id ?? ""}::${row.brand ?? ""}`)),
    [brandAccess],
  );
  const brandScopeExists = assignedBrandKeys.has(`${scopeBrandStoreId}::${scopeBrand}`);

  async function run(action: () => PromiseLike<SaveResult>, message: string) {
    setBusy(true);
    setErr(null);
    setOk(null);
    const { error } = await action();
    setBusy(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setOk(message);
    await onSaved();
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;

    if (role === "sales_rep" && !employeeId) {
      setErr("Choose the salesperson record this login belongs to.");
      return;
    }

    const store = stores.find((item) => item.id === storeId) ?? null;
    await run(
      () => supabase.from("profiles").update({
        full_name: name.trim() || null,
        email: email.trim(),
        role,
        employee_id: role === "sales_rep" ? employeeId : null,
        rep_name: role === "sales_rep" ? selectedEmployee?.display_name ?? null : null,
        store_id: storeId || null,
        store_name: store?.name ?? null,
      }).eq("id", profile.id),
      "User details saved.",
    );
  }

  async function addStoreScope(event: FormEvent) {
    event.preventDefault();
    if (!profile || !scopeStoreId) return;

    await run(
      () => supabase.from("user_store_access").insert({
        user_id: profile.id,
        store_id: scopeStoreId,
        access_role: "general_sales_manager",
        active: true,
      }),
      "Additional location added.",
    );
  }

  async function removeStoreScope(id: string) {
    await run(
      () => supabase.from("user_store_access").update({ active: false }).eq("id", id),
      "Additional location removed.",
    );
  }

  async function addBrandScope(event: FormEvent) {
    event.preventDefault();
    if (!profile || !scopeBrandStoreId || !scopeBrand) return;

    await run(
      () => supabase.from("user_brand_access").insert({
        user_id: profile.id,
        store_id: scopeBrandStoreId,
        brand: scopeBrand,
        active: true,
      }),
      "Brand access added.",
    );
  }

  async function removeBrandScope(id: string) {
    await run(
      () => supabase.from("user_brand_access").update({ active: false }).eq("id", id),
      "Brand access removed.",
    );
  }

  function changeEmployee(nextEmployeeId: string) {
    setEmployeeId(nextEmployeeId);
    const employee = employees.find((item) => item.id === nextEmployeeId);
    if (employee?.store_id) setStoreId(employee.store_id);
  }

  if (!profile) {
    return <div className="empty-card">Select a user to manage their account and permissions.</div>;
  }

  return (
    <section className="access-detail">
      <header className="access-detail-head">
        <div>
          <span className="eyebrow">Selected user</span>
          <h2>{profile.full_name || profile.rep_name || profile.email}</h2>
          <p>{profile.email}</p>
        </div>
        <span className={`role-badge role-${role}`}>{selectedRole.label}</span>
      </header>

      <div className="access-scope-banner">
        <span>Effective access</span>
        <strong>{scopeSummary}</strong>
      </div>

      {err && <div className="form-msg err">{err}</div>}
      {ok && <div className="form-msg ok">{ok}</div>}

      <form className="settings-form" onSubmit={saveProfile}>
        <div className="form-section-head">
          <div>
            <h3>Account details</h3>
            <p>Set the role first. The fields and permissions below will match that role.</p>
          </div>
        </div>

        <div className="settings-grid">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Primary location</label>
            <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              <option value="">No primary location</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </div>
          {role === "sales_rep" && (
            <div className="field field-wide">
              <label>Linked salesperson</label>
              <select value={employeeId} onChange={(event) => changeEmployee(event.target.value)} required>
                <option value="">Choose the matching salesperson</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}
              </select>
              <small>This link controls which deals and commissions the user can see.</small>
            </div>
          )}
        </div>

        <div className="role-explainer">
          <strong>{selectedRole.label}</strong>
          <span>{selectedRole.description}</span>
        </div>

        <div className="form-actions">
          <button className="btn-primary slim" disabled={busy || (role === "sales_rep" && !employeeId)} type="submit">
            {busy ? "Saving" : "Save changes"}
          </button>
        </div>
      </form>

      {role === "general_sales_manager" && (
        <section className="permission-panel">
          <div className="form-section-head">
            <div>
              <h3>Additional locations</h3>
              <p>The primary location is already included. Add only other locations this manager should see.</p>
            </div>
          </div>

          <div className="permission-list">
            {storeAccess.length === 0 && <div className="empty-inline">No additional locations assigned.</div>}
            {storeAccess.map((row) => (
              <div className="permission-item" key={row.id}>
                <div><strong>{row.stores?.name || row.note || "Location"}</strong><span>Additional manager access</span></div>
                <button className="btn-del" disabled={busy} onClick={() => removeStoreScope(row.id)} type="button">Remove</button>
              </div>
            ))}
          </div>

          {availableStoreScopes.length > 0 && (
            <form className="permission-form" onSubmit={addStoreScope}>
              <div className="field">
                <label>Add location</label>
                <select value={scopeStoreId} onChange={(event) => setScopeStoreId(event.target.value)}>
                  {availableStoreScopes.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </div>
              <button className="btn-primary slim" disabled={busy || !scopeStoreId} type="submit">Add location</button>
            </form>
          )}
        </section>
      )}

      {role === "brand_manager" && (
        <section className="permission-panel">
          <div className="form-section-head">
            <div>
              <h3>Brand access</h3>
              <p>Assign each brand and location combination this manager is responsible for.</p>
            </div>
          </div>

          <div className="permission-list">
            {brandAccess.length === 0 && <div className="empty-inline">No brand access assigned.</div>}
            {brandAccess.map((row) => (
              <div className="permission-item" key={row.id}>
                <div><strong>{row.brand || "Brand"}</strong><span>{row.stores?.name || "Location"}</span></div>
                <button className="btn-del" disabled={busy} onClick={() => removeBrandScope(row.id)} type="button">Remove</button>
              </div>
            ))}
          </div>

          <form className="permission-form brand-permission-form" onSubmit={addBrandScope}>
            <div className="field">
              <label>Location</label>
              <select value={scopeBrandStoreId} onChange={(event) => setScopeBrandStoreId(event.target.value)}>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Brand</label>
              <select value={scopeBrand} onChange={(event) => setScopeBrand(event.target.value)}>
                {brands.map((brand) => <option key={brand.brand} value={brand.brand}>{brand.brand}</option>)}
              </select>
            </div>
            <button className="btn-primary slim" disabled={busy || !scopeBrand || !scopeBrandStoreId || brandScopeExists} type="submit">
              {brandScopeExists ? "Already assigned" : "Add brand"}
            </button>
          </form>
        </section>
      )}

      {(role === "payroll_manager" || role === "admin") && (
        <div className="global-access-note">
          <strong>No extra scope needed</strong>
          <span>This role automatically has access to every location.</span>
        </div>
      )}
    </section>
  );
}

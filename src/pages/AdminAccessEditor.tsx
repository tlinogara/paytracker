import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { Profile, Role } from "../lib/types";

const ROLES: Role[] = ["sales_rep", "brand_manager", "general_sales_manager", "payroll_manager", "admin"];

const STORE_ACCESS_ROLES = ["general_sales_manager", "payroll_manager", "admin"];

type Store = { id: string; name: string; active: boolean | null };
type SaveResult = { error: { message: string } | null };

function roleLabel(role: string) {
  if (role === "sales_rep") return "Sales rep";
  if (role === "brand_manager") return "Brand manager";
  if (role === "general_sales_manager") return "General sales manager";
  if (role === "payroll_manager") return "Payroll manager";
  if (role === "admin") return "Admin";
  return role;
}

function normalizeRole(role: string | null | undefined): Role {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return (role ?? "sales_rep") as Role;
}

export default function AdminAccessEditor({ profile, onSaved }: { profile: Profile | null; onSaved: () => Promise<void> }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("sales_rep");
  const [storeId, setStoreId] = useState("");

  const [newProfileId, setNewProfileId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("sales_rep");
  const [newStoreId, setNewStoreId] = useState("");

  const [scopeStoreId, setScopeStoreId] = useState("");
  const [scopeStoreRole, setScopeStoreRole] = useState("general_sales_manager");
  const [scopeBrandStoreId, setScopeBrandStoreId] = useState("");
  const [scopeBrand, setScopeBrand] = useState("");

  useEffect(() => {
    supabase.from("stores").select("id,name,active").order("name").then(({ data, error }) => {
      if (error) setErr(error.message);
      const next = (data ?? []) as Store[];
      setStores(next);
      if (next[0]) {
        setScopeStoreId(next[0].id);
        setScopeBrandStoreId(next[0].id);
        setNewStoreId(next[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name || profile.rep_name || "");
    setEmail(profile.email || "");
    setRole(normalizeRole(profile.role));
    setStoreId(profile.store_id || "");
  }, [profile]);

  async function run(action: () => PromiseLike<SaveResult>, message: string) {
    setBusy(true);
    setErr(null);
    setOk(null);
    const { error } = await action();
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setOk(message);
      await onSaved();
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const store = stores.find((s) => s.id === storeId) ?? null;
    await run(() => supabase.from("profiles").update({
      full_name: name || null,
      email,
      role,
      store_id: storeId || null,
      store_name: store?.name ?? null,
    }).eq("id", profile.id), "Profile saved.");
  }

  async function createProfile(e: FormEvent) {
    e.preventDefault();
    const store = stores.find((s) => s.id === newStoreId) ?? null;
    await run(() => supabase.from("profiles").upsert({
      id: newProfileId.trim(),
      email: newEmail.trim(),
      full_name: newName.trim() || null,
      role: newRole,
      store_id: newStoreId || null,
      store_name: store?.name ?? null,
    }), "Profile created or updated.");
    setNewProfileId("");
    setNewEmail("");
    setNewName("");
    setNewRole("sales_rep");
  }

  async function addStoreScope(e: FormEvent) {
    e.preventDefault();
    if (!profile || !scopeStoreId) return;
    await run(() => supabase.from("user_store_access").insert({
      user_id: profile.id,
      store_id: scopeStoreId,
      access_role: scopeStoreRole,
      active: true,
    }), "Store access added.");
  }

  async function addBrandScope(e: FormEvent) {
    e.preventDefault();
    if (!profile || !scopeBrandStoreId || !scopeBrand.trim()) return;
    await run(() => supabase.from("user_brand_access").insert({
      user_id: profile.id,
      store_id: scopeBrandStoreId,
      brand: scopeBrand.trim(),
      active: true,
    }), "Brand access added.");
    setScopeBrand("");
  }

  return (
    <section className="card access-card">
      <h3>Access actions</h3>
      {err && <div className="notice">{err}</div>}
      {ok && <div className="form-msg ok">{ok}</div>}

      <form className="adj-form access-form" onSubmit={createProfile}>
        <div className="field"><label>Profile id</label><input value={newProfileId} onChange={(e) => setNewProfileId(e.target.value)} required /></div>
        <div className="field"><label>Email</label><input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required /></div>
        <div className="field"><label>Name</label><input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
        <div className="field"><label>Role</label><select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></div>
        <div className="field"><label>Primary store</label><select value={newStoreId} onChange={(e) => setNewStoreId(e.target.value)}><option value="">None</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <button className="btn-primary slim" disabled={busy} type="submit">Add user</button>
      </form>

      {profile && <form className="adj-form access-form" onSubmit={saveProfile}>
        <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Role</label><select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></div>
        <div className="field"><label>Primary store</label><select value={storeId} onChange={(e) => setStoreId(e.target.value)}><option value="">None</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <button className="btn-primary slim" disabled={busy} type="submit">Save user</button>
      </form>}

      {profile && <form className="adj-form access-form" onSubmit={addStoreScope}>
        <div className="field"><label>Store</label><select value={scopeStoreId} onChange={(e) => setScopeStoreId(e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label>Access</label><select value={scopeStoreRole} onChange={(e) => setScopeStoreRole(e.target.value)}>{STORE_ACCESS_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></div>
        <button className="btn-primary slim" disabled={busy} type="submit">Add store access</button>
      </form>}

      {profile && <form className="adj-form access-form" onSubmit={addBrandScope}>
        <div className="field"><label>Store</label><select value={scopeBrandStoreId} onChange={(e) => setScopeBrandStoreId(e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label>Brand</label><input value={scopeBrand} onChange={(e) => setScopeBrand(e.target.value)} placeholder="McLaren" /></div>
        <button className="btn-primary slim" disabled={busy || !scopeBrand.trim()} type="submit">Add brand access</button>
      </form>}
    </section>
  );
}

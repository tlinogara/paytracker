import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile, Role } from "../lib/types";
import Topbar from "../components/Topbar";

function normalizeRole(role: string | null | undefined): Role {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return (role ?? "sales_rep") as Role;
}

function roleLabel(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  if (normalized === "sales_rep") return "Sales rep";
  if (normalized === "brand_manager") return "Brand manager";
  if (normalized === "general_sales_manager") return "General sales manager";
  if (normalized === "payroll_manager") return "Payroll manager";
  if (normalized === "admin") return "Admin";
  return normalized;
}

type StoreAccess = {
  user_id: string;
  store_id: string | null;
  access_role: string | null;
  active: boolean | null;
  note: string | null;
  stores?: { name: string | null } | null;
};

type BrandAccess = {
  user_id: string;
  store_id: string | null;
  brand: string | null;
  active: boolean | null;
  note: string | null;
  stores?: { name: string | null } | null;
};

function profileName(profile: Profile) {
  return profile.full_name || profile.rep_name || profile.email || "Unnamed user";
}

export default function AdminAccess({ session }: { session: Session }) {
  const [self, setSelf] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [storeAccess, setStoreAccess] = useState<StoreAccess[]>([]);
  const [brandAccess, setBrandAccess] = useState<BrandAccess[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedUserId) ?? null,
    [profiles, selectedUserId],
  );

  const selectedStoreAccess = useMemo(
    () => storeAccess.filter((row) => row.user_id === selectedUserId && row.active !== false),
    [storeAccess, selectedUserId],
  );

  const selectedBrandAccess = useMemo(
    () => brandAccess.filter((row) => row.user_id === selectedUserId && row.active !== false),
    [brandAccess, selectedUserId],
  );

  const effectiveStores = useMemo(() => {
    const names = new Set<string>();
    for (const row of selectedStoreAccess) names.add(row.stores?.name || row.note || row.store_id || "All locations");
    for (const row of selectedBrandAccess) names.add(row.stores?.name || row.store_id || "Store");
    if (selectedProfile?.store_name) names.add(selectedProfile.store_name);
    return Array.from(names);
  }, [selectedBrandAccess, selectedProfile, selectedStoreAccess]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);

      const selfRes = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (selfRes.error) {
        setErr(selfRes.error.message);
        setLoading(false);
        return;
      }

      const selfProfile = selfRes.data as Profile;
      setSelf(selfProfile);

      if (normalizeRole(selfProfile.role) !== "admin") {
        setLoading(false);
        return;
      }

      const [profilesRes, storeRes, brandRes] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name,role,employee_id,store_id,rep_name,store_name").order("full_name", { ascending: true }),
        supabase.from("user_store_access").select("user_id,store_id,access_role,active,note,stores(name)").order("created_at", { ascending: false }),
        supabase.from("user_brand_access").select("user_id,store_id,brand,active,note,stores(name)").order("brand", { ascending: true }),
      ]);

      if (profilesRes.error) setErr(profilesRes.error.message);
      else setProfiles((profilesRes.data ?? []) as Profile[]);

      if (storeRes.error) setErr(storeRes.error.message);
      else setStoreAccess((storeRes.data ?? []) as unknown as StoreAccess[]);

      if (brandRes.error) setErr(brandRes.error.message);
      else setBrandAccess((brandRes.data ?? []) as unknown as BrandAccess[]);

      const firstProfile = (profilesRes.data ?? [])[0] as Profile | undefined;
      if (firstProfile) setSelectedUserId(firstProfile.id);
      setLoading(false);
    }

    load();
  }, [session.user.id]);

  const topbarProfile = self ?? ({ id: session.user.id, email: session.user.email ?? "", full_name: null, rep_name: null, store_name: null, employee_id: null, store_id: null, role: "admin" } as Profile);
  const isAdmin = normalizeRole(self?.role) === "admin";

  function effectiveScope(profile: Profile | null) {
    if (!profile) return "Select a user to preview access.";
    const role = normalizeRole(profile.role);
    if (role === "admin") return "All locations, all users, all settings, and access management.";
    if (role === "payroll_manager") return "All locations, payroll review, imports, month close, and commission settings.";
    if (role === "general_sales_manager") return effectiveStores.length ? effectiveStores.join(", ") : profile.store_name || "Assigned location.";
    if (role === "brand_manager") return selectedBrandAccess.length ? selectedBrandAccess.map((row) => row.brand).filter(Boolean).join(", ") : "Assigned brand team.";
    return profile.rep_name || profile.full_name || "Own deals and own pay breakdown.";
  }

  return (
    <>
      <Topbar profile={topbarProfile} />
      <main className="page">
        <div className="section-head">
          <h2>Users and Access</h2>
          <span className="count">admin preview</span>
        </div>

        {err && <div className="notice">{err}</div>}
        {loading && <div className="notice">Loading access data…</div>}
        {!loading && !isAdmin && <div className="notice">Only admins can preview users and access scopes.</div>}

        {!loading && isAdmin && (
          <div className="grid two">
            <section className="card access-card">
              <h3>People</h3>
              <div className="tablewrap">
                <table className="deals adj">
                  <thead>
                    <tr><th>Name</th><th>Role</th><th>Store</th><th></th></tr>
                  </thead>
                  <tbody>
                    {profiles.map((profile) => (
                      <tr key={profile.id}>
                        <td>{profileName(profile)}<div className="muted">{profile.email}</div></td>
                        <td>{roleLabel(profile.role)}</td>
                        <td>{profile.store_name ?? "All or scoped"}</td>
                        <td className="r"><button className="btn-primary slim" onClick={() => setSelectedUserId(profile.id)}>Manage</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card access-card">
              <h3>Preview</h3>
              {selectedProfile ? (
                <div className="access-pane">
                  <div className="access-summary">
                    <div><span>User</span><strong>{profileName(selectedProfile)}</strong></div>
                    <div><span>Role</span><strong>{roleLabel(selectedProfile.role)}</strong></div>
                  </div>
                  <div className="notice">Effective scope: {effectiveScope(selectedProfile)}</div>
                  <h4>Store access</h4>
                  <div className="scope-list">
                    {effectiveStores.length === 0 && <div className="scope-item muted">No store scope.</div>}
                    {effectiveStores.map((store, idx) => <div className="scope-item" key={`${store}-${idx}`}><strong>{store}</strong></div>)}
                  </div>
                  <h4>Brand access</h4>
                  <div className="scope-list">
                    {selectedBrandAccess.length === 0 && <div className="scope-item muted">No brand scope.</div>}
                    {selectedBrandAccess.map((row, idx) => <div className="scope-item" key={`${row.user_id}-brand-${idx}`}><strong>{row.brand || "Brand"}</strong><span>{row.stores?.name || row.store_id || "Store"}</span></div>)}
                  </div>
                </div>
              ) : <div className="empty">Select a user to preview their profile and permissions.</div>}
            </section>
          </div>
        )}
      </main>
    </>
  );
}

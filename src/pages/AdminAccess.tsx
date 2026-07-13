import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile, Role } from "../lib/types";
import Topbar from "../components/Topbar";
import AdminAccessEditor, { type BrandAccessRow, type StoreAccessRow } from "./AdminAccessEditor";

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

function profileName(profile: Profile) {
  return profile.full_name || profile.rep_name || profile.email || "Unnamed user";
}

export default function AdminAccess({ session }: { session: Session }) {
  const [self, setSelf] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [storeAccess, setStoreAccess] = useState<StoreAccessRow[]>([]);
  const [brandAccess, setBrandAccess] = useState<BrandAccessRow[]>([]);
  const [storeNames, setStoreNames] = useState<Record<string, string>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
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

    const [profilesRes, storeAccessRes, brandRes, storesRes] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,role,employee_id,store_id,rep_name,store_name").order("full_name", { ascending: true }),
      supabase.from("user_store_access").select("id,user_id,store_id,access_role,active,note,stores(name)").order("created_at", { ascending: false }),
      supabase.from("user_brand_access").select("id,user_id,store_id,brand,active,note,stores(name)").order("brand", { ascending: true }),
      supabase.from("stores").select("id,name").order("name"),
    ]);

    if (profilesRes.error) setErr(profilesRes.error.message);
    if (storeAccessRes.error) setErr(storeAccessRes.error.message);
    if (brandRes.error) setErr(brandRes.error.message);
    if (storesRes.error) setErr(storesRes.error.message);

    const nextProfiles = (profilesRes.data ?? []) as Profile[];
    const nextStoreNames: Record<string, string> = {};
    for (const store of storesRes.data ?? []) nextStoreNames[store.id] = store.name;

    setProfiles(nextProfiles);
    setStoreAccess((storeAccessRes.data ?? []) as unknown as StoreAccessRow[]);
    setBrandAccess((brandRes.data ?? []) as unknown as BrandAccessRow[]);
    setStoreNames(nextStoreNames);
    setSelectedUserId((current) => {
      if (current && nextProfiles.some((profile) => profile.id === current)) return current;
      return nextProfiles[0]?.id ?? null;
    });
    setLoading(false);
  }, [session.user.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedUserId) ?? null,
    [profiles, selectedUserId],
  );

  const selectedStoreAccess = useMemo(
    () => storeAccess.filter((row) => row.user_id === selectedUserId && row.active !== false),
    [selectedUserId, storeAccess],
  );

  const selectedBrandAccess = useMemo(
    () => brandAccess.filter((row) => row.user_id === selectedUserId && row.active !== false),
    [brandAccess, selectedUserId],
  );

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return profiles;
    return profiles.filter((profile) => {
      const primaryStore = profile.store_name || (profile.store_id ? storeNames[profile.store_id] : "") || "";
      const searchable = `${profileName(profile)} ${profile.email} ${roleLabel(profile.role)} ${primaryStore}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [profiles, search, storeNames]);

  const effectiveStores = useMemo(() => {
    const names = new Set<string>();
    const primaryStore = selectedProfile?.store_name
      || (selectedProfile?.store_id ? storeNames[selectedProfile.store_id] : null);
    if (primaryStore) names.add(primaryStore);
    for (const row of selectedStoreAccess) names.add(row.stores?.name || row.note || "Assigned location");
    for (const row of selectedBrandAccess) names.add(row.stores?.name || "Assigned location");
    return Array.from(names);
  }, [selectedBrandAccess, selectedProfile, selectedStoreAccess, storeNames]);

  function effectiveScope(profile: Profile | null) {
    if (!profile) return "Select a user to see their access.";

    const role = normalizeRole(profile.role);
    if (role === "admin") return "All locations, all users, and all settings.";
    if (role === "payroll_manager") return "All locations, imports, month close, and commission rules.";
    if (role === "general_sales_manager") {
      return effectiveStores.length > 0 ? effectiveStores.join(", ") : "No location assigned yet.";
    }
    if (role === "brand_manager") {
      const scopes = selectedBrandAccess.map((row) => `${row.brand || "Brand"} at ${row.stores?.name || "assigned location"}`);
      return scopes.length > 0 ? scopes.join(", ") : "No brand access assigned yet.";
    }
    return profile.employee_id
      ? `Own deals and commission for ${profile.rep_name || profile.full_name || "the linked salesperson"}.`
      : "No salesperson is linked yet.";
  }

  function directorySummary(profile: Profile) {
    const role = normalizeRole(profile.role);
    if (role === "admin" || role === "payroll_manager") return "All locations";
    if (role === "sales_rep") return profile.employee_id ? "Linked" : "Needs salesperson link";
    if (role === "brand_manager") {
      const count = brandAccess.filter((row) => row.user_id === profile.id && row.active !== false).length;
      return `${count} brand scope${count === 1 ? "" : "s"}`;
    }
    const extraCount = storeAccess.filter((row) => row.user_id === profile.id && row.active !== false).length;
    const primaryStore = profile.store_name || (profile.store_id ? storeNames[profile.store_id] : null);
    return primaryStore || (extraCount > 0 ? `${extraCount} location scope${extraCount === 1 ? "" : "s"}` : "Needs location");
  }

  const topbarProfile = self ?? ({
    id: session.user.id,
    email: session.user.email ?? "",
    full_name: null,
    rep_name: null,
    store_name: null,
    employee_id: null,
    store_id: null,
    role: "admin",
  } as Profile);
  const isAdmin = normalizeRole(self?.role) === "admin";

  return (
    <>
      <Topbar profile={topbarProfile} />
      <main className="page">
        <header className="page-heading">
          <div>
            <span className="eyebrow">Administration</span>
            <h1>Users &amp; access</h1>
            <p>Choose a user, assign the correct role, then add only the location or brand access that role needs.</p>
          </div>
          <div className="page-context">
            <span>Accounts</span>
            <strong>{profiles.length}</strong>
          </div>
        </header>

        {err && <div className="notice">Could not load access data. {err}</div>}
        {loading && <div className="notice">Loading users and permissions…</div>}
        {!loading && !isAdmin && <div className="notice">Only admins can manage users and access.</div>}

        {!loading && isAdmin && (
          <>
            <div className="access-help">
              <strong>How to use this page</strong>
              <span>Pick a person on the left. Save their role and account link first. Then add any extra location or brand scope shown for that role.</span>
              <small>New login accounts are created through authentication. Once an account exists, it appears here for access setup.</small>
            </div>

            <div className="access-layout">
              <aside className="user-directory" aria-label="Users">
                <div className="directory-head">
                  <div>
                    <h2>People</h2>
                    <span>{filteredProfiles.length} shown</span>
                  </div>
                  <label className="search-field compact-search">
                    <span>Find user</span>
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, role, or location" />
                  </label>
                </div>

                <div className="directory-list">
                  {filteredProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      className={`directory-user ${selectedUserId === profile.id ? "active" : ""}`}
                      aria-pressed={selectedUserId === profile.id}
                      onClick={() => setSelectedUserId(profile.id)}
                    >
                      <span className="directory-avatar" aria-hidden="true">{profileName(profile).charAt(0).toUpperCase()}</span>
                      <span className="directory-copy">
                        <strong>{profileName(profile)}</strong>
                        <span>{profile.email}</span>
                        <small>{roleLabel(profile.role)} · {directorySummary(profile)}</small>
                      </span>
                    </button>
                  ))}
                  {filteredProfiles.length === 0 && <div className="empty compact">No users match your search.</div>}
                </div>
              </aside>

              <AdminAccessEditor
                profile={selectedProfile}
                storeAccess={selectedStoreAccess}
                brandAccess={selectedBrandAccess}
                scopeSummary={effectiveScope(selectedProfile)}
                onSaved={loadData}
              />
            </div>
          </>
        )}
      </main>
    </>
  );
}

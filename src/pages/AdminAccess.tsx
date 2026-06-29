import type { Session } from "@supabase/supabase-js";
import type { Profile } from "../lib/types";
import Topbar from "../components/Topbar";

export default function AdminAccess({ session }: { session: Session }) {
  const profile = { id: session.user.id, email: session.user.email ?? "", full_name: null, rep_name: null, store_name: null, employee_id: null, store_id: null, role: "admin" } as Profile;

  return (
    <>
      <Topbar profile={profile} />
      <main className="page">
        <div className="section-head">
          <h2>Users and Access</h2>
          <span className="count">preview scaffold</span>
        </div>
        <div className="notice">
          This v2 page is reserved for role preview, profile scope review, and access management.
        </div>
      </main>
    </>
  );
}

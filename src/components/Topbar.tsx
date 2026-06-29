import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import { useMonthLink } from "../lib/useMonth";

export default function Topbar({ profile }: { profile: Profile | null }) {
  const role = profile?.role;
  const canManage = role === "manager" || role === "payroll" || role === "admin";
  const canAdmin = role === "payroll" || role === "admin";
  const isAdmin = role === "admin";
  const monthLink = useMonthLink();

  return (
    <header className="topbar">
      <Link to={monthLink("/")} className="wordmark">
        Pay<span>Track</span>
      </Link>
      <nav className="topbar-user">
        <Link className="btn-ghost" to={monthLink("/")}>Month Summary</Link>
        {canManage && <Link className="btn-ghost" to={monthLink("/enhancers")}>Bonus Approvals</Link>}
        {canManage && <Link className="btn-ghost" to={monthLink("/brand-reps")}>Team Setup</Link>}
        {canAdmin && <Link className="btn-ghost" to={monthLink("/imports")}>Import Status</Link>}
        {canAdmin && <Link className="btn-ghost" to={monthLink("/payroll")}>Month Close</Link>}
        {isAdmin && <Link className="btn-ghost" to={monthLink("/calculations")}>Commission Settings</Link>}
        <span className="who">
          {profile?.full_name || profile?.email || "Signed in"}
          {role && role !== "rep" ? ` · ${role}` : ""}
        </span>
        <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
    </header>
  );
}

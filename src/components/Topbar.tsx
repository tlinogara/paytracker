import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import { useMonthLink } from "../lib/useMonth";

function normalizedRole(role: string | null | undefined): string {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return role ?? "sales_rep";
}

export default function Topbar({ profile }: { profile: Profile | null }) {
  const role = normalizedRole(profile?.role);
  const canManage = ["brand_manager", "general_sales_manager", "payroll_manager", "admin"].includes(role);
  const canAdmin = ["payroll_manager", "admin"].includes(role);
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
          {role !== "sales_rep" ? ` · ${role}` : ""}
        </span>
        <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
    </header>
  );
}

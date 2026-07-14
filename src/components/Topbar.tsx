import { NavLink } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import { useMonthLink } from "../lib/useMonth";

function normalizedRole(role: string | null | undefined): string {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return role ?? "sales_rep";
}

function roleLabel(role: string) {
  if (role === "sales_rep") return "Sales rep";
  if (role === "brand_manager") return "Brand manager";
  if (role === "general_sales_manager") return "General sales manager";
  if (role === "payroll_manager") return "Payroll manager";
  if (role === "admin") return "Admin";
  return role;
}

export default function Topbar({ profile }: { profile: Profile | null }) {
  const role = normalizedRole(profile?.role);
  const canManage = ["brand_manager", "general_sales_manager", "payroll_manager", "admin"].includes(role);
  const canPayroll = ["payroll_manager", "admin"].includes(role);
  const canAdmin = role === "admin";
  const monthLink = useMonthLink();
  const navClass = ({ isActive }: { isActive: boolean }) => `btn-ghost${isActive ? " active" : ""}`;

  return (
    <header className="topbar">
      <NavLink to={monthLink("/")} className="wordmark">
        Pay<span>Track</span>
      </NavLink>
      <nav className="topbar-user" aria-label="Primary navigation">
        <NavLink className={navClass} to={monthLink("/")} end>Commissions</NavLink>
        {canManage && <NavLink className={navClass} to={monthLink("/enhancers")}>Bonus review</NavLink>}
        {canManage && <NavLink className={navClass} to={monthLink("/brand-reps")}>Team setup</NavLink>}
        {canPayroll && <NavLink className={navClass} to={monthLink("/imports")}>Imports</NavLink>}
        {canPayroll && <NavLink className={navClass} to={monthLink("/payroll")}>Month close</NavLink>}
        {canPayroll && <NavLink className={navClass} to={monthLink("/calculations")}>Commission rules</NavLink>}
        {canAdmin && <NavLink className={navClass} to={monthLink("/admin-access")}>Users &amp; access</NavLink>}
        <span className="who">
          {profile?.full_name || profile?.email || "Signed in"}
          {role !== "sales_rep" ? ` · ${roleLabel(role)}` : ""}
        </span>
        <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
    </header>
  );
}

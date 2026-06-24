import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";

export default function Topbar({ profile }: { profile: Profile | null }) {
  const role = profile?.role;
  const canManage = role === "manager" || role === "payroll" || role === "admin";
  const canAdmin = role === "payroll" || role === "admin";
  return (
    <header className="topbar">
      <Link to="/" className="wordmark">
        Pay<span>Track</span>
      </Link>
      <nav className="topbar-user">
        <Link className="btn-ghost" to="/">
          Dashboard
        </Link>
        {canManage && (
          <Link className="btn-ghost" to="/enhancers">
            Enhancers
          </Link>
        )}
        {canAdmin && (
          <Link className="btn-ghost" to="/imports">
            Imports
          </Link>
        )}
        {canAdmin && (
          <Link className="btn-ghost" to="/payroll">
            Payroll
          </Link>
        )}
        <span className="who">
          {profile?.full_name || profile?.email || "Signed in"}
          {role && role !== "rep" ? ` · ${role}` : ""}
        </span>
        <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </nav>
    </header>
  );
}

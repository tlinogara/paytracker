import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setErr(error.message);
    else navigate("/", { replace: true });
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <span className="wordmark">Pay<span>Track</span></span>
        <p className="lede">Set a password for faster sign in next time.</p>
        {err && <div className="form-msg err">{err}</div>}
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="pw">New password</label><input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="field"><label htmlFor="pw2">Confirm password</label><input id="pw2" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          <button className="btn-primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save password"}</button>
        </form>
        <div className="auth-alt"><Link to="/">Skip for now</Link></div>
      </div>
    </div>
  );
}

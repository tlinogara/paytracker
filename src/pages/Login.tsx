import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";

type Mode = "password" | "magic";

export default function Login() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) setErr(error.message);
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) setErr(error.message);
        else setOk("Login link sent. Check your email on this device.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <span className="wordmark">
          Pay<span>Track</span>
        </span>
        <p className="lede">
          Your deals, units, and commission — straight from the deal log.
        </p>

        {err && <div className="form-msg err">{err}</div>}
        {ok && <div className="form-msg ok">{ok}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode === "password" && (
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          <button className="btn-primary" disabled={busy} type="submit">
            {busy
              ? "Working…"
              : mode === "password"
                ? "Sign in"
                : "Email me a login link"}
          </button>
        </form>

        <div className="auth-alt">
          {mode === "password" ? (
            <>
              No password yet or forgot it?{" "}
              <button onClick={() => setMode("magic")}>
                Use an email login link
              </button>
            </>
          ) : (
            <button onClick={() => setMode("password")}>
              Sign in with a password instead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "./lib/supabase";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UpdatePassword from "./pages/UpdatePassword";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <span className="wordmark">
            Pay<span>Track</span>
          </span>
          <p className="lede">
            Not configured yet. Copy <code>.env.example</code> to{" "}
            <code>.env</code>, fill in your Supabase URL and anon key, and
            restart the dev server (or set the two variables in Vercel).
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/update-password"
          element={
            session ? <UpdatePassword /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/"
          element={
            session ? <Dashboard session={session} /> : <Navigate to="/login" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

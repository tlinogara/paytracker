import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "./lib/supabase";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Enhancers from "./pages/Enhancers";
import BrandReps from "./pages/BrandReps";
import Imports from "./pages/Imports";
import Payroll from "./pages/Payroll";
import Calculations from "./pages/Calculations";
import UpdatePassword from "./pages/UpdatePassword";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <span className="wordmark">Pay<span>Track</span></span>
          <p className="lede">Copy .env.example to .env, fill in your Supabase URL and anon key, then restart the dev server.</p>
        </div>
      </div>
    );
  }

  if (!ready) return <div className="loading">Loading…</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/update-password" element={session ? <UpdatePassword /> : <Navigate to="/login" replace />} />
        <Route path="/enhancers" element={session ? <Enhancers session={session} /> : <Navigate to="/login" replace />} />
        <Route path="/brand-reps" element={session ? <BrandReps session={session} /> : <Navigate to="/login" replace />} />
        <Route path="/imports" element={session ? <Imports session={session} /> : <Navigate to="/login" replace />} />
        <Route path="/payroll" element={session ? <Payroll session={session} /> : <Navigate to="/login" replace />} />
        <Route path="/calculations" element={session ? <Calculations session={session} /> : <Navigate to="/login" replace />} />
        <Route path="/" element={session ? <Dashboard session={session} /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

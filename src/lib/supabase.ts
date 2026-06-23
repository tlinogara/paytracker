import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && anonKey);

// The anon key is safe to ship to browsers: row-level security in Postgres
// decides what each logged-in user can read. Never put the service_role
// key anywhere near this app.
export const supabase = createClient(
  url ?? "https://not-configured.supabase.co",
  anonKey ?? "missing-anon-key"
);

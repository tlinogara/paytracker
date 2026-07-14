import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ImportFile, Profile } from "../lib/types";
import { parseCsv, sha256 } from "../lib/csv";
import Topbar from "../components/Topbar";
import Collapsible from "../components/Collapsible";
import { shortDate } from "../lib/format";

type CsvRow = Record<string, string>;

function appRole(role: string | null | undefined) {
  if (role === "rep") return "sales_rep";
  if (role === "manager") return "general_sales_manager";
  if (role === "payroll") return "payroll_manager";
  return role ?? "sales_rep";
}

function cleanCell(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return !trimmed || trimmed === "-" ? null : trimmed;
}

function rowMonth(row: CsvRow) {
  const raw = cleanCell(row["Contract Date"]) ?? cleanCell(row["Final accounting date"]) ?? cleanCell(row["Delivery Promised Date"]);
  const match = raw?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${String(Number(match[1])).padStart(2, "0")}-01`;
}

function importMonths(rows: CsvRow[]) {
  return Array.from(new Set(rows.map(rowMonth).filter(Boolean) as string[])).sort();
}

function monthLabelFromISO(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[month - 1] ?? iso} ${year}`;
}

export default function Imports({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [imports, setImports] = useState<ImportFile[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const role = appRole(profile?.role);
  const canImport = role === "payroll_manager" || role === "admin";

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => setProfile((data as Profile) ?? null));
  }, [session.user.id]);

  async function loadImports() {
    const { data, error } = await supabase.from("raw_import_files").select("*").order("imported_at", { ascending: false }).limit(25);
    if (error) setErr(error.message); else setImports((data ?? []) as ImportFile[]);
  }

  useEffect(() => { loadImports(); }, []);

  async function refreshMonths(months: string[]) {
    if (months.length === 0) throw new Error("No valid commission month was found in the file.");
    for (const month of months) {
      const { error } = await supabase.rpc("refresh_commission_preview", { p_month: month, p_store_id: null });
      if (error) throw error;
    }
  }

  async function upload() {
    setErr(null); setOk(null);
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const hash = await sha256(text);
      const months = importMonths(rows);
      const { data: importRow, error: importErr } = await supabase.from("raw_import_files").insert({ source: "tekion_sales_log_browser", store_id: null, file_name: file.name, file_hash: hash, row_count: rows.length }).select("id").single();
      if (importErr) {
        if (importErr.code === "23505") {
          await refreshMonths(months);
          setOk(`That file was already uploaded. Refreshed ${months.map(monthLabelFromISO).join(", ")}.`);
          loadImports();
          return;
        }
        throw importErr;
      }
      const importId = importRow.id as string;
      const payload = rows.map((raw_json, index) => ({ import_file_id: importId, row_number: index + 2, raw_json }));
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase.from("raw_tekion_rows").insert(payload.slice(i, i + 500));
        if (error) throw error;
      }
      const { error: normErr } = await supabase.rpc("normalize_tekion_import", { p_import_file_id: importId });
      if (normErr) throw normErr;
      await refreshMonths(months);
      setOk(`Imported ${rows.length} rows and refreshed ${months.map(monthLabelFromISO).join(", ")}.`);
      setFile(null);
      loadImports();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return <><Topbar profile={profile} /><main className="page">{err && <div className="notice">{err}</div>}{ok && <div className="form-msg ok">{ok}</div>}{!canImport && profile && <div className="notice">Only payroll managers and admins can import Tekion files.</div>}<Collapsible title="Tekion imports" count="raw file staging">{canImport ? <section className="tablewrap padbox"><div className="field"><label htmlFor="csv">Tekion deal sales log CSV</label><input id="csv" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div><button className="btn-primary slim" disabled={!file || busy} onClick={upload}>{busy ? "Importing…" : "Upload and process"}</button></section> : <div className="tablewrap"><div className="empty">No import actions are available for this role.</div></div>}</Collapsible><Collapsible title="Recent imports" count={`${imports.length} file(s)`}><div className="tablewrap"><table className="deals adj"><thead><tr><th>Date</th><th>File</th><th>Source</th><th className="r">Rows</th><th>Hash</th></tr></thead><tbody>{imports.map((f) => <tr key={f.id}><td className="num">{shortDate(f.imported_at.slice(0, 10))}</td><td>{f.file_name}</td><td>{f.source}</td><td className="r num">{f.row_count ?? 0}</td><td className="note-cell">{f.file_hash?.slice(0, 16) ?? "—"}</td></tr>)}</tbody></table></div></Collapsible></main></>;
}

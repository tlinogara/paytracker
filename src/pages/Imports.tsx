import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ImportFile, Profile } from "../lib/types";
import { parseCsv, sha256 } from "../lib/csv";
import Topbar from "../components/Topbar";
import { shortDate } from "../lib/format";

export default function Imports({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [imports, setImports] = useState<ImportFile[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => setProfile((data as Profile) ?? null));
  }, [session.user.id]);

  async function loadImports() {
    const { data, error } = await supabase.from("raw_import_files").select("*").order("imported_at", { ascending: false }).limit(25);
    if (error) setErr(error.message);
    else setImports((data ?? []) as ImportFile[]);
  }

  useEffect(() => {
    loadImports();
  }, []);

  async function upload() {
    setErr(null);
    setOk(null);
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const hash = await sha256(text);
      const { data: importRow, error: importErr } = await supabase
        .from("raw_import_files")
        .insert({
          source: "tekion_sales_log_browser",
          store_id: profile?.store_id ?? null,
          file_name: file.name,
          file_hash: hash,
          row_count: rows.length,
        })
        .select("id")
        .single();
      if (importErr) throw importErr;
      const importId = importRow.id as string;
      const payload = rows.map((raw_json, index) => ({ import_file_id: importId, row_number: index + 2, raw_json }));
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase.from("raw_tekion_rows").insert(payload.slice(i, i + 500));
        if (error) throw error;
      }
      const { error: normErr } = await supabase.rpc("normalize_tekion_import", { p_import_file_id: importId });
      if (normErr) throw normErr;
      const { error: calcErr } = await supabase.rpc("refresh_commission_preview", { p_month: null, p_store_id: profile?.store_id ?? null });
      if (calcErr) throw calcErr;
      setOk(`Imported ${rows.length} Tekion rows and refreshed commission previews.`);
      setFile(null);
      loadImports();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const canImport = profile?.role === "payroll" || profile?.role === "admin";

  return (
    <>
      <Topbar profile={profile} />
      <main className="page">
        <div className="section-head"><h2>Tekion imports</h2><span className="count">raw file staging</span></div>
        {err && <div className="notice">{err}</div>}
        {ok && <div className="form-msg ok">{ok}</div>}
        {!canImport && profile && <div className="notice">Only payroll and admins can import Tekion files.</div>}
        {canImport && (
          <section className="tablewrap padbox">
            <div className="field">
              <label htmlFor="csv">Tekion deal sales log CSV</label>
              <input id="csv" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <button className="btn-primary slim" disabled={!file || busy} onClick={upload}>{busy ? "Importing…" : "Upload and process"}</button>
          </section>
        )}
        <div className="section-head"><h2>Recent imports</h2><span className="count">{imports.length} file(s)</span></div>
        <div className="tablewrap">
          <table className="deals adj">
            <thead><tr><th>Date</th><th>File</th><th>Source</th><th className="r">Rows</th><th>Hash</th></tr></thead>
            <tbody>{imports.map((f) => <tr key={f.id}><td className="num">{shortDate(f.imported_at.slice(0, 10))}</td><td>{f.file_name}</td><td>{f.source}</td><td className="r num">{f.row_count ?? 0}</td><td className="note-cell">{f.file_hash?.slice(0, 16) ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      </main>
    </>
  );
}

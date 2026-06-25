import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ImportFile, Profile } from "../lib/types";
import { parseCsv, sha256 } from "../lib/csv";
import Topbar from "../components/Topbar";
import Collapsible from "../components/Collapsible";
import { shortDate } from "../lib/format";

type CsvRow = Record<string, string>;

function cleanCell(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "-") return null;
  return trimmed;
}

function parseTekionMonthISO(row: CsvRow): string | null {
  const raw = cleanCell(row["Contract Date"]) ?? cleanCell(row["Final accounting date"]) ?? cleanCell(row["Delivery Promised Date"]);
  if (!raw) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) return null;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function detectImportMonths(rows: CsvRow[]): string[] {
  const months = new Set<string>();
  for (const row of rows) {
    const dealNumber = cleanCell(row["Deal Number"]);
    if (!dealNumber) continue;
    const monthISO = parseTekionMonthISO(row);
    if (monthISO) months.add(monthISO);
  }
  return Array.from(months).sort();
}

function monthLabelFromISO(iso: string): string {
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

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile((data as Profile) ?? null));
  }, [session.user.id]);

  async function loadImports() {
    const { data, error } = await supabase
      .from("raw_import_files")
      .select("*")
      .order("imported_at", { ascending: false })
      .limit(25);

    if (error) setErr(error.message);
    else setImports((data ?? []) as ImportFile[]);
  }

  useEffect(() => {
    loadImports();
  }, []);

  async function refreshMonths(months: string[]) {
    if (months.length === 0) {
      throw new Error("No valid Tekion date values were found, so no commission month could be refreshed.");
    }

    for (const month of months) {
      const { error } = await supabase.rpc("refresh_commission_preview", {
        p_month: month,
        p_store_id: profile?.store_id ?? null,
      });
      if (error) throw error;
    }
  }

  async function upload() {
    setErr(null);
    setOk(null);
    if (!file) return;

    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const hash = await sha256(text);
      const months = detectImportMonths(rows);

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

      if (importErr) {
        if (importErr.code === "23505") {
          await refreshMonths(months);
          setOk(
            `That file was already uploaded. Refreshed commission preview for ${months
              .map(monthLabelFromISO)
              .join(", ")}.`
          );
          loadImports();
          return;
        }
        throw importErr;
      }

      const importId = importRow.id as string;
      const payload = rows.map((raw_json, index) => ({
        import_file_id: importId,
        row_number: index + 2,
        raw_json,
      }));

      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase
          .from("raw_tekion_rows")
          .insert(payload.slice(i, i + 500));
        if (error) throw error;
      }

      const { error: normErr } = await supabase.rpc("normalize_tekion_import", {
        p_import_file_id: importId,
      });
      if (normErr) throw normErr;

      await refreshMonths(months);

      setOk(
        `Imported ${rows.length} Tekion rows and refreshed commission preview for ${months
          .map(monthLabelFromISO)
          .join(", ")}.`
      );
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
        {err && <div className="notice">{err}</div>}
        {ok && <div className="form-msg ok">{ok}</div>}
        {!canImport && profile && (
          <div className="notice">Only payroll and admins can import Tekion files.</div>
        )}

        <Collapsible title="Tekion imports" count="raw file staging">
          {canImport ? (
            <section className="tablewrap padbox">
              <div className="field">
                <label htmlFor="csv">Tekion deal sales log CSV, dated or undated</label>
                <input
                  id="csv"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <button className="btn-primary slim" disabled={!file || busy} onClick={upload}>
                {busy ? "Importing…" : "Upload and process"}
              </button>
            </section>
          ) : (
            <div className="tablewrap">
              <div className="empty">No import actions are available for this role.</div>
            </div>
          )}
        </Collapsible>

        <Collapsible title="Recent imports" count={`${imports.length} file(s)`}>
          <div className="tablewrap">
            <table className="deals adj">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>File</th>
                  <th>Source</th>
                  <th className="r">Rows</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((f) => (
                  <tr key={f.id}>
                    <td className="num">{shortDate(f.imported_at.slice(0, 10))}</td>
                    <td>{f.file_name}</td>
                    <td>{f.source}</td>
                    <td className="r num">{f.row_count ?? 0}</td>
                    <td className="note-cell">{f.file_hash?.slice(0, 16) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
      </main>
    </>
  );
}

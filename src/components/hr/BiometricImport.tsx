"use client";
import { useMemo, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cleanPunch, dedupe, localToUtc, parseLocalDateTime, type PunchRow } from "@/lib/biometric";

type Sheet = { headers: string[]; rows: unknown[][] };

function parseCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}

async function readFile(f: File): Promise<Sheet> {
  let grid: unknown[][];
  if (/\.xlsx$/i.test(f.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await f.arrayBuffer());
    const ws = wb.worksheets[0];
    grid = [];
    ws?.eachRow(r => {
      const vals = (r.values as unknown[]).slice(1).map(v =>
        v && typeof v === "object" && !(v instanceof Date) && "result" in (v as object) ? (v as { result: unknown }).result
        : v && typeof v === "object" && !(v instanceof Date) && "text" in (v as object) ? (v as { text: unknown }).text : v);
      grid.push(vals);
    });
  } else grid = parseCsv(await f.text());
  // Reports often start with title rows: the header is the first row with 3+ filled cells.
  const h = grid.findIndex(r => r.filter(v => v !== null && v !== undefined && String(v).trim()).length >= 3);
  if (h < 0) return { headers: [], rows: [] };
  return { headers: grid[h].map((v, i) => String(v ?? "").trim() || `Column ${i + 1}`), rows: grid.slice(h + 1) };
}

const guess = (headers: string[], re: RegExp) => Math.max(-1, headers.findIndex(h => re.test(h)));

/** Import an eSSL attendance export (CSV or XLSX): pick the code, date and time columns. */
export function BiometricImport({ onImported }: { onImported: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [codeCol, setCodeCol] = useState(-1);
  const [dateCol, setDateCol] = useState(-1);
  const [timeCols, setTimeCols] = useState<number[]>([]);
  const [tz, setTz] = useState(330);
  const [busy, setBusy] = useState(false);

  async function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast.error("File is over 10 MB");
    try {
      const s = await readFile(f);
      if (!s.rows.length) return toast.error("No rows found in this file");
      setSheet(s);
      setCodeCol(guess(s.headers, /emp.*(code|id|no)|user ?id|pin|card/i));
      setDateCol(guess(s.headers, /date|log ?time|punch/i));
      setTimeCols(s.headers.map((h, i) => (/\b(in|out)\b.*time|time.*\b(in|out)\b|^(in|out)$|punch ?\d/i.test(h) ? i : -1)).filter(i => i >= 0));
    } catch {
      toast.error("Could not read this file. Save it as .xlsx or .csv and try again.");
    }
  }

  const parsed = useMemo(() => {
    if (!sheet || codeCol < 0 || dateCol < 0) return { rows: [] as PunchRow[], skipped: 0 };
    const rows: PunchRow[] = [];
    let skipped = 0;
    for (const r of sheet.rows) {
      const cells = timeCols.length ? timeCols.map(t => parseLocalDateTime(r[dateCol], r[t])) : [parseLocalDateTime(r[dateCol])];
      for (const local of cells) {
        if (!local) continue; // blank in/out cell: not a punch
        const p = cleanPunch(r[codeCol], localToUtc(local, tz));
        if (p) rows.push(p); else skipped++;
      }
    }
    return { rows: dedupe(rows), skipped };
  }, [sheet, codeCol, dateCol, timeCols, tz]);

  async function save() {
    setBusy(true);
    let sent = 0;
    for (let i = 0; i < parsed.rows.length; i += 500) {
      const chunk = parsed.rows.slice(i, i + 500).map(r => ({ ...r, source: "import" }));
      const { error } = await supabase.from("biometric_punches").upsert(chunk, { onConflict: "org_id,employee_code,punched_at", ignoreDuplicates: true });
      if (error) { setBusy(false); return toast.error(`Stopped after ${sent} punches: ${error.message}`); }
      sent += chunk.length;
    }
    setBusy(false);
    toast.success(`${sent} punches imported (any already stored were skipped)`);
    setSheet(null);
    onImported();
  }

  const col = (label: string, value: number, set: (n: number) => void) => (
    <label className="text-xs text-[#6b6b67] space-y-1 block">{label}
      <select className="input h-9 text-sm w-full" value={value} onChange={e => set(Number(e.target.value))}>
        <option value={-1}>Choose a column</option>
        {sheet!.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
      </select>
    </label>
  );

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2"><FileUp className="w-4 h-4" /><h3 className="text-sm font-bold text-[#1c1c1c]">Import from file</h3></div>
      <p className="text-xs text-[#6b6b67]">An attendance or punch log exported from eSSL (eTimeTrackLite reports, Excel or CSV). Re-importing the same file adds nothing twice.</p>
      <input type="file" accept=".xlsx,.csv" className="text-xs" onChange={e => pick(e.target.files?.[0])} />
      {sheet && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {col("Employee code column", codeCol, setCodeCol)}
            {col("Date (or date + time) column", dateCol, setDateCol)}
            <label className="text-xs text-[#6b6b67] space-y-1 block">Device time zone
              <select className="input h-9 text-sm w-full" value={tz} onChange={e => setTz(Number(e.target.value))}>
                <option value={330}>India (UTC+5:30)</option>
                <option value={300}>Pakistan (UTC+5)</option>
                <option value={240}>Gulf (UTC+4)</option>
                <option value={0}>UTC</option>
              </select>
            </label>
          </div>
          <div className="text-xs text-[#6b6b67]">Time columns (tick In / Out columns if date and time are separate; leave all unticked if the date column already has the time):
            <div className="flex flex-wrap gap-2 mt-1">
              {sheet.headers.map((h, i) => i === codeCol || i === dateCol ? null : (
                <label key={i} className="flex items-center gap-1 rounded-lg border border-[#ebece6] px-2 py-1">
                  <input type="checkbox" checked={timeCols.includes(i)} onChange={e => setTimeCols(t => e.target.checked ? [...t, i] : t.filter(x => x !== i))} />{h}
                </label>
              ))}
            </div>
          </div>
          <p className="text-xs text-[#1c1c1c]">{parsed.rows.length} punches found in {sheet.rows.length} rows{parsed.skipped ? `, ${parsed.skipped} skipped (bad code or date)` : ""}.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-primary text-xs" disabled={busy || !parsed.rows.length} onClick={save}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Import ${parsed.rows.length} punches`}
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => setSheet(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

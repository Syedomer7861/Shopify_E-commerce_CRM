/**
 * The slice of the old `xlsx` (SheetJS) API this app used, rebuilt on exceljs
 * so callers only swap `import("xlsx")` for `import("@/lib/sheets")`.
 * Browser-only (writeFile downloads a Blob). CSV is parsed and written here
 * because exceljs's CSV support needs Node streams.
 */
import ExcelJS from "exceljs";

type Cell = string | number | boolean | Date | null;
export type Sheet = { rows: Cell[][]; "!cols"?: { wch: number }[] };
export type Book = { SheetNames: string[]; Sheets: Record<string, Sheet> };

function toBytes(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  // FileReader.readAsBinaryString: one char per byte.
  const s = String(data ?? "");
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** RFC 4180: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v !== "object") return v as Cell;
  if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return String(v.text);
  if ("error" in v) return null;
  return String(v);
}

export async function read(data: unknown, _opts?: unknown): Promise<Book> {
  const bytes = toBytes(data);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK": .xlsx
  if (!isZip) {
    const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
    return { SheetNames: ["Sheet1"], Sheets: { Sheet1: { rows: parseCsv(text) } } };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const book: Book = { SheetNames: [], Sheets: {} };
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (r, n) => {
      const vals: Cell[] = [];
      r.eachCell({ includeEmpty: true }, (c, col) => { vals[col - 1] = cellValue(c.value); });
      rows[n - 1] = vals;
    });
    book.SheetNames.push(ws.name);
    book.Sheets[ws.name] = { rows: Array.from(rows, (r) => r ?? []) };
  });
  return book;
}

function display(v: Cell): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function sheet_to_json(sheet: Sheet, opts: { header?: 1; raw?: boolean; defval?: unknown } = {}): any[] {
  const raw = opts.raw !== false;
  const conv = (v: Cell) => (raw ? (v instanceof Date ? v.toISOString() : v) : display(v));
  if (opts.header === 1) return sheet.rows.map((r) => Array.from(r, (v) => conv(v ?? null)));
  const [head = [], ...body] = sheet.rows;
  const keys = head.map((h) => display(h ?? null));
  return body
    .filter((r) => r.some((v) => v != null && v !== ""))
    .map((r) => {
      const o: Record<string, unknown> = {};
      keys.forEach((k, i) => {
        if (!k) return;
        const v = r[i];
        if (v == null || v === "") { if ("defval" in opts) o[k] = opts.defval; }
        else o[k] = conv(v);
      });
      return o;
    });
}

function aoa_to_sheet(rows: unknown[][]): Sheet {
  return { rows: rows.map((r) => r.map((v) => (v == null ? null : v instanceof Date || typeof v !== "object" ? (v as Cell) : String(v)))) };
}

function json_to_sheet(objs: Record<string, unknown>[]): Sheet {
  const keys = Array.from(new Set(objs.flatMap((o) => Object.keys(o))));
  return aoa_to_sheet([keys, ...objs.map((o) => keys.map((k) => o[k] as Cell))]);
}

const book_new = (): Book => ({ SheetNames: [], Sheets: {} });
function book_append_sheet(wb: Book, sheet: Sheet, name: string) {
  wb.SheetNames.push(name);
  wb.Sheets[name] = sheet;
}

function csvOf(sheet: Sheet) {
  const q = (v: Cell) => { const s = display(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return sheet.rows.map((r) => Array.from(r, (v) => q(v ?? null)).join(",")).join("\r\n");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File bytes: CSV (first sheet) or .xlsx (every sheet). Replaces XLSX.write. */
export async function write(wb: Book, opts: { bookType?: string; type?: string } = {}): Promise<ArrayBuffer | string> {
  if (opts.bookType === "csv") return "﻿" + csvOf(wb.Sheets[wb.SheetNames[0]] ?? { rows: [] });
  const out = new ExcelJS.Workbook();
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const ws = out.addWorksheet(name.slice(0, 31));
    sheet.rows.forEach((r) => ws.addRow(Array.from(r, (v) => v ?? null)));
    sheet["!cols"]?.forEach((c, i) => { ws.getColumn(i + 1).width = c.wch; });
  }
  return (await out.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function writeFile(wb: Book, filename: string, opts: { bookType?: string } = {}) {
  const csv = opts.bookType === "csv" || filename.toLowerCase().endsWith(".csv");
  const data = await write(wb, { bookType: csv ? "csv" : "xlsx" });
  download(new Blob([data], { type: csv ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

export const utils = { sheet_to_json, aoa_to_sheet, json_to_sheet, book_new, book_append_sheet };

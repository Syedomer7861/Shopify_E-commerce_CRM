"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import toast from "react-hot-toast";
import { PAGE, PLACEHOLDERS, customKeys, mergeElements, type DocTemplate } from "@/lib/hr-docs";
import { DocPage } from "@/components/hr/documents/DocPage";

export type GenEmployee = {
  id: string; name: string; email?: string | null; phone?: string | null; designation?: string | null; department?: string | null;
  joining_date?: string | null; monthly_salary?: number | string | null; biometric_code?: string | null;
};
type AttRow = { agent_id: string; date: string; status: string };

const dateLabel = (d: string | null | undefined) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "";
const money = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? "" : `₹${Number(v).toLocaleString("en-IN")}`);
const label = (k: string) => k.split(/[._]/).filter(Boolean).map(w => (["pf", "hra", "tds", "pt", "ctc", "da", "id", "esi"].includes(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");

/**
 * Fill a design for one employee and print or save it as PDF. Record fields
 * come from the employee and the attendance register; anything else in the
 * design ({{basic}}, {{last_working_day}}...) is typed here, never guessed.
 */
export function DocGenerator({ tpl, employees, attendance, companyName, onClose }: {
  tpl: DocTemplate; employees: GenEmployee[]; attendance: AttRow[]; companyName: string; onClose: () => void;
}) {
  const [empId, setEmpId] = useState(employees[0]?.id ?? "");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.6);
  const page = PAGE[tpl.page_size];
  const extra = useMemo(() => customKeys(tpl.elements), [tpl.elements]);
  const emp = employees.find(e => e.id === empId);
  const usesMonth = useMemo(() => JSON.stringify(tpl.elements).match(/\{\{\s*(period|attendance)\./) !== null, [tpl.elements]);

  useEffect(() => {
    const fit = () => holder.current && setZoom(Math.min(1, (holder.current.clientWidth - 16) / page.w));
    fit();
    const ro = new ResizeObserver(fit);
    if (holder.current) ro.observe(holder.current);
    return () => ro.disconnect();
  }, [page.w]);

  const values = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const rows = attendance.filter(a => a.agent_id === empId && a.date.startsWith(month));
    const count = (...s: string[]) => String(rows.filter(r => s.includes(r.status)).length);
    const v: Record<string, string> = {
      "employee.name": emp?.name ?? "", "employee.designation": emp?.designation ?? "", "employee.department": emp?.department ?? "",
      "employee.email": emp?.email ?? "", "employee.phone": emp?.phone ?? "", "employee.joining_date": dateLabel(emp?.joining_date),
      "employee.monthly_salary": money(emp?.monthly_salary), "employee.code": emp?.biometric_code ?? "",
      "company.name": companyName, today: dateLabel(new Date().toISOString()),
      "period.month": new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      "attendance.days_in_month": String(new Date(y, m, 0).getDate()),
      "attendance.present": count("Present", "Late"), "attendance.late": count("Late"), "attendance.half_day": count("Half Day"),
      "attendance.absent": count("Absent"), "attendance.leave": count("Leave"),
    };
    return { ...v, ...custom };
  }, [emp, empId, month, attendance, companyName, custom]);

  const missing = PLACEHOLDERS.filter(p => JSON.stringify(tpl.elements).includes(`{{${p.key}}}`) && !values[p.key]).map(p => p.label);
  const merged = useMemo(() => ({ ...tpl, elements: mergeElements(tpl.elements, values) }), [tpl, values]);
  const fileName = `${tpl.name} - ${emp?.name ?? "employee"}${usesMonth ? ` - ${month}` : ""}`.replace(/[\\/:*?"<>|]/g, "");

  function print() {
    const node = pageRef.current;
    if (!node) return;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return toast.error("Allow pop-ups to print");
    w.document.title = fileName;
    const style = w.document.createElement("style");
    style.textContent = `@page{size:${tpl.page_size === "A4" ? "A4" : "letter"};margin:0}body{margin:0}`;
    w.document.head.appendChild(style);
    w.document.body.appendChild(w.document.importNode(node, true));
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  }

  async function pdf() {
    if (!pageRef.current) return;
    setBusy(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const canvas = await html2canvas(pageRef.current, { scale: 2, backgroundColor: "#ffffff", logging: false });
      const doc = new jsPDF({ unit: "px", format: [page.w, page.h], orientation: "portrait", hotfixes: ["px_scaling"] });
      doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, page.w, page.h);
      doc.save(`${fileName}.pdf`);
    } catch {
      toast.error("Could not make the PDF. Use Print and choose Save as PDF.");
    } finally { setBusy(false); }
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[300px_1fr]">
      <div className="card p-4 space-y-3 self-start">
        <div className="text-sm font-bold text-[#1c1c1c]">{tpl.name}</div>
        <label className="text-xs text-[#6b6b67] block space-y-1">Employee
          <select className="input h-9 text-sm w-full" value={empId} onChange={e => setEmpId(e.target.value)}>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        {usesMonth && (
          <label className="text-xs text-[#6b6b67] block space-y-1">Month
            <input type="month" className="input h-9 text-sm w-full" value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
          </label>
        )}
        {extra.map(k => (
          <label key={k} className="text-xs text-[#6b6b67] block space-y-1">{label(k)}
            <input className="input h-9 text-sm w-full" value={custom[k] ?? ""} onChange={e => setCustom(c => ({ ...c, [k]: e.target.value }))} />
          </label>
        ))}
        {missing.length > 0 && <p className="text-[11px] text-[#a3561f]">Empty on this employee&apos;s record: {missing.join(", ")}. Fill it in their profile or edit the design.</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-primary text-xs" onClick={print}><Printer className="w-3.5 h-3.5" /> Print</button>
          <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={pdf}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} PDF</button>
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>Back</button>
        </div>
      </div>
      <div ref={holder} className="card p-2 bg-[#e9eae4] overflow-hidden">
        <div style={{ width: page.w * zoom, height: page.h * zoom }} className="mx-auto">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <DocPage tpl={merged} />
          </div>
        </div>
      </div>
      {/* Unscaled copy for Print and PDF (a scaled node prints and captures at the wrong size). */}
      <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
        <DocPage ref={pageRef} tpl={merged} />
      </div>
    </div>
  );
}

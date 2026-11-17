/**
 * HR document designer model (hr_doc_templates.elements).
 * A page is a fixed-size canvas in CSS px (96 dpi); every block is absolutely
 * positioned. Text may hold {{placeholders}}, filled at print time.
 */
export type ElType = "text" | "image" | "line" | "box" | "table";
export type DocEl = {
  id: string; type: ElType;
  x: number; y: number; w: number; h: number;
  text?: string;           // text
  src?: string;            // image (data URL)
  rows?: string[][];       // table cells, first row is the header
  fontSize?: number; bold?: boolean; italic?: boolean;
  align?: "left" | "center" | "right";
  color?: string; bg?: string; border?: string; borderWidth?: number; radius?: number;
};
export type DocKind = "payslip" | "offer_letter" | "appointment_letter" | "experience_letter" | "relieving_letter" | "salary_certificate" | "warning_letter" | "other";
export type DocTemplate = { id?: string; name: string; kind: DocKind; page_size: "A4" | "Letter"; elements: DocEl[] };

export const PAGE: Record<DocTemplate["page_size"], { w: number; h: number }> = {
  A4: { w: 794, h: 1123 },
  Letter: { w: 816, h: 1056 },
};

export const KIND_LABEL: Record<DocKind, string> = {
  payslip: "Payslip", offer_letter: "Offer letter", appointment_letter: "Appointment letter",
  experience_letter: "Experience letter", relieving_letter: "Relieving letter",
  salary_certificate: "Salary certificate", warning_letter: "Warning letter", other: "Other",
};

/** Filled from real records. Anything else in {{ }} is asked for when printing. */
export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "employee.name", label: "Employee name" },
  { key: "employee.designation", label: "Designation" },
  { key: "employee.department", label: "Department" },
  { key: "employee.email", label: "Email" },
  { key: "employee.phone", label: "Phone" },
  { key: "employee.joining_date", label: "Joining date" },
  { key: "employee.monthly_salary", label: "Monthly salary" },
  { key: "employee.code", label: "Employee / device code" },
  { key: "company.name", label: "Company name" },
  { key: "today", label: "Today's date" },
  { key: "period.month", label: "Pay month" },
  { key: "attendance.days_in_month", label: "Days in month" },
  { key: "attendance.present", label: "Days present" },
  { key: "attendance.late", label: "Days late" },
  { key: "attendance.half_day", label: "Half days" },
  { key: "attendance.absent", label: "Days absent" },
  { key: "attendance.leave", label: "Leave days" },
];
const KNOWN = new Set(PLACEHOLDERS.map(p => p.key));
const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Placeholders in a design that are not filled from records (HR types them). */
export function customKeys(els: DocEl[]): string[] {
  const out = new Set<string>();
  for (const e of els) {
    for (const s of [e.text ?? "", ...(e.rows ?? []).flat()]) {
      for (const m of s.matchAll(TOKEN)) if (!KNOWN.has(m[1])) out.add(m[1]);
    }
  }
  return [...out];
}

export function fill(s: string, values: Record<string, string>) {
  return s.replace(TOKEN, (_, k: string) => values[k] ?? "");
}

export function mergeElements(els: DocEl[], values: Record<string, string>): DocEl[] {
  return els.map(e => ({
    ...e,
    text: e.text === undefined ? undefined : fill(e.text, values),
    rows: e.rows?.map(r => r.map(c => fill(c, values))),
  }));
}

export const newId = () => Math.random().toString(36).slice(2, 10);

// ---------- Starter designs (code, not DB: nobody can edit the originals) ----------
const T = (x: number, y: number, w: number, h: number, text: string, o: Partial<DocEl> = {}): DocEl =>
  ({ id: newId(), type: "text", x, y, w, h, text, fontSize: 13, color: "#1c1c1c", ...o });
const LINE = (y: number): DocEl => ({ id: newId(), type: "line", x: 60, y, w: 674, h: 2, bg: "#1c1c1c" });
const head = (title: string): DocEl[] => [
  T(60, 50, 500, 34, "{{company.name}}", { fontSize: 22, bold: true }),
  T(60, 86, 500, 20, "Address line · City · Phone · Email", { fontSize: 11, color: "#6b6b67" }),
  LINE(118),
  T(60, 140, 674, 28, title, { fontSize: 18, bold: true, align: "center" }),
  T(534, 180, 200, 20, "Date: {{today}}", { align: "right", fontSize: 12 }),
];
const sign = (y: number): DocEl[] => [
  T(60, y, 300, 20, "For {{company.name}}"),
  T(60, y + 70, 300, 20, "Authorised signatory", { bold: true }),
];
const letter = (name: string, kind: DocKind, title: string, body: string): DocTemplate => ({
  name, kind, page_size: "A4",
  elements: [...head(title), T(60, 230, 674, 520, body, { fontSize: 13 }), ...sign(800)],
});

export const STARTERS: DocTemplate[] = [
  {
    name: "Payslip", kind: "payslip", page_size: "A4",
    elements: [
      ...head("Payslip for {{period.month}}").filter(e => !(e.text ?? "").startsWith("Date:")),
      { id: newId(), type: "table", x: 60, y: 190, w: 674, h: 120, fontSize: 12, border: "#d4d5cd", rows: [
        ["Employee", "{{employee.name}}", "Employee code", "{{employee.code}}"],
        ["Designation", "{{employee.designation}}", "Department", "{{employee.department}}"],
        ["Days in month", "{{attendance.days_in_month}}", "Days present", "{{attendance.present}}"],
        ["Leave days", "{{attendance.leave}}", "Days absent", "{{attendance.absent}}"],
      ] },
      { id: newId(), type: "table", x: 60, y: 340, w: 674, h: 210, fontSize: 12, border: "#d4d5cd", rows: [
        ["Earnings", "Amount", "Deductions", "Amount"],
        ["Basic", "{{basic}}", "Provident fund", "{{pf}}"],
        ["House rent allowance", "{{hra}}", "Professional tax", "{{professional_tax}}"],
        ["Special allowance", "{{special_allowance}}", "Income tax (TDS)", "{{tds}}"],
        ["Other", "{{other_earnings}}", "Other", "{{other_deductions}}"],
        ["Gross earnings", "{{gross}}", "Total deductions", "{{total_deductions}}"],
      ] },
      { id: newId(), type: "box", x: 60, y: 575, w: 674, h: 48, bg: "#f6f7f2", border: "#1c1c1c", borderWidth: 1, radius: 6 },
      T(76, 588, 400, 24, "Net pay", { fontSize: 15, bold: true }),
      T(434, 588, 284, 24, "{{net_pay}}", { fontSize: 15, bold: true, align: "right" }),
      T(60, 650, 674, 40, "This is a computer-generated payslip and does not need a signature.", { fontSize: 10, color: "#6b6b67", italic: true }),
    ],
  },
  letter("Offer letter", "offer_letter", "Offer of Employment",
    "Dear {{employee.name}},\n\nWe are pleased to offer you the position of {{employee.designation}} in our {{employee.department}} team at {{company.name}}.\n\nYour monthly gross salary will be {{employee.monthly_salary}}. Your expected date of joining is {{employee.joining_date}}.\n\nPlease sign and return a copy of this letter to confirm your acceptance.\n\nWe look forward to working with you."),
  letter("Appointment letter", "appointment_letter", "Letter of Appointment",
    "Dear {{employee.name}},\n\nFurther to your acceptance of our offer, we are pleased to appoint you as {{employee.designation}} with effect from {{employee.joining_date}}.\n\nYour monthly gross salary is {{employee.monthly_salary}}. You will be on probation for {{probation_months}} months, after which your appointment will be reviewed.\n\nYou will be governed by the policies of {{company.name}} as amended from time to time."),
  letter("Experience letter", "experience_letter", "Experience Certificate",
    "To whom it may concern,\n\nThis is to certify that {{employee.name}} worked with {{company.name}} as {{employee.designation}} in the {{employee.department}} department from {{employee.joining_date}} to {{last_working_day}}.\n\nDuring this period we found them sincere and hardworking. We wish them every success in the future."),
  letter("Relieving letter", "relieving_letter", "Relieving Letter",
    "Dear {{employee.name}},\n\nWith reference to your resignation, we confirm that you have been relieved from the services of {{company.name}} at the close of business on {{last_working_day}}.\n\nYou have handed over all company property and your full and final settlement has been completed.\n\nWe thank you for your contribution and wish you the very best."),
  letter("Salary certificate", "salary_certificate", "Salary Certificate",
    "To whom it may concern,\n\nThis is to certify that {{employee.name}} is employed with {{company.name}} as {{employee.designation}} since {{employee.joining_date}} and draws a monthly gross salary of {{employee.monthly_salary}}.\n\nThis certificate is issued on their request for {{purpose}}."),
  letter("Warning letter", "warning_letter", "Warning Letter",
    "Dear {{employee.name}},\n\nThis letter is a formal warning regarding {{reason}}.\n\n{{details}}\n\nWe expect immediate improvement. Any repetition may lead to further disciplinary action."),
];

/** Make a fresh, independent copy of a starter (new ids). */
export const cloneTemplate = (t: DocTemplate): DocTemplate =>
  ({ ...t, id: undefined, elements: t.elements.map(e => ({ ...e, id: newId(), rows: e.rows?.map(r => [...r]) })) });

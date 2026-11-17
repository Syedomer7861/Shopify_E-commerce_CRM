import { NextRequest, NextResponse } from "next/server";

/**
 * Receives browser CSP violation reports (Content-Security-Policy-Report-Only in
 * next.config.js) and writes one short line per report to the server log.
 * Public on purpose: browsers send these without cookies. Only the page path,
 * directive and blocked origin are kept, never query strings or sample code.
 * The middleware's anonymous write limit caps how many one IP can send.
 */
const origin = (u: unknown) => {
  if (typeof u !== "string") return "";
  try { const x = new URL(u); return x.origin === "null" ? u.slice(0, 40) : x.origin + (x.pathname.length > 1 ? x.pathname.slice(0, 60) : ""); }
  catch { return u.slice(0, 40); } // "inline", "eval", "data", ...
};

export async function POST(req: NextRequest) {
  const text = (await req.text()).slice(0, 8000);
  try {
    const body = JSON.parse(text);
    const reports = Array.isArray(body) ? body.map(r => r?.body ?? r) : [body?.["csp-report"] ?? body];
    for (const r of reports.slice(0, 5)) {
      const page = origin(r?.["document-uri"] ?? r?.documentURL);
      const directive = String(r?.["effective-directive"] ?? r?.effectiveDirective ?? r?.["violated-directive"] ?? "").slice(0, 40);
      const blocked = origin(r?.["blocked-uri"] ?? r?.blockedURL);
      console.warn(`[csp] ${directive} blocked=${blocked} page=${page}`);
    }
  } catch {
    // Not JSON: ignore.
  }
  return new NextResponse(null, { status: 204 });
}

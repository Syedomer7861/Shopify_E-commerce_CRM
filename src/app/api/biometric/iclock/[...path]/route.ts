import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { checkSharedRateLimit, rateLimit } from "@/lib/rate-limit";
import { parseAttlog, MAX_PUNCHES_PER_REQUEST } from "@/lib/biometric";
import { storePunches } from "@/lib/biometric-server";

/**
 * eSSL / ZKTeco ADMS ("Cloud server") push protocol. The device calls
 * /iclock/cdata and /iclock/getrequest (rewritten here in next.config.js).
 * No session: the device is identified by its serial number, which an admin
 * must have registered in HR > Attendance > Biometric. Unknown or disabled
 * serials get nothing. Punches only ever land in that device's workspace.
 */
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain" } });

async function device(req: NextRequest) {
  const ipLimited = await rateLimit(req, "iclock-ip", 300, 60_000);
  if (ipLimited) return { error: text("Too many requests", 429) };
  const sn = (req.nextUrl.searchParams.get("SN") || "").trim();
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(sn)) return { error: text("Unknown device", 401) };
  const rl = await checkSharedRateLimit(`iclock:${sn}`, 120, 60_000);
  if (!rl.allowed) return { error: text("Too many requests", 429) };
  const admin = createAdminClient();
  const { data } = await admin.from("biometric_devices")
    .select("id, org_id, tz_offset_minutes, is_active").eq("serial_number", sn).maybeSingle();
  if (!data || !data.is_active) return { error: text("Unknown device", 401) };
  await admin.from("biometric_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return { admin, sn, dev: data as { id: string; org_id: string; tz_offset_minutes: number } };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const d = await device(req);
  if ("error" in d) return d.error;
  const [first] = (await ctx.params).path;
  if (first === "cdata") {
    // Handshake: tell the device to push attendance logs in real time.
    return text([
      `GET OPTION FROM: ${d.sn}`, "ATTLOGStamp=None", "OPERLOGStamp=9999", "ATTPHOTOStamp=None",
      "ErrorDelay=60", "Delay=30", "TransTimes=00:00;14:05", "TransInterval=1",
      "TransFlag=TransData AttLog", "Realtime=1", "Encrypt=None",
    ].join("\n"));
  }
  return text("OK"); // getrequest: no commands queued
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const d = await device(req);
  if ("error" in d) return d.error;
  const [first] = (await ctx.params).path;
  const table = req.nextUrl.searchParams.get("table");
  const body = await req.text();
  if (first !== "cdata" || table !== "ATTLOG") return text("OK"); // operation logs, photos etc. are not stored
  if (body.length > 1_000_000) return text("Payload too large", 413);
  const rows = parseAttlog(body, d.dev.tz_offset_minutes).slice(0, MAX_PUNCHES_PER_REQUEST);
  const { count, error } = await storePunches(d.admin, d.dev.org_id, d.dev.id, "device", rows);
  if (error) return text("ERROR", 500); // device retries later
  return text(`OK: ${count}`);
}

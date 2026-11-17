"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, Download, Fingerprint, Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/components/ConfirmDialog";
import { BiometricImport } from "@/components/hr/BiometricImport";

type Device = {
  id: string; name: string; serial_number: string; location: string | null; tz_offset_minutes: number;
  is_active: boolean; last_seen_at: string | null; last_punch_at: string | null;
};
type Punch = { id: string; employee_code: string; punched_at: string; source: string; direction: string | null };
type Emp = { id: string; name: string; biometric_code?: string | null };

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString("en-IN");
};
const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

/**
 * eSSL / ZKTeco biometric integration. Three ways in, all landing in
 * biometric_punches: device push (ADMS cloud server), the PC sync agent
 * (eTimeTrackLite database via API key) and a file import. Punches become
 * attendance once each employee has their device code set below.
 */
export function BiometricPanel({ employees, onRefresh }: { employees: Emp[]; onRefresh: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ name: "", serial_number: "", location: "" });
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const host = typeof window === "undefined" ? "" : window.location.host;

  const load = useCallback(async () => {
    const [d, p] = await Promise.all([
      supabase.from("biometric_devices").select("*").order("created_at"),
      supabase.from("biometric_punches").select("id, employee_code, punched_at, source, direction").order("punched_at", { ascending: false }).limit(50),
    ]);
    if (d.error) { setMissing(true); setDevices([]); return; }
    setDevices(d.data as Device[]);
    setPunches((p.data || []) as Punch[]);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCodes(Object.fromEntries(employees.map(e => [e.id, e.biometric_code || ""]))); }, [employees]);

  const byCode = useMemo(() => new Map(employees.filter(e => e.biometric_code).map(e => [e.biometric_code as string, e.name])), [employees]);
  const unmatched = useMemo(() => [...new Set(punches.map(p => p.employee_code).filter(c => !byCode.has(c)))], [punches, byCode]);

  async function addDevice() {
    const serial = form.serial_number.trim();
    if (!form.name.trim() || !/^[A-Za-z0-9_-]{4,40}$/.test(serial)) return toast.error("Give a name and the device serial number (4-40 letters/numbers)");
    const { error } = await supabase.from("biometric_devices").insert({ name: form.name.trim(), serial_number: serial, location: form.location.trim() || null });
    if (error) return toast.error(error.code === "23505" ? "This serial number is already registered" : error.message);
    setForm({ name: "", serial_number: "", location: "" });
    toast.success("Device registered");
    load();
  }

  async function toggle(d: Device) {
    const { error } = await supabase.from("biometric_devices").update({ is_active: !d.is_active }).eq("id", d.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function remove(d: Device) {
    if (!(await confirmDialog(`Remove device "${d.name}"? It will stop sending punches. Punches already received are kept.`))) return;
    const { error } = await supabase.from("biometric_devices").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function saveCode(emp: Emp) {
    setSavingCode(emp.id);
    const res = await fetch("/api/hr/data", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "biometric_code", data: { agent_id: emp.id, biometric_code: codes[emp.id] || "" } }),
    });
    setSavingCode(null);
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error || "Could not save");
    toast.success(`Device code saved for ${emp.name}`);
    onRefresh();
  }

  if (!devices) return <div className="py-16 text-center text-[#9a9a94]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (missing) return <div className="card p-6 text-sm text-[#6b6b67]">Biometric integration is being set up for your workspace. Please check back shortly.</div>;

  return (
    <div className="space-y-5">
      {/* 1. Devices */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2"><Cpu className="w-4 h-4" /><h3 className="text-sm font-bold text-[#1c1c1c]">Devices (live push)</h3></div>
        <ol className="text-xs text-[#55554f] list-decimal pl-4 space-y-1">
          <li>Register the device here with its serial number (Menu › System Info › Device Info).</li>
          <li>On the device: Menu › COMM › Cloud Server Setting. Server address <b className="font-mono">{host}</b>, port <b>443</b>, HTTPS on, domain name on.</li>
          <li>Punches arrive within a minute. &quot;Last seen&quot; below confirms the device is talking to the CRM.</li>
        </ol>
        <p className="text-xs text-[#9a9a94]">Older devices without HTTPS cloud support: use the PC sync agent below instead.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input className="input h-9 text-sm" placeholder="Name, e.g. Main gate" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="input h-9 text-sm font-mono" placeholder="Serial number" value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} />
          <input className="input h-9 text-sm" placeholder="Location (optional)" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
          <button type="button" className="btn-primary text-xs h-9" onClick={addDevice}><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
        {devices.length > 0 && (
          <div className="divide-y divide-[#ebece6] border border-[#ebece6] rounded-xl">
            {devices.map(d => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <span className={cn("w-2 h-2 rounded-full", d.is_active && d.last_seen_at && Date.now() - Date.parse(d.last_seen_at) < 15 * 60000 ? "bg-[#55c08f]" : "bg-[#d4d5cd]")} />
                <span className="flex-1 min-w-[160px]">
                  <span className="font-semibold text-[#1c1c1c]">{d.name}</span>
                  <span className="block text-xs text-[#6b6b67] font-mono">{d.serial_number}{d.location ? ` · ${d.location}` : ""}</span>
                </span>
                <span className="text-xs text-[#6b6b67]">Last seen {ago(d.last_seen_at)} · last punch {ago(d.last_punch_at)}</span>
                <button type="button" className="btn-secondary text-xs h-8" onClick={() => toggle(d)}>{d.is_active ? "Pause" : "Resume"}</button>
                <button type="button" aria-label={`Remove ${d.name}`} className="p-2 rounded-lg hover:bg-[#f6f7f2]" onClick={() => remove(d)}><Trash2 className="w-4 h-4 text-[#c94f40]" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Employee codes */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2"><Fingerprint className="w-4 h-4" /><h3 className="text-sm font-bold text-[#1c1c1c]">Employee device codes</h3></div>
        <p className="text-xs text-[#6b6b67]">The user ID each person is enrolled with on the device (eSSL &quot;Emp Code&quot;). Punches with no matching code are kept but not counted.</p>
        <div className="divide-y divide-[#ebece6] border border-[#ebece6] rounded-xl max-h-[420px] overflow-y-auto">
          {employees.map(e => (
            <div key={e.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm text-[#1c1c1c] truncate">{e.name}</span>
              <input className="input h-8 w-28 text-xs font-mono" placeholder="e.g. 101" value={codes[e.id] ?? ""}
                aria-label={`Device code for ${e.name}`} onChange={ev => setCodes(c => ({ ...c, [e.id]: ev.target.value }))} />
              <button type="button" className="btn-secondary text-xs h-8" disabled={savingCode === e.id || (codes[e.id] ?? "") === (e.biometric_code || "")} onClick={() => saveCode(e)}>Save</button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. PC sync agent */}
      <div className="card p-5 space-y-2">
        <div className="flex items-center gap-2"><Download className="w-4 h-4" /><h3 className="text-sm font-bold text-[#1c1c1c]">PC sync agent (eTimeTrackLite / eSSL Online Downloader)</h3></div>
        <ol className="text-xs text-[#55554f] list-decimal pl-4 space-y-1">
          <li>Settings › API &amp; Webhooks: create a key with the <span className="font-mono">attendance:write</span> scope.</li>
          <li>Download the script on the PC that runs eSSL and follow the steps at the top of it (it reads the eTimeTrackLite database and sends new punches).</li>
          <li>Schedule it every 5 minutes with Windows Task Scheduler.</li>
        </ol>
        <code className="block text-[11px] bg-[#f6f7f2] rounded-lg p-2 font-mono break-all">
          powershell -ExecutionPolicy Bypass -File essl-sync.ps1 -CrmUrl {typeof window === "undefined" ? "" : window.location.origin}
        </code>
        <a className="btn-secondary text-xs inline-flex" href="/downloads/essl-sync.ps1" download>Download essl-sync.ps1</a>
      </div>

      {/* 4. File import */}
      <BiometricImport onImported={() => { load(); onRefresh(); }} />

      {/* 5. Recent punches */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#1c1c1c]">Latest punches</h3>
        {unmatched.length > 0 && (
          <p className="text-xs text-[#a3561f]">Codes with no employee: {unmatched.slice(0, 12).join(", ")}{unmatched.length > 12 ? "…" : ""}. Add them above to count these punches.</p>
        )}
        {punches.length === 0 ? <p className="text-xs text-[#9a9a94]">No punches received yet.</p> : (
          <div className="divide-y divide-[#ebece6] border border-[#ebece6] rounded-xl text-sm">
            {punches.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="flex-1 min-w-[140px] text-[#1c1c1c]">{byCode.get(p.employee_code) ?? <span className="text-[#9a9a94]">Code {p.employee_code}</span>}</span>
                <span className="text-xs text-[#6b6b67]">{fmt(p.punched_at)}</span>
                <span className="text-xs text-[#9a9a94] w-16">{p.direction ?? ""}</span>
                <span className="text-[10px] uppercase tracking-wider text-[#9a9a94] w-14">{p.source}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

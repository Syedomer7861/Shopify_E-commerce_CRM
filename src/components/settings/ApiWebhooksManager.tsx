"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Loader2, Plus, Trash2, Webhook } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const SCOPES = ["leads:read", "leads:write", "deals:read", "deals:write", "tickets:read"];
const EVENTS = ["lead.created", "deal.created", "deal.won", "ticket.created", "quote.accepted", "invoice.created"];
type Key = { id: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null };
type Hook = { id: string; url: string; events: string[]; is_active: boolean; created_at: string };
type Delivery = { id: number; endpoint_id: string; event: string; created_at: string; status_code: number | null; error: string | null };
const input = "h-9 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";

/** API keys and webhooks for a workspace. Admin-only in the database (RLS + functions). */
export function ApiWebhooksManager() {
  const supabase = useMemo(() => createClient(), []);
  const [keys, setKeys] = useState<Key[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["leads:read"]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["lead.created"]);
  const [busy, setBusy] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    const [k, h, d] = await Promise.all([
      supabase.from("api_keys").select("id,name,prefix,scopes,created_at,last_used_at,revoked_at").order("created_at", { ascending: false }),
      supabase.from("webhook_endpoints").select("id,url,events,is_active,created_at").order("created_at", { ascending: false }),
      supabase.rpc("webhook_recent"),
    ]);
    if (k.error) toast.error(k.error.message);
    setKeys((k.data || []) as Key[]);
    setHooks((h.data || []) as Hook[]);
    setDeliveries((d.data || []) as Delivery[]);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copied"), () => toast.error("Could not copy"));

  async function createKey() {
    if (!keyName.trim() || keyScopes.length === 0) return toast.error("Name the key and pick at least one permission");
    setBusy(true);
    const { data, error } = await supabase.rpc("create_api_key", { p_name: keyName.trim(), p_scopes: keyScopes });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSecret({ label: "Your new API key", value: data as string });
    setKeyName(""); load();
  }
  async function revoke(k: Key) {
    if (!window.confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) return;
    const { error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", k.id);
    if (error) return toast.error(error.message);
    load();
  }
  async function createHook() {
    if (events.length === 0) return toast.error("Pick at least one event");
    setBusy(true);
    const { data, error } = await supabase.rpc("create_webhook", { p_url: url.trim(), p_events: events });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSecret({ label: "Webhook signing secret", value: data as string });
    setUrl(""); load();
  }
  async function patchHook(h: Hook, change: Partial<Hook>) {
    const { error } = await supabase.from("webhook_endpoints").update(change).eq("id", h.id);
    if (error) return toast.error(error.message);
    load();
  }
  async function deleteHook(h: Hook) {
    if (!window.confirm(`Delete the webhook to ${h.url}?`)) return;
    const { error } = await supabase.from("webhook_endpoints").delete().eq("id", h.id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="space-y-6">
      {secret && (
        <div className="card p-4 border-amber-200 bg-amber-50 space-y-2">
          <div className="text-xs font-bold text-amber-800">{secret.label}: copy it now. It will not be shown again.</div>
          <div className="flex gap-2">
            <code className="flex-1 min-w-0 break-all rounded bg-white px-2 py-1.5 text-xs">{secret.value}</code>
            <button onClick={() => copy(secret.value)} className="inline-flex items-center gap-1 text-xs font-semibold px-3 rounded-lg border border-amber-300"><Copy className="w-3 h-3" /> Copy</button>
          </div>
          <button onClick={() => setSecret(null)} className="text-[11px] text-amber-800 underline">I have saved it</button>
        </div>
      )}

      <div className="card p-6 space-y-4">
        <h3 className="flex items-center gap-2 text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest"><KeyRound className="w-3.5 h-3.5" /> API keys</h3>
        <p className="text-xs text-[#5f5f5d]">Connect other software. Send the key as <code>Authorization: Bearer &lt;key&gt;</code> to <code>{origin}/api/v1/leads</code>, <code>/api/v1/deals</code> or <code>/api/v1/tickets</code>. GET lists (<code>?limit=</code>, <code>?since=</code>); POST creates leads and deals. 120 requests a minute per key.</p>
        {keys.length > 0 && (
          <div className="divide-y divide-[#eceae4] border border-[#eceae4] rounded-lg">
            {keys.map(k => (
              <div key={k.id} className={cn("p-3 flex flex-wrap items-center gap-2 text-sm", k.revoked_at && "opacity-50")}>
                <div className="flex-1 min-w-[160px]"><div className="font-semibold">{k.name} <code className="text-[11px] font-normal text-[#5f5f5d]">{k.prefix}…</code></div>
                  <div className="text-[11px] text-[#5f5f5d]">{k.scopes.join(", ")} · {k.revoked_at ? "revoked" : k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleString()}` : "never used"}</div></div>
                {!k.revoked_at && <button onClick={() => revoke(k)} className="text-[11px] font-semibold text-rose-600">Revoke</button>}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-[#5f5f5d] flex-1 min-w-[160px]">Key name<input className={cn(input, "w-full mt-1")} maxLength={80} value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Zapier, website, ERP" /></label>
          <div className="flex flex-wrap gap-1.5">{SCOPES.map(s => (
            <label key={s} className="flex items-center gap-1 text-[11px] border border-[#eceae4] rounded-full px-2 py-1"><input type="checkbox" checked={keyScopes.includes(s)} onChange={() => setKeyScopes(toggle(keyScopes, s))} /> {s}</label>
          ))}</div>
          <button onClick={createKey} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 h-9 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create key</button>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h3 className="flex items-center gap-2 text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest"><Webhook className="w-3.5 h-3.5" /> Webhooks</h3>
        <p className="text-xs text-[#5f5f5d]">We POST JSON to your https address when these happen. Verify the <code>X-CodeCrest-Signature</code> header: hex HMAC-SHA256 of the raw body with your signing secret.</p>
        {hooks.length > 0 && (
          <div className="divide-y divide-[#eceae4] border border-[#eceae4] rounded-lg">
            {hooks.map(h => (
              <div key={h.id} className={cn("p-3 flex flex-wrap items-center gap-2 text-sm", !h.is_active && "opacity-50")}>
                <div className="flex-1 min-w-[160px]"><div className="font-semibold break-all">{h.url}</div><div className="text-[11px] text-[#5f5f5d]">{h.events.join(", ")}</div></div>
                <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={h.is_active} onChange={e => patchHook(h, { is_active: e.target.checked })} /> On</label>
                <button onClick={() => deleteHook(h)} aria-label="Delete webhook" className="p-1 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-[#5f5f5d] flex-1 min-w-[200px]">https address<input className={cn(input, "w-full mt-1")} maxLength={500} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/hooks/codecrest" /></label>
          <div className="flex flex-wrap gap-1.5">{EVENTS.map(ev => (
            <label key={ev} className="flex items-center gap-1 text-[11px] border border-[#eceae4] rounded-full px-2 py-1"><input type="checkbox" checked={events.includes(ev)} onChange={() => setEvents(toggle(events, ev))} /> {ev}</label>
          ))}</div>
          <button onClick={createHook} disabled={busy || !url.trim()} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 h-9 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Add webhook</button>
        </div>
        {deliveries.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-1">Recent deliveries</div>
            <div className="max-h-56 overflow-y-auto text-[11px] divide-y divide-[#eceae4] border border-[#eceae4] rounded-lg">
              {deliveries.map(d => (
                <div key={d.id} className="px-3 py-1.5 flex gap-3">
                  <span className="w-28 shrink-0 text-[#5f5f5d]">{new Date(d.created_at).toLocaleString()}</span>
                  <span className="flex-1">{d.event}</span>
                  <span className={d.status_code && d.status_code < 300 ? "text-emerald-700" : "text-rose-600"}>{d.status_code ?? (d.error ? "failed" : "pending")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

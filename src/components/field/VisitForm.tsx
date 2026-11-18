"use client";
import { useEffect, useMemo, useState } from "react";
import { Building2, Link2, Loader2, Search, ShieldCheck, UserRound, X } from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone-utils";
import { cn } from "@/lib/utils";
import {
  CONTACT_CATEGORIES, EMPTY_CONTACT, INTEREST, VISIT_PURPOSES, contactErrors, contactInput, contactRow, type ContactInput,
} from "@/lib/field-contacts";
import type { RecordRow } from "@/components/records/RecordsModule";

type Found = { id: string; business_name: string; contact_person: string | null; phone: string | null; city: string | null; area: string | null } & Record<string, unknown>;

/**
 * New visit with the contact's full details. Picks a saved contact or adds a
 * new one (matched by mobile number so repeat visits land on one record),
 * then saves the visit linked to it. Contacts feed the Field contacts module.
 */
export function VisitForm({ open, ownerId, onClose, onSaved }: {
  open: boolean; ownerId: string; onClose: () => void;
  onSaved: (row: RecordRow, checkInNow: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [c, setC] = useState<ContactInput>(EMPTY_CONTACT);
  const [purpose, setPurpose] = useState("");
  const [purposeOther, setPurposeOther] = useState("");
  const [plannedAt, setPlannedAt] = useState("");
  const [picked, setPicked] = useState<Found | null>(null);           // a contact this person can see and edit
  const [linked, setLinked] = useState<{ id: string; name: string } | null>(null); // same phone, saved by someone else
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState<null | "now" | "later">(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (open) return;
    setC(EMPTY_CONTACT); setPurpose(""); setPurposeOther(""); setPlannedAt(""); setPicked(null); setLinked(null);
    setQ(""); setFound(null); setTouched(false); setMore(false);
  }, [open]);

  // Saved contacts this person can see, by name, person or phone.
  useEffect(() => {
    const term = q.trim().replace(/[,()*%_\\"]/g, "");
    if (term.length < 2) { setFound(null); return; }
    const t = setTimeout(async () => {
      const digits = normalizePhone(term);
      const or = [`business_name.ilike.%${term}%`, `contact_person.ilike.%${term}%`, ...(digits.length >= 4 ? [`phone.ilike.%${digits}%`] : [])].join(",");
      const { data } = await supabase.from("field_contacts").select("*").or(or).order("last_visit_at", { ascending: false, nullsFirst: false }).limit(6);
      setFound((data || []) as Found[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, supabase]);

  const errors = contactErrors(c);
  const err = (k: keyof ContactInput) => (touched ? errors[k] : undefined);
  const set = <K extends keyof ContactInput>(k: K, v: ContactInput[K]) => setC(prev => ({ ...prev, [k]: v }));

  const pick = (f: Found) => { setPicked(f); setLinked(null); setC(contactInput(f)); setQ(""); setFound(null); };
  const unpick = () => { setPicked(null); setLinked(null); setC(EMPTY_CONTACT); };

  // Same number saved before (maybe by a colleague): link to it instead of adding a duplicate.
  async function checkPhone() {
    const phone = normalizePhone(c.phone);
    if (picked || phone.length < 10) return;
    const { data } = await supabase.rpc("field_contact_by_phone", { p_phone: phone });
    const hit = (data as { id: string; business_name: string }[] | null)?.[0];
    setLinked(hit ? { id: hit.id, name: hit.business_name } : null);
  }

  async function save(checkInNow: boolean) {
    setTouched(true);
    if (Object.keys(errors).length) return toast.error(Object.values(errors)[0]!);
    const finalPurpose = purpose === "Other" ? purposeOther.trim() || "Other" : purpose;
    setSaving(checkInNow ? "now" : "later");
    try {
      const row = contactRow(c);
      let contactId: string | null = picked?.id ?? linked?.id ?? null;
      if (picked) {
        const { error } = await supabase.from("field_contacts").update(row).eq("id", picked.id);
        if (error) toast("Visit saved, but the contact's details couldn't be updated (only its owner or a manager can).", { duration: 6000 });
      } else if (!linked) {
        const id = crypto.randomUUID();
        const { error } = await supabase.from("field_contacts").insert({ id, owner_id: ownerId, ...row });
        if (!error) contactId = id;
        else if (error.code === "23505" && row.phone) {
          const { data } = await supabase.rpc("field_contact_by_phone", { p_phone: row.phone });
          contactId = (data as { id: string }[] | null)?.[0]?.id ?? null;
        } else if (!/field_contacts|relation|schema cache/i.test(error.message)) {
          throw new Error(error.message);
        }
        // Table not there yet (migration pending): the visit still saves without the link.
      }

      const visit: Record<string, unknown> = {
        id: crypto.randomUUID(), owner_id: ownerId, party_name: row.business_name,
        purpose: finalPurpose || null,
        planned_at: plannedAt ? new Date(plannedAt).toISOString() : new Date().toISOString(),
        ...(contactId ? { contact_id: contactId } : {}),
      };
      let { error } = await supabase.from("visits").insert(visit);
      if (error && /contact_id/i.test(error.message)) {
        delete visit.contact_id;
        ({ error } = await supabase.from("visits").insert(visit));
      }
      if (error) throw new Error(error.message);
      toast.success(contactId ? "Visit and contact saved" : "Visit saved");
      onSaved({ status: "planned", ...visit, id: visit.id as string }, checkInNow);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't save the visit");
    } finally {
      setSaving(null);
    }
  }

  const field = "input w-full text-sm";
  return (
    <Modal open={open} onClose={onClose} title="New visit" maxWidth="max-w-2xl"
      footer={
        <div className="flex flex-col gap-2 w-full">
          <button onClick={() => save(true)} disabled={!!saving} className="btn-primary w-full py-2.5">
            {saving === "now" ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save & check in now (photo + location)"}
          </button>
          <button onClick={() => save(false)} disabled={!!saving} className="btn-secondary w-full py-2.5">
            {saving === "later" ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save visit for later"}
          </button>
        </div>
      }>
      <div className="space-y-5">
        {/* Find a saved contact */}
        {picked ? (
          <div className="rounded-xl border border-[#1c1c1c] bg-[#fcfbf8] p-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-[var(--accent)] grid place-items-center shrink-0"><Building2 className="w-4 h-4 text-[#1c1c1c]" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-[#1c1c1c] truncate">{picked.business_name}</div>
              <div className="text-[11px] text-[#6b6b67] truncate">Saved contact · {Number(picked.visit_count || 0)} earlier visits. Edit anything below that changed.</div>
            </div>
            <button type="button" onClick={unpick} aria-label="Use a different contact" className="text-[#9a9a94] hover:text-[#1c1c1c]"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="relative">
            <label className="text-xs font-medium text-[#3a3a36] block mb-1" htmlFor="vf-find">Visiting someone you met before?</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#9a9a94] absolute left-3 top-1/2 -translate-y-1/2" />
              <input id="vf-find" value={q} onChange={e => setQ(e.target.value)} placeholder="Search saved contacts by shop, person or mobile" className={cn(field, "pl-9")} autoComplete="off" />
            </div>
            {found && (
              <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-white border border-[#ebece6] shadow-lg overflow-hidden">
                {found.length === 0 && <li className="px-3 py-2.5 text-xs text-[#9a9a94]">No saved contact matches. Fill in the details below.</li>}
                {found.map(f => (
                  <li key={f.id}>
                    <button type="button" onClick={() => pick(f)} className="w-full text-left px-3 py-2.5 hover:bg-[#f6f7f2]">
                      <div className="text-xs font-semibold text-[#1c1c1c]">{f.business_name}</div>
                      <div className="text-[11px] text-[#6b6b67]">{[f.contact_person, f.phone, f.area || f.city].filter(Boolean).join(" · ")}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Section icon={<Building2 className="w-3.5 h-3.5" />} title="Business">
          <Field label="Shop / business name" required error={err("business_name")} className="sm:col-span-2">
            <input className={field} value={c.business_name} onChange={e => set("business_name", e.target.value)} placeholder="e.g. Sai Medicals" maxLength={200} />
          </Field>
          <Field label="Type">
            <Select value={c.category} onChange={v => set("category", v)} placeholder="Choose type" options={CONTACT_CATEGORIES.map(o => ({ value: o, label: o }))} />
          </Field>
          <Field label="Area / locality">
            <input className={field} value={c.area} onChange={e => set("area", e.target.value)} placeholder="e.g. Banjara Hills" maxLength={120} />
          </Field>
        </Section>

        <Section icon={<UserRound className="w-3.5 h-3.5" />} title="Person you met">
          <Field label="Name" required error={err("contact_person")}>
            <input className={field} value={c.contact_person} onChange={e => set("contact_person", e.target.value)} autoComplete="off" maxLength={120} />
          </Field>
          <Field label="Role">
            <input className={field} value={c.designation} onChange={e => set("designation", e.target.value)} placeholder="Owner, manager, doctor…" maxLength={80} />
          </Field>
          <Field label="Mobile" required error={err("phone")}>
            <input className={field} type="tel" inputMode="tel" value={c.phone} onChange={e => { set("phone", e.target.value); setLinked(null); }} onBlur={checkPhone} placeholder="10-digit mobile" maxLength={16} />
          </Field>
          <Field label="Email" error={err("email")}>
            <input className={field} type="email" inputMode="email" value={c.email} onChange={e => set("email", e.target.value)} maxLength={200} />
          </Field>
          <label className="sm:col-span-2 flex items-center gap-2 text-xs text-[#3a3a36]">
            <input type="checkbox" checked={c.whatsappSame} onChange={e => set("whatsappSame", e.target.checked)} className="accent-[#1c1c1c]" />
            WhatsApp is on this mobile number
          </label>
          {!c.whatsappSame && (
            <Field label="WhatsApp number" error={err("whatsapp")}>
              <input className={field} type="tel" inputMode="tel" value={c.whatsapp} onChange={e => set("whatsapp", e.target.value)} maxLength={16} />
            </Field>
          )}
          {linked && (
            <p className="sm:col-span-2 rounded-lg bg-[#f6f7f2] border border-[#ebece6] px-3 py-2 text-[11px] text-[#3a3a36] flex items-start gap-2">
              <Link2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>This number is already saved as <b>{linked.name}</b>. The visit will be added to that contact, not a new one.</span>
            </p>
          )}
        </Section>

        <Section title="Visit">
          <Field label="Purpose">
            <Select value={purpose} onChange={setPurpose} placeholder="Choose purpose" options={VISIT_PURPOSES.map(o => ({ value: o, label: o }))} />
          </Field>
          <Field label="Planned for" hint="Leave empty for now">
            <input className={cn(field, "min-w-0 appearance-none")} type="datetime-local" value={plannedAt} onChange={e => setPlannedAt(e.target.value)} />
          </Field>
          {purpose === "Other" && (
            <Field label="What is the visit for?" className="sm:col-span-2">
              <input className={field} value={purposeOther} onChange={e => setPurposeOther(e.target.value)} maxLength={200} />
            </Field>
          )}
          <div className="sm:col-span-2">
            <span className="text-xs font-medium text-[#3a3a36] block mb-1">Interest</span>
            <div role="radiogroup" aria-label="Interest" className="flex flex-wrap gap-1.5">
              {INTEREST.map(i => (
                <button key={i.value} type="button" role="radio" aria-checked={c.interest === i.value} onClick={() => set("interest", c.interest === i.value ? "" : i.value)}
                  className={cn("px-3 py-1.5 rounded-full border text-[11px] font-bold",
                    c.interest === i.value ? (i.value === "hot" ? "bg-[var(--accent)] border-[#1c1c1c] text-[#1c1c1c]" : "bg-[#1c1c1c] border-[#1c1c1c] text-white") : "bg-white border-[#ebece6] text-[#55554f] hover:border-[#1c1c1c]")}>
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <button type="button" onClick={() => setMore(v => !v)} aria-expanded={more} className="text-xs font-bold text-[#1c1c1c] underline">
          {more ? "Hide address and notes" : "Add address, products and notes"}
        </button>
        {more && (
          <Section title="Address and notes">
            <Field label="Address" className="sm:col-span-2">
              <textarea className={cn(field, "min-h-[64px]")} value={c.address} onChange={e => set("address", e.target.value)} maxLength={500} />
            </Field>
            <Field label="City"><input className={field} value={c.city} onChange={e => set("city", e.target.value)} maxLength={80} /></Field>
            <Field label="State"><input className={field} value={c.state} onChange={e => set("state", e.target.value)} maxLength={80} /></Field>
            <Field label="PIN code" error={err("pincode")}><input className={field} inputMode="numeric" value={c.pincode} onChange={e => set("pincode", e.target.value)} maxLength={10} /></Field>
            <Field label="Products they're interested in"><input className={field} value={c.products_interest} onChange={e => set("products_interest", e.target.value)} maxLength={300} /></Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea className={cn(field, "min-h-[64px]")} value={c.notes} onChange={e => set("notes", e.target.value)} maxLength={2000} />
            </Field>
          </Section>
        )}

        <label className="flex items-start gap-2.5 rounded-xl border border-[#ebece6] p-3 cursor-pointer">
          <input type="checkbox" checked={c.marketing_consent} onChange={e => set("marketing_consent", e.target.checked)} className="mt-0.5 accent-[#1c1c1c]" />
          <span className="text-xs text-[#3a3a36]">
            <span className="font-bold text-[#1c1c1c] inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> They agreed to get offers and updates</span>
            <span className="block text-[11px] text-[#6b6b67]">Tick only if they said yes to WhatsApp, SMS or email from us. Marketing only messages contacts who agreed.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-[10px] font-bold uppercase tracking-wider text-[#9a9a94] mb-2 flex items-center gap-1.5">{icon}{title}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </fieldset>
  );
}

function Field({ label, required, error, hint, className, children }: { label: string; required?: boolean; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="text-xs font-medium text-[#3a3a36] block mb-1">{label}{required && " *"}{hint && <span className="text-[#9a9a94] font-normal"> · {hint}</span>}</span>
      {children}
      {error && <span role="alert" className="block mt-1 text-[11px] text-rose-600">{error}</span>}
    </label>
  );
}

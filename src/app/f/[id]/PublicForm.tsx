"use client";
import { useState } from "react";

export type PublicFormSpec = {
  title: string; intro: string; success_message: string; org_name: string;
  fields: string[];
  custom: { key: string; label: string; field_type: "text" | "textarea" | "number" | "date" | "select"; options: string[]; required: boolean }[];
};

const BUILT_IN: Record<string, { label: string; type: string; auto?: string }> = {
  email: { label: "Email", type: "email", auto: "email" },
  phone: { label: "Phone", type: "tel", auto: "tel" },
  company: { label: "Company", type: "text", auto: "organization" },
  notes: { label: "Message", type: "textarea" },
};
const box = "w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-[15px] focus:outline-none focus:border-black/40";

export default function PublicForm({ id, spec }: { id: string; spec: PublicFormSpec }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setState("sending");
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch(`/api/forms/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || "Could not send. Please try again."); setState("idle"); return; }
      setState("done");
    } catch {
      setError("Could not send. Check your connection and try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center text-[15px]" role="status">{spec.success_message}</div>;
  }

  const custom = new Map(spec.custom.map((c) => [`cf:${c.key}`, c]));
  return (
    <form onSubmit={submit} className="mx-auto max-w-lg rounded-2xl bg-white p-6 sm:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{spec.title}</h1>
        {spec.intro && <p className="mt-2 text-[15px] text-black/60">{spec.intro}</p>}
      </div>
      <Field label="Name" required><input name="name" required maxLength={120} autoComplete="name" className={box} /></Field>
      {spec.fields.map((k) => {
        const b = BUILT_IN[k];
        if (b) return (
          <Field key={k} label={b.label}>
            {b.type === "textarea" ? <textarea name={k} rows={4} maxLength={4000} className={box} />
              : <input name={k} type={b.type} autoComplete={b.auto} maxLength={200} className={box} />}
          </Field>
        );
        const c = custom.get(k);
        if (!c) return null;
        return (
          <Field key={k} label={c.label} required={c.required}>
            {c.field_type === "select" ? (
              <select name={k} required={c.required} className={box} defaultValue="">
                <option value="" disabled>Choose</option>
                {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : c.field_type === "textarea" ? <textarea name={k} required={c.required} rows={3} maxLength={2000} className={box} />
              : <input name={k} type={c.field_type === "number" ? "number" : c.field_type === "date" ? "date" : "text"} step="any" required={c.required} maxLength={2000} className={box} />}
          </Field>
        );
      })}
      {/* Honeypot: hidden from people, bots fill it in. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      <button type="submit" disabled={state === "sending"} className="w-full rounded-full bg-[#111113] py-3 text-sm font-semibold text-white disabled:opacity-50">
        {state === "sending" ? "Sending..." : "Send"}
      </button>
      <p className="text-center text-[11px] text-black/40">Sent to {spec.org_name}</p>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium">{label}{required && " *"}</span>
      {children}
    </label>
  );
}

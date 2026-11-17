"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { orgModuleOff } from "@/lib/access";
import { isAdmin } from "@/lib/permissions";
import {
  ACCENT_SWATCHES, DEFAULT_ACCENT, DEFAULT_RADIUS, THEME_EVENT, THEME_PRESETS,
  cleanTheme, readableAccent, type OrgTheme,
} from "@/lib/org-theme";

/**
 * Settings › Appearance. Admins pick the workspace colour, corner style and
 * table density. Premium only: the DB trigger trg_guard_org_theme refuses the
 * save when the plan blocks "branding", this screen only explains it.
 */
export function AppearanceManager() {
  const { profile } = useCurrentProfile();
  const supabase = useMemo(() => createClient(), []);
  const [saved, setSaved] = useState<OrgTheme | null>(null);
  const [draft, setDraft] = useState<OrgTheme>({});
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = orgModuleOff(profile, "branding");
  const canEdit = isAdmin(profile) && !locked;
  const orgId = profile?.org_id;

  useEffect(() => {
    if (!orgId) return;
    supabase.from("organizations").select("theme").eq("id", orgId).maybeSingle().then(({ data, error }) => {
      if (error) toast.error(error.message);
      const t = cleanTheme(data?.theme);
      setSaved(t); setDraft(t);
    });
  }, [supabase, orgId]);

  const accent = draft.accent ?? DEFAULT_ACCENT;
  const radius = draft.radius ?? DEFAULT_RADIUS;
  const dirty = saved !== null && JSON.stringify(saved) !== JSON.stringify(draft);
  const customOk = readableAccent(custom);

  async function save(next: OrgTheme) {
    if (!orgId) return;
    setBusy(true);
    const { error } = await supabase.from("organizations").update({ theme: next }).eq("id", orgId);
    setBusy(false);
    if (error) return toast.error(error.message);
    setSaved(next); setDraft(next);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
    toast.success("Appearance saved for everyone in your workspace");
  }

  if (!saved) return <div className="py-16 text-center text-[#9a9a94]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="card p-5 space-y-6">
        <div>
          <h2 className="text-sm font-bold text-[#1c1c1c]">Appearance</h2>
          <p className="text-xs text-[#6b6b67] mt-0.5">Colour, corners and density for everyone in your workspace.</p>
        </div>

        {locked && (
          <div className="flex gap-2 items-start rounded-xl border border-[#ebece6] bg-[#f6f7f2] p-3 text-xs text-[#3a3a36]">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            Custom branding is part of the Premium plan. Ask your account owner to upgrade to change these.
          </div>
        )}
        {!locked && !isAdmin(profile) && <p className="text-xs text-[#6b6b67]">Only admins can change the appearance.</p>}

        <fieldset disabled={!canEdit || busy} className="space-y-6 disabled:opacity-60">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b6b67] mb-2">Presets</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {THEME_PRESETS.map(p => {
                const on = (draft.preset ?? "default") === p.key;
                return (
                  <button key={p.key} type="button" onClick={() => setDraft({ ...p.theme, density: draft.density, preset: p.key })}
                    className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm", on ? "border-[#1c1c1c]" : "border-[#ebece6] hover:border-[#1c1c1c]/30")}>
                    <span className="w-5 h-5 rounded-full border border-black/10" style={{ background: p.theme.accent ?? DEFAULT_ACCENT }} />
                    <span className="flex-1 truncate">{p.name}</span>
                    {on && <Check className="w-4 h-4" />}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b6b67] mb-2">Accent colour</h3>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_SWATCHES.map(c => (
                <button key={c} type="button" aria-label={`Accent ${c}`} onClick={() => setDraft({ ...draft, accent: c, preset: undefined })}
                  className={cn("w-8 h-8 rounded-full border border-black/10 grid place-items-center", accent === c && "ring-2 ring-offset-2 ring-[#1c1c1c]")}
                  style={{ background: c }}>
                  {accent === c && <Check className="w-4 h-4 text-[#1c1c1c]" />}
                </button>
              ))}
              <span className="flex items-center gap-1.5 ml-1">
                <input type="color" aria-label="Pick a custom colour" value={customOk ? custom : accent}
                  onChange={e => setCustom(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
                <input className="input h-8 w-24 text-xs font-mono" placeholder="#a1b2c3" value={custom}
                  onChange={e => setCustom(e.target.value.trim())} />
                <button type="button" className="btn-secondary text-xs h-8" disabled={!customOk}
                  onClick={() => setDraft({ ...draft, accent: custom.toLowerCase(), preset: undefined })}>Use</button>
              </span>
            </div>
            {custom && !customOk && (
              <p className="text-xs text-[#c94f40] mt-1.5">Too dark for the app&apos;s dark text on buttons. Pick a lighter colour.</p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b6b67] mb-2">Card corners · {radius}px</h3>
            <input type="range" min={8} max={28} step={2} value={radius} aria-label="Card corner radius"
              onChange={e => setDraft({ ...draft, radius: Number(e.target.value), preset: undefined })} className="w-full max-w-sm accent-[#1c1c1c]" />
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b6b67] mb-2">Table density</h3>
            <div className="inline-flex rounded-xl border border-[#ebece6] p-1">
              {(["comfortable", "compact"] as const).map(d => (
                <button key={d} type="button" onClick={() => setDraft({ ...draft, density: d })}
                  className={cn("px-4 py-1.5 rounded-lg text-sm capitalize", (draft.density ?? "comfortable") === d ? "bg-[#1c1c1c] text-white" : "text-[#3a3a36]")}>
                  {d}
                </button>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-xs" disabled={!dirty} onClick={() => save(draft)}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save appearance"}
            </button>
            <button type="button" className="btn-secondary text-xs" disabled={!dirty} onClick={() => setDraft(saved)}>Discard</button>
            <button type="button" className="btn-secondary text-xs ml-auto" disabled={JSON.stringify(saved) === "{}"} onClick={() => save({})}>
              Reset to default
            </button>
          </div>
        </fieldset>
      </div>

      {/* Preview: CSS variables scoped to this box only, the app changes on save. */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b6b67]">Preview</h3>
        <div
          className="space-y-3 rounded-2xl bg-[#f2f3ee] p-4"
          style={{
            ["--accent" as string]: accent,
            ["--accent-3" as string]: `color-mix(in srgb, ${accent} 42%, white)`,
            ["--accent-4" as string]: `color-mix(in srgb, ${accent} 12%, white)`,
            ["--radius-card" as string]: `${radius}px`,
          }}
        >
          <div className="card p-4">
            <div className="text-xs text-[#6b6b67]">Revenue this month</div>
            <div className="text-2xl font-bold text-[#1c1c1c]">Sample</div>
            <div className="mt-3 h-2 rounded-full bg-[color:var(--accent-4)]">
              <div className="h-2 w-2/3 rounded-full bg-[color:var(--accent)]" />
            </div>
          </div>
          <div className="card divide-y divide-[#ebece6] p-0 overflow-hidden">
            {["First row", "Second row"].map(r => (
              <div key={r} className={cn("px-4 text-sm text-[#1c1c1c]", draft.density === "compact" ? "py-1.5" : "py-3")}>{r}</div>
            ))}
          </div>
          <button type="button" tabIndex={-1} className="rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[#1c1c1c]">
            Primary action
          </button>
          <span className="ml-2 rounded-full bg-[color:var(--accent-3)] px-2.5 py-1 text-xs font-semibold text-[#1c1c1c]">Badge</span>
        </div>
      </div>
    </div>
  );
}

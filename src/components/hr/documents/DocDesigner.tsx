"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Image as ImageIcon, Minus, Square, Table, Trash2, Type, X } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { KIND_LABEL, PAGE, PLACEHOLDERS, newId, type DocEl, type DocKind, type DocTemplate, type ElType } from "@/lib/hr-docs";
import { ElView } from "@/components/hr/documents/DocPage";

const MAX_IMAGE_BYTES = 400_000;

/** Downscale an uploaded logo/signature to a small data URL so templates stay light. */
async function toDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 700 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const png = c.toDataURL("image/png");
  return png.length <= MAX_IMAGE_BYTES ? png : c.toDataURL("image/jpeg", 0.85);
}

const BLANK: Record<ElType, Partial<DocEl>> = {
  text: { w: 300, h: 40, text: "New text", fontSize: 13 },
  image: { w: 160, h: 80 },
  line: { w: 400, h: 2, bg: "#1c1c1c" },
  box: { w: 240, h: 100, bg: "#f6f7f2", border: "#1c1c1c", borderWidth: 1, radius: 6 },
  table: { w: 500, h: 120, fontSize: 12, border: "#d4d5cd", rows: [["Heading", "Heading"], ["Value", "Value"]] },
};

/**
 * Canvas editor for one HR document design. Drag blocks to move, drag the
 * corner to resize, edit the selected block on the right. Saved to
 * hr_doc_templates (RLS: admin/HR of this organisation only).
 */
export function DocDesigner({ initial, onClose, onSaved }: { initial: DocTemplate; onClose: () => void; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [tpl, setTpl] = useState<DocTemplate>(initial);
  const [sel, setSel] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.7);
  const [saving, setSaving] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "size"; sx: number; sy: number; el: DocEl } | null>(null);
  const page = PAGE[tpl.page_size];
  const selected = tpl.elements.find(e => e.id === sel) ?? null;

  useEffect(() => {
    const fit = () => wrap.current && setZoom(Math.min(1, (wrap.current.clientWidth - 24) / page.w));
    fit();
    const ro = new ResizeObserver(fit);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [page.w]);

  const patch = (id: string, p: Partial<DocEl>) => setTpl(t => ({ ...t, elements: t.elements.map(e => (e.id === id ? { ...e, ...p } : e)) }));

  function add(type: ElType, extra: Partial<DocEl> = {}) {
    const el = { id: newId(), type, x: 80, y: 80, ...BLANK[type], ...extra } as DocEl;
    setTpl(t => ({ ...t, elements: [...t.elements, el] }));
    setSel(el.id);
  }

  function remove(id: string) { setTpl(t => ({ ...t, elements: t.elements.filter(e => e.id !== id) })); setSel(null); }
  function duplicate(el: DocEl) { const c = { ...el, id: newId(), x: el.x + 16, y: el.y + 16, rows: el.rows?.map(r => [...r]) }; setTpl(t => ({ ...t, elements: [...t.elements, c] })); setSel(c.id); }
  function layer(id: string, dir: 1 | -1) {
    setTpl(t => {
      const i = t.elements.findIndex(e => e.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= t.elements.length) return t;
      const els = [...t.elements];
      [els[i], els[j]] = [els[j], els[i]];
      return { ...t, elements: els };
    });
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom;
      if (d.mode === "move") patch(d.id, { x: Math.round(Math.max(0, Math.min(page.w - 10, d.el.x + dx))), y: Math.round(Math.max(0, Math.min(page.h - 2, d.el.y + dy))) });
      else patch(d.id, { w: Math.round(Math.max(10, d.el.w + dx)), h: Math.round(Math.max(2, d.el.h + dy)) });
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [zoom, page.w, page.h]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!selected || (e.target as HTMLElement).closest("input,textarea,select")) return;
      const step = e.shiftKey ? 10 : 1;
      const m: Record<string, Partial<DocEl>> = {
        ArrowLeft: { x: selected.x - step }, ArrowRight: { x: selected.x + step },
        ArrowUp: { y: selected.y - step }, ArrowDown: { y: selected.y + step },
      };
      if (m[e.key]) { e.preventDefault(); patch(selected.id, m[e.key]); }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(selected.id); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected]);

  async function save() {
    if (!tpl.name.trim()) return toast.error("Give the document a name");
    setSaving(true);
    const row = { name: tpl.name.trim(), kind: tpl.kind, page_size: tpl.page_size, elements: tpl.elements, updated_at: new Date().toISOString() };
    const res = tpl.id
      ? await supabase.from("hr_doc_templates").update(row).eq("id", tpl.id).select("id").single()
      : await supabase.from("hr_doc_templates").insert(row).select("id").single();
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    setTpl(t => ({ ...t, id: res.data.id }));
    toast.success("Design saved");
    onSaved();
  }

  async function pickImage(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image file");
    try {
      const src = await toDataUrl(f);
      if (src.length > MAX_IMAGE_BYTES * 1.4) return toast.error("Image is too large even after resizing");
      if (selected?.type === "image") patch(selected.id, { src }); else add("image", { src });
    } catch { toast.error("Could not read this image"); }
  }

  const num = (label: string, k: keyof DocEl, v: number | undefined, min = 0) => (
    <label className="text-[11px] text-[#6b6b67] flex items-center justify-between gap-2">{label}
      <input type="number" min={min} className="input h-7 w-20 text-xs" value={v ?? ""} onChange={e => selected && patch(selected.id, { [k]: Number(e.target.value) || 0 } as Partial<DocEl>)} />
    </label>
  );
  const color = (label: string, k: "color" | "bg" | "border", v: string | undefined) => (
    <label className="text-[11px] text-[#6b6b67] flex items-center justify-between gap-2">{label}
      <span className="flex items-center gap-1">
        <input type="color" className="w-7 h-7" value={v || "#ffffff"} onChange={e => selected && patch(selected.id, { [k]: e.target.value })} />
        {v && k !== "color" && <button type="button" aria-label={`Clear ${label}`} onClick={() => selected && patch(selected.id, { [k]: undefined })}><X className="w-3 h-3" /></button>}
      </span>
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <input className="input h-9 text-sm flex-1 min-w-[180px]" value={tpl.name} onChange={e => setTpl({ ...tpl, name: e.target.value })} aria-label="Document name" />
        <select className="input h-9 text-sm w-44" value={tpl.kind} onChange={e => setTpl({ ...tpl, kind: e.target.value as DocKind })} aria-label="Document type">
          {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input h-9 text-sm w-24" value={tpl.page_size} onChange={e => setTpl({ ...tpl, page_size: e.target.value as DocTemplate["page_size"] })} aria-label="Page size">
          <option value="A4">A4</option><option value="Letter">Letter</option>
        </select>
        <button type="button" className="btn-primary text-xs h-9" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save design"}</button>
        <button type="button" className="btn-secondary text-xs h-9" onClick={onClose}>Close</button>
      </div>

      <div className="card p-2 flex flex-wrap gap-1">
        {([["text", Type, "Text"], ["line", Minus, "Line"], ["box", Square, "Box"], ["table", Table, "Table"]] as const).map(([t, I, l]) => (
          <button key={t} type="button" className="btn-secondary text-xs h-8" onClick={() => add(t)}><I className="w-3.5 h-3.5" /> {l}</button>
        ))}
        <label className="btn-secondary text-xs h-8 cursor-pointer"><ImageIcon className="w-3.5 h-3.5" /> {selected?.type === "image" ? "Replace image" : "Logo / image"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <select className="input h-8 text-xs w-48" value="" onChange={e => {
          const token = `{{${e.target.value}}}`;
          if (selected?.type === "text") patch(selected.id, { text: (selected.text ?? "") + token });
          else add("text", { text: token });
        }} aria-label="Insert field">
          <option value="">+ Insert field…</option>
          {PLACEHOLDERS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <span className="text-[11px] text-[#9a9a94] self-center ml-1">Type {"{{anything}}"} for a value you fill in when printing.</span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_260px]">
        <div ref={wrap} className="card p-3 bg-[#e9eae4] overflow-hidden" onPointerDown={e => { if (e.target === e.currentTarget) setSel(null); }}>
          <div style={{ width: page.w * zoom, height: page.h * zoom }} className="mx-auto">
            <div style={{ width: page.w, height: page.h, transform: `scale(${zoom})`, transformOrigin: "top left" }}
              className="relative bg-white shadow-sm" onPointerDown={e => { if (e.target === e.currentTarget) setSel(null); }}>
              {tpl.elements.map(el => (
                <div key={el.id}
                  className={cn("absolute cursor-move select-none", sel === el.id ? "outline outline-2 outline-[#4f7fc8]" : "hover:outline hover:outline-1 hover:outline-[#4f7fc8]/50")}
                  style={{ left: el.x, top: el.y, width: el.w, height: el.h }}
                  onPointerDown={e => { e.stopPropagation(); setSel(el.id); drag.current = { id: el.id, mode: "move", sx: e.clientX, sy: e.clientY, el }; }}>
                  <ElView el={el} />
                  {sel === el.id && (
                    <span className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-[#4f7fc8] rounded-sm cursor-nwse-resize"
                      onPointerDown={e => { e.stopPropagation(); drag.current = { id: el.id, mode: "size", sx: e.clientX, sy: e.clientY, el }; }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-3 space-y-2 self-start">
          {!selected ? <p className="text-xs text-[#9a9a94]">Select a block on the page to edit it. Arrow keys nudge, Delete removes.</p> : (
            <>
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold capitalize flex-1">{selected.type}</span>
                <button type="button" aria-label="Bring forward" className="p-1.5 rounded hover:bg-[#f6f7f2]" onClick={() => layer(selected.id, 1)}><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" aria-label="Send backward" className="p-1.5 rounded hover:bg-[#f6f7f2]" onClick={() => layer(selected.id, -1)}><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" aria-label="Duplicate" className="p-1.5 rounded hover:bg-[#f6f7f2]" onClick={() => duplicate(selected)}><Copy className="w-3.5 h-3.5" /></button>
                <button type="button" aria-label="Delete" className="p-1.5 rounded hover:bg-[#f6f7f2]" onClick={() => remove(selected.id)}><Trash2 className="w-3.5 h-3.5 text-[#c94f40]" /></button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {num("X", "x", selected.x)}{num("Y", "y", selected.y)}{num("W", "w", selected.w, 10)}{num("H", "h", selected.h, 2)}
              </div>
              {selected.type === "text" && (
                <textarea className="input text-xs min-h-[120px] w-full" value={selected.text ?? ""} onChange={e => patch(selected.id, { text: e.target.value })} aria-label="Text" />
              )}
              {selected.type === "table" && (
                <label className="text-[11px] text-[#6b6b67] block">One row per line, cells separated by |
                  <textarea className="input text-xs min-h-[140px] w-full font-mono" value={(selected.rows ?? []).map(r => r.join(" | ")).join("\n")}
                    onChange={e => patch(selected.id, { rows: e.target.value.split("\n").map(l => l.split("|").map(c => c.trim())) })} />
                </label>
              )}
              {(selected.type === "text" || selected.type === "table") && (
                <>
                  {num("Font size", "fontSize", selected.fontSize, 6)}
                  {color("Text colour", "color", selected.color)}
                  <div className="flex gap-1">
                    <button type="button" className={cn("btn-secondary text-xs h-7 px-2", selected.bold && "!bg-[#1c1c1c] !text-white")} onClick={() => patch(selected.id, { bold: !selected.bold })}>B</button>
                    <button type="button" className={cn("btn-secondary text-xs h-7 px-2 italic", selected.italic && "!bg-[#1c1c1c] !text-white")} onClick={() => patch(selected.id, { italic: !selected.italic })}>I</button>
                    {(["left", "center", "right"] as const).map(a => (
                      <button key={a} type="button" className={cn("btn-secondary text-xs h-7 px-2 capitalize", (selected.align ?? "left") === a && "!bg-[#1c1c1c] !text-white")} onClick={() => patch(selected.id, { align: a })}>{a}</button>
                    ))}
                  </div>
                </>
              )}
              {(selected.type === "box" || selected.type === "line" || selected.type === "text") && color(selected.type === "line" ? "Colour" : "Fill", "bg", selected.bg)}
              {(selected.type === "box" || selected.type === "table") && color("Border", "border", selected.border)}
              {selected.type === "box" && <>{num("Border width", "borderWidth", selected.borderWidth)}{num("Corner radius", "radius", selected.radius)}</>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; group?: string; hint?: string; disabled?: boolean };

/**
 * Searchable dropdown with keyboard navigation and an optional
 * "+ Add custom ..." row at the bottom. Options keep the order given, so the
 * caller decides what shows first (e.g. designations of the chosen department).
 */
export function UnitCombobox({
  value, onChange, options, placeholder = "Search or select", addLabel, onAdd, disabled, id, invalid,
}: {
  value: string | null;
  onChange: (value: string, option: ComboOption) => void;
  options: ComboOption[];
  placeholder?: string;
  addLabel?: string;
  onAdd?: (query: string) => void;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find(o => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const exact = filtered.some(o => o.label.toLowerCase() === query.trim().toLowerCase());
  const rows = filtered.length + (onAdd ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => { list.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const pick = (i: number) => {
    if (i === filtered.length && onAdd) { setOpen(false); onAdd(query.trim()); setQuery(""); return; }
    const o = filtered[i];
    if (!o || o.disabled) return;
    onChange(o.value, o);
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setActive(a => Math.min(a + 1, rows - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { if (open) { e.preventDefault(); pick(active); } }
    else if (e.key === "Escape") { setOpen(false); setQuery(""); }
  };

  let lastGroup: string | undefined;
  return (
    <div ref={wrap} className="relative">
      <div className={cn("input flex items-center gap-2 text-xs py-0 pr-2", invalid && "border-rose-300", disabled && "opacity-60")}>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          className="flex-1 bg-transparent outline-none py-2 min-w-0"
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : selected?.label ?? ""}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKey}
          onBlur={() => { setOpen(false); setQuery(""); }}
        />
        <button type="button" tabIndex={-1} disabled={disabled} onClick={() => setOpen(o => !o)} aria-label="Show options" className="text-gray-400">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <ul ref={list} id={listId} role="listbox" className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-[#eceae4] bg-white shadow-xl py-1 text-xs">
          {filtered.length === 0 && <li className="px-3 py-2 text-gray-400">No match.</li>}
          {filtered.map((o, i) => {
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <li key={o.value} role="presentation">
                {header && <div className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-gray-400">{header}</div>}
                <div
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled}
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={e => { e.preventDefault(); pick(i); }}
                  className={cn("px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer",
                    i === active && "bg-[#f7f4ed]", o.disabled && "opacity-40 cursor-not-allowed")}
                >
                  <span className="truncate">{o.label}</span>
                  <span className="shrink-0 flex items-center gap-1 text-[10px] text-gray-400">
                    {o.hint}{o.value === value && <Check className="w-3 h-3 text-emerald-600" />}
                  </span>
                </div>
              </li>
            );
          })}
          {onAdd && (
            <li role="presentation" className="border-t border-[#eceae4] mt-1 pt-1">
              <div
                role="option"
                aria-selected={false}
                data-idx={filtered.length}
                onMouseEnter={() => setActive(filtered.length)}
                onMouseDown={e => { e.preventDefault(); pick(filtered.length); }}
                className={cn("px-3 py-2 flex items-center gap-1.5 font-semibold text-[#1c1c1c] cursor-pointer", active === filtered.length && "bg-[#f7f4ed]")}
              >
                <Plus className="w-3.5 h-3.5" /> {addLabel ?? "Add custom"}{query.trim() && !exact ? `: "${query.trim()}"` : ""}
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

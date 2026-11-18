"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Minus, Plus, Search, X } from "lucide-react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = { id: string; lat: number; lng: number; kind: "on_site" | "done" | "issue" | "other"; label: string; sub?: string };
export type LivePoint = { id: string; lat: number; lng: number; initial: string; label: string; sub: string; fresh: boolean };
export type MePoint = { lat: number; lng: number; accuracy: number };
type Place = { name: string; lat: number; lng: number };

/**
 * Real map (OpenStreetMap tiles through Leaflet) in the app's theme: visit
 * pins, the chosen rep's route, live team positions and "you are here".
 * Leaflet touches `window`, so it is imported inside the effect.
 */
export function FieldMap({ points, live, me, trailLine, selectedId, selectedLive, onSelect, onSelectLive, fitToken, className }: {
  points: MapPoint[];
  live: LivePoint[];
  me: MePoint | null;
  trailLine: [number, number][];
  selectedId: string | null;
  selectedLive?: string | null;
  onSelect: (id: string) => void;
  onSelectLive?: (userId: string) => void;
  /** Change it to fit the map to everything shown. */
  fitToken: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const cb = useRef({ onSelect, onSelectLive });
  cb.current = { onSelect, onSelectLive };
  const lastFit = useRef<string>("");
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    let dead = false;
    import("leaflet").then(mod => {
      if (dead || !box.current || map.current) return;
      L.current = mod;
      const m = mod.map(box.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([20.6, 78.9], 5);
      mod.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, subdomains: "abc", className: "field-tiles",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(m);
      // Scroll zooms only after the map is clicked, so the page still scrolls past it.
      m.on("click", () => m.scrollWheelZoom.enable());
      m.on("mouseout", () => m.scrollWheelZoom.disable());
      map.current = m;
      layer.current = mod.layerGroup().addTo(m);
      draw();
      fit(true);
    });
    // Keep tiles filling the box when it changes size (expand, sidebar, rotate).
    const ro = new ResizeObserver(() => map.current?.invalidateSize());
    if (box.current) ro.observe(box.current);
    return () => { dead = true; ro.disconnect(); map.current?.remove(); map.current = null; layer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once; draw() below follows the props
  }, []);

  function all(): [number, number][] {
    return [...points.map(p => [p.lat, p.lng] as [number, number]), ...live.map(p => [p.lat, p.lng] as [number, number]), ...(me ? [[me.lat, me.lng] as [number, number]] : [])];
  }

  function fit(force = false) {
    const mod = L.current, m = map.current;
    if (!mod || !m) return;
    const pts = all();
    const key = `${fitToken}|${pts.length}`;
    if (!force && key === lastFit.current) return;
    lastFit.current = key;
    if (pts.length === 1) m.setView(pts[0], 15);
    else if (pts.length > 1) m.fitBounds(mod.latLngBounds(pts), { padding: [60, 60], maxZoom: 15 });
  }

  function draw() {
    const mod = L.current, m = map.current, g = layer.current;
    if (!mod || !m || !g) return;
    g.clearLayers();
    if (trailLine.length > 1) {
      mod.polyline(trailLine, { color: "#1c1c1c", weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(g);
      mod.polyline(trailLine, { className: "field-route-dash", color: "#c3e33a", weight: 2, opacity: 1, dashArray: "1 8", lineCap: "round" }).addTo(g);
      trailLine.forEach((pt, i) => mod.marker(pt, {
        icon: mod.divIcon({ className: "", html: `<span class="field-step">${i + 1}</span>`, iconSize: [18, 18], iconAnchor: [9, 26] }),
        interactive: false, zIndexOffset: 500,
      }).addTo(g));
    }
    if (place) {
      mod.marker([place.lat, place.lng], { icon: mod.divIcon({ className: "", html: '<span class="field-place"></span>', iconSize: [22, 30], iconAnchor: [11, 30] }), title: place.name, zIndexOffset: 2500 })
        .addTo(g).bindTooltip(esc(place.name), { direction: "top", offset: [0, -30], className: "field-tip" });
    }
    if (me) {
      mod.circle([me.lat, me.lng], { radius: Math.min(me.accuracy, 2000), className: "field-me-acc", color: "#1c1c1c", weight: 1, fillColor: "#c3e33a", fillOpacity: 0.18 }).addTo(g);
      mod.marker([me.lat, me.lng], { icon: mod.divIcon({ className: "", html: '<span class="field-me"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), title: "You are here", zIndexOffset: 2000 }).addTo(g);
    }
    for (const p of points) {
      const sel = p.id === selectedId;
      const icon = mod.divIcon({ className: "", html: `<span class="field-pin field-pin--${p.kind}${sel ? " field-pin--sel" : ""}"></span>`, iconSize: [24, 24], iconAnchor: [12, 12] });
      const mk = mod.marker([p.lat, p.lng], { icon, title: p.label, zIndexOffset: sel ? 1000 : 0, keyboard: true }).addTo(g);
      mk.on("click", () => cb.current.onSelect(p.id));
      if (sel) mk.bindTooltip(`<b>${esc(p.label)}</b>${p.sub ? `<br/><span>${esc(p.sub)}</span>` : ""}`, { permanent: true, direction: "top", offset: [0, -14], className: "field-tip" }).openTooltip();
    }
    for (const p of live) {
      const sel = p.id === selectedLive;
      const icon = mod.divIcon({ className: "", html: `<span class="field-live${p.fresh ? "" : " field-live--stale"}${sel ? " field-live--sel" : ""}">${esc(p.initial)}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      const mk = mod.marker([p.lat, p.lng], { icon, title: p.label, zIndexOffset: 1500, keyboard: true }).addTo(g);
      mk.on("click", () => cb.current.onSelectLive?.(p.id));
      mk.bindTooltip(`<b>${esc(p.label)}</b><br/><span>${esc(p.sub)}</span>`, { direction: "top", offset: [0, -18], className: "field-tip", permanent: sel });
    }
  }

  useEffect(() => { draw(); fit(); }); // every render: cheap for a few hundred pins

  useEffect(() => {
    const p = points.find(x => x.id === selectedId) || live.find(x => x.id === selectedLive);
    if (p && map.current) map.current.panTo([p.lat, p.lng], { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedLive]);

  useEffect(() => { if (me && map.current) map.current.setView([me.lat, me.lng], Math.max(map.current.getZoom(), 15), { animate: true }); }, [me?.lat, me?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fit(true); }, [fitToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoom = (d: number) => map.current?.setZoom(map.current.getZoom() + d);
  const go = (p: Place) => { setPlace(p); map.current?.setView([p.lat, p.lng], 16, { animate: true }); };

  return (
    <div className={className}>
      <div ref={box} className="absolute inset-0" role="application" aria-label="Map of visit check-ins and live team locations" />
      <PlaceSearch onPick={go} onClear={() => setPlace(null)} hasPlace={!!place} />
      <div className="absolute z-[1000] right-3 bottom-9 flex flex-col rounded-xl bg-white/95 border border-[#ebece6] shadow-sm overflow-hidden">
        <button type="button" onClick={() => zoom(1)} aria-label="Zoom in" title="Zoom in" className="w-9 h-9 grid place-items-center text-[#1c1c1c] hover:bg-[var(--accent)]"><Plus className="w-4 h-4" /></button>
        <span className="h-px bg-[#ebece6]" />
        <button type="button" onClick={() => zoom(-1)} aria-label="Zoom out" title="Zoom out" className="w-9 h-9 grid place-items-center text-[#1c1c1c] hover:bg-[var(--accent)]"><Minus className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

/**
 * Find a place by name (OpenStreetMap Nominatim, free). Searches only when
 * the user presses Enter or the button, to stay inside its one-request-a-second rule.
 */
function PlaceSearch({ onPick, onClear, hasPlace }: { onPick: (p: Place) => void; onClear: () => void; hasPlace: boolean }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Place[] | null>(null);
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=${encodeURIComponent(term)}`);
      const rows = r.ok ? ((await r.json()) as { display_name: string; lat: string; lon: string }[]) : [];
      setResults(rows.map(x => ({ name: x.display_name, lat: Number(x.lat), lng: Number(x.lon) })).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng)));
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="absolute z-[1000] top-14 right-14 w-[min(260px,calc(100%-14rem))] min-w-[150px]">
      <form onSubmit={search} role="search" className="flex items-center rounded-xl bg-white/95 border border-[#ebece6] shadow-sm focus-within:border-[#1c1c1c]">
        <Search className="w-3.5 h-3.5 ml-2.5 text-[#9a9a94] shrink-0" />
        <input value={q} onChange={e => { setQ(e.target.value); if (!e.target.value) { setResults(null); onClear(); } }}
          placeholder="Search a place" aria-label="Search a place on the map"
          className="flex-1 min-w-0 bg-transparent px-2 py-2 text-xs outline-none" />
        {busy ? <Loader2 className="w-3.5 h-3.5 mr-2.5 animate-spin text-[#9a9a94]" />
          : (q || hasPlace) && <button type="button" aria-label="Clear search" onClick={() => { setQ(""); setResults(null); onClear(); }} className="mr-2 text-[#9a9a94] hover:text-[#1c1c1c]"><X className="w-3.5 h-3.5" /></button>}
      </form>
      {results && (
        <ul className="mt-1 rounded-xl bg-white border border-[#ebece6] shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {results.length === 0 && <li className="px-3 py-2 text-[11px] text-[#9a9a94]">No place found.</li>}
          {results.map(r => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" onClick={() => { onPick(r); setResults(null); setQ(r.name.split(",")[0]); }}
                className="w-full text-left px-3 py-2 text-[11px] text-[#1c1c1c] hover:bg-[#f6f7f2] flex gap-2">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#6b6b67]" /><span className="line-clamp-2">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

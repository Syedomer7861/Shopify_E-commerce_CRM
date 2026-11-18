"use client";
import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = { id: string; lat: number; lng: number; kind: "on_site" | "done" | "issue" | "other"; label: string; sub?: string };
export type LivePoint = { id: string; lat: number; lng: number; initial: string; label: string; sub: string; fresh: boolean };
export type MePoint = { lat: number; lng: number; accuracy: number };

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
    return () => { dead = true; map.current?.remove(); map.current = null; layer.current = null; };
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

  return <div ref={box} className={className} role="application" aria-label="Map of visit check-ins and live team locations" />;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

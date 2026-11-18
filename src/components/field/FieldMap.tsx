"use client";
import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = { id: string; lat: number; lng: number; kind: "on_site" | "done" | "issue" | "other"; label: string; sub?: string };

/**
 * Real map (OpenStreetMap tiles through Leaflet) of check-in locations.
 * Leaflet touches `window`, so it is imported inside the effect; the page
 * renders on the server without it.
 */
export function FieldMap({ points, trailLine, selectedId, onSelect, className }: {
  points: MapPoint[];
  trailLine: [number, number][];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const fitKey = points.map(p => p.id).join();
  const lastFit = useRef("");

  useEffect(() => {
    let dead = false;
    import("leaflet").then(mod => {
      if (dead || !box.current || map.current) return;
      L.current = mod;
      const m = mod.map(box.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([20.6, 78.9], 5);
      mod.control.zoom({ position: "bottomright" }).addTo(m);
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
    });
    return () => { dead = true; map.current?.remove(); map.current = null; layer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once; draw() below follows the props
  }, []);

  function draw() {
    const mod = L.current, m = map.current, g = layer.current;
    if (!mod || !m || !g) return;
    g.clearLayers();
    if (trailLine.length > 1) mod.polyline(trailLine, { color: "#1c1c1c", weight: 3, opacity: 0.85 }).addTo(g);
    for (const p of points) {
      const sel = p.id === selectedId;
      const icon = mod.divIcon({
        className: "",
        html: `<span class="field-pin field-pin--${p.kind}${sel ? " field-pin--sel" : ""}"></span>`,
        iconSize: [22, 22], iconAnchor: [11, 11],
      });
      const mk = mod.marker([p.lat, p.lng], { icon, title: p.label, zIndexOffset: sel ? 1000 : 0, keyboard: true }).addTo(g);
      mk.on("click", () => select.current(p.id));
      if (sel) mk.bindTooltip(`<b>${esc(p.label)}</b>${p.sub ? `<br/><span>${esc(p.sub)}</span>` : ""}`, { permanent: true, direction: "top", offset: [0, -12], className: "field-tip" }).openTooltip();
    }
    if (fitKey !== lastFit.current && points.length) {
      lastFit.current = fitKey;
      if (points.length === 1) m.setView([points[0].lat, points[0].lng], 14);
      else m.fitBounds(mod.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 15 });
    }
  }

  useEffect(draw); // every render: cheap for a few hundred pins

  useEffect(() => {
    const p = points.find(x => x.id === selectedId);
    if (p && map.current) map.current.panTo([p.lat, p.lng], { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={box} className={className} role="application" aria-label="Map of visit check-ins" />;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

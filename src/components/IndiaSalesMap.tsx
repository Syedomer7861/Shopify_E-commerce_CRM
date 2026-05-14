"use client";
import { useState, useEffect, useRef, useCallback } from "react";
// @ts-ignore — @svg-maps/india ships valid CJS with .default
import indiaMap from "@svg-maps/india";
import { ChevronDown, HelpCircle, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";

// ---------------------------------------------------------------------------
// Pull real SVG paths + viewBox from the npm package (no network call)
// ---------------------------------------------------------------------------
const mapData = (indiaMap as any).default ?? indiaMap;
const VIEWBOX: string = mapData.viewBox; // "0 0 612 696"
const INDIA_LOCATIONS: { name: string; id: string; path: string }[] =
  mapData.locations ?? [];

// State name aliases — CRM records may use different spellings
const ALIASES: Record<string, string[]> = {
  "Jammu and Kashmir": ["Jammu & Kashmir", "J&K"],
  "Dadra and Nagar Haveli": ["Dadra and Nagar Haveli and Daman and Diu", "DNH"],
  "Daman and Diu": ["Daman & Diu"],
  "Andaman and Nicobar Islands": ["Andaman & Nicobar Islands"],
};

const METRICS = [
  { value: "orders",  label: "Orders"  },
  { value: "revenue", label: "Revenue" },
  { value: "rto",     label: "RTO"     },
];

const DAY_PRESETS = [
  { value: 7,   label: "Last 7 days"  },
  { value: 30,  label: "Last 30 days" },
  { value: 90,  label: "Last 90 days" },
  { value: 0,   label: "All time"     },
];

interface StateData {
  name: string;
  orders: number;
  revenue: number;
  rto: number;
  orderPercentage: number;
  revenuePercentage: number;
  rtoRate: number;
}

interface Tooltip { x: number; y: number; name: string; }

// ---------------------------------------------------------------------------
// Smooth linear colour interpolation between stops
// ---------------------------------------------------------------------------
function lerp(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + t * (b[i] - v)));
}
function scaleColor(t: number, stops: number[][]): string {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (stops.length - 1);
  const lo = stops[Math.floor(idx)];
  const hi = stops[Math.min(Math.ceil(idx), stops.length - 1)];
  const [r, g, b] = lerp(lo, hi, idx - Math.floor(idx));
  return `rgb(${r},${g},${b})`;
}

const SCALE_ORDERS  = [[237,233,254],[196,181,253],[139,92,246],[109,40,217],[76,29,149]];
const SCALE_REVENUE = [[240,253,244],[134,239,172],[34,197,94],[21,128,61],[5,46,22]];
const SCALE_RTO     = [[254,242,242],[252,165,165],[239,68,68],[185,28,28],[127,29,29]];

const GRADIENTS: Record<string, string> = {
  orders:  "linear-gradient(to right,#ede9fe,#c4b5fd,#8b5cf6,#6d28d9,#4c1d95)",
  revenue: "linear-gradient(to right,#f0fdf4,#86efac,#22c55e,#15803d,#052e16)",
  rto:     "linear-gradient(to right,#fef2f2,#fca5a5,#ef4444,#b91c1c,#7f1d1d)",
};

export default function IndiaSalesMap() {
  const [data, setData]           = useState<StateData[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [metric, setMetric]       = useState<"orders"|"revenue"|"rto">("orders");
  const [days, setDays]           = useState(30);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [daysOpen, setDaysOpen]   = useState(false);
  const [tooltip, setTooltip]     = useState<Tooltip | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const dropdownRef   = useRef<HTMLDivElement>(null);
  const daysRef       = useRef<HTMLDivElement>(null);
  const supabase      = createClient();

  // ── Fetch from API ────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setTimeout(() => {
        setData([
          { name: "Maharashtra", orders: 450, revenue: 1250000, rto: 12, orderPercentage: 22, revenuePercentage: 25, rtoRate: 2.6 },
          { name: "Karnataka", orders: 380, revenue: 980000, rto: 8, orderPercentage: 18, revenuePercentage: 19, rtoRate: 2.1 },
          { name: "Delhi", orders: 320, revenue: 850000, rto: 15, orderPercentage: 15, revenuePercentage: 16, rtoRate: 4.6 },
          { name: "Tamil Nadu", orders: 280, revenue: 720000, rto: 5, orderPercentage: 12, revenuePercentage: 13, rtoRate: 1.7 },
          { name: "Gujarat", orders: 250, revenue: 650000, rto: 9, orderPercentage: 10, revenuePercentage: 11, rtoRate: 3.6 },
          { name: "Uttar Pradesh", orders: 210, revenue: 420000, rto: 25, orderPercentage: 8, revenuePercentage: 7, rtoRate: 11.9 }
        ]);
        setLastUpdated(new Date());
        setLoading(false);
        setRefreshing(false);
      }, 800);
      return;
    }

    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/analytics/geospatial?days=${days}`);
      const json = await res.json();
      setData(json.states ?? []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[IndiaSalesMap] fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  // Initial load + refetch when days changes
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Supabase real-time subscription ──────────────────────────────────────
  // Listens to INSERT/UPDATE on the orders table and silently refetches
  useEffect(() => {
    const channelId = `india-map-orders-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => { fetchData(true); }
      )
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [fetchData, supabase]);

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
      if (daysRef.current && !daysRef.current.contains(e.target as Node)) setDaysOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getStateData = (locName: string): StateData | undefined => {
    const direct = data.find((s) => s.name.toLowerCase() === locName.toLowerCase());
    if (direct) return direct;
    for (const alias of (ALIASES[locName] ?? [])) {
      const found = data.find((s) => s.name.toLowerCase() === alias.toLowerCase());
      if (found) return found;
    }
    return undefined;
  };

  const maxVal = (): number => {
    if (!data.length) return 1;
    if (metric === "orders")  return Math.max(...data.map((d) => d.orders),  1);
    if (metric === "revenue") return Math.max(...data.map((d) => d.revenue), 1);
    return Math.max(...data.map((d) => d.rto), 1);
  };

  const getFill = (locName: string): string => {
    const sd = getStateData(locName);
    if (!sd) return "#ede9fe";
    const max = maxVal();
    const val = metric === "orders" ? sd.orders : metric === "revenue" ? sd.revenue : sd.rto;
    const t = max > 0 ? val / max : 0;
    const stops = metric === "orders" ? SCALE_ORDERS : metric === "revenue" ? SCALE_REVENUE : SCALE_RTO;
    return scaleColor(t, stops);
  };

  const selectedMetricLabel = METRICS.find((m) => m.value === metric)?.label ?? "Orders";
  const selectedDayLabel    = DAY_PRESETS.find((d) => d.value === days)?.label ?? "Last 30 days";
  const legendMax   = Math.ceil(maxVal() / 50) * 50 || 200;
  const legendSteps = [0, 0.25, 0.5, 0.75, 1].map((f) => f * legendMax);
  const tooltipData = tooltip ? getStateData(tooltip.name) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-[#f7f4ed] rounded-3xl border border-[#eceae4] shadow-sm flex items-center justify-center h-[500px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#eceae4] border-t-[#1c1c1c] rounded-full animate-spin" />
          <span className="text-[10px] text-[#5f5f5d] font-black uppercase tracking-widest">Calibrating Geospatial Data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f7f4ed] rounded-[32px] border border-[#eceae4] shadow-sm overflow-visible">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-wrap gap-4">

        {/* Left: metric + day dropdowns */}
        <div className="flex items-center gap-3">
          {/* Metric */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#eceae4] bg-[#f7f4ed] hover:bg-[#eceae4] transition-all text-[11px] font-black text-[#1c1c1c] uppercase tracking-wider shadow-sm"
            >
              {selectedMetricLabel}
              <ChevronDown className={`w-4 h-4 text-[#1c1c1c]/40 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {dropdownOpen && (
              <div className="absolute top-[calc(100%+8px)] left-0 z-50 bg-[#f7f4ed] border border-[#eceae4] rounded-2xl shadow-2xl py-2 min-w-[160px] animate-in fade-in zoom-in-95 duration-200">
                {METRICS.map((m) => (
                  <button key={m.value} onClick={() => { setMetric(m.value as any); setDropdownOpen(false); }}
                    className={`w-full text-left px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors ${metric === m.value ? "bg-[#1c1c1c] text-[#f7f4ed]" : "text-[#1c1c1c] hover:bg-[#eceae4]"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Day range */}
          <div className="relative" ref={daysRef}>
            <button
              onClick={() => setDaysOpen((o) => !o)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#eceae4] bg-[#f7f4ed] hover:bg-[#eceae4] transition-all text-[11px] font-black text-[#5f5f5d]/60 uppercase tracking-wider shadow-sm"
            >
              {selectedDayLabel}
              <ChevronDown className={`w-4 h-4 text-[#1c1c1c]/40 transition-transform duration-200 ${daysOpen ? "rotate-180" : ""}`} />
            </button>
            {daysOpen && (
              <div className="absolute top-[calc(100%+8px)] left-0 z-50 bg-[#f7f4ed] border border-[#eceae4] rounded-2xl shadow-2xl py-2 min-w-[180px] animate-in fade-in zoom-in-95 duration-200">
                {DAY_PRESETS.map((d) => (
                  <button key={d.value} onClick={() => { setDays(d.value); setDaysOpen(false); }}
                    className={`w-full text-left px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors ${days === d.value ? "bg-[#1c1c1c] text-[#f7f4ed]" : "text-[#1c1c1c] hover:bg-[#eceae4]"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: live badge + last updated + refresh + help */}
        <div className="flex items-center gap-4">
          {/* Live indicator */}
          <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Live Feed</span>
          </div>

          {/* Last updated */}
          {lastUpdated && (
            <span className="text-[10px] text-[#5f5f5d]/40 font-black uppercase tracking-tight hidden sm:block">
              SYNCED {formatDistanceToNow(lastUpdated, { addSuffix: true }).toUpperCase()}
            </span>
          )}

          {/* Manual refresh */}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-2 rounded-xl hover:bg-[#eceae4] transition-all disabled:opacity-40 border border-transparent hover:border-[#eceae4]"
            title="Refresh Intelligence"
          >
            <RefreshCw className={`w-4 h-4 text-[#1c1c1c]/40 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          <HelpCircle className="w-4 h-4 text-[#1c1c1c]/20 cursor-pointer hover:text-[#1c1c1c] transition-colors" />
        </div>
      </div>

      {/* ── SVG Map ── */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        onMouseLeave={() => setTooltip(null)}
      >
        <svg
          viewBox={VIEWBOX}
          className="w-full"
          style={{ height: 460, display: "block" }}
          aria-label="India sales map"
        >
          {INDIA_LOCATIONS.map((loc) => {
            const fill = getFill(loc.name);
            const isHovered = hoveredId === loc.id;
            return (
              <path
                key={loc.id}
                d={loc.path}
                fill={fill}
                stroke="#eceae4"
                strokeWidth={isHovered ? 1.5 : 0.8}
                strokeLinejoin="round"
                style={{
                  cursor: "pointer",
                  filter: isHovered ? "brightness(0.9)" : "none",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                onMouseEnter={(e) => {
                  setHoveredId(loc.id);
                  if (!containerRef.current) return;
                  const rect = containerRef.current.getBoundingClientRect();
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, name: loc.name });
                }}
                onMouseMove={(e) => {
                  if (!containerRef.current) return;
                  const rect = containerRef.current.getBoundingClientRect();
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, name: loc.name });
                }}
                onMouseLeave={() => { setHoveredId(null); setTooltip(null); }}
              />
            );
          })}
        </svg>

        {/* Subtle refresh overlay */}
        {refreshing && (
          <div className="absolute top-4 right-4 bg-[#f7f4ed]/90 backdrop-blur-md rounded-2xl px-4 py-2 flex items-center gap-3 shadow-xl border border-[#eceae4] animate-in fade-in slide-in-from-top-4">
            <RefreshCw className="w-4 h-4 text-[#1c1c1c] animate-spin" />
            <span className="text-[10px] text-[#1c1c1c] font-black uppercase tracking-widest">Syncing Pipeline...</span>
          </div>
        )}

        {/* Floating Tooltip */}
        {tooltip && tooltipData && (
          <div
            className="pointer-events-none absolute z-50 animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: Math.min(tooltip.x + 18, (containerRef.current?.offsetWidth ?? 400) - 210),
              top: Math.max(tooltip.y - 120, 10),
            }}
          >
            <div className="bg-[#1c1c1c] border border-[#1c1c1c] rounded-2xl shadow-2xl px-5 py-4 min-w-[200px]">
              <p className="text-[11px] font-black text-[#f7f4ed] uppercase tracking-widest mb-3 border-b border-white/10 pb-2">
                {tooltip.name}
              </p>
              <div className="space-y-2">
                <div className="flex justify-between gap-6 uppercase font-black">
                  <span className="text-[9px] text-white/40">Total Orders</span>
                  <span className="text-[11px] text-blue-400 tabular-nums">{tooltipData.orders}</span>
                </div>
                <div className="flex justify-between gap-6 uppercase font-black">
                  <span className="text-[9px] text-white/40">Gross Revenue</span>
                  <span className="text-[11px] text-emerald-400 tabular-nums">₹{tooltipData.revenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-6 uppercase font-black">
                  <span className="text-[9px] text-white/40">Market Share</span>
                  <span className="text-[11px] text-[#f7f4ed] tabular-nums">{tooltipData.orderPercentage.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between gap-6 pt-2 border-t border-white/5 mt-1 uppercase font-black">
                  <span className="text-[9px] text-rose-400">RTO Risk</span>
                  <span className="text-[11px] text-rose-400 tabular-nums">{tooltipData.rtoRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="px-10 pb-8 pt-4">
        <div className="h-3 w-full rounded-full shadow-inner" style={{ background: GRADIENTS[metric] }} />
        <div className="flex justify-between mt-3">
          {legendSteps.map((v, i) => (
            <span key={i} className="text-[10px] text-[#5f5f5d]/40 font-black uppercase tracking-tighter tabular-nums">
              {metric === "revenue" && v >= 1000 ? `₹${Math.round(v / 1000)}K` : Math.round(v)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

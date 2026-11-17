"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dashboard tiles (lime / ink theme): white rounded cards with a tinted icon
 * chip, a big number, an optional ring gauge and a corner arrow when the tile
 * opens a page. The hero variant is the dark card with a lime glow.
 */
export const TONES = {
  lime: { chip: "bg-[#e6f5a6] text-[#1c1c1c]", ring: "#c3e33a" },
  coral: { chip: "bg-[#fde3df] text-[#d6503f]", ring: "#ef8a7c" },
  mint: { chip: "bg-[#dcf2e7] text-[#1f7a55]", ring: "#55c08f" },
  amber: { chip: "bg-[#fdf0d2] text-[#b7791f]", ring: "#f0b43c" },
  ink: { chip: "bg-[#ecece8] text-[#1c1c1c]", ring: "#1c1c1c" },
} as const;
export type Tone = keyof typeof TONES;

export function Ring({ pct, tone = "lime", label, size = 64 }: { pct: number; tone?: Tone; label: string; size?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eeeee9" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={TONES[tone].ring} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} className="transition-[stroke-dashoffset] duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[13px] font-bold text-[#1c1c1c]">{p}%</span>
        <span className="text-[8px] text-[#8a8a86] mt-0.5">{label}</span>
      </div>
    </div>
  );
}

type TileProps = {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string;
  tone?: Tone; ring?: { pct: number; label: string; tone?: Tone } | null; className?: string;
  /** Small trend line from real history (oldest first). */
  spark?: number[] | null;
  /** Short change label, e.g. "+2 this month"; tone follows direction. */
  trend?: { text: string; dir: "up" | "down" | "flat" } | null;
};

/** Area sparkline in the tile's tone; flat when every point is equal. */
export function Spark({ data, tone = "lime" }: { data: number[]; tone?: Tone }) {
  const w = 96, h = 40, max = Math.max(...data), min = Math.min(...data), span = max - min || 1;
  const pts = data.map((v, i) => [(i / Math.max(data.length - 1, 1)) * w, h - 4 - ((v - min) / span) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `sp-${tone}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-24 h-10 flex-shrink-0" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={TONES[tone].ring} stopOpacity="0.35" /><stop offset="1" stopColor={TONES[tone].ring} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="#1c1c1c" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
const TREND = { up: "bg-[#e6f5a6] text-[#3d5208]", down: "bg-[#fde3df] text-[#b5402f]", flat: "bg-[#efefea] text-[#6b6b67]" };

function Shell({ href, className, children }: { href?: string; className: string; children: React.ReactNode }) {
  return href ? <Link href={href} className={cn(className, "group")}>{children}</Link> : <div className={className}>{children}</div>;
}

export function Tile({ icon, label, value, sub, href, tone = "lime", ring, className, spark, trend }: TileProps) {
  return (
    <Shell href={href} className={cn("block bg-white rounded-[20px] p-4 sm:p-5 shadow-[0_1px_2px_rgba(16,24,16,0.04)] border border-[#ebece6] transition-all hover:shadow-md hover:-translate-y-0.5", className)}>
      <div className="flex items-center gap-2 sm:gap-2.5">
        <span className={cn("w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0", TONES[tone].chip)}>{icon}</span>
        <span className="text-[12px] sm:text-[13px] leading-tight font-semibold text-[#1c1c1c] flex-1 min-w-0 line-clamp-2 break-words">{label}</span>
        {href && <span className="w-7 h-7 rounded-full border border-[#ebece6] flex items-center justify-center text-[#5f5f5d] group-hover:bg-[#1c1c1c] group-hover:text-white transition-colors"><ArrowUpRight className="w-3.5 h-3.5" /></span>}
      </div>
      <div className="flex items-end justify-between gap-3 mt-4">
        <div className="min-w-0">
          <div className="text-[22px] sm:text-[28px] leading-none font-bold tracking-tight text-[#1c1c1c] tabular-nums break-words">{value}</div>
          <div className="flex items-center gap-1.5 mt-2 min-w-0">
            {trend && <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap", TREND[trend.dir])}>{trend.text}</span>}
            {sub && <span className="text-xs text-[#6b6b67] truncate">{sub}</span>}
          </div>
        </div>
        {ring ? <Ring pct={ring.pct} label={ring.label} tone={ring.tone ?? tone} /> : spark && spark.length > 1 ? <Spark data={spark} tone={tone} /> : null}
      </div>
    </Shell>
  );
}

export function HeroTile({ icon, label, value, chip, sub, href, className }: { icon: React.ReactNode; label: string; value: React.ReactNode; chip?: React.ReactNode; sub?: React.ReactNode; href?: string; className?: string }) {
  return (
    <Shell href={href} className={cn("relative block overflow-hidden rounded-[20px] p-5 bg-[#151515] text-white shadow-lg transition-transform hover:-translate-y-0.5", className)}>
      <div aria-hidden className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-[#c3e33a]/20 blur-3xl" />
      <div className="relative flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-full bg-[#d6ef6a] text-[#151515] flex items-center justify-center flex-shrink-0">{icon}</span>
        <span className="text-[13px] font-semibold flex-1 truncate">{label}</span>
        {href && <span className="w-7 h-7 rounded-full border border-white/15 flex items-center justify-center text-white/70 group-hover:bg-white group-hover:text-[#151515] transition-colors"><ArrowUpRight className="w-3.5 h-3.5" /></span>}
      </div>
      <div className="relative mt-4 text-[32px] leading-none font-bold tracking-tight tabular-nums">{value}</div>
      {(chip || sub) && (
        <div className="relative mt-3 flex items-center gap-2 text-xs text-white/60">
          {chip && <span className="px-2 py-0.5 rounded-md bg-[#d6ef6a] text-[#151515] font-bold text-[11px]">{chip}</span>}
          {sub}
        </div>
      )}
    </Shell>
  );
}

/** White panel used by dashboard sections (same look as the tiles). */
export const PANEL = "bg-white rounded-[20px] border border-[#ebece6] shadow-[0_1px_2px_rgba(16,24,16,0.04)] p-5";

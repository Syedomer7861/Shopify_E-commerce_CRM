"use client";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

// Split from ui.tsx: the chart library is large and ui.tsx is imported by
// every signed-in page, so it is loaded only where a StatCard draws a trend.
export default function Sparkline({ data, isGradient, accent }: { data: { value: number }[]; isGradient?: boolean; accent?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <Area
          type="monotone"
          dataKey="value"
          stroke={isGradient ? "rgba(255,255,255,0.4)" : accent || "#1c1c1c"}
          fill={isGradient ? "url(#colorWhite)" : "url(#colorAccent)"}
          strokeWidth={2}
          dot={false}
        />
        <defs>
          <linearGradient id="colorAccent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={accent || "#1c1c1c"} stopOpacity={0.1}/>
            <stop offset="95%" stopColor={accent || "#1c1c1c"} stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorWhite" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ffffff" stopOpacity={0.2}/>
            <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
          </linearGradient>
        </defs>
      </AreaChart>
    </ResponsiveContainer>
  );
}

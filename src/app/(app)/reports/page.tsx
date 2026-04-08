"use client";
import { useState, useEffect } from "react";
import { Download, TrendingUp, TrendingDown, Loader2, ShoppingBag, BarChart3, ClipboardCheck, Users, Info } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase";
import { cn, formatCurrency } from "@/lib/utils";
import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";
import toast from "react-hot-toast";

function BarRow({ label, value, max, color = "bg-forest", suffix = "" }: { label: string; value: number; max: number; color?: string; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-32 text-[10px] text-gray-500 text-right flex-shrink-0 truncate">{label}</div>
      <div className="flex-1 h-4 bg-gray-100 rounded-md overflow-hidden">
        <div className={cn("h-full rounded-md transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-20 text-[10px] font-bold text-forest text-right flex-shrink-0">{Math.round(value).toLocaleString()}{suffix}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">{children}</h2>;
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "customers" | "rto" | "recovery">("overview");
  const [loading, setLoading] = useState(true);
  const [exportingMaster, setExportingMaster] = useState(false);
  const [stats, setStats] = useState({
    totalCalls: 0,
    totalRevenue: 0,
    reorderRate: 0,
    rtoRate: 0,
    deliveryBreakdown: [] as { label: string; value: number; color: string }[],
    segmentStats: [] as any[],
    rtoOrders: [] as any[],
    taskBreakdown: [] as { label: string; value: number; color: string }[],
    agentPerformance: [] as { name: string; count: number; revenue: number }[],
    dailyTrends: [] as { date: string; count: number }[],
    topProducts: [] as { name: string; count: number }[],
    rawCallsLogs: [] as any[],
    rawOrdersLogs: [] as any[],
    abandonedStats: { count: 0, potential: 0, recovered: 0, rate: 0 },
    rawAbandonedData: [] as any[]
  });

  const supabase = createClient();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const now = new Date();
      const start = startOfMonth(now).toISOString();
      const end = endOfMonth(now).toISOString();

      // 1. Raw Call Logs with Customer and Task Metadata
      const { data: callsData, count: callsCount } = await supabase
        .from("call_logs")
        .select("*, customer:customers(*), task:tasks(*, order:orders(*))", { count: "exact" })
        .gte("called_at", start)
        .lte("called_at", end)
        .order("called_at", { ascending: false });

      // 2. Total Revenue (delivered orders this month)
      const { data: revenueData } = await supabase
        .from("orders")
        .select("*, customer:customers(*)")
        .eq("delivery_status", "delivered")
        .gte("ordered_at", start)
        .lte("ordered_at", end)
        .order("ordered_at", { ascending: false });
      const revenue = revenueData?.reduce((s, o) => s + (Number(o.total_price) || 0), 0) || 0;

      // 3. RTO Rate
      const { count: totalOrders } = await supabase.from("orders").select("*", { count: "exact", head: true });
      const { count: rtoOrdersCount } = await supabase.from("orders").select("*", { count: "exact", head: true }).eq("delivery_status", "rto");
      const rtoRate = totalOrders ? Math.round((Number(rtoOrdersCount) / Number(totalOrders)) * 100) : 0;

      // 4. Delivery Status Breakdown
      const { data: deliveryData } = await supabase.from("orders").select("delivery_status");
      const breakdown = [
        { label: "Delivered", color: "bg-emerald-500", key: "delivered" },
        { label: "In Transit", color: "bg-blue-500", key: "in_transit" },
        { label: "RTO", color: "bg-rose-500", key: "rto" },
        { label: "Pending", color: "bg-gray-300", key: "pending" },
      ].map(b => ({
        label: b.label,
        value: deliveryData?.filter(o => o.delivery_status === b.key).length || 0,
        color: b.color
      }));

      // 5. Segment Stats
      const { data: segmentData } = await supabase.from("v_segment_summary").select("*");
      const repeatCount = segmentData?.find(s => s.segment === "repeat")?.count || 0;
      const totalCustCount = segmentData?.reduce((s, row) => s + row.count, 0) || 0;
      const reorderRateValue = totalCustCount ? Math.round((Number(repeatCount) / Number(totalCustCount)) * 100) : 0;

      // 6. Detailed Task Outcome Breakdown
      const taskOutcomes = [
        { label: "Completed", key: "done", color: "bg-emerald-500" },
        { label: "No Answer", key: "no_answer", color: "bg-rose-500" },
        { label: "Rescheduled", key: "rescheduled", color: "bg-blue-500" },
      ].map(o => ({
        label: o.label,
        value: callsData?.filter(c => c.outcome === o.key).length || 0,
        color: o.color
      }));

      // 7. Agent Rankings (Revenue Attribution)
      const agents: Record<string, { count: number; revenue: number }> = {};
      callsData?.forEach(c => {
        const name = c.agent_name || "Unknown";
        if (!agents[name]) agents[name] = { count: 0, revenue: 0 };
        agents[name].count++;
        if (c.outcome === "done" && c.task?.order) {
            agents[name].revenue += Number(c.task.order.total_price) || 0;
        }
      });
      const agentPerf = Object.entries(agents)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue);

      // 8. Daily Call Trends (Last 30 Days Activity)
      const callDays: Record<string, number> = {};
      callsData?.forEach(c => {
          const d = format(new Date(c.called_at), "yyyy-MM-dd");
          callDays[d] = (callDays[d] || 0) + 1;
      });
      const trends = Object.entries(callDays)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 9. Top Selling Products
      const products: Record<string, number> = {};
      revenueData?.forEach(o => {
          (o.line_items as any[])?.forEach(l => {
              products[l.name] = (products[l.name] || 0) + 1;
          });
      });
      const topProducts = Object.entries(products)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // 10. Abandoned Cart Metrics
      const { data: abData } = await supabase.from("abandoned_carts").select("*");
      const abCount = abData?.length || 0;
      const abPotential = abData?.reduce((s, c) => s + (Number(c.total_price) || 0), 0) || 0;
      const abRecovered = abData?.filter(c => c.recovery_status === "recovered").reduce((s, c) => s + (Number(c.total_price) || 0), 0) || 0;
      const abRate = abCount > 0 ? Math.round(((abData?.filter(c => c.recovery_status === "recovered").length || 0) / abCount) * 100) : 0;

      setStats({
        totalCalls: callsCount || 0,
        totalRevenue: revenue,
        reorderRate: reorderRateValue,
        rtoRate,
        deliveryBreakdown: breakdown,
        segmentStats: segmentData || [],
        rtoOrders: (revenueData || []).filter(o => o.delivery_status === "rto").slice(0, 10),
        taskBreakdown: taskOutcomes,
        agentPerformance: agentPerf,
        dailyTrends: trends,
        topProducts,
        rawCallsLogs: callsData || [],
        rawOrdersLogs: revenueData || [],
        abandonedStats: { count: abCount, potential: abPotential, recovered: abRecovered, rate: abRate },
        rawAbandonedData: abData || []
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch detailed analytics");
    } finally {
      setLoading(false);
    }
  }

  function downloadReport() {
    try {
      const wb = XLSX.utils.book_new();
      
      // 1. Overview Sheet
      const overviewData = [
        ["REPORT SUMMARY", "", ""],
        ["Generated At", format(new Date(), "yyyy-MM-dd HH:mm"), ""],
        ["", "", ""],
        ["METRIC", "VALUE", "DESCRIPTION"],
        ["Total Calls", stats.totalCalls, "Calls logged this month"],
        ["Reorder Rate", `${stats.reorderRate}%`, "Percentage of repeat customers"],
        ["RTO Rate", `${stats.rtoRate}%`, "Overall Return to Origin rate"],
        ["Delivered Revenue", formatCurrency(stats.totalRevenue), "Orders with 'Delivered' status"],
        ["Recovered Revenue", formatCurrency(stats.abandonedStats.recovered), "Successfully recovered carts"],
        ["TOTAL PORTFOLIO VALUE", formatCurrency(stats.totalRevenue + stats.abandonedStats.recovered), "Gross business handled (Delivered + Recovered)"],
        ["", "", ""],
        ["ABANDONED RECOVERY", "", ""],
        ["Total Abandoned", stats.abandonedStats.count, "Total carts dropped"],
        ["Potential Revenue", formatCurrency(stats.abandonedStats.potential), "Total lost value"],
        ["Recovered Revenue", formatCurrency(stats.abandonedStats.recovered), "Successfully recovered"],
        ["Recovery Rate", `${stats.abandonedStats.rate}%`, "Success percentage"],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overviewData), "Summary");

      // 2. Detailed Call Logs
      const callLogsData = [
        ["Date", "Agent", "Customer", "Phone", "Outcome", "Note", "Order Info"],
        ...stats.rawCallsLogs.map(c => [
          format(new Date(c.called_at), "yyyy-MM-dd HH:mm"),
          c.agent_name || "System",
          c.customer?.name || "Unknown",
          c.customer?.phone || "-",
          c.outcome?.toUpperCase(),
          c.note || "-",
          c.task?.order?.order_number ? `#${c.task.order.order_number}` : "None"
        ])
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(callLogsData), "Call History");

      // 3. Order Registry
      const ordersData = [
        ["Order Number", "Customer", "Subtotal", "Discount", "Total Revenue", "Status", "Ordered At"],
        ...stats.rawOrdersLogs.map(o => [
          o.order_number,
          o.customer?.name || "Unknown",
          formatCurrency(o.subtotal_price || 0),
          formatCurrency(o.total_discounts || 0),
          formatCurrency(o.total_price || 0),
          o.delivery_status?.toUpperCase(),
          format(new Date(o.ordered_at), "yyyy-MM-dd")
        ])
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ordersData), "Order Registry");

      // 4. Agent Performance
      const agentData = [
        ["Agent Name", "Total Calls", "Attributed Revenue", "Avg Revenue/Call"],
        ...stats.agentPerformance.map(a => [
          a.name,
          a.count,
          formatCurrency(a.revenue),
          formatCurrency(a.count > 0 ? a.revenue / a.count : 0)
        ])
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(agentData), "Agent Leaderboard");

      // 5. Product Analytics
      const productData = [
        ["Product Name", "Units Sold (Delivered)"],
        ...stats.topProducts.map(p => [p.name, p.count])
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(productData), "Product Sales");
      
      // 6. Abandoned Cart Details
      const recoveryData = [
        ["Date", "Customer", "Phone", "Email", "Value", "Status", "Checkout Stage", "Recovery Link"],
        ...stats.rawAbandonedData.map(c => [
          format(new Date(c.abandoned_at), "yyyy-MM-dd HH:mm"),
          c.customer?.name || "Unknown",
          c.phone,
          c.email || "-",
          formatCurrency(c.total_price),
          c.recovery_status?.toUpperCase(),
          c.custom_meta?.checkout_stage || "-",
          c.custom_meta?.ABANDONLINK || "-"
        ])
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recoveryData), "Abandoned Recovery");

      // Write and Download
      XLSX.writeFile(wb, `CureForever_Monthly_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("Detailed monthly report downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate monthly report");
    }
  }

  async function downloadMasterData() {
    setExportingMaster(true);
    try {
      // 1. Fetch All Customers
      const { data: allCustomers } = await supabase.from("customers").select("*").order("name");
      
      // 2. Fetch All Orders
      const { data: allOrders } = await supabase.from("orders").select("*, customer:customers(name, phone, source)").order("ordered_at", { ascending: false });
      
      // 3. Fetch All Abandoned Carts
      const { data: allCarts } = await supabase.from("abandoned_carts").select("*, customer:customers(name, phone, source)").order("abandoned_at", { ascending: false });
      
      // 4. Fetch All Call Logs
      const { data: allLogs } = await supabase.from("call_logs").select("*, customer:customers(name, phone), task:tasks(*)").order("called_at", { ascending: false });

      // Create Workbook
      const wb = XLSX.utils.book_new();
      
      // Sheet 1: Customers
      const custHeaders = ["Name", "Phone", "Email", "Alt Phone", "Segment", "Total Orders", "Source", "Address", "City", "State", "Zip", "Notes", "Created At"];
      const custRows = (allCustomers || []).map(c => [
        c.name, c.phone, c.email || "-", c.alt_phone || "-", c.segment?.toUpperCase(), c.total_orders, c.custom_meta?.source || "-",
        c.address || "-", c.city || "-", c.state || "-", c.zip || "-", c.notes || "-", format(new Date(c.created_at), "yyyy-MM-dd HH:mm")
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([custHeaders, ...custRows]), "Master Customers");

      // Sheet 2: Orders (Detailed)
      const orderHeaders = ["Order ID", "Customer Name", "Phone", "Subtotal", "Discounts", "Total Revenue", "Status", "Source", "Ordered Timestamp", "Delivered Timestamp", "Product List"];
      const orderRows = (allOrders || []).map(o => [
        o.order_number || o.shopify_order_id, (o.customer as any)?.name || "Unknown", (o.customer as any)?.phone || "-",
        o.subtotal_price || 0, o.total_discounts || 0, o.total_price, o.delivery_status?.toUpperCase(), (o.customer as any)?.source || o.source || "-",
        format(new Date(o.ordered_at), "yyyy-MM-dd HH:mm"),
        o.delivered_at ? format(new Date(o.delivered_at), "yyyy-MM-dd HH:mm") : "-",
        (o.line_items as any[])?.map(l => l.title || l.name).join(", ") || "-"
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([orderHeaders, ...orderRows]), "Master Orders");

      // Sheet 3: Abandoned Carts
      const cartHeaders = ["Abandoned Date/Time", "Customer Name", "Phone", "Value", "Status", "Recovery Stage", "Source", "Recovery Link"];
      const cartRows = (allCarts || []).map(c => [
        format(new Date(c.abandoned_at), "yyyy-MM-dd HH:mm"), (c.customer as any)?.name || "Unknown", (c.customer as any)?.phone || "-",
        c.total_price, c.recovery_status?.toUpperCase(), c.custom_meta?.checkout_stage || "-", (c.customer as any)?.source || "-", c.custom_meta?.ABANDONLINK || "-"
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cartHeaders, ...cartRows]), "Master Abandoned");

      // Sheet 4: Call History (Worked On)
      const logHeaders = ["Activity Date", "Agent", "Customer", "Phone", "Task Type", "Outcome", "Action Note"];
      const logRows = (allLogs || []).map(l => [
        format(new Date(l.called_at), "yyyy-MM-dd HH:mm"), l.agent_name || "System", 
        (l.customer as any)?.name || "Unknown", (l.customer as any)?.phone || "-",
        l.task?.task_type?.toUpperCase() || "-", l.outcome?.toUpperCase(), l.note || "-"
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([logHeaders, ...logRows]), "Master Call Logs");

      // Sheet 5: Agent Productivity Master (Calculated)
      const agentMap: Record<string, { calls: number; completed: number; revenue: number; uniqueCust: Set<string> }> = {};
      allLogs?.forEach(l => {
         const name = l.agent_name || "Unknown";
         if (!agentMap[name]) agentMap[name] = { calls: 0, completed: 0, revenue: 0, uniqueCust: new Set() };
         agentMap[name].calls++;
         if (l.customer_id) agentMap[name].uniqueCust.add(l.customer_id);
         if (l.outcome === "done") {
             agentMap[name].completed++;
             // Revenue attribution would usually happen here if linked to an order
         }
      });
      const agentHeaders = ["Agent Name", "Total Activity Units", "Success Full Outcomes", "Unique Customers Handled", "Conversion Rate (%)"];
      const agentRows = Object.entries(agentMap).map(([name, d]) => [
         name, d.calls, d.completed, d.uniqueCust.size, 
         d.calls > 0 ? Math.round((d.completed / d.calls) * 100) : 0
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([agentHeaders, ...agentRows]), "Agent Performance Master");

      XLSX.writeFile(wb, `CureForever_COMPLETE_MASTER_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("Complete master history data exported");
    } catch (err) {
      console.error(err);
      toast.error("Master export failed");
    } finally {
      setExportingMaster(false);
    }
  }

  const tabs = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "tasks", label: "Tasks", icon: ClipboardCheck },
    { key: "customers", label: "Segments", icon: Users },
    { key: "recovery", label: "Recovery", icon: ShoppingBag },
    { key: "rto", label: "RTO", icon: Info },
  ] as const;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin mb-2" />
        <p className="text-sm">Loading live analytics...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Analytics"
        subtitle={`${format(new Date(), "MMMM yyyy")} · Live performance data`}
        actions={
          <div className="flex gap-2">
            <button 
              disabled={exportingMaster}
              onClick={downloadMasterData} 
              className="btn-secondary"
            >
              {exportingMaster ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />} 
              Export Master Data
            </button>
            <button onClick={downloadReport} className="btn-primary">
              <Download className="w-4 h-4" /> Download Monthly Report
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5 gap-0 overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn("px-4 py-2.5 text-sm font-medium border-b-2 transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === t.key ? "border-forest text-forest" : "border-transparent text-gray-500 hover:text-gray-700"
            )}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Total Calls (Month)" value={stats.totalCalls} sub="Real-time count" accent="text-blue-600" />
            <StatCard label="Reorder Rate" value={`${stats.reorderRate}%`} sub="Based on repeat segment" accent="text-emerald-600" />
            <StatCard label="RTO Rate" value={`${stats.rtoRate}%`} sub="All-time average" accent="text-amber-600" />
            <StatCard label={`Delivered Revenue (${format(new Date(), "MMM")})`} value={formatCurrency(stats.totalRevenue)} sub="Orders with Delivered status" accent="text-forest" />
            <StatCard label="Recovered (Rev)" value={formatCurrency(stats.abandonedStats.recovered)} sub="Saved revenue" accent="text-emerald-600" />
            <StatCard label="Total Portfolio Value" value={formatCurrency(stats.totalRevenue + stats.abandonedStats.recovered)} sub="Gross Performance (Sum)" accent="text-blue-700" className="md:col-span-2 xl:col-span-1 border-blue-200 bg-blue-50/10" />
            <StatCard label="Abandoned Carts" value={stats.abandonedStats.count} sub="All time drop" accent="text-rose-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card p-5">
              <SectionTitle>Recent Activity Trends</SectionTitle>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {stats.dailyTrends.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-12">No activity recorded for this period.</p>
                ) : (
                    stats.dailyTrends.map(t => (
                        <div key={t.date} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100 hover:border-forest/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-forest" />
                                <span className="text-xs font-semibold text-gray-700">{format(new Date(t.date), "EEE, MMM dd")}</span>
                            </div>
                            <span className="text-xs font-bold text-forest">{t.count} calls</span>
                        </div>
                    ))
                )}
              </div>
            </div>

            <div className="card p-5">
              <SectionTitle>Total Delivery Status</SectionTitle>
              <div className="space-y-2 py-4">
                {stats.deliveryBreakdown.map(r => (
                  <BarRow key={r.label} label={r.label} value={r.value} max={stats.deliveryBreakdown.reduce((s,x)=>s+x.value,0)} color={r.color} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TASK PERFORMANCE */}
      {activeTab === "tasks" && (
        <div className="space-y-5">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card p-5">
              <SectionTitle>Task Outcomes</SectionTitle>
              <div className="space-y-4 py-4">
                {stats.taskBreakdown.map(r => (
                  <BarRow key={r.label} label={r.label} value={r.value} max={stats.taskBreakdown.reduce((s,x)=>s+x.value,0)} color={r.color} />
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-2 text-center italic">Calculated from calls logged this month.</p>
            </div>

            <div className="card p-5">
              <SectionTitle>Agent Productivity & Sales</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 italic">
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">Agent</th>
                      <th className="text-center py-2 text-xs text-gray-500 font-medium">Calls</th>
                      <th className="text-right py-2 text-xs text-gray-500 font-medium">Attributed Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats.agentPerformance.map(a => (
                      <tr key={a.name}>
                        <td className="py-2 text-xs font-semibold text-forest">{a.name.split("@")[0]}</td>
                        <td className="py-2 text-center text-xs text-gray-600 font-bold">{a.count}</td>
                        <td className="py-2 text-right text-xs font-bold text-emerald-600">{formatCurrency(a.revenue)}</td>
                      </tr>
                    ))}
                    {stats.agentPerformance.length === 0 && (
                        <tr><td colSpan={3} className="py-12 text-center text-gray-400 text-xs italic">No calls logged this month yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEGMENTS */}
      {activeTab === "customers" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.segmentStats.map(s => (
              <StatCard 
                key={s.segment} 
                label={s.segment.replace("_", " ").toUpperCase()} 
                value={s.count} 
                sub={`Avg orders: ${s.avg_orders}`} 
                accent={s.segment === "repeat" ? "text-emerald-600" : "text-amber-600"} 
              />
            ))}
          </div>

          <div className="card p-5">
            <SectionTitle>Top Selling Products (Delivered)</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {stats.topProducts.map(p => (
                    <div key={p.name} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-emerald-50/30">
                        <span className="text-xs font-medium text-forest truncate pr-2">{p.name}</span>
                        <span className="text-xs font-bold text-emerald-700 whitespace-nowrap">{p.count} units</span>
                    </div>
                ))}
            </div>
            {stats.topProducts.length === 0 && <p className="text-sm text-center text-gray-400 py-4">No product data available for this month.</p>}
          </div>
        </div>
      )}

      {/* REVENUE RECOVERY */}
      {activeTab === "recovery" && (
          <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard label="Total Abandoned" value={stats.abandonedStats.count} sub="All time records" />
                  <StatCard label="Potential Revenue" value={formatCurrency(stats.abandonedStats.potential)} sub="Lost if not recovered" accent="text-rose-600" />
                  <StatCard label="Recovered Revenue" value={formatCurrency(stats.abandonedStats.recovered)} sub="Saved through follow-ups" accent="text-emerald-600" />
                  <StatCard label="Recovery Rate" value={`${stats.abandonedStats.rate}%`} sub="Success percentage" />
              </div>

              <div className="card p-6 border-l-4 border-l-emerald-500 bg-emerald-50/10">
                  <SectionTitle>Recovery Performance</SectionTitle>
                  <p className="text-sm text-gray-600 mb-6 font-medium">Your team has successfully recovered <span className="text-emerald-700 font-bold">{formatCurrency(stats.abandonedStats.recovered)}</span> of lost revenue.</p>
                  
                  <div className="space-y-4">
                      <BarRow 
                        label="Recovered" 
                        value={stats.abandonedStats.recovered} 
                        max={stats.abandonedStats.potential} 
                        color="bg-emerald-500" 
                      />
                      <BarRow 
                        label="Remaining (Lost)" 
                        value={stats.abandonedStats.potential - stats.abandonedStats.recovered} 
                        max={stats.abandonedStats.potential} 
                        color="bg-gray-200" 
                      />
                  </div>
              </div>
          </div>
      )}

      {/* RTO */}
      {activeTab === "rto" && (
        <div className="space-y-5">
           <div className="card p-5">
            <SectionTitle>Recent RTO Events</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">Order</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">Customer</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">Value</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stats.rtoOrders.map(r => (
                    <tr key={r.id} className="hover:bg-rose-50/30">
                      <td className="py-2 px-2 text-xs font-semibold text-forest">#{r.order_number}</td>
                      <td className="py-2 px-2 text-xs text-gray-700">{r.customer?.name || "Unknown"}</td>
                      <td className="py-2 px-2 text-xs font-semibold text-forest">{formatCurrency(r.total_price)}</td>
                      <td className="py-2 px-2">
                         <span className="text-[11px] text-rose-600 font-medium">RTO Flagged</span>
                      </td>
                    </tr>
                  ))}
                  {stats.rtoOrders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400 text-sm">No RTO events recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

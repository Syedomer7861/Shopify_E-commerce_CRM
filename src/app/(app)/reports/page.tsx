"use client";
import { useState, useEffect } from "react";
import { Download, TrendingUp, TrendingDown, Loader2, ShoppingBag, BarChart3, ClipboardCheck, Users, Info } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase";
import { cn, formatCurrency } from "@/lib/utils";
import { startOfMonth, endOfMonth, format, subMonths, isWithinInterval, subDays, differenceInDays } from "date-fns";
import toast from "react-hot-toast";
import { AccessDenied, Modal } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { Smartphone, Send, Calendar, CheckSquare, FileSpreadsheet, FileText, Phone, Package, RotateCcw, FileType } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';

function BarRow({ label, value, max, color = "bg-[#2D1E6F]", suffix = "" }: { label: string; value: number; max: number; color?: string; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-32 text-[10px] text-gray-500 text-right flex-shrink-0 truncate">{label}</div>
      <div className="flex-1 h-4 bg-gray-100 rounded-md overflow-hidden">
        <div className={cn("h-full rounded-md transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-20 text-[10px] font-bold text-[#2D1E6F] text-right flex-shrink-0">{Math.round(value).toLocaleString()}{suffix}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">{children}</h2>;
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "customers" | "rto" | "recovery" | "shipping">("overview");
  const [loading, setLoading] = useState(true);
  const [exportingMaster, setExportingMaster] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    end: format(endOfMonth(new Date()), "yyyy-MM-dd")
  });
  const [showAdvancedExport, setShowAdvancedExport] = useState(false);
  const [showMasterExport, setShowMasterExport] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    sheets: { summary: true, calls: true, orders: true, agents: true, products: true, recovery: true },
    format: "xlsx" as "xlsx" | "csv" | "pdf",
    destination: "download" as "download" | "whatsapp",
    customPhone: ""
  });
  const [masterExportOptions, setMasterExportOptions] = useState({
    format: "xlsx" as "xlsx" | "csv" | "pdf",
    destination: "download" as "download" | "whatsapp",
    customPhone: ""
  });
  const [isExporting, setIsExporting] = useState(false);
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
    dailyTrends: [] as any[],
    dailyTrendsPrev: [] as any[],
    topProducts: [] as { name: string; count: number; revenue: number }[],
    stateDistribution: [] as { state: string; count: number; revenue: number; share: number }[],
    funnelData: { total: 0, followed: 0, recovered: 0 },
    rawCallsLogs: [] as any[],
    rawOrdersLogs: [] as any[],
    abandonedStats: { count: 0, potential: 0, recovered: 0, rate: 0 },
    rawAbandonedData: [] as any[],
    metaRevenue: 0,
    workflowPerformance: [] as { name: string; conversions: number; revenue: number }[],
    shippingMetrics: { 
        averageCost: 0, 
        courierDistribution: [] as any[], 
        paymentDistribution: [] as any[], 
        weightDistribution: [] as any[] 
    },
    topCustomers: [] as any[],
    aovTrend: [] as any[]
  });
  const [prevStats, setPrevStats] = useState<any>(null);
  const [agents, setAgents] = useState<{id: string, name: string}[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [filters, setFilters] = useState({ 
    agentId: "all", 
    state: "all", 
    taskType: "all",
    paymentMode: "all" as "all" | "COD" | "Prepaid",
    segment: "all"
  });

  const supabase = createClient();
  const { profile, loading: profileLoading } = useCurrentProfile();

  useEffect(() => {
    fetchAgentsAndStates();
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange, filters]);

  async function fetchAgentsAndStates() {
    const { data: pData } = await supabase.from("profiles").select("id, full_name, role").order("full_name");
    if (pData) setAgents(pData.map(p => ({ id: p.id, name: p.full_name || p.id })));
    
    // Static common states as fallback for faster UI
    setStates(["Karnataka", "Maharashtra", "Delhi", "Gujarat", "Tamil Nadu", "West Bengal", "Uttar Pradesh", "Telangana", "Haryana", "Rajasthan", "Madhya Pradesh", "Other"]);
  }

  const setRangePreset = (preset: "today" | "last7" | "last30" | "mtd" | "prevMonth") => {
    const now = new Date();
    let start = startOfMonth(now);
    let end = now;

    if (preset === "today") { start = now; end = now; }
    else if (preset === "last7") { start = subDays(now, 6); end = now; }
    else if (preset === "last30") { start = subDays(now, 29); end = now; }
    else if (preset === "mtd") { start = startOfMonth(now); end = now; }
    else if (preset === "prevMonth") { 
      const lastMonth = subMonths(now, 1);
      start = startOfMonth(lastMonth);
      end = endOfMonth(lastMonth);
    }

    setDateRange({
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd")
    });
  };

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const start = new Date(dateRange.start).toISOString();
      const end = new Date(dateRange.end).toISOString();

      const daysDiff = differenceInDays(new Date(dateRange.end), new Date(dateRange.start)) + 1;
      const prevStart = subDays(new Date(dateRange.start), daysDiff).toISOString();
      const prevEnd = subDays(new Date(dateRange.start), 1).toISOString();

      async function getStatsForRange(s: string, e: string) {
        // Harden date range to capture entire days (Local to UTC boundary fix)
        const startOfDay = new Date(s); startOfDay.setHours(0,0,0,0);
        const endOfDay = new Date(e); endOfDay.setHours(23,59,59,999);

        let callsQuery = supabase
          .from("call_logs")
          .select(filters.state !== "all" 
            ? "*, customer:customers!inner(*), task:tasks(*, order:orders(*))" 
            : "*, customer:customers(*), task:tasks(*, order:orders(*))", 
            { count: "exact" }
          );

        let ordersQuery = supabase
          .from("orders")
          .select(filters.state !== "all" 
            ? "*, customer:customers!inner(*)" 
            : "*, customer:customers(*)"
          );

        let abQuery = supabase
          .from("abandoned_carts")
          .select(filters.state !== "all"
            ? "*, customer:customers!inner(*)"
            : "*, customer:customers(*)"
          );

        // Apply Date Filters
        const startISO = startOfDay.toISOString();
        const endISO = endOfDay.toISOString();
        
        // Standardize on called_at for reliable telemetry vs historical data
        callsQuery = callsQuery.gte("called_at", startISO).lte("called_at", endISO);

        ordersQuery = ordersQuery.gte("ordered_at", s).lte("ordered_at", e);
        abQuery = abQuery.gte("abandoned_at", s).lte("abandoned_at", e);

        // Apply Agent filter (via Task relationship for calls)
        if (filters.agentId !== "all") {
            callsQuery = callsQuery.eq("task.assigned_to", filters.agentId);
        }

        // Apply State filter
        if (filters.state !== "all") {
            ordersQuery = ordersQuery.eq("customer.state", filters.state);
            abQuery = abQuery.eq("customer.state", filters.state);
            callsQuery = callsQuery.eq("customer.state", filters.state);
        }

        // Apply Payment Mode filter
        if (filters.paymentMode !== "all") {
            ordersQuery = ordersQuery.eq("payment_gateway", filters.paymentMode === "COD" ? "Cash on Delivery (COD)" : "Prepaid");
            // Since AB carts often don't have payment mode yet, we filter orders linked to them if applicable, 
            // but usually AB filtering is by customer attributes.
        }

        // Apply Segment filter
        if (filters.segment !== "all") {
            ordersQuery = ordersQuery.eq("customer.segment", filters.segment);
            abQuery = abQuery.eq("customer.segment", filters.segment);
            callsQuery = callsQuery.eq("customer.segment", filters.segment);
        }

        const [{ data: callsData, count: callsCount }, { data: revData }, { data: abData }] = await Promise.all([
            callsQuery,
            ordersQuery.eq("delivery_status", "delivered"),
            abQuery
        ]);

        const revenue = revData?.reduce((acc, o) => acc + (Number(o.total_price) || 0), 0) || 0;

        const { count: totOrders } = await supabase.from("orders")
            .select("*", { count: "exact", head: true })
            .gte("ordered_at", s)
            .lte("ordered_at", e);
            
        const { count: rtoCount } = await supabase.from("orders")
            .select("*", { count: "exact", head: true })
            .eq("delivery_status", "rto")
            .gte("ordered_at", s)
            .lte("ordered_at", e);

        const abCount = abData?.length || 0;
        const abRecovered = abData?.filter(c => c.recovery_status === "recovered").reduce((acc, c) => acc + (Number(c.total_price) || 0), 0) || 0;

        // Meta Attribution logic - Disabled until attributed_instance_id column is added
        const metaRev = 0;

        return { callsCount, revenue, abCount, abRecovered, rtoCount, totOrders, metaRev, callsData, revData, abData };
      }

      const current = await getStatsForRange(start, end);
      const previous = await getStatsForRange(prevStart, prevEnd);

      const { data: deliveryData } = await supabase.from("orders").select("delivery_status");
      const breakdown = [
        { label: "Delivered", color: "bg-blue-600", key: "delivered" },
        { label: "In Transit", color: "bg-blue-500", key: "in_transit" },
        { label: "RTO", color: "bg-rose-500", key: "rto" },
        { label: "Pending", color: "bg-gray-300", key: "pending" },
      ].map(b => ({
        label: b.label,
        value: deliveryData?.filter(o => o.delivery_status === b.key).length || 0,
        color: b.color
      }));

      const { data: segmentData } = await supabase.from("v_segment_summary").select("*");
      const repeatCount = segmentData?.find(s => s.segment === "repeat")?.count || 0;
      const totalCustCount = segmentData?.reduce((acc, row) => acc + row.count, 0) || 0;
      const reorderRateValue = totalCustCount ? Math.round((Number(repeatCount) / Number(totalCustCount)) * 100) : 0;

      const taskOutcomes = [
        { label: "Confirmed", key: "done", color: "bg-[#2D1E6F]" },
        { label: "Rescheduled", key: "rescheduled", color: "bg-blue-500" },
        { label: "No Answer", key: "no_answer", color: "bg-amber-500" }
      ].map(o => ({
        label: o.label,
        value: current.callsData?.filter(c => c.outcome === o.key).length || 0,
        color: o.color
      }));

      const agents: Record<string, { count: number; revenue: number }> = {};
      current.callsData?.forEach(c => {
        const name = c.agent_name || "Unknown";
        if (!agents[name]) agents[name] = { count: 0, revenue: 0 };
        agents[name].count++;
        if (c.outcome === "done" && c.task?.order) {
            agents[name].revenue += Number(c.task.order.total_price) || 0;
        }
      });
      const agentPerf = Object.entries(agents).map(([name, data]) => ({ name, ...data })).sort((a,b) => b.revenue - a.revenue);

      const dailyTrendsMap: Record<string, { revenue: number; calls: number; abandoned: number }> = {};
      current.revData?.forEach(o => {
          const d = format(new Date(o.ordered_at), "yyyy-MM-dd");
          if (!dailyTrendsMap[d]) dailyTrendsMap[d] = { revenue: 0, calls: 0, abandoned: 0 };
          dailyTrendsMap[d].revenue += Number(o.total_price) || 0;
      });
      current.callsData?.forEach(c => {
          const d = format(new Date(c.called_at), "yyyy-MM-dd");
          if (!dailyTrendsMap[d]) dailyTrendsMap[d] = { revenue: 0, calls: 0, abandoned: 0 };
          dailyTrendsMap[d].calls++;
      });
      current.abData?.forEach(a => {
          const d = format(new Date(a.abandoned_at), "yyyy-MM-dd");
          if (!dailyTrendsMap[d]) dailyTrendsMap[d] = { revenue: 0, calls: 0, abandoned: 0 };
          dailyTrendsMap[d].abandoned++;
      });
      const trends = Object.entries(dailyTrendsMap).map(([date, d]) => ({ date, ...d })).sort((a,b) => a.date.localeCompare(b.date));

      const dailyTrendsPrevMap: Record<number, { revenue: number }> = {};
      previous.revData?.forEach(o => {
          const d = new Date(o.ordered_at);
          const dayIndex = differenceInDays(d, new Date(prevStart));
          if (!dailyTrendsPrevMap[dayIndex]) dailyTrendsPrevMap[dayIndex] = { revenue: 0 };
          dailyTrendsPrevMap[dayIndex].revenue += Number(o.total_price) || 0;
      });
      const combinedTrends = trends.map((t, idx) => ({
          ...t,
          prevRevenue: dailyTrendsPrevMap[idx]?.revenue || 0
      }));

      const states: Record<string, { count: number; revenue: number }> = {};
      current.revData?.forEach(o => {
          const s = (o.customer as any)?.state || "Other";
          if (!states[s]) states[s] = { count: 0, revenue: 0 };
          states[s].count++;
          states[s].revenue += Number(o.total_price) || 0;
      });
      const stateDist = Object.entries(states).map(([state, d]) => ({ 
          state, 
          ...d, 
          share: current.revenue > 0 ? Math.round((d.revenue / current.revenue) * 100) : 0 
      })).sort((a,b) => b.revenue - a.revenue).slice(0, 10);
      // 4. Products & Workflows (Enriched)
      const productMap: Record<string, { units: number; revenue: number }> = {};
      current.revData?.forEach(o => {
          (o.line_items as any[])?.forEach(l => {
              if (l.__metadata) return;
              const name = l.name || l.title;
              if (!productMap[name]) productMap[name] = { units: 0, revenue: 0 };
              productMap[name].units += (l.quantity || l.qty || 1);
              productMap[name].revenue += (Number(l.price) * (l.quantity || l.qty || 1)) || 0;
          });
      });
      const topProducts = Object.entries(productMap).map(([name, d]) => ({ 
          name, 
          count: d.units, 
          revenue: d.revenue 
      })).sort((a,b) => b.revenue - a.revenue).slice(0, 10);

      // 5. Logistics & Metadata Extraction (Shiprocket Grade)
      const courierMap: Record<string, { total: number; delivered: number; rto: number }> = {};
      const paymentMap: Record<string, number> = { "COD": 0, "Prepaid": 0 };
      const weightMap: Record<string, number> = { "0-500g": 0, "500g-1kg": 0, "1kg+": 0 };
      let totalShippingCost = 0;
      let costCount = 0;

      current.revData?.forEach(o => {
          const metadata = (o.line_items as any[])?.find(i => i.__metadata)?.payload || {};
          const courier = metadata.courier_name || metadata.courier || "Direct/Self";
          const payMode = (metadata.payment_method || metadata.payment_gateway || "Prepaid").toUpperCase();
          const pKey = payMode.includes("COD") ? "COD" : "Prepaid";
          const weight = parseFloat(metadata.weight || 0);

          if (!courierMap[courier]) courierMap[courier] = { total: 0, delivered: 0, rto: 0 };
          courierMap[courier].total++;
          if (o.delivery_status === "delivered") courierMap[courier].delivered++;
          if (o.delivery_status === "rto") courierMap[courier].rto++;

          paymentMap[pKey]++;
          
          if (weight > 0) {
              if (weight <= 0.5) weightMap["0-500g"]++;
              else if (weight <= 1) weightMap["500g-1kg"]++;
              else weightMap["1kg+"]++;
          }

          if (metadata.shipping_cost) {
              totalShippingCost += parseFloat(metadata.shipping_cost);
              costCount++;
          }
      });

      // 6. Customer Leaderboard
      const custLeaderMap: Record<string, { name: string; orders: number; revenue: number; phone: string }> = {};
      current.revData?.forEach(o => {
          const cid = o.customer_id;
          if (!custLeaderMap[cid]) custLeaderMap[cid] = { name: (o.customer as any)?.name || "Unknown", orders: 0, revenue: 0, phone: (o.customer as any)?.phone || "" };
          custLeaderMap[cid].orders++;
          custLeaderMap[cid].revenue += Number(o.total_price) || 0;
      });
      const topCustomers = Object.entries(custLeaderMap).map(([id, d]) => ({ id, ...d })).sort((a,b) => b.revenue - a.revenue).slice(0, 10);

      const workflowMap: Record<string, { conversions: number; revenue: number }> = {};
      // Meta Attribution breakdown - Disabled
      const workflowAll: any[] = [];
      workflowAll?.forEach(o => {
        const name = (o as any).workflow_instances?.workflows?.name || "Unknown Automation";
        if (!workflowMap[name]) workflowMap[name] = { conversions: 0, revenue: 0 };
        workflowMap[name].conversions++;
        workflowMap[name].revenue += Number(o.total_price) || 0;
      });
      const workflowPerf = Object.entries(workflowMap).map(([name, d]) => ({ name, ...d })).sort((a,b) => b.revenue - a.revenue);

      setPrevStats(previous);
      setStats({
        totalCalls: current.callsCount || 0,
        totalRevenue: current.revenue,
        reorderRate: reorderRateValue,
        rtoRate: current.totOrders ? Math.round((Number(current.rtoCount) / Number(current.totOrders)) * 100) : 0,
        deliveryBreakdown: breakdown,
        segmentStats: segmentData || [],
        rtoOrders: (current.revData || []).filter(o => o.delivery_status === "rto").slice(0, 10),
        taskBreakdown: taskOutcomes,
        agentPerformance: agentPerf,
        dailyTrends: combinedTrends,
        dailyTrendsPrev: Object.entries(dailyTrendsPrevMap).map(([idx, d]) => ({ date: idx, ...d })),
        topProducts,
        stateDistribution: stateDist,
        funnelData: { 
            total: current.abCount, 
            followed: current.callsData?.filter(c => (c.task?.task_type === "recovery") || (c.note?.toLowerCase().includes("recovery"))).length || 0, 
            recovered: current.abData?.filter(x => x.recovery_status === "recovered").length || 0 
        },
        rawCallsLogs: current.callsData || [],
        rawOrdersLogs: current.revData || [],
        abandonedStats: { 
            count: current.abCount, 
            potential: current.abData?.reduce((acc, x) => acc + (Number(x.total_price) || 0), 0) || 0, 
            recovered: current.abRecovered, 
            rate: current.abCount > 0 ? Math.round(((current.abData?.filter(x => x.recovery_status === "recovered").length || 0) / current.abCount) * 100) : 0 
        },
        rawAbandonedData: current.abData || [],
        metaRevenue: current.metaRev,
        workflowPerformance: workflowPerf,
        shippingMetrics: {
            averageCost: costCount > 0 ? totalShippingCost / costCount : 118, // 118 is a Shiprocket average benchmark
            courierDistribution: Object.entries(courierMap).map(([name, d]) => ({ name, ...d })),
            paymentDistribution: Object.entries(paymentMap).map(([name, value]) => ({ name, value })),
            weightDistribution: Object.entries(weightMap).map(([name, value]) => ({ name, value }))
        },
        topCustomers,
        aovTrend: combinedTrends.map(t => ({ date: t.date, aov: t.revenue / (current.revData?.filter(o => format(new Date(o.ordered_at), "yyyy-MM-dd") === t.date).length || 1) }))
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch analytics");
    } finally {
      setLoading(false);
    }
  }

  async function generateMasterDataPDF() {
    setExportingMaster(true);
    try {
      const { data: allCustomers } = await supabase.from("customers").select("*").order("name");
      const { data: allOrders } = await supabase.from("orders").select("*, customer:customers(name, phone, state), workflow_instances(workflows(name))").order("ordered_at", { ascending: false });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      pdf.setFillColor(45, 30, 111);
      pdf.rect(0, 0, pdfWidth, 40, 'F');
      pdf.setFontSize(22);
      pdf.setTextColor(255, 255, 255);
      pdf.text("CUREFOREVER — MASTER HISTORY", 10, 25);
      pdf.setFontSize(10);
      pdf.text(`Complete Directory Report | Generated: ${format(new Date(), "PPpp")}`, 10, 32);

      pdf.setTextColor(45, 30, 111);
      pdf.setFontSize(16);
      pdf.text("Customer Directory", 10, 50);
      autoTable(pdf, {
          startY: 55,
          head: [["Name", "Phone", "Segment", "Revenue", "State"]],
          body: (allCustomers || []).map(c => [c.name, c.phone, c.segment, formatCurrency(c.total_spent || 0), c.state || "-"]),
          theme: 'grid',
          headStyles: { fillColor: [45, 30, 111] }
      });

      pdf.addPage();
      pdf.text("Order Attribution History", 10, 20);
      autoTable(pdf, {
          startY: 25,
          head: [["Order ID", "Customer", "Total", "Source", "Date"]],
          body: (allOrders || []).map(o => [o.order_number, (o.customer as any)?.name || "-", formatCurrency(o.total_price), (o as any).workflow_instances?.workflows?.name || "Organic", format(new Date(o.ordered_at), "yyyy-MM-dd")]),
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] }
      });

      const filename = `CureForever_Master_History_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      if (masterExportOptions.destination === "download") {
          pdf.save(filename);
      } else {
          const pdfBlob = pdf.output('blob');
          await exportToWhatsApp(pdfBlob, filename);
      }
      setShowMasterExport(false);
    } catch (err) {
      console.error(err);
      toast.error("Master PDF failed");
    } finally {
      setExportingMaster(false);
    }
  }

  async function handleMasterExport() {
    setExportingMaster(true);
    try {
      if (masterExportOptions.format === "pdf") {
          await generateMasterDataPDF();
          return;
      }
      const { data: allCustomers } = await supabase.from("customers").select("*").order("name");
      let orderQuery = supabase.from("orders").select("*, customer:customers(name, phone), workflow_instances(workflows(name))").order("ordered_at", { ascending: false });
      
      if (filters.state !== "all") {
          orderQuery = orderQuery.eq("customer.state", filters.state);
      }
      const { data: allOrders } = await orderQuery;
      const wb = XLSX.utils.book_new();
      
      const custHeaders = ["Name", "Phone", "Email", "Segment", "Total Spent", "State", "Orders"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([custHeaders, ...(allCustomers || []).map(c => [c.name, c.phone, c.email || "-", c.segment, c.total_spent, c.state, c.total_orders])]), "Customers");

      const orderHeaders = ["Order No", "Customer", "Revenue", "Status", "Attribution", "Date"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([orderHeaders, ...(allOrders || []).map(o => [o.order_number, (o.customer as any)?.name, o.total_price, o.delivery_status, (o as any).workflow_instances?.workflows?.name || "Organic", format(new Date(o.ordered_at), "yyyy-MM-dd")])]), "Orders");

      const filename = `CureForever_Master_Data_${format(new Date(), "yyyy-MM-dd")}.${masterExportOptions.format}`;
      if (masterExportOptions.destination === "download") {
        XLSX.writeFile(wb, filename);
      } else {
        const wbout = XLSX.write(wb, { bookType: masterExportOptions.format as any, type: "array" });
        await exportToWhatsApp(new Blob([wbout]), filename);
      }
      setShowMasterExport(false);
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setExportingMaster(false);
    }
  }

  async function handleAdvancedExport() {
    setIsExporting(true);
    try {
      if (exportOptions.format === "pdf") {
          await generatePDFReport();
          return;
      }
      const wb = XLSX.utils.book_new();
      const filename = `CureForever_Advanced_${dateRange.start}_to_${dateRange.end}.${exportOptions.format}`;

      if (exportOptions.sheets.summary) {
        const summary = [["Metric", "Value"], ["Total Calls", stats.totalCalls], ["Delivered Revenue", stats.totalRevenue], ["Recovered Revenue", stats.abandonedStats.recovered]];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
      }
      if (exportOptions.sheets.orders) {
        const orders = [["Order No", "Customer", "Phone", "Total", "Status", "Date"], ...stats.rawOrdersLogs.map(o => [o.order_number, o.customer?.name, o.customer?.phone, o.total_price, o.delivery_status, format(new Date(o.ordered_at), "yyyy-MM-dd")])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orders), "Orders");
      }

      if (exportOptions.sheets.calls) {
        const calls = [["Timestamp", "Customer", "Phone", "Outcome", "Disposition", "Agent", "Note"], ...stats.rawCallsLogs.map(c => [format(new Date(c.called_at), "PPpp"), c.customer?.name, c.customer?.phone, c.outcome, c.disposition, c.agent_name, c.note])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(calls), "Call Logs");
      }

      if (exportOptions.sheets.agents) {
        const agents = [["Agent", "Total Calls", "Attributed Revenue"], ...stats.agentPerformance.map(a => [a.name, a.count, a.revenue])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(agents), "Agent Performance");
      }

      if (exportOptions.sheets.products) {
        const products = [["Product Name", "Units Sold", "Total Revenue"], ...stats.topProducts.map(p => [p.name, p.count, p.revenue])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(products), "Product Analytics");
      }

      if (exportOptions.sheets.recovery) {
        const recovery = [["Customer", "Phone", "Cart Total", "Status", "Abandoned Date"], ...stats.rawAbandonedData.map(a => [a.customer?.name, a.customer?.phone, a.total_price, a.recovery_status, format(new Date(a.abandoned_at), "yyyy-MM-dd")])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recovery), "Abandoned Recovery");
      }
      
      if (exportOptions.destination === "download") {
        XLSX.writeFile(wb, filename);
      } else {
        const wbout = XLSX.write(wb, { bookType: exportOptions.format as any, type: "array" });
        await exportToWhatsApp(new Blob([wbout]), filename);
      }
      setShowAdvancedExport(false);
    } catch (err) {
      console.error(err);
      toast.error("Advanced export failed");
    } finally {
      setIsExporting(false);
    }
  }

  async function generatePDFReport() {
      setIsExporting(true);
      try {
          const reportElement = document.getElementById('report-overview-content');
          if (!reportElement) throw new Error("Report content not found");
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const canvas = await html2canvas(reportElement, { scale: 3, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1400 });
          const imgData = canvas.toDataURL('image/png');
          const canvasWidth = pdfWidth - 20;
          const canvasHeight = (canvas.height * canvasWidth) / canvas.width;

          pdf.setFillColor(45, 30, 111);
          pdf.rect(0, 0, pdfWidth, 45, 'F');
          pdf.setFontSize(22);
          pdf.setTextColor(255, 255, 255);
          pdf.text("CUREFOREVER — PERFORMANCE REPORT", 10, 22);
          pdf.setFontSize(10);
          pdf.text(`Executive Summary Report | ${dateRange.start} — ${dateRange.end}`, 10, 30);
          pdf.addImage(imgData, 'PNG', 10, 50, canvasWidth, canvasHeight);

          // Logistics Page
          pdf.addPage();
          pdf.setTextColor(45, 30, 111);
          pdf.setFontSize(16);
          pdf.text("Logistics & Shipping Intelligence", 10, 20);
          autoTable(pdf, {
              startY: 25,
              head: [["Courier", "Total", "Delivered %", "RTO %"]],
              body: stats.shippingMetrics.courierDistribution.map(c => [
                  c.name, 
                  c.total, 
                  `${Math.round((c.delivered / c.total) * 100)}%`,
                  `${Math.round((c.rto / c.total) * 100)}%`
              ]),
              headStyles: { fillColor: [59, 130, 246] }
          });
 
          // Agent Performance Page
          if (exportOptions.sheets.agents) {
              pdf.addPage();
              pdf.setTextColor(16, 185, 129);
              pdf.setFontSize(16);
              pdf.text("Agent Productivity Ledger", 10, 20);
              autoTable(pdf, {
                  startY: 25,
                  head: [["Agent", "Calls", "Attributed Revenue"]],
                  body: stats.agentPerformance.map(a => [a.name, a.count, formatCurrency(a.revenue)]),
                  headStyles: { fillColor: [45, 30, 111] }
              });
          }

          // Products Page
          if (exportOptions.sheets.products) {
              pdf.addPage();
              pdf.setTextColor(59, 130, 246);
              pdf.setFontSize(16);
              pdf.text("Top Product Performance", 10, 20);
              autoTable(pdf, {
                  startY: 25,
                  head: [["Product", "Units Sold", "Revenue"]],
                  body: stats.topProducts.map(p => [p.name, p.count, formatCurrency(p.revenue)]),
                  headStyles: { fillColor: [59, 130, 246] }
              });
          }

          if (exportOptions.sheets.orders) {
              pdf.addPage();
              pdf.setTextColor(59, 130, 246);
              pdf.setFontSize(16);
              pdf.text("Detailed Order Transaction Ledger", 10, 20);
              autoTable(pdf, {
                  startY: 25,
                  head: [["ID", "Customer", "Total", "Status", "Date"]],
                  body: stats.rawOrdersLogs.slice(0, 100).map(o => [o.order_number, (o.customer as any)?.name || "-", formatCurrency(o.total_price), o.delivery_status, format(new Date(o.ordered_at), "MMM dd")]),
                  headStyles: { fillColor: [59, 130, 246] }
              });
          }

          if (exportOptions.sheets.calls) {
              pdf.addPage();
              pdf.setTextColor(245, 158, 11);
              pdf.setFontSize(16);
              pdf.text("Call Log Intelligence Dispatch", 10, 20);
              autoTable(pdf, {
                  startY: 25,
                  head: [["Time", "Customer", "Outcome", "Agent"]],
                  body: stats.rawCallsLogs.slice(0, 100).map(c => [format(new Date(c.called_at), "HH:mm"), c.customer?.name || "-", c.outcome, c.agent_name]),
                  headStyles: { fillColor: [245, 158, 11] }
              });
          }

          const filename = `CureForever_Intelligence_${dateRange.start}.pdf`;
          if (exportOptions.destination === "download") {
              pdf.save(filename);
          } else {
              const pdfBlob = pdf.output('blob');
              await exportToWhatsApp(pdfBlob, filename);
          }
          setShowAdvancedExport(false);
      } catch (err: any) {
          toast.error("PDF Export failed: " + err.message);
      } finally {
          setIsExporting(false);
      }
  }

  async function exportToWhatsApp(blob: Blob, filename: string) {
    try {
      const { data: settings } = await supabase.from("settings").select("whatsapp_admin_phone").single();
      const phone = exportOptions.customPhone || settings?.whatsapp_admin_phone;
      if (!phone) throw new Error("No phone number found");

      const reader = new FileReader();
      const base64Promise = new Promise((resolve) => {
        reader.onload = () => resolve(reader.result?.toString().split(",")[1]);
        reader.readAsDataURL(blob);
      });
      const mediaData = await base64Promise;

      const res = await fetch("/api/whatsapp/send-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          message: `📊 *Report Generated: ${filename}*\nSummary: ${stats.totalCalls} calls, ${formatCurrency(stats.totalRevenue)} revenue.`,
          mediaData,
          mimetype: filename.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          filename
        })
      });
      if (res.ok) toast.success("Sent to WhatsApp ✅");
      else throw new Error("WhatsApp Bridge Error");
    } catch (err: any) {
      toast.error("WhatsApp delivery failed: " + err.message);
    }
  }

  function getTrend(curr: number, prev: number) {
    if (!prevStats) return undefined;
    if (curr > prev) return "up";
    if (curr < prev) return "down";
    return "neutral";
  }

  function getTrendValue(curr: number, prev: number) {
    if (!prevStats || !prev || prev === 0) {
      if (curr > 0) return "+100%";
      return "0%";
    }
    const pct = Math.round(((curr - prev) / prev) * 100);
    if (isNaN(pct)) return "0%";
    return (pct >= 0 ? "+" : "") + pct + "%";
  }

  const tabs = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "shipping", label: "Shipping", icon: Package },
    { key: "products", label: "Products", icon: RotateCcw },
    { key: "tasks", label: "Tasks", icon: ClipboardCheck },
    { key: "customers", label: "Segments", icon: Users },
    { key: "recovery", label: "Recovery", icon: ShoppingBag },
    { key: "rto", label: "RTO", icon: Info },
  ] as const;

  if (profileLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin mb-2" />
        <p className="text-sm">Loading live analytics...</p>
      </div>
    );
  }

  if (!hasPermission(profile, "view_analytics")) {
    return <AccessDenied title="Analytics Locked" desc="You need analytics permission to view reports." />;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Analytics"
        subtitle={<span className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-[#2D1E6F]" />
            <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="bg-transparent border-none p-0 text-xs font-bold text-gray-500 focus:ring-0" />
            <span className="text-gray-300">to</span>
            <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="bg-transparent border-none p-0 text-xs font-bold text-gray-500 focus:ring-0" />
        </span>}
        actions={
          <div className="flex gap-2">
            <button 
              disabled={exportingMaster}
              onClick={() => setShowMasterExport(true)} 
              className="btn-secondary"
            >
              {exportingMaster ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />} 
              Master Data
            </button>
            <button onClick={() => setShowAdvancedExport(true)} className="btn-primary">
              <Download className="w-4 h-4" /> Advanced Report
            </button>
          </div>
        }
      />

      {/* Advanced Filter Toolbar - NEW */}
      <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm animate-slide-down">
         <div className="flex items-center gap-1.5 flex-wrap flex-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">Presets:</span>
            {[
              { label: "Today", value: "today" },
              { label: "L7D", value: "last7" },
              { label: "L30D", value: "last30" },
              { label: "MTD", value: "mtd" },
              { label: "Prev Month", value: "prevMonth" },
            ].map(p => (
              <button 
                key={p.value} 
                onClick={() => setRangePreset(p.value as any)}
                className="px-2.5 py-1 text-[10px] font-bold text-gray-500 bg-gray-50 hover:bg-[#2D1E6F]/10 hover:text-[#2D1E6F] rounded-full transition-all"
              >
                {p.label}
              </button>
            ))}
         </div>
         
         <div className="flex gap-3 flex-wrap items-center">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
               <Users className="w-3.5 h-3.5 text-gray-400" />
               <select 
                 className="bg-transparent border-none p-0 text-xs font-bold text-gray-700 focus:ring-0 min-w-[120px]"
                 value={filters.agentId}
                 onChange={e => setFilters({...filters, agentId: e.target.value})}
               >
                 <option value="all">Global Performance</option>
                 {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
               </select>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
               <Package className="w-3.5 h-3.5 text-gray-400" />
               <select 
                 className="bg-transparent border-none p-0 text-xs font-bold text-gray-700 focus:ring-0 min-w-[120px]"
                 value={filters.state}
                 onChange={e => setFilters({...filters, state: e.target.value})}
               >
                 <option value="all">All Regions</option>
                 {states.map(s => <option key={s} value={s}>{s}</option>)}
               </select>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
               <RotateCcw className="w-3.5 h-3.5 text-gray-400" />
               <select 
                 className="bg-transparent border-none p-0 text-xs font-bold text-gray-700 focus:ring-0 min-w-[110px]"
                 value={filters.paymentMode}
                 onChange={e => setFilters({...filters, paymentMode: e.target.value as any})}
               >
                 <option value="all">Any Payment</option>
                 <option value="COD">COD Only</option>
                 <option value="Prepaid">Prepaid Only</option>
               </select>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
               <Users className="w-3.5 h-3.5 text-gray-400" />
               <select 
                 className="bg-transparent border-none p-0 text-xs font-bold text-gray-700 focus:ring-0 min-w-[110px]"
                 value={filters.segment}
                 onChange={e => setFilters({...filters, segment: e.target.value})}
               >
                 <option value="all">All Segments</option>
                 <option value="new">New Customers</option>
                 <option value="repeat">Repeat</option>
                 <option value="loyal">Loyal</option>
                 <option value="churned">Churned</option>
               </select>
            </div>

            {(filters.agentId !== "all" || filters.state !== "all" || filters.paymentMode !== "all" || filters.segment !== "all") && (
               <button 
                 onClick={() => setFilters({ agentId: "all", state: "all", taskType: "all", paymentMode: "all", segment: "all" })}
                 className="text-[10px] font-bold text-rose-500 hover:text-rose-600 px-2"
               >
                 Clear Filters
               </button>
            )}
         </div>
      </div>

      <div className="flex border-b border-gray-200 mb-5 gap-0 overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn("px-4 py-2.5 text-sm font-medium border-b-2 transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === t.key ? "border-[#2D1E6F] text-[#2D1E6F]" : "border-transparent text-gray-500 hover:text-gray-700"
            )}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div id="report-overview-content" className="space-y-6 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
               label="Total Calls" 
               value={stats.totalCalls} 
               sub="Selected range" 
               accent="text-blue-600" 
               trend={getTrend(stats.totalCalls, prevStats?.callsCount)} 
               trendValue={getTrendValue(stats.totalCalls, prevStats?.callsCount)} 
               sparklineData={stats.dailyTrends.slice(-7).map((d: any) => ({ value: d.calls || 0 }))}
            />
            <StatCard label="Reorder Rate" value={`${stats.reorderRate}%`} sub="Based on repeat segment" accent="text-[#2D1E6F]" />
            <StatCard label="RTO Rate" value={`${stats.rtoRate}%`} sub="Range average" accent="text-amber-600" />
            <StatCard 
               label="Delivered Rev" 
               value={formatCurrency(stats.totalRevenue)} 
               sub="Range success" 
               accent="text-[#2D1E6F]" 
               trend={getTrend(stats.totalRevenue, prevStats?.revenue)} 
               trendValue={getTrendValue(stats.totalRevenue, prevStats?.revenue)} 
               sparklineData={stats.dailyTrends.slice(-7).map((d: any) => ({ value: d.revenue || 0 }))}
            />
            
            <StatCard 
               label="Recovered" 
               value={formatCurrency(stats.abandonedStats.recovered)} 
               sub="Saved revenue" 
               accent="text-[#2D1E6F]" 
               trend={getTrend(stats.abandonedStats.recovered, prevStats?.abRecovered)} 
               trendValue={getTrendValue(stats.abandonedStats.recovered, prevStats?.abRecovered)} 
               sparklineData={stats.dailyTrends.slice(-7).map((d: any) => ({ value: d.revenue || 0 }))} 
            />
            <StatCard 
               label="Sales via Meta" 
               value={formatCurrency(stats.metaRevenue)} 
               sub="WhatsApp Attribution" 
               accent="text-blue-500" 
               className="border-blue-100 bg-blue-50/20" 
               trend={getTrend(stats.metaRevenue, prevStats?.metaRev)}
               trendValue={getTrendValue(stats.metaRevenue, prevStats?.metaRev)}
            />
            <StatCard 
               label="AOV" 
               value={formatCurrency(stats.totalRevenue / (stats.rawOrdersLogs.length || 1))} 
               sub="Average Order Value" 
               accent="text-blue-700" 
               className="border-blue-200 bg-blue-50/10" 
               trend={getTrend(stats.totalRevenue / (stats.rawOrdersLogs.length || 1), prevStats?.revenue / (prevStats?.totOrders || 1))}
               trendValue={getTrendValue(stats.totalRevenue / (stats.rawOrdersLogs.length || 1), prevStats?.revenue / (prevStats?.totOrders || 1))}
            />
            <StatCard 
               label="Shipping Cost" 
               value={formatCurrency(stats.shippingMetrics.averageCost)} 
               sub="Avg per shipment" 
               accent="text-gray-600" 
               sparklineData={stats.dailyTrends.slice(-7).map((d: any) => ({ value: d.calls || 0 }))}
            />
            <StatCard 
               label="Abandoned Carts" 
               value={stats.abandonedStats.count} 
               sub="Range drop" 
               accent="text-rose-600" 
               trend={getTrend(stats.abandonedStats.count, prevStats?.abCount)} 
               trendValue={getTrendValue(stats.abandonedStats.count, prevStats?.abCount)} 
               sparklineData={stats.dailyTrends.slice(-7).map((d: any) => ({ value: d.abandoned || 0 }))}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-3 card p-6 shadow-sm border-gray-100/50">
                <SectionTitle>
                  <TrendingUp className="w-4 h-4 text-[#2D1E6F]" />
                  Revenue & Average Order Value Trends
                </SectionTitle>
                <div className="h-[350px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.dailyTrends}>
                      <defs>
                        <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2D1E6F" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#2D1E6F" stopOpacity={0.01}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{fontSize: 10, fill: '#9ca3af'}} tickFormatter={(d) => format(new Date(d), "MMM dd")} axisLine={false} tickLine={false} />
                      <YAxis tick={{fontSize: 10, fill: '#9ca3af'}} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v>=1000 ? (v/1000).toFixed(1)+'k' : v}`} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
                        itemStyle={{ fontSize: '11px', fontWeight: '800' }}
                        formatter={(value: any) => [formatCurrency(value), ""]}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#2D1E6F" strokeWidth={4} fillOpacity={1} fill="url(#colorCurrent)" name="Sales" dot={{ r: 3, fill: '#2D1E6F', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                      <Line type="monotone" dataKey="prevRevenue" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Prev Sales" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card p-6 shadow-sm border-gray-100/50 bg-[#2D1E6F]/[0.02]">
                  <SectionTitle>
                    <ShoppingBag className="w-4 h-4 text-[#2D1E6F]" />
                    Financial Snapshot
                  </SectionTitle>
                  <div className="space-y-6 mt-6">
                      <div className="flex justify-between items-end">
                         <div className="flex flex-col"><span className="text-[10px] text-gray-400 font-bold uppercase">Gross Sales</span><span className="text-lg font-black text-gray-900">{formatCurrency(stats.totalRevenue * 1.12)}</span></div>
                         <span className="text-[10px] font-bold text-[#2D1E6F] bg-[#2D1E6F]/10 px-2 py-0.5 rounded-full">+12% Tax</span>
                      </div>
                      <div className="flex justify-between items-end border-t border-gray-50 pt-4">
                         <div className="flex flex-col"><span className="text-[10px] text-gray-400 font-bold uppercase">Net Sales</span><span className="text-lg font-black text-gray-900">{formatCurrency(stats.totalRevenue)}</span></div>
                         <span className="text-[10px] font-bold text-gray-400 italic">Excl. Returns</span>
                      </div>
                      <div className="flex justify-between items-end border-t border-gray-50 pt-4">
                         <div className="flex flex-col"><span className="text-[10px] text-gray-400 font-bold uppercase">Returns</span><span className="text-lg font-black text-rose-600">{formatCurrency(stats.totalRevenue * 0.04)}</span></div>
                         <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">-4% RTO</span>
                      </div>
                      <div className="pt-4 border-t border-gray-100 mt-4">
                         <div className="p-3 bg-white rounded-2xl border border-gray-100 shadow-sm">
                            <span className="text-[9px] font-black text-gray-400 uppercase block mb-1">Total Portfolio</span>
                            <span className="text-xl font-black text-[#2D1E6F]">{formatCurrency(stats.totalRevenue + stats.abandonedStats.recovered)}</span>
                         </div>
                      </div>
                  </div>
              </div>
          </div>

          <div className="space-y-6">

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
               <div className="xl:col-span-3 card p-6 shadow-sm border-gray-100/50">
                  <SectionTitle>
                    <Info className="w-4 h-4 text-blue-500" />
                    Most Popular Orders Location
                  </SectionTitle>
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-gray-100 italic">
                          <th className="py-2 text-[10px] font-bold text-gray-400 uppercase">State</th>
                          <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-center">Order Count</th>
                          <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-right">Revenue</th>
                          <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-right">Revenue %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {stats.stateDistribution.map(s => (
                          <tr 
                            key={s.state} 
                            onClick={() => setFilters({...filters, state: s.state})}
                            className={cn("hover:bg-[#2D1E6F]/5 cursor-pointer transition-colors group", filters.state === s.state && "bg-[#2D1E6F]/10")}
                          >
                            <td className="py-3 text-xs font-bold text-gray-600 uppercase tracking-tighter">{s.state}</td>
                            <td className="py-3 text-xs font-black text-gray-900 text-center">{s.count}</td>
                            <td className="py-3 text-xs font-black text-gray-900 text-right">{formatCurrency(s.revenue)}</td>
                            <td className="py-3 text-right">
                               <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#2D1E6F] rounded-full" style={{ width: `${s.share}%` }} />
                                  </div>
                                  <span className="text-[10px] font-black text-[#2D1E6F]">{s.share}%</span>
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </div>

               <div className="card p-6 shadow-sm border-gray-100/50 flex flex-col items-center">
                  <SectionTitle>
                    <RotateCcw className="w-4 h-4 text-[#2D1E6F]" />
                    Recovery Funnel
                  </SectionTitle>
                  <div className="flex-1 w-full flex flex-col justify-center items-center gap-4 mt-4">
                      <div className="w-full space-y-1">
                         <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase">
                            <span>Total Abandoned</span>
                            <span>{stats.funnelData.total}</span>
                         </div>
                         <div className="h-10 bg-rose-50 border border-rose-100 rounded-xl relative overflow-hidden flex items-center justify-center">
                            <div className="absolute inset-0 bg-rose-500/10" style={{ width: '100%' }} />
                            <span className="relative text-xs font-black text-rose-600">100% Entry</span>
                         </div>
                      </div>
                      <div className="w-4 h-4 text-gray-300">▼</div>
                      <div className="w-4/5 space-y-1">
                         <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase">
                            <span>Followed Up</span>
                            <span>{stats.funnelData.followed}</span>
                         </div>
                         <div className="h-10 bg-amber-50 border border-amber-100 rounded-xl relative overflow-hidden flex items-center justify-center">
                            <div className="absolute inset-0 bg-amber-500/10" style={{ width: `${stats.funnelData.total > 0 ? (stats.funnelData.followed / stats.funnelData.total) * 100 : 0}%` }} />
                            <span className="relative text-xs font-black text-amber-600">
                               {stats.funnelData.total > 0 ? Math.round((stats.funnelData.followed / stats.funnelData.total) * 100) : 0}% Attempt
                            </span>
                         </div>
                      </div>
                      <div className="w-4 h-4 text-gray-300">▼</div>
                      <div className="w-3/5 space-y-1">
                         <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase">
                            <span>Recovered</span>
                            <span>{stats.funnelData.recovered}</span>
                         </div>
                         <div className="h-10 bg-blue-50 border border-blue-100 rounded-xl relative overflow-hidden flex items-center justify-center">
                            <div className="absolute inset-0 bg-[#2D1E6F]/10" style={{ width: `${stats.funnelData.total > 0 ? (stats.funnelData.recovered / stats.funnelData.total) * 100 : 0}%` }} />
                            <span className="relative text-xs font-black text-[#2D1E6F]">
                               {stats.funnelData.total > 0 ? Math.round((stats.funnelData.recovered / stats.funnelData.total) * 100) : 0}% Success
                            </span>
                         </div>
                      </div>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-6 text-center italic">Calculated based on recovery attribution.</p>
               </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="card p-6 shadow-sm border-gray-100/50 bg-gradient-to-br from-white to-blue-50/10">
                <SectionTitle>
                  <Send className="w-4 h-4 text-blue-500" />
                  Top Automations
                </SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {stats.workflowPerformance.map(w => (
                    <div key={w.name} className="p-4 rounded-2xl bg-white border border-blue-50 shadow-sm flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{w.name}</span>
                        <span className="text-[10px] text-gray-400 font-bold">{w.conversions} Conversions</span>
                      </div>
                      <div className="text-sm font-black text-gray-900">{formatCurrency(w.revenue)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-6 shadow-sm border-gray-100/50">
                <SectionTitle>
                  <Users className="w-4 h-4 text-purple-500" />
                  Agent Productivity
                </SectionTitle>
                <div className="space-y-5 mt-6">
                  {stats.agentPerformance.slice(0, 5).map(a => (
                    <div key={a.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black text-gray-700 uppercase tracking-tighter">{a.name.split("@")[0]}</span>
                        <span className="font-black text-[#2D1E6F]">{formatCurrency(a.revenue)}</span>
                      </div>
                      <div className="h-2 bg-gray-50 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${(a.count / Math.max(...stats.agentPerformance.map(x=>x.count), 1)) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "shipping" && (
        <div className="space-y-6">
           <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              <div className="xl:col-span-3 card p-6 shadow-sm border-gray-100/50">
                 <SectionTitle>
                    <Package className="w-4 h-4 text-blue-500" />
                    Courier Performance Matrix
                 </SectionTitle>
                 <div className="overflow-x-auto mt-4">
                    <table className="w-full text-left">
                       <thead>
                          <tr className="border-b border-gray-100">
                             <th className="py-2 text-[10px] font-bold text-gray-400 uppercase">Courier Name</th>
                             <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-center">Total</th>
                             <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-center">Delivered %</th>
                             <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-center">RTO %</th>
                             <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-right">Performance</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-50">
                          {stats.shippingMetrics.courierDistribution.map(c => (
                             <tr key={c.name} className="hover:bg-gray-50/50 transition-colors">
                                <td className="py-3 text-xs font-bold text-gray-700 uppercase">{c.name}</td>
                                <td className="py-3 text-xs font-black text-gray-900 text-center">{c.total}</td>
                                <td className="py-3 text-xs font-black text-blue-600 text-center">{Math.round((c.delivered / c.total) * 100)}%</td>
                                <td className="py-3 text-xs font-black text-rose-600 text-center">{Math.round((c.rto / c.total) * 100)}%</td>
                                <td className="py-3 text-right">
                                   <div className="w-20 h-1.5 bg-gray-100 rounded-full ml-auto overflow-hidden">
                                      <div className="h-full bg-[#2D1E6F] rounded-full" style={{ width: `${(c.delivered / c.total) * 100}%` }} />
                                   </div>
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="card p-5">
                    <SectionTitle>Payment Split</SectionTitle>
                    <div className="h-[150px] w-full">
                       <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                             <Pie data={stats.shippingMetrics.paymentDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                                {stats.shippingMetrics.paymentDistribution.map((entry: any, index: number) => (
                                   <Cell key={`cell-${index}`} fill={index === 0 ? "#2D1E6F" : "#3b82f6"} />
                                ))}
                             </Pie>
                             <Tooltip />
                          </PieChart>
                       </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                       {stats.shippingMetrics.paymentDistribution.map((p: any, idx: number) => (
                          <div key={p.name} className="flex items-center gap-1.5">
                             <div className={cn("w-2 h-2 rounded-full", idx === 0 ? "bg-[#2D1E6F]" : "bg-blue-500")} />
                             <span className="text-[10px] font-bold text-gray-500">{p.name}</span>
                          </div>
                       ))}
                    </div>
                 </div>

                 <div className="card p-5">
                    <SectionTitle>Weight Profiles</SectionTitle>
                    <div className="space-y-3 mt-4">
                       {stats.shippingMetrics.weightDistribution.map((w: any) => (
                          <div key={w.name} className="space-y-1">
                             <div className="flex justify-between text-[10px] font-bold text-gray-500">
                                <span>{w.name}</span>
                                <span>{w.value}</span>
                             </div>
                             <div className="h-1 bg-gray-50 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-400" style={{ width: `${(w.value / stats.rawOrdersLogs.length) * 100}%` }} />
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

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
            </div>

            <div className="card p-5">
              <SectionTitle>Agent Performance</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 italic">
                      <th className="text-left py-2 text-xs text-gray-500 font-medium">Agent</th>
                      <th className="text-center py-2 text-xs text-gray-500 font-medium">Calls</th>
                      <th className="text-right py-2 text-xs text-gray-500 font-medium">Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats.agentPerformance.map(a => (
                      <tr key={a.name}>
                        <td className="py-2 text-xs font-semibold text-[#2D1E6F]">{a.name.split("@")[0]}</td>
                        <td className="py-2 text-center text-xs text-gray-600 font-bold">{a.count}</td>
                        <td className="py-2 text-right text-xs font-bold text-[#2D1E6F]">{formatCurrency(a.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "products" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 card p-6">
               <SectionTitle>Product Sales Matrix</SectionTitle>
               <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="border-b border-gray-100">
                           <th className="py-2 text-[10px] font-bold text-gray-400 uppercase">Product</th>
                           <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-center">Units</th>
                           <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-right">Revenue</th>
                           <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-right">Rev Share</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {stats.topProducts.map(p => (
                           <tr key={p.name} className="hover:bg-gray-50">
                              <td className="py-3 text-xs font-bold text-gray-700">{p.name}</td>
                              <td className="py-3 text-xs font-black text-gray-900 text-center">{p.count}</td>
                              <td className="py-3 text-xs font-black text-[#2D1E6F] text-right">{formatCurrency(p.revenue)}</td>
                              <td className="py-3 text-right">
                                 <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                                    {stats.totalRevenue > 0 ? Math.round((p.revenue / stats.totalRevenue) * 100) : 0}%
                                 </span>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
            
            <div className="card p-6 bg-gradient-to-br from-[#2D1E6F]/5 to-white">
               <SectionTitle>Revenue Distribution</SectionTitle>
               <div className="h-[300px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                        <Pie
                           data={stats.topProducts}
                           dataKey="revenue"
                           nameKey="name"
                           cx="50%"
                           cy="50%"
                           innerRadius={60}
                           outerRadius={80}
                           paddingAngle={2}
                        >
                           {stats.topProducts.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={["#2D1E6F", "#3b82f6", "#f59e0b", "#6366f1", "#ec4899"][index % 5]} />
                           ))}
                        </Pie>
                        <Tooltip />
                     </PieChart>
                  </ResponsiveContainer>
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "customers" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.segmentStats.map(s => (
              <StatCard key={s.segment} label={s.segment.toUpperCase()} value={s.count} sub={`Avg: ${s.avg_orders}`} />
            ))}
          </div>

          <div className="card p-5">
            <SectionTitle>Top 10 Performers (Customers)</SectionTitle>
            <div className="overflow-x-auto mt-4">
               <table className="w-full text-left">
                  <thead>
                     <tr className="border-b border-gray-100">
                        <th className="py-2 text-[10px] font-bold text-gray-400 uppercase">Customer</th>
                        <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-center">Orders</th>
                        <th className="py-2 text-[10px] font-bold text-gray-400 uppercase text-right">Lifetime Rev</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                     {stats.topCustomers.map(c => (
                        <tr key={c.id}>
                           <td className="py-3">
                              <div className="flex flex-col">
                                 <span className="text-xs font-bold text-gray-800">{c.name}</span>
                                 <span className="text-[10px] text-gray-400">{c.phone}</span>
                              </div>
                           </td>
                           <td className="py-3 text-xs font-black text-gray-700 text-center">{c.orders}</td>
                           <td className="py-3 text-xs font-black text-[#2D1E6F] text-right">{formatCurrency(c.revenue)}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          </div>

          <div className="card p-5">
            <SectionTitle>Product Performance Leaderboard</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {stats.topProducts.map(p => (
                    <div key={p.name} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-blue-50/10 hover:shadow-md transition-all">
                        <div className="flex flex-col gap-0.5 truncate pr-4">
                           <span className="text-xs font-bold text-gray-700 truncate">{p.name}</span>
                           <span className="text-[10px] text-[#2D1E6F] font-black">{p.count} Units Sold</span>
                        </div>
                        <div className="text-xs font-black text-gray-900 border-l border-blue-100 pl-4">{formatCurrency(p.revenue)}</div>
                    </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "recovery" && (
          <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard label="Total Abandoned" value={stats.abandonedStats.count} />
                  <StatCard label="Potential Revenue" value={formatCurrency(stats.abandonedStats.potential)} accent="text-rose-600" />
                  <StatCard label="Recovered Revenue" value={formatCurrency(stats.abandonedStats.recovered)} accent="text-[#2D1E6F]" />
                  <StatCard label="Recovery Rate" value={`${stats.abandonedStats.rate}%`} />
              </div>
          </div>
      )}

      {activeTab === "rto" && (
        <div className="space-y-5">
           <div className="card p-5">
            <SectionTitle>Recent RTO Events</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100"><th className="text-left py-2 px-2">Order</th><th className="text-left py-2 px-2">Customer</th><th className="text-left py-2 px-2">Value</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {stats.rtoOrders.map(r => (
                    <tr key={r.id}>
                      <td className="py-2 px-2 text-xs font-semibold text-[#2D1E6F]">#{r.order_number}</td>
                      <td className="py-2 px-2 text-xs text-gray-700">{r.customer?.name || "Unknown"}</td>
                      <td className="py-2 px-2 text-xs font-semibold text-[#2D1E6F]">{formatCurrency(r.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Modal open={showMasterExport} onClose={() => setShowMasterExport(false)} title="Master History Export" maxWidth="max-w-md"
        footer={<><button className="btn-secondary" onClick={() => setShowMasterExport(false)}>Cancel</button><button className="btn-primary" onClick={handleMasterExport} disabled={exportingMaster}>{exportingMaster ? "Exporting..." : "Generate Report"}</button></>}
      >
        <div className="space-y-6 py-2">
            <p className="text-xs text-gray-500 italic">This will generate a complete business mastery report containing every record in the system.</p>
            <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Format</label><div className="grid grid-cols-3 gap-2"><button onClick={() => setMasterExportOptions({...masterExportOptions, format: "xlsx"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", masterExportOptions.format === "xlsx" ? "bg-blue-50 border-blue-500" : "bg-white")}>EXCEL</button><button onClick={() => setMasterExportOptions({...masterExportOptions, format: "csv"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", masterExportOptions.format === "csv" ? "bg-blue-50 border-blue-500" : "bg-white")}>CSV</button><button onClick={() => setMasterExportOptions({...masterExportOptions, format: "pdf"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", masterExportOptions.format === "pdf" ? "bg-rose-50 border-rose-500" : "bg-white")}>PDF</button></div></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Destination</label><div className="grid grid-cols-2 gap-2"><button onClick={() => setMasterExportOptions({...masterExportOptions, destination: "download"})} className={cn("py-2 px-2 rounded-lg border text-[10px] font-bold", masterExportOptions.destination === "download" ? "bg-blue-50 border-blue-500" : "bg-white")}>LOCAL</button><button onClick={() => setMasterExportOptions({...masterExportOptions, destination: "whatsapp"})} className={cn("py-2 px-2 rounded-lg border text-[10px] font-bold", masterExportOptions.destination === "whatsapp" ? "bg-[#2D1E6F]/10 border-[#2D1E6F]" : "bg-white")}>WHATSAPP</button></div></div>
            </div>
            {masterExportOptions.destination === "whatsapp" && (<div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100"><input type="text" placeholder="Recipient Phone" value={masterExportOptions.customPhone} onChange={e => setMasterExportOptions({...masterExportOptions, customPhone: e.target.value})} className="input text-xs" /></div>)}
        </div>
      </Modal>

      <Modal open={showAdvancedExport} onClose={() => setShowAdvancedExport(false)} title="Advanced Report Export" maxWidth="max-w-xl"
        footer={<><button className="btn-secondary" onClick={() => setShowAdvancedExport(false)}>Cancel</button><button className="btn-primary" onClick={handleAdvancedExport} disabled={isExporting}>{isExporting ? "Processing..." : "Generate Report"}</button></>}
      >
        <div className="space-y-6 py-2">
            <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Select Sheets</label><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{["Summary", "Calls", "Orders", "Agents", "Products", "Recovery"].map(s => (<button key={s} onClick={() => setExportOptions({...exportOptions, sheets: {...exportOptions.sheets, [s.toLowerCase()]: !(exportOptions.sheets as any)[s.toLowerCase()]}})} className={cn("flex items-center gap-2 p-3 rounded-xl border text-[11px] font-bold", (exportOptions.sheets as any)[s.toLowerCase()] ? "bg-[#2D1E6F]/5 border-[#2D1E6F] text-[#2D1E6F]" : "bg-white border-gray-100")}>{s}</button>))}</div></div>
            <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Format</label><div className="grid grid-cols-3 gap-2"><button onClick={() => setExportOptions({...exportOptions, format: "xlsx"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", exportOptions.format === "xlsx" ? "bg-blue-50 border-blue-500" : "bg-white")}>EXCEL</button><button onClick={() => setExportOptions({...exportOptions, format: "csv"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", exportOptions.format === "csv" ? "bg-blue-50 border-blue-500" : "bg-white")}>CSV</button><button onClick={() => setExportOptions({...exportOptions, format: "pdf"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", exportOptions.format === "pdf" ? "bg-rose-50 border-rose-500" : "bg-white")}>PDF</button></div></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Destination</label><div className="grid grid-cols-2 gap-2"><button onClick={() => setExportOptions({...exportOptions, destination: "download"})} className={cn("py-2 px-2 rounded-lg border text-[10px] font-bold", exportOptions.destination === "download" ? "bg-blue-50 border-blue-500" : "bg-white")}>LOCAL</button><button onClick={() => setExportOptions({...exportOptions, destination: "whatsapp"})} className={cn("py-2 px-2 rounded-lg border text-[10px] font-bold", exportOptions.destination === "whatsapp" ? "bg-[#2D1E6F]/10 border-[#2D1E6F]" : "bg-white")}>WHATSAPP</button></div></div>
            </div>
        </div>
      </Modal>
    </div>
  );
}

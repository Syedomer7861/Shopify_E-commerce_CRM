"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Download, TrendingUp, TrendingDown, Loader2, ShoppingBag, BarChart3, ClipboardCheck, Users, Info, RefreshCw } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase";
import { cn, formatCurrency } from "@/lib/utils";
import { startOfMonth, endOfMonth, format, subMonths, isWithinInterval, subDays, differenceInDays } from "date-fns";
import toast from "react-hot-toast";
import { AccessDenied, Modal, Avatar, SectionTitle, BarRow } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { Smartphone, Send, Calendar, CheckSquare, FileSpreadsheet, FileText, Phone, Package, RotateCcw, FileType } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import IndiaSalesMap from "@/components/IndiaSalesMap";


export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "customers" | "rto" | "recovery" | "shipping" | "agents" | "attendance" | "products">("overview");
  const [loading, setLoading] = useState(true);
  const [exportingMaster, setExportingMaster] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    end: format(endOfMonth(new Date()), "yyyy-MM-dd")
  });
  const [showAdvancedExport, setShowAdvancedExport] = useState(false);
  const [showMasterExport, setShowMasterExport] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    sheets: { summary: true, calls: true, orders: true, agents: true, products: true, recovery: true, workflows: true, attendance: true, trends: true },
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
  const [stats, setStats] = useState<any>({
    totalCalls: 0,
    totalRevenue: 0,
    reorderRate: 0,
    rtoRate: 0,
    rtoRevenue: 0,
    deliveryBreakdown: [],
    segmentStats: [],
    rtoOrders: [],
    taskBreakdown: [],
    agentPerformance: [],
    dailyTrends: [],
    dailyTrendsPrev: [],
    topProducts: [],
    stateDistribution: [],
    funnelData: { total: 0, followed: 0, converted: 0, rate: 0 },
    revenueTrend: [],
    recentActivity: [],
    shippingMetrics: { courierDistribution: [], paymentDistribution: [], weightDistribution: [], averageCost: 0 },
    topCustomers: [],
    abandonedStats: { count: 0, potential: 0, recovered: 0, rate: 0 },
    workflowPerformance: [],
    metaRevenue: 0,
    agentAttendance: [],
    rawCallsLogs: [],
    rawOrdersLogs: [],
    rawAbandonedData: [],
    rawWorkflowLogs: [],
    dailyAttendanceLogs: [],
    aovTrend: []
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

  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useCurrentProfile();

  const formatDurationReport = (ms: number) => {
    const s = Math.floor((ms / 1000) % 60);
    const m = Math.floor((ms / (1000 * 60)) % 60);
    const h = Math.floor(ms / (1000 * 60 * 60));
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };





  const fetchAgentsAndStates = useCallback(async () => {
    const { data: pData } = await supabase
      .from("profiles")
      .select("id, name, role")
      .not("email", "ilike", "%demo%")
      .not("name", "ilike", "%demo%")
      .or('is_demo.is.null,is_demo.eq.false')
      .order("name");
    if (pData) setAgents(pData.map((p: any) => ({ id: p.id, name: p.name || p.id })));
    
    // Static common states as fallback for faster UI
    setStates(["Karnataka", "Maharashtra", "Delhi", "Gujarat", "Tamil Nadu", "West Bengal", "Uttar Pradesh", "Telangana", "Haryana", "Rajasthan", "Madhya Pradesh", "Other"]);
  }, [supabase]);



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

  const fetchAnalytics = useCallback(async (silent = false) => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      if (!silent) setLoading(true);
      const { MOCK_ANALYTICS } = await import("@/lib/mockData");
      
      // Map mock data to the stats structure
      setStats((prev: any) => ({
        ...prev,
        totalCalls: 150,
        totalRevenue: 45000,
        reorderRate: 35,
        rtoRate: 5,
        rtoRevenue: 3600,
        deliveryBreakdown: [
          { label: "Delivered", value: 120, color: "bg-[#1c1c1c]" },
          { label: "In Transit", value: 15, color: "bg-[#eceae4]" },
          { label: "RTO", value: 8, color: "bg-rose-500" },
          { label: "Pending", value: 7, color: "bg-gray-300" },
        ],
        dailyTrends: MOCK_ANALYTICS.sales.map(s => ({ date: s.date, revenue: s.amount, calls: 25, orders: 15, recovery: 5, rto: 1 })),
        topProducts: [
          { name: "Krill Oil Gold", count: 85, revenue: 25000 },
          { name: "Wellness Tea", count: 120, revenue: 15000 },
          { name: "Sleep Gummies", count: 45, revenue: 5000 },
        ],
        agentPerformance: MOCK_ANALYTICS.topAgents,
        agentAttendance: MOCK_ANALYTICS.topAgents.map(a => ({
          name: a.name,
          onlineHours: "08:00:00",
          breakHours: "01:00:00",
          taskCount: a.deals,
          productivity: a.conversion,
          status: "online"
        })),
        stateDistribution: [
          { state: "Maharashtra", revenue: 15000, share: 33 },
          { state: "Karnataka", revenue: 12000, share: 27 },
          { state: "Delhi", revenue: 8000, share: 18 },
        ],
        abandonedStats: { count: 45, potential: 12000, recovered: 4500, rate: 38 },
        dailyAttendanceLogs: [
          { date: new Date().toISOString(), name: "Demo Agent 1", status: "Present", clockIn: "09:00 AM", clockOut: "06:00 PM", workHours: "08:00:00", breakHours: "01:00:00", tasks: 25, revenue: 5000 },
          { date: new Date().toISOString(), name: "Demo Agent 2", status: "Present", clockIn: "09:30 AM", clockOut: "06:30 PM", workHours: "08:00:00", breakHours: "01:00:00", tasks: 18, revenue: 3200 }
        ],
        aovTrend: MOCK_ANALYTICS.sales.map(s => ({ date: s.date, aov: s.amount / 15 }))
      }));
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
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

        const [callsRes, ordersRes, abRes] = await Promise.all([
            callsQuery,
            ordersQuery,
            abQuery
        ]);

        if (callsRes.error) {
            console.error("Calls Query Error:", callsRes.error);
            // Fallback to simpler query if nested joins fail
            const fallback = await supabase.from("call_logs").select("*").gte("called_at", startISO).lte("called_at", endISO);
            callsRes.data = fallback.data as any;
        }

        const callsData = callsRes.data || [];
        const revData = ordersRes.data || [];
        const abData = abRes.data || [];
        const callsCount = callsRes.count || callsData.length;

        const revenue = revData?.filter(o => o.delivery_status === "delivered").reduce((acc, o) => acc + (Number(o.total_price) || 0), 0) || 0;
        const metaRev = revData?.reduce((acc, o) => acc + (Number(o.total_price) || 0), 0) || 0;
        // Real returned-order value, not a flat invented percentage of
        // revenue - reuses revData (same range/filters) rather than a
        // separate query.
        const rtoRevenue = revData?.filter(o => o.delivery_status === "rto").reduce((acc, o) => acc + (Number(o.total_price) || 0), 0) || 0;

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

        const { data: attData } = await supabase
            .from("agent_attendance")
            .select("*, profile:profiles(name, email)")
            .gte("created_at", s)
            .lte("created_at", e)
            .order("created_at", { ascending: true });

        return { callsCount, revenue, abCount, abRecovered, rtoCount, rtoRevenue, totOrders, metaRev, callsData, revData, abData, attData };
      }

      const current = await getStatsForRange(start, end);
      const previous = await getStatsForRange(prevStart, prevEnd);

      const { data: deliveryData } = await supabase.from("orders").select("delivery_status");
      const breakdown = [
        { label: "Delivered", color: "bg-[#1c1c1c]", key: "delivered" },
        { label: "In Transit", color: "bg-[#eceae4]", key: "in_transit" },
        { label: "RTO", color: "bg-rose-500", key: "rto" },
        { label: "Pending", color: "bg-gray-300", key: "pending" },
      ].map(b => ({
        label: b.label,
        value: deliveryData?.filter(o => o.delivery_status === b.key).length || 0,
        color: b.color
      }));

      // Manual Segment Aggregation (Safe fallback for missing views)
      const { data: allCustomers, error: custErr } = await supabase.from("customers").select("segment, total_orders");
      if (custErr) console.error("Customer Segment Fetch Error:", custErr);
      const segmentMap: Record<string, { count: number, orders: number }> = { 
          repeat: { count: 0, orders: 0 }, 
          one_time: { count: 0, orders: 0 }, 
          inactive: { count: 0, orders: 0 }, 
          risky: { count: 0, orders: 0 } 
      };
      allCustomers?.forEach(c => {
          const s = (c.segment || 'inactive') as keyof typeof segmentMap;
          if (segmentMap[s] !== undefined) {
              segmentMap[s].count++;
              segmentMap[s].orders += Number(c.total_orders || 0);
          }
      });

      const segmentStats = [
          { segment: "Repeat", count: segmentMap.repeat.count, color: "#1c1c1c", dot: "bg-[#1c1c1c]", avg_orders: segmentMap.repeat.count > 0 ? (segmentMap.repeat.orders / segmentMap.repeat.count).toFixed(1) : "0.0" },
          { segment: "One-time", count: segmentMap.one_time.count, color: "#5f5f5d", dot: "bg-[#5f5f5d]", avg_orders: segmentMap.one_time.count > 0 ? (segmentMap.one_time.orders / segmentMap.one_time.count).toFixed(1) : "0.0" },
          { segment: "Risky", count: segmentMap.risky.count, color: "#b45309", dot: "bg-amber-600", avg_orders: segmentMap.risky.count > 0 ? (segmentMap.risky.orders / segmentMap.risky.count).toFixed(1) : "0.0" },
          { segment: "Inactive", count: segmentMap.inactive.count, color: "#94a3b8", dot: "bg-gray-400", avg_orders: segmentMap.inactive.count > 0 ? (segmentMap.inactive.orders / segmentMap.inactive.count).toFixed(1) : "0.0" }
      ];

      const repeatCount = segmentMap.repeat.count;
      const totalCustCount = (allCustomers?.length || 0);
      const reorderRateValue = totalCustCount ? Math.round((Number(repeatCount) / Number(totalCustCount)) * 100) : 0;

      const taskOutcomes = [
        { label: "Confirmed", key: "done", color: "bg-[#1c1c1c]" },
        { label: "Rescheduled", key: "rescheduled", color: "bg-[#5f5f5d]" },
        { label: "No Answer", key: "no_answer", color: "bg-[#eceae4]" }
      ].map((o: any) => ({
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

      // --- Agent Attendance & Productivity (NEW) ---
      const attendanceSummary: Record<string, { name: string; workMs: number; breakMs: number; taskCount: number }> = {};
      
      // Initialize with agents from calls
      agentPerf.forEach(ap => {
          attendanceSummary[ap.name] = { name: ap.name, workMs: 0, breakMs: 0, taskCount: ap.count };
      });

      // Group attendance logs by agent
      const groupedLogs: Record<string, any[]> = {};
      current.attData?.forEach(log => {
          const name = log.profile?.name || log.profile?.email || log.agent_id;
          if (!groupedLogs[name]) groupedLogs[name] = [];
          groupedLogs[name].push(log);
      });

      // Calculate durations
      Object.entries(groupedLogs).forEach(([name, logs]) => {
          if (!attendanceSummary[name]) attendanceSummary[name] = { name, workMs: 0, breakMs: 0, taskCount: 0 };
          
          for (let i = 0; i < logs.length; i++) {
              const curr = logs[i];
              const next = logs[i+1];
              // If no next log, and it's TODAY, we could use Date.now(), but for reports we usually use the range end
              const endTime = next ? new Date(next.created_at).getTime() : new Date(end).getTime();
              const duration = Math.max(0, endTime - new Date(curr.created_at).getTime());
              
              if (curr.status === "online") attendanceSummary[name].workMs += duration;
              else if (curr.status === "break") attendanceSummary[name].breakMs += duration;
          }
      });

      const agentAttendance = Object.values(attendanceSummary).map((a: any) => {
          const onlineHoursDecimal = a.workMs / 3600000;
          const productivity = onlineHoursDecimal > 0 ? (a.taskCount / onlineHoursDecimal).toFixed(1) : "0.0";
          return {
              name: a.name,
              status: (a as any).lastStatus, // Capture status if available
              onlineHours: formatDurationReport(a.workMs),
              breakHours: formatDurationReport(a.breakMs),
              onlineSeconds: a.workMs / 1000,
              breakSeconds: a.breakMs / 1000,
              taskCount: a.taskCount,
              productivity
          };
      }).sort((a, b) => Number(b.productivity) - Number(a.productivity));

          const dailyTrendMap: Record<string, { calls: number; revenue: number; orders: number; recovery: number; rto: number }> = {};
      current.callsData?.forEach(c => {
          const date = format(new Date(c.called_at), "yyyy-MM-dd");
          if (!dailyTrendMap[date]) dailyTrendMap[date] = { calls: 0, revenue: 0, orders: 0, recovery: 0, rto: 0 };
          dailyTrendMap[date].calls++;
      });
      current.revData?.forEach(o => {
          const date = format(new Date(o.ordered_at), "yyyy-MM-dd");
          if (!dailyTrendMap[date]) dailyTrendMap[date] = { calls: 0, revenue: 0, orders: 0, recovery: 0, rto: 0 };
          dailyTrendMap[date].revenue += Number(o.total_price) || 0;
          dailyTrendMap[date].orders++;
          if (o.delivery_status === "rto") dailyTrendMap[date].rto++;
      });
      current.abData?.forEach(a => {
          if (a.recovery_status === "recovered") {
              const date = format(new Date(a.abandoned_at), "yyyy-MM-dd");
              if (!dailyTrendMap[date]) dailyTrendMap[date] = { calls: 0, revenue: 0, orders: 0, recovery: 0, rto: 0 };
              dailyTrendMap[date].recovery++;
          }
      });
      const dailyTrendArr = Object.entries(dailyTrendMap).map(([date, d]) => ({ date, ...d })).sort((a,b) => b.date.localeCompare(a.date));

      const states: Record<string, { count: number; revenue: number }> = {};
      current.revData?.forEach(o => {
          const s = (o.customer as any)?.state || "Other";
          if (!states[s]) states[s] = { count: 0, revenue: 0 };
          states[s].count++;
          states[s].revenue += Number(o.total_price) || 0;
      });
      // Was dividing each state's revenue (all orders, any status) by
      // current.revenue (delivered-only) - a much smaller denominator, so
      // shares summed to over 1000% instead of 100%. Compare against the
      // same total the per-state figures are drawn from.
      const totalStateRevenue = Object.values(states).reduce((acc, d) => acc + d.revenue, 0);
      const stateDist = Object.entries(states).map(([state, d]) => ({
          state,
          ...d,
          share: totalStateRevenue > 0 ? Math.round((d.revenue / totalStateRevenue) * 100) : 0
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
      // Same fix as State Distribution's share - the Product Sales Matrix
      // used stats.totalRevenue (delivered-only) as the denominator for a
      // line-item revenue that spans every order regardless of status.
      const totalProductRevenue = Object.values(productMap).reduce((acc, d) => acc + d.revenue, 0);

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
              const cost = parseFloat(metadata.shipping_cost);
              if (!isNaN(cost)) {
                  totalShippingCost += cost;
                  costCount++;
              }
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
      let workflowAll: any[] = [];
      
      try {
        const { data: wfData } = await supabase
          .from("workflow_instances")
          .select("*, workflows(name), orders:order_id(*)")
          .not("order_id", "is", null)
          .gte("created_at", start)
          .lte("created_at", end);
        
        workflowAll = wfData || [];
        workflowAll.forEach(instance => {
          const name = (instance as any).workflows?.name || "Unknown Automation";
          if (!workflowMap[name]) workflowMap[name] = { conversions: 0, revenue: 0 };
          workflowMap[name].conversions++;
          workflowMap[name].revenue += Number((instance as any).orders?.total_price) || 0;
        });
      } catch (wfErr) {
        console.error("Workflow attribution failed:", wfErr);
      }
      
      const workflowPerf = Object.entries(workflowMap).map(([name, d]) => ({ name, ...d })).sort((a,b) => b.revenue - a.revenue);

      // 7. Fetch Agent Attendance & Productivity
      const agentRes = await fetch(`/api/admin/analytics/agents?start=${start}&end=${end}`);
      const agentData = await agentRes.json();
      
      setPrevStats(previous);
      setStats({
        totalCalls: current.callsCount || 0,
        totalRevenue: current.revenue,
        reorderRate: reorderRateValue,
        rtoRate: current.totOrders ? Math.round((Number(current.rtoCount) / Number(current.totOrders)) * 100) : 0,
        rtoRevenue: current.rtoRevenue || 0,
        deliveryBreakdown: breakdown,
        segmentStats: segmentStats,
        rtoOrders: (current.revData || []).filter(o => o.delivery_status === "rto").slice(0, 10),
        taskBreakdown: taskOutcomes,
        agentPerformance: agentData.data || [],
        dailyTrends: dailyTrendArr,
        dailyTrendsPrev: [], // Simplified for stability
        topProducts,
        totalProductRevenue,
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
        rawWorkflowLogs: workflowAll || [],
        metaRevenue: current.metaRev,
        workflowPerformance: workflowPerf,
        agentAttendance: agentData.data || [],
        recentActivity: agentData.recentActivity || [],
        shippingMetrics: {
            averageCost: costCount > 0 ? totalShippingCost / costCount : 118,
            courierDistribution: Object.entries(courierMap).map(([name, d]) => ({ name, ...d })),
            paymentDistribution: Object.entries(paymentMap).map(([name, value]) => ({ name, value })),
            weightDistribution: Object.entries(weightMap).map(([name, value]) => ({ name, value }))
        },
        topCustomers,
        aovTrend: dailyTrendArr.map(t => ({ date: t.date, aov: t.revenue / (t.orders || 1) })),
        dailyAttendanceLogs: agentData.dailyLogs || []
      });

      if (agentData.success) {
          setStats((prev: any) => ({ 
              ...prev, 
              agentAttendance: agentData.data,
              recentActivity: agentData.recentActivity 
          }));
      }
    } catch (err: any) {
      console.error("fetchAnalytics failed:", err);
      toast.error("Failed to fetch analytics: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }, [dateRange, filters, supabase]);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange, filters, fetchAnalytics]);

  useEffect(() => {
    fetchAgentsAndStates();
  }, [fetchAgentsAndStates]);

  // Real-time Status Sync for Reports
  useEffect(() => {
    
    return () => {  };
  }, []);

  // Background Pulse: Silently refresh analytics every 30s
  useEffect(() => {
    if (activeTab !== "agents" && activeTab !== "attendance" && activeTab !== "overview") return;
    const interval = setInterval(() => {
      // Interaction Sentinel
      const isInteracting = document.activeElement?.tagName === 'INPUT' || 
                           document.activeElement?.tagName === 'TEXTAREA' ||
                           document.querySelector('[role="dialog"]');
      if (isInteracting) return;
      
      fetchAnalytics(true);
    }, 60000); // Throttled to 60s for reports
    return () => clearInterval(interval);
  }, [activeTab, fetchAnalytics]);

  useEffect(() => {
    if (loading || activeTab !== "agents") return;

    const interval = setInterval(() => {
      setStats((prev: any) => ({
        ...prev,
        agentAttendance: prev.agentAttendance.map((a: any) => {
          if (!a.status || a.status === "offline") return a;
          
          const newOnlineSeconds = a.status === "online" ? (Number(a.onlineSeconds) || 0) + 1 : (Number(a.onlineSeconds) || 0);
          const newBreakSeconds = a.status === "break" ? (Number(a.breakSeconds) || 0) + 1 : (Number(a.breakSeconds) || 0);
          
          return {
            ...a,
            onlineSeconds: newOnlineSeconds,
            breakSeconds: newBreakSeconds,
            onlineHours: formatDurationReport(newOnlineSeconds * 1000),
            breakHours: formatDurationReport(newBreakSeconds * 1000)
          };
        })
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [loading, activeTab]);

  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#5f5f5d] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Compiling Analytics Data...</p>
      </div>
    );
  }

  if (!hasPermission(profile, 'view_analytics')) {
    return (
      <AccessDenied 
        title="Intelligence Access Locked" 
        desc="Access to the Analytics Engine and Reporting Suite is restricted to authorized administrative personnel." 
      />
    );
  }

  async function generateMasterDataPDF() {
    setExportingMaster(true);
    try {
      const { data: allCustomers } = await supabase.from("customers").select("*").order("name");
      const { data: allOrders } = await supabase.from("orders").select("*, customer:customers(name, phone, state), workflow_instances(workflows(name))").order("ordered_at", { ascending: false });
      const { data: allCalls } = await supabase.from("call_logs").select("*, customer:customers(name, phone)").order("called_at", { ascending: false });
      const { data: allAB } = await supabase.from("abandoned_carts").select("*, customer:customers(name, phone)").order("abandoned_at", { ascending: false });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      pdf.setFillColor(28, 28, 28);
      pdf.rect(0, 0, pdfWidth, 40, 'F');
      pdf.setFontSize(22);
      pdf.setTextColor(255, 255, 255);
      pdf.text("CUREFOREVER — MASTER ARCHIVE", 10, 25);
      pdf.setFontSize(10);
      pdf.text(`Administrative Registry Audit | Generated: ${format(new Date(), "PPpp")}`, 10, 32);

      pdf.setTextColor(28, 28, 28);
      pdf.setFontSize(16);
      pdf.text("Customer Directory", 10, 50);
      autoTable(pdf, {
          startY: 55,
          head: [["Name", "Phone", "Segment", "Revenue", "State"]],
          body: (allCustomers || []).map((c: any) => [c.name, c.phone, c.segment, formatCurrency(c.total_spent || 0), c.state || "-"]),
          theme: 'grid',
          headStyles: { fillColor: [28, 28, 28] },
          styles: { fontSize: 8, cellPadding: 3 }
      });

      pdf.addPage();
      pdf.setTextColor(28, 28, 28);
      pdf.text("Order Attribution History", 10, 20);
      autoTable(pdf, {
          startY: 25,
          head: [["Order ID", "Customer", "Total", "Source", "Date"]],
          body: (allOrders || []).map((o: any) => [o.order_number, (o.customer as any)?.name || "-", formatCurrency(o.total_price), (o as any).workflow_instances?.workflows?.name || "Organic", format(new Date(o.ordered_at), "yyyy-MM-dd")]),
          theme: 'striped',
          headStyles: { fillColor: [28, 28, 28] }
      });

      pdf.addPage();
      pdf.setTextColor(245, 158, 11);
      pdf.text("Call Log Intelligence", 10, 20);
      autoTable(pdf, {
          startY: 25,
          head: [["Time", "Customer", "Outcome", "Agent"]],
          body: (allCalls || []).slice(0, 50).map((c: any) => [format(new Date(c.called_at), "HH:mm"), (c.customer as any)?.name || "-", c.outcome, c.agent_name]),
          headStyles: { fillColor: [245, 158, 11] }
      });

      pdf.addPage();
      pdf.setTextColor(225, 29, 72);
      pdf.text("Abandoned Cart Recovery Pipeline", 10, 20);
      autoTable(pdf, {
          startY: 25,
          head: [["Customer", "Total", "Status", "Date"]],
          body: (allAB || []).slice(0, 50).map((a: any) => [(a.customer as any)?.name || "-", formatCurrency(a.total_price), a.recovery_status, format(new Date(a.abandoned_at), "yyyy-MM-dd")]),
          headStyles: { fillColor: [225, 29, 72] }
      });

      pdf.addPage();
      pdf.setTextColor(124, 58, 237);
      pdf.text("Automation & Workflow ROI", 10, 20);
      autoTable(pdf, {
          startY: 25,
          head: [["Workflow", "Conversions", "Revenue"]],
          body: stats.workflowPerformance.map((w: any) => [w.name, w.conversions, formatCurrency(w.revenue)]),
          headStyles: { fillColor: [124, 58, 237] }
      });

      pdf.addPage();
      pdf.setTextColor(28, 28, 28);
      pdf.text("Agent Productivity Ledger", 10, 20);
      autoTable(pdf, {
          startY: 25,
          head: [["Agent", "Calls", "Revenue", "Productivity"]],
          body: stats.agentAttendance.map((a: any) => {
              const perf = stats.agentPerformance.find((p: any) => p.name === a.name);
              return [a.name, a.taskCount || 0, formatCurrency(perf?.revenue || 0), `${a.productivity || 0} T/H`];
          }),
          headStyles: { fillColor: [28, 28, 28] }
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
      const { data: allCalls } = await supabase.from("call_logs").select("*, customer:customers(name, phone)").order("called_at", { ascending: false });
      const { data: allAB } = await supabase.from("abandoned_carts").select("*, customer:customers(name, phone)").order("abandoned_at", { ascending: false });
      const { data: allWorkflows } = await supabase.from("workflow_instances").select("*, workflows(name), customers(name, phone)").not("order_id", "is", null);

      const wb = XLSX.utils.book_new();
      
      const custHeaders = ["Name", "Phone", "Email", "Segment", "Total Spent", "State", "Orders"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([custHeaders, ...(allCustomers || []).map((c: any) => [c.name, c.phone, c.email || "-", c.segment, c.total_spent, c.state, c.total_orders])]), "Customers");

      const orderHeaders = ["Order No", "Customer", "Revenue", "Status", "Attribution", "Date"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([orderHeaders, ...(allOrders || []).map((o: any) => [o.order_number, (o.customer as any)?.name, o.total_price, o.delivery_status, (o as any).workflow_instances?.workflows?.name || "Organic", format(new Date(o.ordered_at), "yyyy-MM-dd")])]), "Orders");

      const abHeaders = ["Customer", "Phone", "Total", "Status", "Abandoned At"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([abHeaders, ...(allAB || []).map((a: any) => [(a.customer as any)?.name, (a.customer as any)?.phone, a.total_price, a.recovery_status, format(new Date(a.abandoned_at), "yyyy-MM-dd")])]), "Abandoned Carts");

      const callHeaders = ["Time", "Customer", "Phone", "Outcome", "Agent", "Note"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([callHeaders, ...(allCalls || []).map((c: any) => [format(new Date(c.called_at), "PPpp"), (c.customer as any)?.name, (c.customer as any)?.phone, c.outcome, c.agent_name, c.note])]), "Call Logs");

      const wfHeaders = ["Workflow", "Customer", "Phone", "Order ID", "Date"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([wfHeaders, ...(allWorkflows || []).map((w: any) => [(w.workflows as any)?.name, (w.customers as any)?.name, (w.customers as any)?.phone, w.order_id, format(new Date(w.created_at), "yyyy-MM-dd")])]), "Automations");

      const agentHeaders = ["Agent Name", "Total Tasks", "Attributed Revenue", "Productivity", "Status"];
      const agentDataArr = stats.agentAttendance.map((a: any) => [a.name, a.taskCount, a.revenue, `${a.productivity} T/H`, a.status || "Offline"]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([agentHeaders, ...agentDataArr]), "Agent Performance");

      const trendHeaders = ["Date", "Total Revenue", "Orders", "Calls", "Recoveries", "RTOs"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([trendHeaders, ...stats.dailyTrends.map((t: any) => [t.date, t.revenue, t.orders, t.calls, t.recovery, t.rto])]), "Daily Trends");

      const attendanceHeaders = ["Date", "Agent", "Clock In", "Clock Out", "Work Hours", "Break Hours", "Net Hours", "Tasks", "Revenue"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([attendanceHeaders, ...stats.dailyAttendanceLogs.map((a: any) => [a.date, a.name, a.clockIn, a.clockOut, a.workHours, a.breakHours, a.netHours, a.tasks, a.revenue])]), "Attendance Register");

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
        const orders = [["Order No", "Customer", "Phone", "Total", "Status", "Date"], ...stats.rawOrdersLogs.map((o: any) => [o.order_number, o.customer?.name, o.customer?.phone, o.total_price, o.delivery_status, format(new Date(o.ordered_at), "yyyy-MM-dd")])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orders), "Orders");
      }

      if (exportOptions.sheets.calls) {
        const calls = [["Timestamp", "Customer", "Phone", "Outcome", "Disposition", "Agent", "Note"], ...stats.rawCallsLogs.map((c: any) => [format(new Date(c.called_at), "PPpp"), c.customer?.name, c.customer?.phone, c.outcome, c.disposition, c.agent_name, c.note])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(calls), "Call Logs");
      }

      if (exportOptions.sheets.attendance) {
        const attendance = [["Date", "Agent", "Status", "Clock In", "Clock Out", "Work Hours", "Break Hours", "Net Hours", "Tasks", "Revenue"], ...stats.dailyAttendanceLogs.map((a: any) => [a.date, a.name, a.status, a.clockIn, a.clockOut, a.workHours, a.breakHours, a.netHours, a.tasks, a.revenue])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attendance), "Attendance Register");
      }

      if (exportOptions.sheets.agents) {
        const agentHeaders = ["Agent Name", "Total Calls", "Attributed Revenue", "Productivity", "Status"];
        const agentData = stats.agentAttendance.map((a: any) => {
          const perf = stats.agentPerformance.find((p: any) => p.name === a.name);
          return [a.name, a.taskCount || perf?.calls || 0, perf?.revenue || 0, `${a.productivity || 0} T/H`, a.status || "Offline"];
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([agentHeaders, ...agentData]), "Agent Analytics");
      }

      if (exportOptions.sheets.products) {
        const products = [["Product Name", "Units Sold", "Total Revenue"], ...stats.topProducts.map((p: any) => [p.name, p.count, p.revenue])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(products), "Product Analytics");
      }

      if (exportOptions.sheets.recovery) {
        const recovery = [["Customer", "Phone", "Cart Total", "Status", "Abandoned Date"], ...stats.rawAbandonedData.map((a: any) => [a.customer?.name, a.customer?.phone, a.total_price, a.recovery_status, format(new Date(a.abandoned_at), "yyyy-MM-dd")])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recovery), "Abandoned Recovery");
      }

      if (exportOptions.sheets.workflows) {
        const wfs = [["Workflow", "Customer", "Order ID", "Status", "Date"], ...stats.rawWorkflowLogs.map((w: any) => [w.workflows?.name, w.orders?.customer?.name || "Customer", w.order_id, w.status, format(new Date(w.created_at), "yyyy-MM-dd")])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wfs), "Workflow Attribution");
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
          const reportElement = document.getElementById('analytics-report-wrapper');
          if (!reportElement) throw new Error("Report content not found");
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const canvas = await html2canvas(reportElement, { scale: 3, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1400 });
          const imgData = canvas.toDataURL('image/png');
          const canvasWidth = pdfWidth - 20;
          const canvasHeight = (canvas.height * canvasWidth) / canvas.width;

          pdf.setFillColor(28, 28, 28);
          pdf.rect(0, 0, pdfWidth, 45, 'F');
          pdf.setFontSize(22);
          pdf.setTextColor(255, 255, 255);
          pdf.text("CUREFOREVER — PERFORMANCE DOSSIER", 10, 22);
          pdf.setFontSize(10);
          pdf.text(`High-Fidelity Performance Audit | ${dateRange.start} — ${dateRange.end}`, 10, 30);
          pdf.addImage(imgData, 'PNG', 10, 50, canvasWidth, canvasHeight);

          // Logistics Page
          pdf.addPage();
          pdf.setTextColor(28, 28, 28);
          pdf.setFontSize(16);
          pdf.text("Logistics & Shipping Intelligence", 10, 20);
          autoTable(pdf, {
              startY: 25,
              head: [["Courier", "Total", "Delivered %", "RTO %"]],
              body: stats.shippingMetrics.courierDistribution.map((c: any) => [
                  c.name, 
                  c.total, 
                  `${Math.round((c.delivered / c.total) * 100)}%`,
                  `${Math.round((c.rto / c.total) * 100)}%`
              ]),
              headStyles: { fillColor: [28, 28, 28] }
          });
 
          // Agent Performance Page
          if (exportOptions.sheets.agents) {
              pdf.addPage();
              pdf.setTextColor(28, 28, 28);
              pdf.setFontSize(16);
              pdf.text("Agent Productivity Ledger", 10, 20);
              autoTable(pdf, {
                  startY: 25,
                                    head: [["Agent", "Tasks", "Revenue", "Productivity"]],
                  body: stats.agentAttendance.map((a: any) => [a.name, a.taskCount, formatCurrency(a.revenue), `${a.productivity} T/H`]),

                  headStyles: { fillColor: [28, 28, 28] }
              });
          }

          // Products Page
          if (exportOptions.sheets.products) {
              pdf.addPage();
              pdf.setTextColor(28, 28, 28);
              pdf.setFontSize(16);
              pdf.text("Top Product Performance", 10, 20);
              autoTable(pdf, {
                  startY: 25,
                  head: [["Product", "Units Sold", "Revenue"]],
                  body: stats.topProducts.map((p: any) => [p.name, p.count, formatCurrency(p.revenue)]),
                  headStyles: { fillColor: [28, 28, 28] }
              });
          }

          if (exportOptions.sheets.orders) {
              pdf.addPage();
              pdf.setTextColor(28, 28, 28);
              pdf.setFontSize(16);
              pdf.text("Detailed Order Transaction Ledger", 10, 20);
              autoTable(pdf, {
                  startY: 25,
                  head: [["ID", "Customer", "Total", "Status", "Date"]],
                  body: stats.rawOrdersLogs.slice(0, 100).map((o: any) => [o.order_number, (o.customer as any)?.name || "-", formatCurrency(o.total_price), o.delivery_status, format(new Date(o.ordered_at), "MMM dd")]),
                  headStyles: { fillColor: [28, 28, 28] }
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
                  body: stats.rawCallsLogs.slice(0, 100).map((c: any) => [format(new Date(c.called_at), "HH:mm"), c.customer?.name || "-", c.outcome, c.agent_name]),
                  headStyles: { fillColor: [245, 158, 11] }
              });
          }
  
          // Abandoned Recovery Page
          if (exportOptions.sheets.recovery) {
              pdf.addPage();
              pdf.setTextColor(225, 29, 72);
              pdf.setFontSize(16);
              pdf.text("Abandoned Cart Recovery Pipeline", 10, 20);
              autoTable(pdf, {
                  startY: 25,
                  head: [["Customer", "Total", "Status", "Date"]],
                  body: stats.rawAbandonedData.map((a: any) => [a.customer?.name || "-", formatCurrency(a.total_price), a.recovery_status, format(new Date(a.abandoned_at), "yyyy-MM-dd")]),
                  headStyles: { fillColor: [225, 29, 72] }
              });
          }

          // Workflows Page
          if (exportOptions.sheets.workflows) {
              pdf.addPage();
              pdf.setTextColor(124, 58, 237);
              pdf.setFontSize(16);
              pdf.text("Automation & Workflow ROI", 10, 20);
              autoTable(pdf, {
                  startY: 25,
                  head: [["Workflow", "Conversions", "Revenue"]],
                  body: stats.workflowPerformance.map((w: any) => [w.name, w.conversions, formatCurrency(w.revenue)]),
                  headStyles: { fillColor: [124, 58, 237] }
              });
          }

          // Attendance Register Page
          if (exportOptions.sheets.trends) {
              pdf.addPage();
              pdf.setTextColor(28, 28, 28);
              pdf.setFontSize(16);
              pdf.text("HR Attendance Register (Clock Logs)", 10, 20);
              autoTable(pdf, {
                  startY: 25,
                  head: [["Date", "Agent", "Clock In", "Clock Out", "Tasks", "Revenue"]],
                  body: stats.dailyAttendanceLogs.map((a: any) => [a.date, a.name, a.clockIn, a.clockOut, a.tasks, formatCurrency(a.revenue)]),
                  headStyles: { fillColor: [28, 28, 28] }
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
    { key: "agents", label: "Agents", icon: Users },
    { key: "attendance", label: "Attendance", icon: Calendar },
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
        subtitle={
          <div className="flex items-center gap-3 bg-[#eceae4]/30 px-3 py-1.5 rounded-full border border-[#eceae4] w-fit mt-1">
            <Calendar className="w-3.5 h-3.5 text-[#1c1c1c]/60" />
            <input 
              type="date" 
              value={dateRange.start} 
              onChange={e => setDateRange({...dateRange, start: e.target.value})} 
              className="bg-transparent border-none p-0 text-xs font-bold text-[#1c1c1c] focus:ring-0 w-[90px]" 
            />
            <span className="text-[#5f5f5d]/40 font-bold">to</span>
            <input 
              type="date" 
              value={dateRange.end} 
              onChange={e => setDateRange({...dateRange, end: e.target.value})} 
              className="bg-transparent border-none p-0 text-xs font-bold text-[#1c1c1c] focus:ring-0 w-[90px]" 
            />
          </div>
        }
        actions={
          <div className="flex gap-2">
            <div className="hidden md:flex flex-col items-end mr-4">
              <span className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest opacity-60">Report Delivery</span>
              <span className="text-[11px] font-bold text-[#1c1c1c]">Excel • PDF • WhatsApp</span>
            </div>
            <button 
              disabled={exportingMaster}
              onClick={() => setShowMasterExport(true)} 
              className="btn-secondary"
            >
              {exportingMaster ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileType className="w-4 h-4" />} 
              Full Archive
            </button>
            <button onClick={() => setShowAdvancedExport(true)} className="btn-primary shadow-lg shadow-[#1c1c1c]/20">
              <Download className="w-4 h-4" /> Download Report
            </button>
          </div>
        }
      />

      {/* Filter Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 mb-10 p-5 bg-[#f7f4ed] rounded-2xl border border-[#eceae4] animate-slide-up">
         <div className="flex items-center gap-1.5 flex-wrap flex-1">
            <span className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mr-2 opacity-60">Presets:</span>
            {[
              { label: "Today", value: "today" },
              { label: "L7D", value: "last7" },
              { label: "L30D", value: "last30" },
              { label: "MTD", value: "mtd" },
              { label: "Prev Month", value: "prevMonth" },
            ].map((p: any) => (
              <button 
                key={p.value} 
                onClick={() => setRangePreset(p.value as any)}
                className="px-3 py-1 text-[10px] font-bold text-[#5f5f5d] bg-[#eceae4]/40 hover:bg-[#1c1c1c] hover:text-[#fcfbf8] rounded-full transition-all"
              >
                {p.label}
              </button>
            ))}
         </div>
         
         <div className="flex gap-3 flex-wrap items-center">
            <div className="flex items-center gap-2 bg-[#eceae4]/20 px-3 py-1.5 rounded-lg border border-[#eceae4]">
               <Users className="w-3.5 h-3.5 text-[#5f5f5d]" />
               <select 
                 className="bg-transparent border-none p-0 text-[11px] font-bold text-[#1c1c1c] focus:ring-0 min-w-[120px]"
                 value={filters.agentId}
                 onChange={e => setFilters({...filters, agentId: e.target.value})}
               >
                 <option value="all">Global Performance</option>
                 {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
               </select>
            </div>

            <div className="flex items-center gap-2 bg-[#eceae4]/20 px-3 py-1.5 rounded-lg border border-[#eceae4]">
               <Package className="w-3.5 h-3.5 text-[#5f5f5d]" />
               <select 
                 className="bg-transparent border-none p-0 text-[11px] font-bold text-[#1c1c1c] focus:ring-0 min-w-[120px]"
                 value={filters.state}
                 onChange={e => setFilters({...filters, state: e.target.value})}
               >
                 <option value="all">All Regions</option>
                 {states.map(s => <option key={s} value={s}>{s}</option>)}
               </select>
            </div>

            {(filters.agentId !== "all" || filters.state !== "all" || filters.paymentMode !== "all" || filters.segment !== "all") && (
               <button 
                 onClick={() => setFilters({ agentId: "all", state: "all", taskType: "all", paymentMode: "all", segment: "all" })}
                 className="text-[10px] font-bold text-rose-600 hover:underline px-2"
               >
                 Reset
               </button>
            )}
         </div>
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar mb-10">
        {tabs.map(t => (
          <button 
            key={t.key} 
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "px-5 py-2.5 text-[13px] font-[600] rounded-full transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === t.key 
                ? "bg-[#1c1c1c] text-[#fcfbf8] shadow-sm" 
                : "bg-[#eceae4]/50 text-[#5f5f5d] hover:bg-[#eceae4]"
            )}
          >
            <t.icon className={cn("w-4 h-4", activeTab === t.key ? "text-[#fcfbf8]" : "text-[#5f5f5d]")} />
            {t.label}
          </button>
        ))}
      </div>

      <div id="analytics-report-wrapper" className="space-y-6">
      {activeTab === "attendance" && (
         <div className="space-y-6">
            <div className="card p-6">
               <SectionTitle>
                  <Calendar className="w-3.5 h-3.5 text-[#1c1c1c]" />
                  HR Attendance Register (Clock Logs)
               </SectionTitle>
               <div className="overflow-x-auto mt-6">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="border-b border-[#eceae4]">
                           <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Date</th>
                           <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Agent</th>
                           <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Status</th>
                           <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">In</th>
                           <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Out</th>
                           <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Work</th>
                           <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Break</th>
                           <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Tasks</th>
                           <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase text-right tracking-widest">Revenue</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-[#eceae4]/50">
                        {stats.dailyAttendanceLogs.length > 0 ? stats.dailyAttendanceLogs.map((log: any, idx: number) => (
                           <tr key={`${log.date}-${log.name}-${idx}`} className="hover:bg-[rgba(28,28,28,0.02)] transition-colors">
                              <td className="py-4 text-xs font-bold text-[#1c1c1c]">{format(new Date(log.date), "MMM dd, yyyy")}</td>
                              <td className="py-4 text-xs font-bold text-[#1c1c1c] uppercase">{log.name.split("@")[0]}</td>
                              <td className="py-4 text-xs font-bold">
                                 <span className={cn(
                                    "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                                    log.status === "Present" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                 )}>
                                    {log.status}
                                 </span>
                              </td>
                              <td className="py-4 text-xs font-bold text-[#5f5f5d] text-center tabular-nums">{log.clockIn}</td>
                              <td className="py-4 text-xs font-bold text-[#5f5f5d] text-center tabular-nums">{log.clockOut}</td>
                              <td className="py-4 text-xs font-bold text-emerald-600 text-center tabular-nums">{log.workHours}</td>
                              <td className="py-4 text-xs font-bold text-amber-600 text-center tabular-nums">{log.breakHours}</td>
                              <td className="py-4 text-xs font-bold text-[#1c1c1c] text-center">{log.tasks}</td>
                              <td className="py-4 text-xs font-bold text-[#1c1c1c] text-right">{formatCurrency(log.revenue)}</td>
                           </tr>
                        )) : (
                           <tr>
                              <td colSpan={9} className="py-12 text-center text-xs text-[#5f5f5d] italic font-medium opacity-60">
                                 No attendance logs found for the selected range.
                              </td>
                           </tr>
                        )}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      )}
      
      {activeTab === "overview" && (
        <div className="space-y-6 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
               label="Total Calls" 
               value={stats.totalCalls} 
               sub="Selected range" 
               accent="text-[#1c1c1c]" 
               trend={getTrend(stats.totalCalls, prevStats?.callsCount)} 
               trendValue={getTrendValue(stats.totalCalls, prevStats?.callsCount)} 
               sparklineData={stats.dailyTrends.slice(-7).map((d: any) => ({ value: d.calls || 0 }))}
            />
            <StatCard 
               label="Total Orders" 
               value={stats.rawOrdersLogs.length} 
               sub="Gross volume" 
               trend={getTrend(stats.rawOrdersLogs.length, prevStats?.totOrders)} 
               trendValue={getTrendValue(stats.rawOrdersLogs.length, prevStats?.totOrders)} 
               sparklineData={stats.dailyTrends.slice(-7).map((d: any) => ({ value: d.orders || 0 }))}
            />
            <StatCard label="Reorder Rate" value={`${stats.reorderRate}%`} sub="Repeat segment" />
            <StatCard label="RTO Rate" value={`${stats.rtoRate}%`} sub="Range average" accent="text-amber-700" />
            <StatCard 
               label="Delivered Rev" 
               value={formatCurrency(stats.totalRevenue)} 
               sub="Range success" 
               trend={getTrend(stats.totalRevenue, prevStats?.revenue)} 
               trendValue={getTrendValue(stats.totalRevenue, prevStats?.revenue)} 
               sparklineData={stats.dailyTrends.slice(-7).map((d: any) => ({ value: d.revenue || 0 }))}
            />
            
            <StatCard 
               label="Recovered" 
               value={formatCurrency(stats.abandonedStats.recovered)} 
               sub="Saved revenue" 
               trend={getTrend(stats.abandonedStats.recovered, prevStats?.abRecovered)} 
               trendValue={getTrendValue(stats.abandonedStats.recovered, prevStats?.abRecovered)} 
            />
            <StatCard
               label="Gross Volume"
               value={formatCurrency(stats.metaRevenue)}
               sub="All orders, any status"
               accent="text-[#1c1c1c]"
               trend={getTrend(stats.metaRevenue, prevStats?.metaRev)}
               trendValue={getTrendValue(stats.metaRevenue, prevStats?.metaRev)}
            />
            <StatCard 
               label="AOV" 
               value={formatCurrency(stats.totalRevenue / (stats.rawOrdersLogs.length || 1))} 
               sub="Avg Order Value" 
               trend={getTrend(stats.totalRevenue / (stats.rawOrdersLogs.length || 1), prevStats?.revenue / (prevStats?.totOrders || 1))}
               trendValue={getTrendValue(stats.totalRevenue / (stats.rawOrdersLogs.length || 1), prevStats?.revenue / (prevStats?.totOrders || 1))}
            />
            <StatCard 
               label="Abandoned" 
               value={stats.abandonedStats.count} 
               sub="Range drop" 
               accent="text-rose-600" 
               trend={getTrend(stats.abandonedStats.count, prevStats?.abCount)} 
               trendValue={getTrendValue(stats.abandonedStats.count, prevStats?.abCount)} 
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-3 card p-6 shadow-sm border-gray-100/50">
                <SectionTitle>
                  <TrendingUp className="w-3.5 h-3.5 text-[#1c1c1c]/60" />
                  Performance Trends
                </SectionTitle>
                <div className="h-[350px] w-full mt-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.dailyTrends}>
                      <defs>
                        <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1c1c1c" stopOpacity={0.08}/>
                          <stop offset="95%" stopColor="#1c1c1c" stopOpacity={0.01}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceae4" />
                      <XAxis dataKey="date" tick={{fontSize: 10, fill: '#5f5f5d'}} tickFormatter={(d) => format(new Date(d), "MMM dd")} axisLine={false} tickLine={false} dy={10} />
                      <YAxis tick={{fontSize: 10, fill: '#5f5f5d'}} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v>=1000 ? (v/1000).toFixed(1)+'k' : v}`} dx={-10} />
                      <Tooltip 
                        contentStyle={{ background: '#1c1c1c', border: 'none', borderRadius: '8px' }}
                        itemStyle={{ color: '#fcfbf8' }}
                        labelStyle={{ color: '#fcfbf8' }}
                        formatter={(value: any) => [formatCurrency(value), "Sales"]}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#1c1c1c" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCurrent)" name="Sales" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#1c1c1c' }} />
                      <Line type="monotone" dataKey="prevRevenue" stroke="#5f5f5d" strokeWidth={1} strokeDasharray="4 4" dot={false} name="Prev" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card p-6 bg-[#1c1c1c] text-[#fcfbf8] border-none shadow-xl shadow-[#1c1c1c]/10">
                  <h2 className="text-[10px] font-bold uppercase tracking-[2px] opacity-60 mb-6">Financial Ledger</h2>
                  <div className="space-y-6">
                      <div className="flex justify-between items-end border-b border-[#fcfbf8]/10 pb-4">
                         <div className="flex flex-col"><span className="text-[10px] text-[#fcfbf8]/60 font-bold uppercase tracking-wider">Net Sales</span><span className="text-xl font-bold tracking-tight">{formatCurrency(stats.totalRevenue)}</span></div>
                         <span className="text-[10px] font-bold text-[#fcfbf8]/40 italic">Delivered orders</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-[#fcfbf8]/10 pb-4">
                         <div className="flex flex-col"><span className="text-[10px] text-[#fcfbf8]/60 font-bold uppercase tracking-wider">Returns</span><span className="text-xl font-bold tracking-tight text-rose-400">{formatCurrency(stats.rtoRevenue)}</span></div>
                         <span className="text-[10px] font-bold text-rose-400">-{stats.rtoRate}% RTO</span>
                      </div>
                      <div className="pt-4">
                         <div className="p-4 bg-[#fcfbf8]/10 rounded-xl">
                            <span className="text-[9px] font-bold text-[#fcfbf8]/60 uppercase block mb-1 tracking-widest">Revenue Impact</span>
                            <span className="text-2xl font-bold tracking-tighter text-emerald-400">{formatCurrency(stats.totalRevenue + stats.abandonedStats.recovered)}</span>
                            <span className="text-[9px] text-[#fcfbf8]/40 italic block mt-1">Net Sales + Recovered Carts</span>
                         </div>
                      </div>
                  </div>
              </div>
          </div>

          <div className="space-y-6">

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
               <div className="xl:col-span-3 card p-6">
                  <SectionTitle>
                    <Info className="w-3.5 h-3.5 text-[#1c1c1c]" />
                    State Distribution
                  </SectionTitle>
                  <div className="overflow-x-auto mt-6">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-[#eceae4]">
                          <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">State</th>
                          <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Orders</th>
                          <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-right tracking-widest">Revenue</th>
                          <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-right tracking-widest">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eceae4]/50">
                        {stats.stateDistribution.map((s: any) => (
                          <tr 
                            key={s.state} 
                            onClick={() => setFilters({...filters, state: s.state})}
                            className={cn("hover:bg-[rgba(28,28,28,0.02)] cursor-pointer transition-colors group", filters.state === s.state && "bg-[rgba(28,28,28,0.04)]")}
                          >
                            <td className="py-4 text-xs font-bold text-[#1c1c1c] uppercase tracking-tight">{s.state}</td>
                            <td className="py-4 text-xs font-bold text-[#5f5f5d] text-center">{s.count}</td>
                            <td className="py-4 text-xs font-bold text-[#1c1c1c] text-right">{formatCurrency(s.revenue)}</td>
                            <td className="py-4 text-right">
                               <div className="flex items-center justify-end gap-3">
                                  <div className="w-20 h-1.5 bg-[#eceae4] rounded-full overflow-hidden">
                                    <div className="h-full bg-[#1c1c1c] rounded-full" style={{ width: `${s.share}%` }} />
                                  </div>
                                  <span className="text-[10px] font-bold text-[#1c1c1c] min-w-[30px]">{s.share}%</span>
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </div>

               <div className="card p-6 flex flex-col items-center">
                  <SectionTitle>
                    <RotateCcw className="w-3.5 h-3.5 text-[#1c1c1c]" />
                    Recovery Pipeline
                  </SectionTitle>
                  <div className="flex-1 w-full flex flex-col justify-center items-center gap-6 mt-8">
                      <div className="w-full space-y-1.5">
                         <div className="flex justify-between text-[9px] font-bold text-[#5f5f5d] uppercase tracking-widest">
                            <span>Total Leads</span>
                            <span>{stats.funnelData.total}</span>
                         </div>
                         <div className="h-10 bg-[#eceae4]/40 border border-[#eceae4] rounded-lg relative overflow-hidden flex items-center justify-center">
                            <div className="absolute inset-0 bg-[#1c1c1c]/5" style={{ width: '100%' }} />
                            <span className="relative text-[11px] font-bold text-[#1c1c1c]">100% Entry</span>
                         </div>
                      </div>
                      
                      <div className="w-full space-y-1.5 px-4">
                         <div className="flex justify-between text-[9px] font-bold text-[#5f5f5d] uppercase tracking-widest">
                            <span>Engagement</span>
                            <span>{stats.funnelData.followed}</span>
                         </div>
                         <div className="h-10 bg-[#eceae4]/40 border border-[#eceae4] rounded-lg relative overflow-hidden flex items-center justify-center">
                            <div className="absolute inset-0 bg-[#1c1c1c]/10" style={{ width: `${stats.funnelData.total > 0 ? (stats.funnelData.followed / stats.funnelData.total) * 100 : 0}%` }} />
                            <span className="relative text-[11px] font-bold text-[#1c1c1c]">
                               {stats.funnelData.total > 0 ? Math.round((stats.funnelData.followed / stats.funnelData.total) * 100) : 0}% Reach
                            </span>
                         </div>
                      </div>

                      <div className="w-full space-y-1.5 px-8">
                         <div className="flex justify-between text-[9px] font-bold text-[#5f5f5d] uppercase tracking-widest">
                            <span>Conversion</span>
                            <span>{stats.funnelData.recovered}</span>
                         </div>
                         <div className="h-10 bg-[#1c1c1c] rounded-lg relative overflow-hidden flex items-center justify-center shadow-lg shadow-[#1c1c1c]/20">
                            <div className="absolute inset-0 bg-emerald-500/10" style={{ width: `${stats.funnelData.total > 0 ? (stats.funnelData.recovered / stats.funnelData.total) * 100 : 0}%` }} />
                            <span className="relative text-[11px] font-bold text-[#fcfbf8]">
                               {stats.funnelData.total > 0 ? Math.round((stats.funnelData.recovered / stats.funnelData.total) * 100) : 0}% Success
                            </span>
                         </div>
                      </div>
                  </div>
                  <p className="text-[9px] text-[#5f5f5d] mt-8 text-center italic opacity-60">Attribution based on last-touch recovery.</p>
               </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="card p-6 shadow-sm border-gray-100/50 bg-[#fcfbf8]">
                <SectionTitle>
                  <Send className="w-4 h-4 text-[#1c1c1c]" />
                  Top Automations
                </SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {stats.workflowPerformance.length === 0 ? (
                    <p className="col-span-full text-xs text-[#5f5f5d] italic text-center py-6">No automation conversions in this range.</p>
                  ) : stats.workflowPerformance.map((w: any) => (
                    <div key={w.name} className="p-4 rounded-2xl bg-[#f7f4ed] border border-[#eceae4] shadow-sm flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest">{w.name}</span>
                        <span className="text-[10px] text-[#5f5f5d] font-bold">{w.conversions} Conversions</span>
                      </div>
                      <div className="text-sm font-black text-[#1c1c1c]">{formatCurrency(w.revenue)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-6 shadow-sm border-gray-100/50">
                <SectionTitle>
                  <Users className="w-4 h-4 text-[#1c1c1c]" />
                  Agent Productivity
                </SectionTitle>
                <div className="space-y-5 mt-6">
                  {stats.agentPerformance.slice(0, 5).map((a: any) => (
                    <div key={a.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black text-[#1c1c1c] uppercase tracking-tighter">{a.name.split("@")[0]}</span>
                        <span className="font-black text-[#1c1c1c]">{formatCurrency(a.revenue)}</span>
                      </div>
                      <div className="h-2 bg-[#eceae4] rounded-full overflow-hidden">
                        <div className="h-full bg-[#1c1c1c]" style={{ width: `${(a.count / Math.max(...stats.agentPerformance.map((x: any) => x.count), 1)) * 100}%` }} />
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
           {/* India Sales Map */}
           <IndiaSalesMap />

           <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              <div className="xl:col-span-3 card p-6">
                 <SectionTitle>
                    <Package className="w-3.5 h-3.5 text-[#1c1c1c]" />
                    Courier Performance Matrix
                 </SectionTitle>
                 <div className="overflow-x-auto mt-6">
                    <table className="w-full text-left">
                       <thead>
                          <tr className="border-b border-[#eceae4]">
                             <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Courier</th>
                             <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Total</th>
                             <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Delivered %</th>
                             <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">RTO %</th>
                             <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-right tracking-widest">Performance</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-[#eceae4]/50">
                          {stats.shippingMetrics.courierDistribution.map((c: any) => (
                             <tr key={c.name} className="hover:bg-[rgba(28,28,28,0.02)] transition-colors">
                                <td className="py-4 text-xs font-bold text-[#1c1c1c] uppercase">{c.name}</td>
                                <td className="py-4 text-xs font-bold text-[#5f5f5d] text-center">{c.total}</td>
                                <td className="py-4 text-xs font-bold text-emerald-600 text-center">{Math.round((c.delivered / c.total) * 100)}%</td>
                                <td className="py-4 text-xs font-bold text-rose-600 text-center">{Math.round((c.rto / c.total) * 100)}%</td>
                                <td className="py-4 text-right">
                                   <div className="w-20 h-1.5 bg-[#eceae4] rounded-full ml-auto overflow-hidden">
                                      <div className="h-full bg-[#1c1c1c] rounded-full" style={{ width: `${(c.delivered / c.total) * 100}%` }} />
                                   </div>
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>

              <div className="space-y-6">
                 <div className="card p-6">
                    <SectionTitle>Payment Split</SectionTitle>
                    <div className="h-[200px] w-full mt-4">
                       <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                             <Pie data={stats.shippingMetrics.paymentDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                                {stats.shippingMetrics.paymentDistribution.map((entry: any, index: number) => (
                                   <Cell key={`cell-${index}`} fill={index === 0 ? "#1c1c1c" : "#5f5f5d"} />
                                ))}
                             </Pie>
                             <Tooltip 
                                contentStyle={{ background: '#1c1c1c', border: 'none', borderRadius: '8px', fontSize: '10px' }} 
                                itemStyle={{ color: '#fcfbf8' }}
                                labelStyle={{ color: '#fcfbf8' }}
                             />
                          </PieChart>
                       </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-6">
                       {stats.shippingMetrics.paymentDistribution.map((p: any, idx: number) => (
                          <div key={p.name} className="flex items-center gap-1.5">
                             <div className={cn("w-2 h-2 rounded-full", idx === 0 ? "bg-[#1c1c1c]" : "bg-[#5f5f5d]")} />
                             <span className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">{p.name}</span>
                          </div>
                       ))}
                    </div>
                 </div>

                 <div className="card p-6">
                    <SectionTitle>Weight Profiles</SectionTitle>
                    <div className="space-y-4 mt-8">
                       {stats.shippingMetrics.weightDistribution.map((w: any) => (
                          <div key={w.name} className="space-y-2">
                             <div className="flex justify-between text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">
                                <span>{w.name}</span>
                                <span>{w.value}</span>
                             </div>
                             <div className="h-1.5 bg-[#eceae4] rounded-full overflow-hidden">
                                <div className="h-full bg-[#1c1c1c]" style={{ width: `${(w.value / stats.rawOrdersLogs.length) * 100}%` }} />
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
                {stats.taskBreakdown.map((r: any) => (
                  <BarRow key={r.label} label={r.label} value={r.value} max={stats.taskBreakdown.reduce((s: number, x: any) => s + x.value, 0)} color={r.color} />
                ))}
              </div>
            </div>

            <div className="card p-6">
              <SectionTitle>Agent Performance</SectionTitle>
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#eceae4]">
                      <th className="text-left py-2 text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest">Agent</th>
                      <th className="text-center py-2 text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest">Calls</th>
                      <th className="text-right py-2 text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest">Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eceae4]/50">
                    {stats.agentPerformance.map((a: any) => (
                      <tr 
                         key={a.name} 
                         className="hover:bg-[rgba(28,28,28,0.02)] transition-colors cursor-pointer"
                         onClick={() => {
                            const agentId = stats.agentAttendance.find((x: any) => x.name === a.name || x.email === a.name)?.id;
                            if (agentId) window.open(`/team/${agentId}`, '_blank');
                         }}
                      >
                        <td className="py-3 text-xs font-bold text-[#1c1c1c] uppercase">{a.name.split("@")[0]}</td>
                        <td className="py-3 text-center text-xs text-[#5f5f5d] font-bold">{a.count}</td>
                        <td className="py-3 text-right text-xs font-bold text-[#1c1c1c]">{formatCurrency(a.revenue)}</td>
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
                        <tr className="border-b border-[#eceae4]">
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Product</th>
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Units</th>
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-right tracking-widest">Revenue</th>
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-right tracking-widest">Share</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-[#eceae4]/50">
                        {stats.topProducts.map((p: any) => (
                           <tr key={p.name} className="hover:bg-[rgba(28,28,28,0.02)] transition-colors">
                              <td className="py-4 text-xs font-bold text-[#1c1c1c]">{p.name}</td>
                              <td className="py-4 text-xs font-bold text-[#5f5f5d] text-center">{p.count}</td>
                              <td className="py-4 text-xs font-bold text-[#1c1c1c] text-right">{formatCurrency(p.revenue)}</td>
                              <td className="py-4 text-right">
                                 <span className="text-[10px] font-bold text-[#5f5f5d] bg-[#eceae4]/50 px-2 py-0.5 rounded-full">
                                    {stats.totalProductRevenue > 0 ? Math.round((p.revenue / stats.totalProductRevenue) * 100) : 0}%
                                 </span>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
            
            <div className="card p-6 bg-[#eceae4]/10">
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
                           {stats.topProducts.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={["#1c1c1c", "#5f5f5d", "#eceae4", "#1c1c1c", "#5f5f5d"][index % 5]} />
                           ))}
                        </Pie>
                        <Tooltip 
                           contentStyle={{ background: '#1c1c1c', border: 'none', borderRadius: '8px', fontSize: '10px' }} 
                           itemStyle={{ color: '#fcfbf8' }}
                           labelStyle={{ color: '#fcfbf8' }}
                        />
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
            {stats.segmentStats.map((s: any, idx: number) => (
              <StatCard 
                key={s.segment || idx} 
                label={(s.segment || "Unknown").toUpperCase()} 
                value={s.count ?? 0} 
                sub={s.avg_orders ? `Avg Orders: ${s.avg_orders}` : undefined} 
              />
            ))}
          </div>

          <div className="card p-6">
            <SectionTitle>Top Customer Performers</SectionTitle>
            <div className="overflow-x-auto mt-6">
               <table className="w-full text-left">
                  <thead>
                     <tr className="border-b border-[#eceae4]">
                        <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Customer</th>
                        <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Orders</th>
                        <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-right tracking-widest">LTV</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eceae4]/50">
                     {stats.topCustomers.map((c: any) => (
                        <tr key={c.id} className="hover:bg-[rgba(28,28,28,0.02)] transition-colors">
                           <td className="py-4">
                              <div className="flex flex-col">
                                 <span className="text-xs font-bold text-[#1c1c1c]">{c.name}</span>
                                 <span className="text-[10px] text-[#5f5f5d] font-medium">{c.phone}</span>
                              </div>
                           </td>
                           <td className="py-4 text-xs font-bold text-[#5f5f5d] text-center">{c.orders}</td>
                           <td className="py-4 text-xs font-bold text-[#1c1c1c] text-right">{formatCurrency(c.revenue)}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          </div>

          <div className="card p-6">
            <SectionTitle>Product Leaderboard</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                {stats.topProducts.map((p: any) => (
                    <div key={p.name} className="flex items-center justify-between p-4 rounded-xl border border-[#eceae4] bg-[#eceae4]/10 hover:shadow-md transition-all">
                        <div className="flex flex-col gap-1 truncate pr-4">
                           <span className="text-xs font-bold text-[#1c1c1c] truncate">{p.name}</span>
                           <span className="text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest">{p.count} Units Sold</span>
                        </div>
                        <div className="text-xs font-bold text-[#1c1c1c] border-l border-[#eceae4] pl-4">{formatCurrency(p.revenue)}</div>
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
                  <StatCard label="Recovered Revenue" value={formatCurrency(stats.abandonedStats.recovered)} accent="text-[#1c1c1c]" />
                  <StatCard label="Recovery Rate" value={`${stats.abandonedStats.rate}%`} />
              </div>

              <div className="card p-6 mt-6">
                <SectionTitle>Recovery Leaderboard</SectionTitle>
                <div className="space-y-6 mt-8">
                    {stats.agentAttendance.filter((a: any) => a.taskCount > 0).map((a: any) => (
                        <div key={a.name} className="flex items-center gap-4">
                            <div className="w-24 text-[10px] font-bold text-[#5f5f5d] uppercase truncate">{a.name.split("@")[0]}</div>
                            <div className="flex-1 h-2 bg-[#eceae4] rounded-full overflow-hidden">
                                <div className="h-full bg-[#1c1c1c] rounded-full" style={{ width: `${Math.min(100, (a.taskCount / Math.max(...stats.agentAttendance.map((x: any) => x.taskCount), 1)) * 100)}%` }} />
                            </div>
                            <div className="w-12 text-[10px] font-bold text-[#1c1c1c] text-right">{a.taskCount}</div>
                        </div>
                    ))}
                </div>
              </div>
          </div>
      )}

      {activeTab === "agents" && (
        <div className="space-y-6">
           <div className="card p-6">
              <SectionTitle>
                 <Users className="w-3.5 h-3.5 text-[#1c1c1c]" />
                 Agent Productivity Ledger
              </SectionTitle>
               <div className="overflow-x-auto mt-6">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="border-b border-[#eceae4]">
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Agent Detail</th>
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Status / Activity</th>
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Net Work</th>
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">On Break</th>
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Volume</th>
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-center tracking-widest">Total Revenue</th>
                           <th className="py-2 text-[10px] font-bold text-[#5f5f5d] uppercase text-right tracking-widest">Effort Score</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-[#eceae4]/50">
                        {stats.agentAttendance.map((a: any) => {
                           const isOnline = a.status === "online";
                           const isBreak = ["break", "lunch", "away"].includes(a.status);
                           const isMeeting = a.status === "meeting";
                           return (
                             <tr 
                                key={a.name} 
                                className="hover:bg-[rgba(28,28,28,0.02)] transition-colors cursor-pointer group"
                                onClick={() => window.open(`/team/${a.id}`, '_blank')}
                             >
                                <td className="py-4">
                                   <div className="flex items-center gap-3">
                                      <div className="relative">
                                         <Avatar name={a.name} size="sm" />
                                         <div className={cn(
                                            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                                            isOnline ? "bg-emerald-500 animate-pulse" : isBreak ? "bg-amber-500" : isMeeting ? "bg-indigo-500" : "bg-gray-400"
                                         )} />
                                      </div>
                                      <div className="flex flex-col">
                                         <span className="text-xs font-bold text-[#1c1c1c] uppercase">{a.name.split("@")[0]}</span>
                                         <span className="text-[9px] text-[#5f5f5d] font-bold">{a.email}</span>
                                      </div>
                                   </div>
                                </td>
                                <td className="py-4 text-center">
                                   <div className="flex flex-col items-center">
                                      <span className={cn(
                                         "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                         isOnline ? "bg-emerald-50 text-emerald-700 border-emerald-100" : isBreak ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-gray-50 text-gray-500 border-gray-100"
                                      )}>
                                         {a.status || "offline"}
                                      </span>
                                      {a.lastReason && <span className="text-[8px] font-bold text-[#5f5f5d] mt-1 italic truncate max-w-[80px]">&quot;{a.lastReason}&quot;</span>}
                                   </div>
                                </td>
                                <td className="py-4 text-xs font-bold text-[#1c1c1c] text-center tabular-nums">{a.onlineHours}</td>
                                <td className="py-4 text-xs font-bold text-amber-700 text-center tabular-nums">{a.breakHours}</td>
                                <td className="py-4 text-center">
                                   <div className="flex flex-col items-center">
                                      <span className="text-xs font-bold text-[#1c1c1c]">{a.taskCount}</span>
                                      <span className="text-[8px] text-gray-400 font-bold uppercase">Tasks</span>
                                   </div>
                                </td>
                                <td className="py-4 text-center">
                                   <div className="flex flex-col items-center">
                                      <span className="text-xs font-bold text-[#1c1c1c]">{formatCurrency(a.revenue)}</span>
                                      {a.revenue > 0 && a.taskCount > 0 && (
                                         <span className="text-[8px] text-emerald-600 font-bold uppercase">Avg: {formatCurrency(a.revenue / a.taskCount)}</span>
                                      )}
                                   </div>
                                </td>
                                <td className="py-4 text-right">
                                   <div className="flex flex-col items-end">
                                      <span className={cn(
                                          "px-3 py-1 rounded-full text-[10px] font-black",
                                          Number(a.productivity) > 5 ? "bg-emerald-500 text-white" : "bg-[#eceae4] text-[#5f5f5d]"
                                      )}>
                                          {a.productivity} T/H
                                      </span>
                                   </div>
                                </td>
                             </tr>
                           );
                        })}
                     </tbody>
                  </table>
               </div>
           </div>
        </div>
      )}

      {activeTab === "rto" && (
        <div className="space-y-5">
           <div className="card p-6">
            <SectionTitle>Recent RTO Events</SectionTitle>
            <div className="overflow-x-auto mt-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#eceae4]">
                    <th className="text-left py-2 text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest">Order</th>
                    <th className="text-left py-2 text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest">Customer</th>
                    <th className="text-right py-2 text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eceae4]/50">
                  {stats.rtoOrders.map((r: any) => (
                    <tr key={r.id}>
                      <td className="py-4 text-xs font-bold text-[#1c1c1c]">#{r.order_number}</td>
                      <td className="py-4 text-xs font-bold text-[#5f5f5d]">{r.customer?.name || "Unknown"}</td>
                      <td className="py-4 text-right text-xs font-bold text-[#1c1c1c]">{formatCurrency(r.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>

      <Modal open={showMasterExport} onClose={() => setShowMasterExport(false)} title="Master History Export" maxWidth="max-w-md"
        footer={<><button className="btn-secondary" onClick={() => setShowMasterExport(false)}>Cancel</button><button className="btn-primary" onClick={handleMasterExport} disabled={exportingMaster}>{exportingMaster ? "Exporting..." : "Generate Report"}</button></>}
      >
        <div className="space-y-6 py-2">
            <p className="text-xs text-[#5f5f5d] italic">Complete data integrity export for audit and compliance purposes.</p>
            <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] font-bold text-[#5f5f5d] uppercase mb-2 block tracking-widest">Format</label><div className="grid grid-cols-3 gap-2"><button onClick={() => setMasterExportOptions({...masterExportOptions, format: "xlsx"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", masterExportOptions.format === "xlsx" ? "bg-[#1c1c1c] text-[#fcfbf8] border-[#1c1c1c]" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>EXCEL</button><button onClick={() => setMasterExportOptions({...masterExportOptions, format: "csv"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", masterExportOptions.format === "csv" ? "bg-[#1c1c1c] text-[#fcfbf8] border-[#1c1c1c]" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>CSV</button><button onClick={() => setMasterExportOptions({...masterExportOptions, format: "pdf"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", masterExportOptions.format === "pdf" ? "bg-rose-500 text-white border-rose-500" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>PDF</button></div></div>
                <div><label className="text-[10px] font-bold text-[#5f5f5d] uppercase mb-2 block tracking-widest">Target</label><div className="grid grid-cols-2 gap-2"><button onClick={() => setMasterExportOptions({...masterExportOptions, destination: "download"})} className={cn("py-2 px-2 rounded-lg border text-[10px] font-bold", masterExportOptions.destination === "download" ? "bg-[#1c1c1c] text-[#fcfbf8] border-[#1c1c1c]" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>LOCAL</button><button onClick={() => setMasterExportOptions({...masterExportOptions, destination: "whatsapp"})} className={cn("py-2 px-2 rounded-lg border text-[10px] font-bold", masterExportOptions.destination === "whatsapp" ? "bg-[#1c1c1c] text-[#fcfbf8] border-[#1c1c1c]" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>WA</button></div></div>
            </div>
            {masterExportOptions.destination === "whatsapp" && (<div className="p-4 bg-[#eceae4]/30 rounded-xl border border-[#eceae4]"><input type="text" placeholder="Phone Number" value={masterExportOptions.customPhone} onChange={e => setMasterExportOptions({...masterExportOptions, customPhone: e.target.value})} className="input text-xs" /></div>)}
        </div>
      </Modal>

      <Modal open={showAdvancedExport} onClose={() => setShowAdvancedExport(false)} title="Advanced Report Export" maxWidth="max-w-xl"
        footer={<><button className="btn-secondary" onClick={() => setShowAdvancedExport(false)}>Cancel</button><button className="btn-primary" onClick={handleAdvancedExport} disabled={isExporting}>{isExporting ? "Processing..." : "Generate Report"}</button></>}
      >
        <div className="space-y-8 py-2">
            <div><label className="text-[10px] font-bold text-[#5f5f5d] uppercase mb-4 block tracking-widest opacity-60">Select Modules</label><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{["Summary", "Calls", "Orders", "Agents", "Products", "Recovery", "Workflows", "Attendance", "Trends"].map((s: any) => (<button key={s} onClick={() => setExportOptions({...exportOptions, sheets: {...exportOptions.sheets, [s.toLowerCase()]: !(exportOptions.sheets as any)[s.toLowerCase()]}})} className={cn("flex items-center justify-center py-3 rounded-xl border text-[11px] font-bold transition-all", (exportOptions.sheets as any)[s.toLowerCase()] ? "bg-[#1c1c1c] text-[#fcfbf8] border-[#1c1c1c] shadow-lg shadow-[#1c1c1c]/10" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>{s}</button>))}</div></div>
            <div className="grid grid-cols-2 gap-8 pt-4 border-t border-[#eceae4]">
                <div><label className="text-[10px] font-bold text-[#5f5f5d] uppercase mb-3 block tracking-widest opacity-60">Output Format</label><div className="grid grid-cols-3 gap-2"><button onClick={() => setExportOptions({...exportOptions, format: "xlsx"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", exportOptions.format === "xlsx" ? "bg-[#1c1c1c] text-[#fcfbf8] border-[#1c1c1c]" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>EXCEL</button><button onClick={() => setExportOptions({...exportOptions, format: "csv"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", exportOptions.format === "csv" ? "bg-[#1c1c1c] text-[#fcfbf8] border-[#1c1c1c]" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>CSV</button><button onClick={() => setExportOptions({...exportOptions, format: "pdf"})} className={cn("py-2 px-1 rounded-lg border text-[10px] font-bold", exportOptions.format === "pdf" ? "bg-rose-500 text-white border-rose-500" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>PDF</button></div></div>
                <div><label className="text-[10px] font-bold text-[#5f5f5d] uppercase mb-3 block tracking-widest opacity-60">Delivery</label><div className="grid grid-cols-2 gap-2"><button onClick={() => setExportOptions({...exportOptions, destination: "download"})} className={cn("py-2 px-2 rounded-lg border text-[10px] font-bold", exportOptions.destination === "download" ? "bg-[#1c1c1c] text-[#fcfbf8] border-[#1c1c1c]" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>LOCAL</button><button onClick={() => setExportOptions({...exportOptions, destination: "whatsapp"})} className={cn("py-2 px-2 rounded-lg border text-[10px] font-bold", exportOptions.destination === "whatsapp" ? "bg-[#1c1c1c] text-[#fcfbf8] border-[#1c1c1c]" : "bg-[#f7f4ed] border-[#eceae4] text-[#5f5f5d]")}>WA</button></div></div>
            </div>
        </div>
      </Modal>
    </div>
  );
}

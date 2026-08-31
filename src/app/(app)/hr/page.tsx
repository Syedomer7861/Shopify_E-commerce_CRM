"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { 
  Users, 
  UserCheck, 
  UserMinus, 
  Clock, 
  Coffee, 
  AlertCircle, 
  Calendar,
  BarChart2,
  RefreshCw,
  TrendingUp,
  LayoutDashboard,
  CheckCircle,
  XCircle,
  Eye,
  History,
  FileText,
  Briefcase,
  Calculator,
  Info,
  ShieldAlert,
  Target,
  Zap,
  ChevronRight
} from "lucide-react";
import { PageHeader, Avatar, Modal, Pagination, AccessDenied } from "@/components/ui";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie
} from 'recharts';
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import PayrollCalculator from "@/components/hr/PayrollCalculator";
import EmployeeDirectory from "@/components/hr/EmployeeDirectory";
import AttendanceRegister from "@/components/hr/AttendanceRegister";
import PayrollRun from "@/components/hr/PayrollRun";
import HRDocuments from "@/components/hr/HRDocuments";
import Announcements from "@/components/hr/Announcements";
import HREngagement from "@/components/hr/HREngagement";
import AgentIntelligence from "@/components/hr/AgentIntelligence";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

interface LeaveRequest {
  id: string;
  agent_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  profile: {
    name: string;
    email: string;
  };
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastSeenMinutes: number | null;
  shiftStart: string | null;
  statusSince: string | null;
  productiveMinutes: number;
  breakMinutes: number;
  taskCount: number | null;
  timeline: { status: string; time: string; reason?: string }[];
}

const MODULE_DESCRIPTIONS: Record<string, string> = {
  overview: "Holistic view of team health, productivity trends, and critical HR metrics.",
  attendance: "Real-time monitoring of agent availability, active tasks, and session durations.",
  leaves: "Administrative portal for reviewing and managing employee time-off applications.",
  employees: "Full lifecycle management from onboarding checklists to offboarding compliance.",
  'attendance-reg': "Digital registry for daily logs, shift scheduling, and holiday calendar management.",
  payroll: "Integrated processing for salary disbursements, revision history, and expense claims.",
  documents: "Smart generator for official letters and a centralized policy compliance library.",
  announcements: "Targeted broadcast system for company news, urgent alerts, and team celebrations.",
  engagement: "Holistic suite for performance appraisal, training tracking, and grievance resolution.",
  calculator: "Manual financial tools and automated payroll estimation for Indian compliance slabs.",
  agents: "Deep telemetry audit for agent productivity, task resolution, and engagement metrics.",
};

import { Suspense } from "react";

function HRDashboardContent() {
  const { profile: currentProfile, loading: profileLoading } = useCurrentProfile();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ 
    members: TeamMember[]; 
    leaves: LeaveRequest[]; 
    stats: any;
    employees: any[];
    announcements: any[];
    policies: any[];
    revisions: any[];
    expenses: any[];
    reviews: any[];
    training: any[];
    grievances: any[];
    attendance: any[];
    holidays: any[];
    benchmark: { slaPct: number; grade: string; doneCount: number; resolutionDeltaPct: number; resolutionDeltaMinutes: number; hasBaseline: boolean };
    revenueAtRiskByAgent: Record<string, number>;
    payrollStatus: Record<string, { status: string; marked_at: string | null }>;
    payrollMonth: string;
  }>({
    members: [],
    leaves: [],
    stats: { totalBreak: 0, avgProductive: 0 },
    employees: [],
    announcements: [],
    policies: [],
    revisions: [],
    expenses: [],
    reviews: [],
    training: [],
    grievances: [],
    attendance: [],
    holidays: [],
    benchmark: { slaPct: 0, grade: "—", doneCount: 0, resolutionDeltaPct: 0, resolutionDeltaMinutes: 0, hasBaseline: false },
    revenueAtRiskByAgent: {},
    payrollStatus: {},
    payrollMonth: new Date().toISOString().slice(0, 7)
  });
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isStale, setIsStale] = useState(false);
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'attendance' | 'leaves' | 'overview' | 'calculator' | 'employees' | 'attendance-reg' | 'payroll' | 'documents' | 'announcements' | 'engagement' | 'agents'>('overview');
  
  // Pagination states
  const [attendancePage, setAttendancePage] = useState(1);
  const [leavesPage, setLeavesPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [mounted, setMounted] = useState(false);
  const [leaveActionModal, setLeaveActionModal] = useState<{ id: string, action: 'approved' | 'rejected' } | null>(null);
  const [leaveRemarks, setLeaveRemarks] = useState("");
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab as any);
    else setActiveTab('overview');
  }, [searchParams]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = useCallback(async () => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setLoading(true);
      setTimeout(() => {
        // Built off today's date, not a hardcoded string, so the Monthly
        // Register in AttendanceRegister.tsx (which opens on the current
        // month) has something to show whenever the demo actually runs,
        // rather than an empty grid undercutting the auto-detection UI.
        const demoAttendance: any[] = [];
        for (let back = 1; back <= 5; back++) {
          const d = new Date();
          d.setDate(d.getDate() - back);
          const dateStr = d.toISOString().slice(0, 10);
          demoAttendance.push({
            agent_id: "e1", date: dateStr, status: back === 3 ? "Late" : "Present", is_auto: true,
            clock_in: `${dateStr}T${back === 3 ? "09:40" : "08:55"}:00.000Z`,
            clock_out: `${dateStr}T13:10:00.000Z`,
            productive_minutes: 480, break_minutes: 40,
          });
          demoAttendance.push({
            agent_id: "e2", date: dateStr, status: back === 2 ? "Half Day" : "Present", is_auto: true,
            clock_in: `${dateStr}T09:05:00.000Z`,
            clock_out: `${dateStr}T${back === 2 ? "12:30" : "13:15"}:00.000Z`,
            productive_minutes: back === 2 ? 195 : 450, break_minutes: 35,
          });
        }
        setData({
          members: [
            { id: '1', name: 'Agent Rahul', email: 'rahul@cureforever.com', role: 'agent', status: 'Online', lastSeenMinutes: 0, shiftStart: '09:00 AM', statusSince: '2h ago', productiveMinutes: 405, breakMinutes: 45, taskCount: 42, timeline: [{ status: 'online', time: '09:00 AM' }, { status: 'break', time: '01:00 PM', reason: 'Lunch' }, { status: 'online', time: '01:45 PM' }] },
            { id: '2', name: 'Agent Priya', email: 'priya@cureforever.com', role: 'agent', status: 'Away', lastSeenMinutes: 5, shiftStart: '10:00 AM', statusSince: '15m ago', productiveMinutes: 315, breakMinutes: 75, taskCount: 28, timeline: [{ status: 'online', time: '10:00 AM' }, { status: 'break', time: '02:00 PM', reason: 'Break' }] },
            { id: '3', name: 'Agent Amit', email: 'amit@cureforever.com', role: 'agent', status: 'Online', lastSeenMinutes: 0, shiftStart: '09:00 AM', statusSince: '4h ago', productiveMinutes: 450, breakMinutes: 30, taskCount: 56, timeline: [{ status: 'online', time: '09:00 AM' }] },
          ],
          leaves: [
            { id: 'l1', agent_id: '1', start_date: '2024-06-01', end_date: '2024-06-05', reason: 'Family vacation', status: 'pending', created_at: new Date().toISOString(), profile: { name: 'Agent Rahul', email: 'rahul@cureforever.com' } },
            { id: 'l2', agent_id: '2', start_date: '2024-05-20', end_date: '2024-05-21', reason: 'Medical appointment', status: 'approved', created_at: new Date().toISOString(), profile: { name: 'Agent Priya', email: 'priya@cureforever.com' } }
          ],
          stats: { totalBreak: 150, avgProductive: 390 },
          employees: [
            { id: 'e1', name: 'Agent Rahul', email: 'rahul@cureforever.com', role: 'Agent', status: 'active', joining_date: '2023-01-15', shift_type: 'Morning' },
            { id: 'e2', name: 'Agent Priya', email: 'priya@cureforever.com', role: 'Agent', status: 'active', joining_date: '2023-03-10', shift_type: 'Afternoon' }
          ],
          announcements: [
            // type is required: Announcements.tsx indexes TYPE_STYLES[a.type]
            // with no fallback, so a missing type throws "Cannot read
            // properties of undefined (reading 'bg')" and crashes the page.
            // The real column is `body`, not `content` - Announcements.tsx
            // reads a.body, so the wrong key was silently rendering blank.
            { id: 'a1', title: 'New Product Launch', body: 'We are launching a new Krill Oil variant next week!', type: 'Celebration', created_at: new Date().toISOString() }
          ],
          // Real columns are name/category/created_at (schema:
          // supabase/migrations/20260423_hr_suite_sync.sql). This object had
          // title instead of name and no created_at at all - HRDocuments.tsx
          // calls p.created_at.split("T")[0] unconditionally, so the missing
          // field crashed the whole Documents tab with "Cannot read
          // properties of undefined (reading 'split')".
          policies: [{ id: 'p1', name: 'Leave Policy 2026', category: 'Compliance', created_at: new Date().toISOString() }],
          revisions: [],
          expenses: [],
          reviews: [],
          training: [],
          grievances: [],
          attendance: demoAttendance,
          holidays: [
            { id: 'h1', date: '2026-01-26', name: 'Republic Day', type: 'National' },
            { id: 'h2', date: '2026-08-15', name: 'Independence Day', type: 'National' },
          ],
          benchmark: { slaPct: 94, grade: 'A', doneCount: 38, resolutionDeltaPct: 12, resolutionDeltaMinutes: 22, hasBaseline: true },
          revenueAtRiskByAgent: { '1': 34500, '2': 18200, '3': 41000 },
          payrollStatus: { '1': { status: 'paid', marked_at: new Date().toISOString() } },
          payrollMonth: new Date().toISOString().slice(0, 7)
        });
        setLastUpdated(new Date());
        setIsStale(false);
        setLoading(false);
      }, 500);
      return;
    }

    try {
      const [statusRes, hrRes] = await Promise.all([
        fetch("/api/team/status"),
        fetch("/api/hr/data")
      ]);

      if (!statusRes.ok || !hrRes.ok) throw new Error("API failed");
      
      const statusData = await statusRes.json();
      const hrData = await hrRes.json();

      // Filter: HR should not see Admins in team status
      const filteredMembers = statusData.members.filter((m: any) => {
        if (currentProfile?.role === 'admin') return true;
        return m.role?.toLowerCase() !== 'admin';
      });

      setData({
        members: filteredMembers,
        leaves: hrData.leaves || [],
        stats: statusData.stats || { totalBreak: 0, avgProductive: 0 },
        employees: hrData.employees || [],
        announcements: hrData.announcements || [],
        policies: hrData.policies || [],
        revisions: hrData.revisions || [],
        expenses: hrData.expenses || [],
        reviews: hrData.reviews || [],
        training: hrData.training || [],
        grievances: hrData.grievances || [],
        attendance: hrData.attendance || [],
        holidays: hrData.holidays || [],
        benchmark: hrData.benchmark || { slaPct: 0, grade: "—", doneCount: 0, resolutionDeltaPct: 0, resolutionDeltaMinutes: 0, hasBaseline: false },
        revenueAtRiskByAgent: hrData.revenueAtRiskByAgent || {},
        payrollStatus: hrData.payrollStatus || {},
        payrollMonth: hrData.payrollMonth || new Date().toISOString().slice(0, 7)
      });
      setLastUpdated(new Date());
      setIsStale(false);
    } catch (err) {
      console.error("HR Dashboard Fetch Error:", err);
      setIsStale(true);
    } finally {
      setLoading(false);
    }
  }, [currentProfile]);

  const handleLeaveAction = async () => {
    if (!leaveActionModal) return;
    try {
      const res = await fetch("/api/leaves/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveId: leaveActionModal.id, status: leaveActionModal.action, remarks: leaveRemarks })
      });
      if (!res.ok) throw new Error("Action failed");
      toast.success(`Leave ${leaveActionModal.action} successfully`);
      setLeaveActionModal(null);
      setLeaveRemarks("");
      fetchData();
    } catch (err) {
      toast.error("Failed to process request");
    }
  };

  useEffect(() => {
    if (!profileLoading && (currentProfile?.role === 'admin' || currentProfile?.role === 'hr')) {
      fetchData();
      // Realtime below drives live updates; poll is only a missed-event
      // safety net (fetchData hits /api/hr/data, which is expensive).
      refreshInterval.current = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        fetchData();
      }, 3 * 60_000);

      const supabase = createClient();
      const channel = supabase
        .channel("hr-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "agent_status_logs" }, fetchData)
        .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" },    fetchData)
        .subscribe();

      return () => {
        if (refreshInterval.current) clearInterval(refreshInterval.current);
        supabase.removeChannel(channel);
      };
    }
  }, [profileLoading, currentProfile, fetchData]);

  const formatMins = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getBreakColor = (mins: number) => {
    if (mins < 30) return "text-gray-500";
    if (mins < 45) return "text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded";
    return "text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded";
  };

  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#5f5f5d] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Synchronizing HR Telemetry...</p>
      </div>
    );
  }

  if (currentProfile?.role !== 'admin' && currentProfile?.role !== 'hr') {
    return (
      <AccessDenied 
        title="Administrative Gating" 
        desc="Access to HR Intelligence and Agent Telemetry is restricted to authorized personnel only." 
      />
    );
  }

  const onlineMembers = data.members.filter(m => m.status === "Online");
  const awayMembers = data.members.filter(m => m.status === "Away");
  const pendingLeaves = data.leaves.filter(l => l.status === "pending");

  return (
    <div className="animate-fade-in pb-12">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-[#1c1c1c] flex items-center justify-center shadow-lg">
                <LayoutDashboard className="w-5 h-5 text-white" />
             </div>
             <div>
                <h1 className="text-2xl font-black text-[#1c1c1c] tracking-tight">HR Intelligence</h1>
                <p className="text-xs text-gray-400 font-medium tracking-tight mt-0.5">Live monitoring & administrative control</p>
             </div>
          </div>
        }
        subtitle={
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-lg border border-emerald-100/50 shadow-sm">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
               <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Live Engine: Online</span>
            </div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-2">Last updated {mounted ? lastUpdated.toLocaleTimeString() : "--:--:--"}</span>
          </div>
        }
        actions={
          <div className="flex gap-2">
            <button onClick={() => { setLoading(true); fetchData(); }} className="btn-secondary gap-2 text-xs h-10 px-4">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
            </button>
          </div>
        }
      />



      {/* Module Description Banner */}
      <div className="bg-[#f8f7f4] border border-[#1c1c1c]/5 rounded-2xl p-6 mb-8 flex items-start gap-4 animate-fade-in shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-white border border-[#1c1c1c]/10 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Info className="w-5 h-5 text-[#1c1c1c]" />
        </div>
        <div>
          <p className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest leading-none mt-1">
            {activeTab === 'attendance-reg' ? 'Attendance Register' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('-', ' ')}
          </p>
          <p className="text-[13px] text-gray-500 mt-2 font-medium leading-relaxed">
            {MODULE_DESCRIPTIONS[activeTab]}
          </p>
        </div>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Top Performance Ribbon */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Active Strength" value={onlineMembers.length} icon={UserCheck} sub={`${data.members.length} total profiles`} accent="text-emerald-600" />
            <MetricCard label="Revenue at Risk" value={`₹${Object.values(data.revenueAtRiskByAgent).reduce((a, b) => a + b, 0).toLocaleString()}`} icon={ShieldAlert} sub="Open orders behind on tasks" accent="text-rose-600" />
            <MetricCard label="Leave Pipeline" value={pendingLeaves.length} icon={Calendar} sub="Awaiting HR approval" accent="text-amber-600" />
            <MetricCard label="Avg Efficiency" value={`${data.stats.avgProductive}m`} icon={TrendingUp} sub="Daily productive avg" accent="text-[#1c1c1c]" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
            {/* Main Productivity Graph */}
            <div className="xl:col-span-2 card p-8">
               <div className="flex justify-between items-center mb-8">
                  <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Team Productivity trends
                  </h3>
                  <div className="flex items-center gap-4">
                     <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#1c1c1c]" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Work</span>
                     </div>
                     <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Break</span>
                     </div>
                  </div>
               </div>
               <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={data.members.filter(m => m.shiftStart)}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#1c1c1c' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#9ca3af' }} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(28,28,28,0.02)' }}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '12px', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="productiveMinutes" name="Work (mins)" stackId="a" fill="#1c1c1c" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="breakMinutes" name="Break (mins)" stackId="a" fill="#e11d48" radius={[4, 4, 0, 0]} />
                     </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>

            {/* Status Breakdown Pie */}
            <div className="card p-8 flex flex-col items-center justify-center relative overflow-hidden">
               <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest mb-4 absolute top-8 left-8">Shift Distribution</h3>
               <div className="h-[220px] w-full mt-8">
                  <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                        <Pie
                           data={[
                             { name: 'Online', value: onlineMembers.length, color: '#10b981' },
                             { name: 'Away', value: awayMembers.length, color: '#f59e0b' },
                             { name: 'Offline', value: data.members.filter(m => m.status === 'Offline').length, color: '#e5e7eb' },
                           ]}
                           cx="50%" cy="50%"
                           innerRadius={60}
                           outerRadius={80}
                           paddingAngle={5}
                           dataKey="value"
                        >
                           {[0,1,2].map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={['#10b981', '#f59e0b', '#e5e7eb'][index]} stroke="none" />
                           ))}
                        </Pie>
                        <Tooltip />
                     </PieChart>
                  </ResponsiveContainer>
               </div>
               <div className="grid grid-cols-3 gap-8 mt-4 w-full px-4">
                  <div className="text-center">
                     <div className="text-sm font-black text-emerald-600">{onlineMembers.length}</div>
                     <div className="text-[9px] font-bold text-gray-400 uppercase">Live</div>
                  </div>
                  <div className="text-center">
                     <div className="text-sm font-black text-amber-600">{awayMembers.length}</div>
                     <div className="text-[9px] font-bold text-gray-400 uppercase">Break</div>
                  </div>
                  <div className="text-center">
                     <div className="text-sm font-black text-gray-400">{data.members.filter(m => m.status === 'Offline').length}</div>
                     <div className="text-[9px] font-bold text-gray-400 uppercase">Off</div>
                  </div>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Backlog Intensity Monitor */}
             <div className="card p-8">
                <div className="flex justify-between items-center mb-8">
                   <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2">
                     <Target className="w-4 h-4" /> High Intensity Agents
                   </h3>
                   <span className="text-[10px] font-bold text-rose-500 uppercase px-2 py-1 bg-rose-50 rounded-lg animate-pulse">Backlog Alert</span>
                </div>
                <div className="space-y-4">
                   {data.members.filter(m => (m.taskCount || 0) > 0).sort((a,b) => (b.taskCount || 0) - (a.taskCount || 0)).slice(0, 4).map(m => {
                     const atRisk = data.revenueAtRiskByAgent[m.id] || 0;
                     return (
                     <div key={m.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-gray-200 transition-all group">
                        <div className="flex items-center gap-3">
                           <Avatar name={m.name} size="sm" />
                           <div>
                              <div className="text-xs font-black text-[#1c1c1c]">{m.name}</div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase">{m.role}</div>
                           </div>
                        </div>
                        <div className="flex items-center gap-6">
                           <div className="text-right">
                              <div className="text-xs font-black text-[#1c1c1c]">{m.taskCount} Tasks</div>
                              <div className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter">
                                {atRisk > 0 ? `₹${atRisk.toLocaleString()} at risk` : "No order value linked"}
                              </div>
                           </div>
                           <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#1c1c1c] group-hover:translate-x-1 transition-all" />
                        </div>
                     </div>
                   );})}
                </div>
             </div>

             {/* Team Performance Card */}
             {(() => {
               const b = data.benchmark;
               const gradeMain = b.grade.replace("+", "");
               const gradeHasPlus = b.grade.endsWith("+");
               const agentMembers = data.members.filter(m => m.taskCount !== null);
               const totalTasks = agentMembers.reduce((acc, m) => acc + (m.taskCount || 0), 0);
               const totalProductiveHours = agentMembers.reduce((acc, m) => acc + (m.productiveMinutes || 0), 0) / 60;
               const tasksPerHour = totalProductiveHours > 0 ? totalTasks / totalProductiveHours : 0;
               return (
             <div className="card p-8 bg-[#1c1c1c] text-white relative overflow-hidden">
                <div className="relative z-10">
                   <div className="flex justify-between items-start mb-8">
                      <div>
                         <h3 className="text-xs font-black text-white/60 uppercase tracking-widest">Efficiency Benchmark</h3>
                         <div className="text-5xl font-black mt-2 tracking-tighter">{gradeMain}{gradeHasPlus && <span className="text-emerald-400">+</span>}</div>
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                         <Zap className="w-6 h-6 text-emerald-400" />
                      </div>
                   </div>
                   <p className="text-[13px] text-white/70 leading-relaxed mb-10 max-w-[80%]">
                     {b.doneCount === 0 ? (
                       <>No tasks completed in the last 7 days yet - grade and trend will appear once there&apos;s data to compute.</>
                     ) : !b.hasBaseline ? (
                       <>SLA adherence is <span className="text-white font-bold">{b.slaPct.toFixed(1)}%</span> across <span className="text-white font-bold">{b.doneCount}</span> tasks completed this week. Not enough history last week to compare a trend yet.</>
                     ) : (
                       <>The team is <span className="text-white font-bold">{b.resolutionDeltaPct >= 0 ? "outperforming" : "behind"}</span> last week&apos;s pace by <span className="text-emerald-400 font-bold">{Math.abs(b.resolutionDeltaPct).toFixed(0)}%</span>. Tasks are resolving <span className="text-white font-bold">{Math.abs(b.resolutionDeltaMinutes).toFixed(0)}m</span> {b.resolutionDeltaMinutes >= 0 ? "faster" : "slower"}.</>
                     )}
                   </p>
                   <div className="grid grid-cols-2 gap-10">
                      <div className="space-y-3">
                         <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                            <span>SLA Adherence</span>
                            <span className="text-white">{b.slaPct.toFixed(1)}%</span>
                         </div>
                         <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ width: `${Math.min(100, b.slaPct)}%` }} />
                         </div>
                      </div>
                      <div className="space-y-3">
                         <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                            <span>Tasks / Productive Hr</span>
                            <span className="text-white">{tasksPerHour.toFixed(1)}x</span>
                         </div>
                         <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" style={{ width: `${Math.min(100, tasksPerHour * 20)}%` }} />
                         </div>
                      </div>
                   </div>
                </div>

                {/* Decorative Pattern */}
                <div className="absolute -right-10 -bottom-10 opacity-[0.05]">
                   <TrendingUp size={240} />
                </div>
             </div>
               );
             })()}
          </div>
        </>
      )}
      
      {activeTab === 'agents' && (
        <AgentIntelligence onRefresh={fetchData} />
      )}

      {activeTab === 'attendance' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Active Strength" value={onlineMembers.length} icon={UserCheck} sub={`${data.members.length} total profiles`} accent="text-emerald-600" />
            <MetricCard label="System Idleness" value={awayMembers.length} icon={Clock} sub="Agents currently away" accent="text-amber-600" />
            <MetricCard label="Leave Pipeline" value={pendingLeaves.length} icon={Calendar} sub="Awaiting HR approval" accent="text-rose-600" />
            <MetricCard label="Avg Efficiency" value={`${data.stats.avgProductive}m`} icon={TrendingUp} sub="Daily productive avg" accent="text-[#1c1c1c]" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-4">
               <div className="card overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#fcfbf8] border-b border-gray-100">
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Team Member</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">State</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">Work/Break</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.members.slice((attendancePage - 1) * ITEMS_PER_PAGE, attendancePage * ITEMS_PER_PAGE).map(m => (
                        <tr key={m.id} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="px-6 py-5">
                             <div className="flex items-center gap-4">
                               <Avatar name={m.name} size="md" />
                               <div>
                                 <div className="text-sm font-black text-[#1c1c1c] tracking-tight">{m.name}</div>
                                 <div className="text-[10px] font-bold text-gray-400">{m.email}</div>
                               </div>
                             </div>
                          </td>
                          <td className="px-6 py-5">
                             <div className="flex flex-col gap-1">
                               <div className="flex items-center gap-1.5">
                                  <div className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    m.status === 'Online' ? 'bg-emerald-500' : m.status === 'Away' ? 'bg-amber-500' : 'bg-gray-300'
                                  )} />
                                  <span className={cn(
                                    "text-[11px] font-black uppercase tracking-wider",
                                    m.status === 'Online' ? 'text-emerald-600' : m.status === 'Away' ? 'text-amber-600' : 'text-gray-400'
                                  )}>{m.status}</span>
                               </div>
                               {m.statusSince && <span className="text-[9px] font-bold text-gray-400">Since {m.statusSince}</span>}
                             </div>
                          </td>
                          <td className="px-6 py-5">
                             <div className="flex flex-col items-center gap-1.5">
                                <div className="flex gap-4">
                                   <div className="text-center">
                                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Work</div>
                                      <div className="text-xs font-black text-[#1c1c1c]">{formatMins(m.productiveMinutes)}</div>
                                   </div>
                                   <div className="text-center">
                                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Break</div>
                                      <div className={cn("text-xs font-black", getBreakColor(m.breakMinutes))}>{m.breakMinutes}m</div>
                                   </div>
                                </div>
                                <div className="w-24 h-1 bg-gray-100 rounded-full overflow-hidden">
                                   <div 
                                     className="h-full bg-[#1c1c1c] transition-all duration-1000" 
                                     style={{ width: `${Math.min(100, (m.productiveMinutes / 480) * 100)}%` }}
                                   />
                                </div>
                             </div>
                          </td>
                          <td className="px-6 py-5 text-right">
                             <button 
                               onClick={() => setSelectedMember(m)}
                               className="p-2 hover:bg-[#1c1c1c] hover:text-white rounded-lg transition-all text-gray-400"
                               title="View Timeline"
                             >
                                <Eye className="w-4 h-4" />
                             </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
               {data.members.length > ITEMS_PER_PAGE && (
                 <div className="px-6 border-t border-gray-100 bg-white">
                   <Pagination 
                     current={attendancePage} 
                     total={data.members.length} 
                     pageSize={ITEMS_PER_PAGE} 
                     onChange={setAttendancePage} 
                   />
                 </div>
               )}
            </div>

            <div className="space-y-6">
               {/* Team Utilization Bar Chart */}
               <div className="card p-6">
                  <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest mb-6 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Productivity Mix
                  </h3>
                  <div className="h-[250px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.members.filter(m => m.shiftStart)}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                           <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#1c1c1c' }} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#9ca3af' }} />
                           <Tooltip 
                             cursor={{ fill: 'rgba(28,28,28,0.02)' }}
                             contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '12px', fontWeight: 'bold' }}
                           />
                           <Bar dataKey="productiveMinutes" name="Work (mins)" stackId="a" fill="#1c1c1c" radius={[0, 0, 0, 0]} />
                           <Bar dataKey="breakMinutes" name="Break (mins)" stackId="a" fill="#e11d48" radius={[4, 4, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>
               </div>

               {/* Real-time Activity Feed */}
               <div className="card p-6">
                  <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest mb-4 flex items-center gap-2">
                    <History className="w-4 h-4" /> Recent Transitions
                  </h3>
                  <div className="space-y-4">
                     {data.members.flatMap(m => m.timeline.map(t => ({ ...t, name: m.name }))).sort((a,b) => b.time.localeCompare(a.time)).slice(0, 5).map((log, i) => (
                       <div key={i} className="flex gap-3 relative pb-4 last:pb-0">
                          {i < 4 && <div className="absolute left-[7px] top-4 bottom-0 w-[2px] bg-gray-50" />}
                          <div className={cn(
                            "w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm shrink-0 z-10 mt-0.5",
                            log.status === 'online' ? 'bg-emerald-500' : log.status === 'offline' ? 'bg-gray-400' : 'bg-amber-500'
                          )} />
                          <div className="flex-1 min-w-0">
                             <div className="text-[10px] font-black text-[#1c1c1c] tracking-tight">{log.name} → <span className="uppercase">{log.status}</span></div>
                             <div className="text-[9px] text-gray-400 font-bold">{log.time} {log.reason && `• ${log.reason}`}</div>
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'leaves' && (
        <div className="space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                 <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-2">
                   <Calendar className="w-4 h-4 text-[#1c1c1c]" /> Awaiting Review
                 </h2>
                 {pendingLeaves.length === 0 ? (
                   <div className="card p-12 flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                         <CheckCircle className="w-8 h-8 text-emerald-500" />
                      </div>
                      <h3 className="text-sm font-black text-[#1c1c1c]">No Pending Requests</h3>
                      <p className="text-xs text-gray-400 mt-1">Great! Your leave inbox is empty.</p>
                   </div>
                 ) : (
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {pendingLeaves.map(leave => (
                        <div key={leave.id} className="card p-5 border-l-4 border-l-amber-400 hover:shadow-xl transition-all duration-300 group">
                           <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3">
                                 <Avatar name={leave.profile.name} size="sm" />
                                 <div>
                                    <div className="text-xs font-black text-[#1c1c1c]">{leave.profile.name}</div>
                                    <div className="text-[9px] text-gray-400 font-bold">{mounted ? new Date(leave.created_at).toLocaleDateString() : "--"}</div>
                                 </div>
                              </div>
                              <div className="bg-amber-50 text-amber-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">Pending</div>
                           </div>
                           <div className="space-y-3">
                              <div className="p-3 bg-gray-50 rounded-xl">
                                 <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">Duration</div>
                                 <div className="text-xs font-black text-[#1c1c1c] flex items-center gap-2">
                                    <Calendar className="w-3 h-3" /> {leave.start_date} <span className="text-gray-300">→</span> {leave.end_date}
                                 </div>
                              </div>
                              <div className="p-3 bg-gray-50 rounded-xl">
                                 <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">Reason</div>
                                 <p className="text-xs text-gray-600 leading-relaxed italic">&quot;{leave.reason}&quot;</p>
                              </div>
                              <div className="flex gap-2 pt-2">
                                 <button 
                                   onClick={() => setLeaveActionModal({ id: leave.id, action: 'approved' })}
                                   className="flex-1 h-9 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10 transition-all"
                                 >
                                    <CheckCircle className="w-3 h-3" /> Approve
                                 </button>
                                 <button 
                                   onClick={() => setLeaveActionModal({ id: leave.id, action: 'rejected' })}
                                   className="flex-1 h-9 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black rounded-lg flex items-center justify-center gap-1.5 shadow-lg shadow-rose-500/10 transition-all"
                                 >
                                    <XCircle className="w-3 h-3" /> Reject
                                 </button>
                              </div>
                           </div>
                        </div>
                      ))}
                   </div>
                 )}
              </div>

              <div className="space-y-4">
                 <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-2">
                   <History className="w-4 h-4 text-[#1c1c1c]" /> Processed Leaves
                 </h2>
                 <div className="card p-5 space-y-4">
                    {data.leaves.filter(l => l.status !== 'pending').slice((leavesPage - 1) * 8, leavesPage * 8).map(leave => (
                      <div key={leave.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-transparent hover:border-gray-100 transition-all group">
                         <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center",
                              leave.status === 'approved' ? 'bg-emerald-50' : 'bg-rose-50'
                            )}>
                               {leave.status === 'approved' ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
                            </div>
                            <div>
                               <div className="text-[10px] font-black text-[#1c1c1c] tracking-tight">{leave.profile.name}</div>
                               <div className="text-[8px] font-bold text-gray-400">{leave.start_date}</div>
                            </div>
                         </div>
                         <div className={cn(
                           "text-[8px] font-black uppercase tracking-widest",
                           leave.status === 'approved' ? 'text-emerald-500' : 'text-rose-500'
                         )}>
                            {leave.status}
                         </div>
                      </div>
                    ))}
                    {data.leaves.filter(l => l.status !== 'pending').length === 0 && (
                      <p className="text-[10px] text-gray-400 italic text-center py-4">No processed history found.</p>
                    )}
                    {data.leaves.filter(l => l.status !== 'pending').length > 8 && (
                      <div className="pt-2 border-t border-gray-100">
                        <Pagination 
                          current={leavesPage} 
                          total={data.leaves.filter(l => l.status !== 'pending').length} 
                          pageSize={8} 
                          onChange={setLeavesPage} 
                        />
                      </div>
                    )}
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'calculator' && (
        <PayrollCalculator />
      )}

      {activeTab === 'employees' && (
        <EmployeeDirectory data={data.employees} onRefresh={fetchData} />
      )}

      {activeTab === 'attendance-reg' && (
        <AttendanceRegister 
          members={data.members} 
          employees={data.employees}
          attendanceLogs={data.attendance}
          holidays={data.holidays}
          onRefresh={fetchData} 
        />
      )}

      {activeTab === 'payroll' && (
        <PayrollRun revisions={data.revisions} expenses={data.expenses} employees={data.employees} payrollStatus={data.payrollStatus} payrollMonth={data.payrollMonth} onRefresh={fetchData} />
      )}

      {activeTab === 'documents' && (
        <HRDocuments policies={data.policies} onRefresh={fetchData} />
      )}

      {activeTab === 'announcements' && (
        <Announcements announcements={data.announcements} onRefresh={fetchData} />
      )}

      {activeTab === 'engagement' && (
        <HREngagement 
          reviews={data.reviews} 
          assignments={data.training} 
          grievances={data.grievances} 
          employees={data.employees}
          onRefresh={fetchData} 
        />
      )}

      {/* Member Detail Timeline Modal */}
      <Modal 
        open={!!selectedMember} 
        onClose={() => setSelectedMember(null)}
        title="Member Timeline"
      >
        <div className="py-2 space-y-6">
           <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <Avatar name={selectedMember?.name || ""} size="md" />
              <div>
                 <div className="text-sm font-black text-[#1c1c1c] tracking-tight">{selectedMember?.name}</div>
                 <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Shift Activity Feed</div>
              </div>
           </div>
           
           <div className="pt-2 space-y-6">
           <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                 <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Productivity</div>
                 <div className="text-lg font-black text-[#1c1c1c]">{selectedMember ? formatMins(selectedMember.productiveMinutes) : '—'}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                 <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Break Utilization</div>
                 <div className={cn("text-lg font-black", selectedMember && getBreakColor(selectedMember.breakMinutes))}>{selectedMember?.breakMinutes}m</div>
              </div>
           </div>

           <div className="space-y-4">
              <h4 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-[0.2em] px-1">Raw Transition Logs</h4>
              <div className="space-y-4">
                 {selectedMember?.timeline.map((log, i) => (
                   <div key={i} className="flex gap-4 relative pb-4 last:pb-0">
                      {i < (selectedMember?.timeline.length - 1) && <div className="absolute left-[7px] top-4 bottom-0 w-[2px] bg-gray-100" />}
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 border-white shadow-sm shrink-0 z-10 mt-0.5",
                        log.status === 'online' ? 'bg-emerald-500' : log.status === 'offline' ? 'bg-gray-400' : 'bg-amber-500'
                      )} />
                      <div className="flex-1">
                         <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-[#1c1c1c] uppercase tracking-wider">{log.status}</span>
                            <span className="text-[10px] font-bold text-gray-400">{log.time}</span>
                         </div>
                         {log.reason && <p className="text-[10px] text-gray-500 mt-0.5 italic">&quot;{log.reason}&quot;</p>}
                      </div>
                   </div>
                 ))}
                 {(!selectedMember?.timeline || selectedMember?.timeline.length === 0) && (
                   <div className="py-8 text-center">
                      <p className="text-xs text-gray-400 font-medium italic">No transitions recorded for this shift yet.</p>
                   </div>
                 )}
              </div>
           </div>
           
           <button className="btn-secondary w-full py-3" onClick={() => setSelectedMember(null)}>Close Activity Review</button>
        </div>
      </div>
    </Modal>

      {/* Leave Action Remarks Modal */}
      <Modal 
        open={!!leaveActionModal} 
        onClose={() => {
          setLeaveActionModal(null);
          setLeaveRemarks("");
        }} 
        title={leaveActionModal?.action === 'approved' ? 'Approve Leave' : 'Reject Leave'}
        maxWidth="max-w-xs"
      >
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Remarks (Optional)</label>
            <textarea 
              className="input text-xs min-h-[80px] py-2" 
              placeholder={`Any remarks for ${leaveActionModal?.action}?`}
              value={leaveRemarks}
              onChange={e => setLeaveRemarks(e.target.value)}
            />
          </div>
          <button 
            onClick={handleLeaveAction}
            className={cn(
              "btn w-full py-3 text-xs gap-2 text-white",
              leaveActionModal?.action === 'approved' ? "bg-emerald-500 hover:bg-emerald-600 border-none" : "bg-rose-500 hover:bg-rose-600 border-none"
            )}
          >
            {leaveActionModal?.action === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, sub, accent = "text-[#1c1c1c]" }: any) {
  return (
    <div className="card p-6 relative overflow-hidden group hover:shadow-xl transition-all duration-500 border border-transparent hover:border-gray-100">
      <div className="flex justify-between items-start mb-3">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{label}</p>
          <h3 className={cn("text-3xl font-black tracking-tighter", accent)}>{value}</h3>
        </div>
        <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-[#1c1c1c] group-hover:text-white transition-all duration-500 scale-110 shadow-sm">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-[11px] text-gray-400 font-bold truncate opacity-80 mt-3">{sub}</p>
      
      {/* Subtle Background Pattern */}
      <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500">
         <Icon size={120} />
      </div>
    </div>
  );
}

export default function HRDashboard() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[#fcfbf8]">
        <RefreshCw className="w-8 h-8 text-[#1c1c1c] animate-spin" />
      </div>
    }>
      <HRDashboardContent />
    </Suspense>
  );
}

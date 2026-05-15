"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  BarChart2, Users, ShoppingBag, 
  CheckSquare, ArrowLeft, Loader2, 
  Clock, Zap, Calendar, Mail, 
  Phone, Shield, User, TrendingUp,
  Activity, ListChecks, CheckCircle2,
  AlertCircle
} from "lucide-react";
import { PageHeader, Avatar, StatCard, SectionTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { formatCurrency, cn } from "@/lib/utils";
import { format } from "date-fns";

export default function AgentDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [activeTasks, setActiveTasks] = useState<any[]>([]);



    const fetchTasks = useCallback(async () => {
        const { data } = await supabase
            .from("tasks")
            .select("*, customer:customers(name, phone)")
            .eq("assigned_to", id)
            .in("status", ["pending", "due", "overdue"])
            .order("due_date", { ascending: true })
            .limit(10);
        setActiveTasks(data || []);
    }, [id, supabase]);

    const fetchAgentData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch Profile
            const { data: prof } = await supabase.from("profiles").select("*").eq("id", id).single();
            setProfile(prof);

            // Fetch Analytics (Last 30 days)
            const end = new Date().toISOString();
            const start = new Date(Date.now() - 30 * 86400000).toISOString();
            
            const res = await fetch(`/api/admin/analytics/agents?start=${start}&end=${end}`);
            const json = await res.json();
            
            const agentStats = json.data.find((a: any) => a.id === id);
            const agentAttendance = json.dailyLogs.filter((a: any) => a.name.includes(prof?.name || prof?.email));

            // Fetch specific activity logs for this agent
            const { data: specificActivity } = await supabase
                .from("agent_activity_logs")
                .select("*")
                .eq("agent_id", id)
                .order("created_at", { ascending: false })
                .limit(50);

            setStats({
                metrics: agentStats,
                activity: specificActivity,
                attendance: agentAttendance
            });

            await fetchTasks();
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    }, [id, supabase, fetchTasks]);

    useEffect(() => {
        if (!id) return;
        fetchAgentData();

        // Real-time Subscription for Live Sync
        

        return () => {
            
        };
    }, [id, fetchAgentData]);

    if (loading) return (
        <div className="h-screen flex items-center justify-center bg-[#fcfbf8]">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-[#1c1c1c]" />
                <p className="text-xs font-bold text-[#5f5f5d] uppercase tracking-widest">Establishing Live Feed...</p>
            </div>
        </div>
    );

    if (!profile) return (
        <div className="h-screen flex items-center justify-center bg-[#fcfbf8]">
            <div className="text-center">
                <p className="text-lg font-bold text-rose-600">Agent Not Found</p>
                <button onClick={() => router.back()} className="mt-4 btn-secondary">Go Back</button>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in p-6 lg:p-10 space-y-10 bg-[#fcfbf8] min-h-screen">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-[#eceae4] transition-all">
                    <ArrowLeft className="w-5 h-5 text-[#1c1c1c]" />
                </button>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Avatar name={profile.name || profile.email} size="lg" />
                        <div className={cn(
                            "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-4 border-[#fcfbf8] transition-all duration-500",
                            profile.status === 'online' ? "bg-emerald-500 animate-pulse" : 
                            ["break", "lunch", "away"].includes(profile.status) ? "bg-amber-500" : 
                            profile.status === 'meeting' ? "bg-indigo-500" : "bg-gray-400"
                        )} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-[#1c1c1c] tracking-tight uppercase flex items-center gap-3">
                            {profile.name || "Unknown Agent"}
                            {profile.status === 'online' && <div className="text-[10px] font-black text-emerald-600 tracking-widest flex items-center gap-1"><Activity className="w-3 h-3" /> LIVE</div>}
                        </h1>
                        <p className="text-sm text-[#5f5f5d] font-bold">{profile.email} • <span className="capitalize">{profile.role}</span></p>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    <div className={cn(
                        "px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all duration-500 shadow-sm",
                        profile.status === 'online' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : 
                        ["break", "lunch", "away"].includes(profile.status) ? "bg-amber-50 text-amber-700 border-amber-200" : 
                        profile.status === 'meeting' ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                        "bg-gray-50 text-gray-500 border-gray-100"
                    )}>
                        {profile.status || 'offline'}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="Live Revenue" value={formatCurrency(stats?.metrics?.revenue || 0)} trend="up" trendValue={stats?.metrics?.revenue > 0 ? "Daily High" : ""} icon={<TrendingUp className="w-4 h-4" />} />
                <StatCard label="Tasks Completed" value={stats?.metrics?.taskCount || 0} icon={<CheckSquare className="w-4 h-4" />} />
                <StatCard label="Session Hours" value={stats?.metrics?.onlineHours || "00:00:00"} icon={<Clock className="w-4 h-4" />} />
                <StatCard label="Flow Efficiency" value={`${stats?.metrics?.productivity || 0} T/H`} icon={<Zap className="w-4 h-4" />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* Live Task Sync Table */}
                    <div className="card p-8 border-l-4 border-l-[#1c1c1c]">
                        <SectionTitle>
                            <ListChecks className="w-4 h-4 text-[#1c1c1c]" />
                            Live Task Queue
                            <span className="ml-auto text-[10px] text-gray-400 font-bold bg-[#eceae4] px-2 py-0.5 rounded-full">
                                {activeTasks.length} PENDING
                            </span>
                        </SectionTitle>
                        <div className="overflow-x-auto mt-6">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-[#eceae4]">
                                        <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Customer</th>
                                        <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Task Type</th>
                                        <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Due</th>
                                        <th className="py-3 text-right text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#eceae4]/50">
                                    {activeTasks.map((task: any) => (
                                        <tr key={task.id} className="hover:bg-[rgba(28,28,28,0.02)] transition-colors">
                                            <td className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-[#1c1c1c] uppercase">{task.customer?.name}</span>
                                                    <span className="text-[9px] text-gray-400 font-bold tracking-wider">{task.customer?.phone}</span>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <span className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-tight">{task.task_type.replace(/_/g, ' ')}</span>
                                            </td>
                                            <td className="py-4 text-[10px] font-bold text-[#5f5f5d]">
                                                {format(new Date(task.due_date), "MMM dd • HH:mm")}
                                            </td>
                                            <td className="py-4 text-right">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-[4px] text-[9px] font-black uppercase tracking-widest border",
                                                    task.status === "overdue" ? "bg-rose-50 text-rose-700 border-rose-100" : "bg-amber-50 text-amber-700 border-amber-100"
                                                )}>
                                                    {task.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {activeTasks.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-10 text-center text-xs text-gray-400 italic">No active tasks in queue. Agent is idle.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="card p-8">
                        <SectionTitle>
                            <Calendar className="w-4 h-4 text-[#1c1c1c]" />
                            Daily Attendance History
                        </SectionTitle>
                        <div className="overflow-x-auto mt-6">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-[#eceae4]">
                                        <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Date</th>
                                        <th className="py-3 text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Status</th>
                                        <th className="py-3 text-center text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">In</th>
                                        <th className="py-3 text-center text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Out</th>
                                        <th className="py-3 text-right text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest">Work Hours</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#eceae4]/50">
                                    {stats?.attendance?.slice(0, 15).map((log: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-[rgba(28,28,28,0.02)] transition-colors">
                                            <td className="py-4 text-xs font-bold text-[#1c1c1c]">{format(new Date(log.date), "MMM dd, yyyy")}</td>
                                            <td className="py-4">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                                                    log.status === "Present" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                                )}>
                                                    {log.status}
                                                </span>
                                            </td>
                                            <td className="py-4 text-center text-xs font-bold text-[#5f5f5d]">{log.clockIn}</td>
                                            <td className="py-4 text-center text-xs font-bold text-[#5f5f5d]">{log.clockOut}</td>
                                            <td className="py-4 text-right text-xs font-bold text-[#1c1c1c]">{log.workHours}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="card p-8">
                        <SectionTitle>
                            <Zap className="w-4 h-4 text-[#1c1c1c]" />
                            Live Pulse Feed
                        </SectionTitle>
                        <div className="mt-6 space-y-6 max-h-[600px] overflow-y-auto no-scrollbar">
                            {stats?.activity?.map((act: any, idx: number) => (
                                <div key={idx} className="flex gap-4 group animate-in fade-in slide-in-from-right-4 duration-500">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#1c1c1c] mt-1.5 group-hover:scale-150 transition-all shadow-sm shadow-[#1c1c1c]/20" />
                                    <div className="flex-1 space-y-1">
                                        <div className="text-[11px] font-bold text-[#1c1c1c] uppercase tracking-tight leading-tight">
                                            {act.activity_type.replace(/_/g, ' ')}
                                        </div>
                                        <div className="text-[10px] text-[#5f5f5d] font-bold line-clamp-2 uppercase">
                                            {act.metadata?.note || act.metadata?.summary || (
                                                act.activity_type === 'task_completed' ? `Completed ${act.metadata?.task_type} for ${act.metadata?.customer_name}` :
                                                act.activity_type === 'task_rescheduled' ? `Rescheduled ${act.metadata?.task_type} for ${act.metadata?.customer_name} to ${act.metadata?.new_date}` :
                                                act.activity_type === 'task_skipped' ? `Skipped ${act.metadata?.task_type} for ${act.metadata?.customer_name}` :
                                                act.activity_type === 'whatsapp' ? `Sent WhatsApp to ${act.metadata?.customer_name}` :
                                                "Activity recorded"
                                            )}
                                        </div>
                                        <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest pt-0.5">
                                            {format(new Date(act.created_at), "HH:mm • MMM dd")}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(!stats?.activity || stats?.activity.length === 0) && (
                                <div className="text-center py-10">
                                    <p className="text-xs text-gray-400 italic">No recent activity logs.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

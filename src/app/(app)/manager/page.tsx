"use client";
import ManagerTaskReview from "@/components/ManagerTaskReview";
import dynamic from "next/dynamic";
import ManagerStatsGrid from "@/components/ManagerStatsGrid";
import GlobalSync from "@/components/hub/GlobalSync";
// Chart and map panels load after the page shell.
const AgentIntelligence = dynamic(() => import("@/components/hr/AgentIntelligence"), { ssr: false });
const CourierPerformance = dynamic(() => import("@/components/CourierPerformance"), { ssr: false });
const IndiaSalesMap = dynamic(() => import("@/components/IndiaSalesMap"), { ssr: false });
import { Shield, TrendingUp, Users, DollarSign, Map, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { AccessDenied } from "@/components/ui";
import { AssignTaskWidget } from "@/components/dashboard/AssignTaskWidget";

export default function ManagerHubPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();

  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#5f5f5d] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Authorizing Manager Access...</p>
      </div>
    );
  }

  if (profile?.role !== 'admin' && profile?.role !== 'manager') {
    return (
      <AccessDenied 
        title="Manager Hub Restricted" 
        desc="Access to the Manager Hub and Operational Oversight is restricted to managers and administrators." 
      />
    );
  }
  return (
    <div className="p-6 lg:p-8 space-y-12 max-w-[1600px] mx-auto">
      {/* Header & Quick Stats */}
      <div className="space-y-12 pb-10 border-b border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center gap-2 text-emerald-500 font-bold text-[10px] uppercase tracking-[0.3em] animate-fade-in">
              <Shield className="w-3 h-3" /> Operational Oversight
            </div>
            <h1 className="page-title !text-5xl font-black tracking-tighter">Manager Hub</h1>
            <p className="text-gray-500 font-medium text-sm leading-relaxed">
              Verify agent task resolutions, monitor real-time activity, and process Shiprocket NDR actions to ensure fulfillment excellence.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/manager/revenue" className="group relative px-8 py-3 rounded-2xl bg-[#1c1c1c] text-white overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-emerald-500/20">
               <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-600 opacity-90 group-hover:opacity-100 transition-opacity" />
               <div className="relative flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 leading-none mb-1">Financial Intelligence</span>
                    <span className="text-sm font-black tracking-tight">Revenue Dashboard</span>
                  </div>
                  <TrendingUp className="w-4 h-4 ml-2 opacity-50 group-hover:opacity-100 transition-opacity group-hover:translate-x-1 duration-300" />
               </div>
            </Link>
            <AssignTaskWidget />
            <GlobalSync />
          </div>
        </div>

        <ManagerStatsGrid />
      </div>

      <div className="space-y-16">
        <div className="space-y-8">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm">
                 <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                 <h2 className="text-xl font-black text-[#1c1c1c] tracking-tight">Logistics Pulse</h2>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Courier Performance Metrics</p>
              </div>
           </div>
           <div className="bg-white/30 backdrop-blur-md rounded-[32px] p-1 border border-gray-100/50">
              <CourierPerformance />
           </div>
        </div>

        {/* Regional Sales Map */}
        <div className="space-y-8">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center shadow-sm">
                 <Map className="w-5 h-5" />
              </div>
              <div>
                 <h2 className="text-xl font-black text-[#1c1c1c] tracking-tight">Geospatial Intelligence</h2>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Regional Sales Distribution</p>
              </div>
           </div>
           <IndiaSalesMap />
        </div>

        <div className="space-y-8">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
                 <Users className="w-5 h-5" />
              </div>
              <div>
                 <h2 className="text-xl font-black text-[#1c1c1c] tracking-tight">Agent Network</h2>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Live Activity Status</p>
              </div>
           </div>
           <div className="bg-white/50 backdrop-blur-sm rounded-[32px] p-2 border border-emerald-100/50">
              <AgentIntelligence />
           </div>
        </div>

        <div className="pt-8 border-t border-gray-100">
          <ManagerTaskReview />
        </div>
      </div>

    </div>
  );
}

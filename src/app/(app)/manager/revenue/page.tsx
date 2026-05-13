"use client";
import RevenueDashboard from "@/components/RevenueDashboard";
import { DollarSign, ChevronLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { AccessDenied } from "@/components/ui";

export default function RevenueManagerPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();

  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#5f5f5d] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Loading Financial Data...</p>
      </div>
    );
  }

  if (profile?.role !== 'admin' && profile?.role !== 'manager') {
    return (
      <AccessDenied 
        title="Revenue Intelligence Locked" 
        desc="Access to financial recovery data and ROI tracking is restricted to authorized managers." 
      />
    );
  }
  return (
    <div className="p-6 lg:p-8 space-y-10 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3">
          <Link 
            href="/manager" 
            className="flex items-center gap-2 text-gray-400 hover:text-[#1c1c1c] font-bold text-[10px] uppercase tracking-widest transition-colors mb-4 group"
          >
            <ChevronLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> Back to Hub
          </Link>
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-[10px] uppercase tracking-[0.3em] animate-fade-in">
            <DollarSign className="w-3 h-3" /> Financial Intelligence
          </div>
          <h1 className="page-title !text-5xl font-black tracking-tighter">Revenue Recovery</h1>
          <p className="text-gray-500 font-medium text-sm max-w-lg leading-relaxed">
            Monitor real-time financial impact of abandoned cart recovery and NDR resolutions. Track ROI and agent performance.
          </p>
        </div>
      </div>

      <RevenueDashboard />
    </div>
  );
}

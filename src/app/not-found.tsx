import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f7f4ed] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none"
           style={{ backgroundImage: `radial-gradient(#1c1c1c 1px, transparent 1px)`, backgroundSize: '24px 24px' }} />

      <div className="w-full max-w-[420px] relative z-10 text-center">
        <div className="group relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 bg-[#1c1c1c]/10 rounded-2xl blur-xl" />
          <div className="relative w-full h-full bg-[#1c1c1c] rounded-2xl flex items-center justify-center shadow-2xl">
            <Zap className="w-8 h-8 text-[#f7f4ed]" strokeWidth={2} />
          </div>
        </div>

        <div className="bg-white rounded-[2rem] p-10 border border-[#eceae4] shadow-[0_20px_50px_rgba(28,28,28,0.05)]">
          <p className="text-6xl font-display font-black text-[#1c1c1c] tracking-tight mb-2">404</p>
          <h1 className="text-xl font-bold text-[#1c1c1c] mb-1">Page not found</h1>
          <p className="text-[#5f5f5d] text-[11px] font-medium uppercase tracking-wider mb-8">
            This route doesn&apos;t exist or was moved
          </p>

          <Link
            href="/"
            className="w-full h-14 bg-[#1c1c1c] text-[#f7f4ed] font-black uppercase tracking-widest rounded-2xl shadow-xl hover:shadow-[#1c1c1c]/10 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
        </div>

        <p className="mt-12 text-[9px] text-[#1c1c1c]/20 font-bold uppercase tracking-widest">
          &copy; 2026 CureForever Administrative Control
        </p>
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";
import { sendAdminNotification } from "@/lib/notifications";

export default function LoginPage() {
  const [email, setEmail] = useState("agent@cureforever.in");
  const [password, setPassword] = useState("demo1234");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      toast.error(error?.message || "Login failed");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    setLoading(false);
    await sendAdminNotification(`👤 Agent Log-in: ${email}`, "info");
    toast.success("Welcome back!");
    
    if (profile?.role === "manager") {
      router.push("/manager");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f4ed] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Editorial Decorative Background */}
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: `radial-gradient(#1c1c1c 1px, transparent 1px)`, backgroundSize: '24px 24px' }} />
      
      <div className="w-full max-w-[420px] relative z-10">
        {/* Logo Section */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="group relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 bg-[#1c1c1c]/10 rounded-2xl blur-xl group-hover:bg-[#1c1c1c]/20 transition-all duration-500" />
            <div className="relative w-full h-full bg-[#1c1c1c] rounded-2xl flex items-center justify-center shadow-2xl transition-transform hover:scale-105 duration-300">
              <Zap className="w-8 h-8 text-[#f7f4ed]" strokeWidth={2} />
            </div>
          </div>
          <h1 className="text-3xl font-display text-[#1c1c1c] tracking-tight mb-2 font-black uppercase">CureForever</h1>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-6 bg-[#1c1c1c]/10" />
            <span className="text-[#1c1c1c]/40 text-[9px] font-black uppercase tracking-[0.3em]">Administrative Suite</span>
            <div className="h-px w-6 bg-[#1c1c1c]/10" />
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-[2rem] p-10 border border-[#eceae4] shadow-[0_20px_50px_rgba(28,28,28,0.05)] relative overflow-hidden animate-slide-up">
          <div className="mb-10">
            <h2 className="text-xl font-bold text-[#1c1c1c] mb-1">Authorization Required</h2>
            <p className="text-[#5f5f5d] text-[11px] font-medium uppercase tracking-wider">Please authenticate to access the command center</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Terminal ID (Email)</label>
              <input 
                type="email" 
                className="w-full h-14 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium" 
                placeholder="admin@cureforever.in"
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required 
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest">Access Key</label>
                <button type="button" className="text-[10px] font-bold text-[#1c1c1c]/40 hover:text-[#1c1c1c] transition-colors">Recover</button>
              </div>
              <div className="relative">
                <input 
                  type={show ? "text" : "password"} 
                  className="w-full h-14 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 pr-12 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium" 
                  placeholder="••••••••"
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                />
                <button 
                  type="button" 
                  onClick={() => setShow(s => !s)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-[#1c1c1c]/20 hover:text-[#1c1c1c] transition-colors"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full h-14 bg-[#1c1c1c] text-[#f7f4ed] font-black uppercase tracking-widest rounded-2xl shadow-xl hover:shadow-[#1c1c1c]/10 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-[#f7f4ed]/20 border-t-[#f7f4ed] rounded-full animate-spin" />
              ) : (
                <>
                  <span>Initialize Session</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center">
          <div className="flex items-center justify-center gap-6 mb-4">
            <span className="text-[9px] font-black text-[#1c1c1c]/20 uppercase tracking-[0.2em]">V_01 Stable</span>
            <div className="w-1 h-1 rounded-full bg-[#1c1c1c]/10" />
            <span className="text-[9px] font-black text-[#1c1c1c]/20 uppercase tracking-[0.2em]">Encrypted Session</span>
          </div>
          <p className="text-[9px] text-[#1c1c1c]/20 font-bold uppercase tracking-widest leading-relaxed">
            &copy; 2026 CureForever Administrative Control
          </p>
        </div>
      </div>
    </div>
  );
}

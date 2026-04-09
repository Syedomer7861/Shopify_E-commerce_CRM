"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";

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
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    toast.success("Welcome back!");
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-forest/40 rounded-full blur-[120px] animate-pulse-slow" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-lime/20 rounded-full blur-[120px] animate-pulse-slow" />
      
      <div className="w-full max-w-[420px] relative z-10 animate-slide-up">
        {/* Logo Section */}
        <div className="text-center mb-10">
          <div className="group relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-lime/30 rounded-3xl blur-xl group-hover:bg-lime/50 transition-all duration-500 animate-pulse" />
            <div className="relative w-full h-full bg-forest rounded-3xl flex items-center justify-center border border-white/10 shadow-2xl transition-transform hover:scale-110 duration-300">
              <Zap className="w-10 h-10 text-lime" strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="text-4xl font-display text-white tracking-tight mb-2">CureForever</h1>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-white/20" />
            <span className="text-lime/60 text-[10px] font-bold uppercase tracking-[0.2em]">Partner Portal</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-white/20" />
          </div>
        </div>

        {/* Login Card - Glassmorphism */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-3xl p-8 border border-white/10 shadow-2xl relative overflow-hidden group">
          {/* Subtle line across the card */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          
          <div className="mb-8">
            <h2 className="text-2xl font-display text-white mb-1">Welcome Back</h2>
            <p className="text-white/40 text-xs">Sign in to manage your e-commerce operations</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest ml-1">Work Email</label>
              <div className="relative">
                <input 
                  type="email" 
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-lime/30 focus:border-lime/30 transition-all text-sm" 
                  placeholder="admin@cureforever.in"
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Password</label>
                <button type="button" className="text-[10px] font-bold text-lime/40 hover:text-lime transition-colors">Forgot?</button>
              </div>
              <div className="relative">
                <input 
                  type={show ? "text" : "password"} 
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 pr-12 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-lime/30 focus:border-lime/30 transition-all text-sm" 
                  placeholder="••••••••"
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                />
                <button 
                  type="button" 
                  onClick={() => setShow(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full h-12 bg-lime text-forest font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 disabled:opacity-50 disabled:translate-y-0 flex items-center justify-center gap-2 group/btn"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-forest/20 border-t-forest rounded-full animate-spin" />
              ) : (
                <>
                  <span>Initialize Dashboard</span>
                </>
              )}
            </button>
          </form>

          {/* Decorative Corner Accent */}
          <div className="absolute bottom-[-10px] right-[-10px] w-12 h-12 bg-white/5 rounded-full blur-xl group-hover:bg-white/10 transition-all" />
        </div>

        {/* Footer Info */}
        <div className="mt-12 flex flex-col items-center gap-4">
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">v4.0.2 Stable</span>
            <div className="w-1 h-1 rounded-full bg-white/10" />
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Cloud Sync Active</span>
          </div>
          <p className="text-[10px] text-white/10 text-center leading-relaxed">
            Secure biometric-encrypted access enabled. Unauthorized attempts are logged.<br/>
            &copy; 2026 CureForever Healthcare Systems
          </p>
        </div>
      </div>
    </div>
  );
}

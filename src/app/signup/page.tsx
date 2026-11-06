"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";

export default function SignupPage() {
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName, name, email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error || "Signup failed");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.success("Workspace created — sign in to continue.");
      window.location.href = "/login";
      return;
    }

    toast.success(`Welcome to ${orgName}!`);
    window.location.href = "/my-hub";
  }

  return (
    <div className="min-h-screen bg-[#f7f4ed] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: `radial-gradient(#1c1c1c 1px, transparent 1px)`, backgroundSize: '24px 24px' }} />

      <div className="w-full max-w-[420px] relative z-10">
        <div className="text-center mb-12 animate-fade-in">
          <div className="group relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 bg-[#1c1c1c]/10 rounded-full blur-xl group-hover:bg-[#1c1c1c]/20 transition-all duration-500" />
            <div className="relative w-full h-full rounded-full overflow-hidden shadow-2xl transition-transform hover:scale-105 duration-300">
              <img src="/logo-mark.png" alt="CodeCrest" className="w-full h-full object-cover" />
            </div>
          </div>
          <h1 className="text-3xl font-display text-[#1c1c1c] tracking-tight mb-2 font-black uppercase">CodeCrest</h1>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-6 bg-[#1c1c1c]/10" />
            <span className="text-[#1c1c1c]/40 text-[9px] font-black uppercase tracking-[0.3em]">Create Your Workspace</span>
            <div className="h-px w-6 bg-[#1c1c1c]/10" />
          </div>
        </div>

        <div className="bg-white rounded-[2rem] p-10 border border-[#eceae4] shadow-[0_20px_50px_rgba(28,28,28,0.05)] relative overflow-hidden animate-slide-up">
          <div className="mb-10">
            <h2 className="text-xl font-bold text-[#1c1c1c] mb-1">Get Started</h2>
            <p className="text-[#5f5f5d] text-[11px] font-medium uppercase tracking-wider">Set up your organization</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Organization Name</label>
              <input
                type="text"
                className="w-full h-14 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium"
                placeholder="Acme Inc."
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Your Name</label>
              <input
                type="text"
                className="w-full h-14 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium"
                placeholder="Jane Doe"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Email</label>
              <input
                type="email"
                className="w-full h-14 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Password</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  className="w-full h-14 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 pr-12 text-[#1c1c1c] placeholder:text-[#1c1c1c]/20 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]/20 transition-all text-sm font-medium"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={6}
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
                <span>Create Workspace</span>
              )}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center">
          <a href="/login" className="text-[10px] font-black text-[#1c1c1c]/40 hover:text-[#1c1c1c] uppercase tracking-widest transition-colors">
            Already have a workspace? Sign in
          </a>
        </div>
      </div>
    </div>
  );
}

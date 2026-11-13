"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";
import { sendAdminNotification } from "@/lib/notifications";
import { MfaChallenge, needsSecondFactor } from "@/components/auth/MfaChallenge";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mfaUserId, setMfaUserId] = useState<string | null>(null);
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

    // Two-factor on: ask for the code before anything else loads.
    if (await needsSecondFactor().catch(() => false)) {
      setLoading(false);
      setMfaUserId(data.user.id);
      return;
    }
    await finishLogin(data.user.id);
  }

  async function finishLogin(userId: string) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_demo")
      .eq("id", userId)
      .single();

    if (profile?.is_demo) {
      document.cookie = "crm-demo-mode=true; path=/; max-age=3600";
      toast.success("Logged in to Demo Instance");
    } else {
      document.cookie = "crm-demo-mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      toast.success("Welcome back!");
    }

    setLoading(false);
    sendAdminNotification(`👤 Agent Log-in: ${email}${profile?.is_demo ? ' (Demo Mode)' : ''}`, "info").catch(console.error);

    // Force a clean hard-redirect to guarantee cookies sync with Next.js SSR
    // middleware. Matches src/app/page.tsx's role routing exactly.
    const landingPage = profile?.role === "manager" ? "/manager"
      : profile?.role === "hr" ? "/hr"
        : "/dashboard";
    window.location.href = landingPage;
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
            <div className="absolute inset-0 bg-[#1c1c1c]/10 rounded-full blur-xl group-hover:bg-[#1c1c1c]/20 transition-all duration-500" />
            <div className="relative w-full h-full rounded-full overflow-hidden shadow-2xl transition-transform hover:scale-105 duration-300">
              <img src="/logo-mark.png" alt="CodeCrest" className="w-full h-full object-cover" />
            </div>
          </div>
          <h1 className="text-3xl font-display text-[#1c1c1c] tracking-tight mb-2 font-black uppercase">CodeCrest</h1>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-6 bg-[#1c1c1c]/10" />
            <span className="text-[#1c1c1c]/60 text-[10px] font-black uppercase tracking-[0.3em]">Administrative Suite</span>
            <div className="h-px w-6 bg-[#1c1c1c]/10" />
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-[2rem] p-10 border border-[#eceae4] shadow-[0_20px_50px_rgba(28,28,28,0.05)] relative overflow-hidden animate-slide-up">
          {mfaUserId ? (
            <MfaChallenge
              onDone={() => finishLogin(mfaUserId)}
              onCancel={async () => { await supabase.auth.signOut(); setMfaUserId(null); setPassword(""); }}
            />
          ) : (<>
          <div className="mb-10">
            <h2 className="text-xl font-bold text-[#1c1c1c] mb-1">Welcome Back</h2>
            <p className="text-[#5f5f5d] text-[11px] font-medium uppercase tracking-wider">Sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full h-14 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 text-[#1c1c1c] placeholder:text-[#1c1c1c]/35 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/15 focus:border-[#1c1c1c]/40 transition-all text-sm font-medium"
                placeholder="you@yourcompany.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label htmlFor="login-password" className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest">Password</label>
                {/* Accounts are created and reset by each organisation's admin; there is no self-serve reset. */}
                <button type="button" onClick={() => toast("Ask your organisation's admin to reset your password from the Team page.", { duration: 6000 })}
                  className="text-[11px] font-bold text-[#1c1c1c]/70 hover:text-[#1c1c1c] underline-offset-2 hover:underline transition-colors py-2 -my-2">Forgot password?</button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  className="w-full h-14 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-5 pr-12 text-[#1c1c1c] placeholder:text-[#1c1c1c]/35 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/15 focus:border-[#1c1c1c]/40 transition-all text-sm font-medium"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-xl text-[#1c1c1c]/50 hover:text-[#1c1c1c] transition-colors"
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
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>
          </>)}
        </div>

        <div className="mt-8 text-center">
          <a href="/contact" className="inline-block py-2 text-[11px] font-black text-[#1c1c1c]/70 hover:text-[#1c1c1c] uppercase tracking-widest transition-colors">
            Need a workspace? Contact us
          </a>
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center">
          <div className="flex items-center justify-center gap-6 mb-4">
            <span className="text-[9px] font-black text-[#1c1c1c]/50 uppercase tracking-[0.2em]">V_01</span>
            <div className="w-1 h-1 rounded-full bg-[#1c1c1c]/10" />
            <span className="text-[9px] font-black text-[#1c1c1c]/50 uppercase tracking-[0.2em]">Created By <a className="text-[9px] font-black text-[#1c1c1c]/50 uppercase tracking-[0.2em]" href="https://codecreststudio.vercel.app/">Codecrest_Studio</a></span>
          </div>
          <p className="text-[9px] text-[#1c1c1c]/50 font-bold uppercase tracking-widest leading-relaxed">
            &copy; 2026 CodeCrest Administrative Control
          </p>
        </div>
      </div>
    </div>
  );
}

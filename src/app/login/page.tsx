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
    <div className="min-h-screen bg-forest flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-lime flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7 text-forest" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-display text-white">CureForever CRM</h1>
          <p className="text-white/50 text-sm mt-1">Standalone CRM · WhatsApp Automation</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-forest mb-5">Sign in</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Password</label>
              <div className="relative">
                <input type={show ? "text" : "password"} className="input pr-10" value={password}
                  onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full btn-primary justify-center py-2.5 text-sm disabled:opacity-60">
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-4">
            Enter your credentials to access the dashboard
          </p>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          Built on Next.js · Supabase · Python Automation
        </p>
      </div>
    </div>
  );
}

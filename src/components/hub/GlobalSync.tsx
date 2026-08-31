"use client";
import { useState } from "react";
import { History, RefreshCw, X } from "lucide-react";
import { SyncProgressBar } from "@/components/ui";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { isDemoMode } from "@/lib/demo";

export default function GlobalSync() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSync = async () => {
    setSyncing(true);
    setProgress(0);
    setMessage("Initializing sync...");
    setIsComplete(false);
    setError(null);

    // This button has always been reachable from a demo login (the Manager
    // Hub allows role === 'manager', which the demo persona has always had)
    // with no guard at all - clicking it during a live demo would kick off
    // a real Shopify/Shiprocket sync against production. Fake the progress
    // bar instead.
    const isDemo = isDemoMode();
    if (isDemo) {
      const steps = [
        [20, "Connecting to Shopify..."],
        [45, "Syncing orders..."],
        [70, "Connecting to Shiprocket..."],
        [90, "Reconciling delivery status..."],
        [100, "System-wide synchronization complete!"],
      ] as const;
      for (const [pct, msg] of steps) {
        await new Promise((r) => setTimeout(r, 500));
        setProgress(pct);
        setMessage(msg);
      }
      setIsComplete(true);
      toast.success("System-wide synchronization complete!");
      setTimeout(() => setSyncing(false), 3000);
      return;
    }

    try {
      const response = await fetch("/api/sync/all?stream=true");
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.progress !== undefined) setProgress(data.progress);
              if (data.message) setMessage(data.message);
              if (data.error) throw new Error(data.error);
              if (data.progress === 100) {
                setIsComplete(true);
                toast.success("System-wide synchronization complete!");
              }
            } catch (e) {
              console.error("Error parsing sync chunk:", e);
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Sync failed");
      toast.error(err.message || "Sync failed");
    } finally {
      // Keep it visible for a moment if successful
      if (!error) {
        setTimeout(() => {
          if (!error) setSyncing(false);
        }, 3000);
      }
    }
  };

  return (
    <>
      <button 
        onClick={startSync}
        disabled={syncing}
        className={cn(
          "group relative px-8 py-3 rounded-2xl bg-white border border-gray-100 text-[#1c1c1c] overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl",
          syncing && "opacity-50 cursor-not-allowed"
        )}
      >
         <div className="relative flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center">
              {syncing ? (
                <RefreshCw className="w-4 h-4 text-[#1c1c1c] animate-spin" />
              ) : (
                <History className="w-4 h-4 text-[#1c1c1c]" />
              )}
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 leading-none mb-1">
                {syncing ? "Syncing..." : "Live Sync"}
              </span>
              <span className="text-sm font-black tracking-tight">Global Refresh</span>
            </div>
         </div>
      </button>

      {syncing && (
        <div className="fixed bottom-8 right-8 z-50 w-80 animate-in slide-in-from-right-8 fade-in duration-500">
          <div className="glass-panel p-6 shadow-2xl border border-white/20 bg-white/90 backdrop-blur-xl rounded-3xl">
            <div className="flex items-center justify-between mb-4">
               <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sync Monitor</h4>
               <button onClick={() => setSyncing(false)} className="text-gray-400 hover:text-[#1c1c1c]">
                 <X className="w-4 h-4" />
               </button>
            </div>
            <SyncProgressBar 
              progress={progress} 
              message={message} 
              isComplete={isComplete} 
              error={error} 
            />
            {isComplete && (
               <button 
                 onClick={() => setSyncing(false)}
                 className="w-full mt-4 py-2 bg-[#1c1c1c] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-black transition-colors"
               >
                 Dismiss
               </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

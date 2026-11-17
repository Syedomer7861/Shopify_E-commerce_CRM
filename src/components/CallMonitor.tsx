import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Phone, PhoneOff, Play, Pause, Clock, User, CheckCircle2, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { isDemoMode } from "@/lib/demo";

export function CallMonitor() {
  const [activeCalls, setActiveCalls] = useState<any[]>([]);
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchCalls = useCallback(async () => {
    const isDemo = typeof document !== 'undefined' && isDemoMode();
    
    if (isDemo) {
      const { MOCK_RAW_CALLS } = require('@/lib/mock-data');
      setActiveCalls(MOCK_RAW_CALLS.filter((c: any) => c.status === 'in_progress'));
      setRecentCalls(MOCK_RAW_CALLS.filter((c: any) => c.status === 'completed'));
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch In-Progress Calls
      const { data: active } = await supabase
        .from('raw_call_logs')
        .select('*, agent:profiles(name, email, avatar_url), task:tasks(task_type)')
        .eq('status', 'in_progress')
        .order('start_time', { ascending: false });

      // 2. Fetch Recent Completed Calls with Recordings
      const { data: recent } = await supabase
        .from('raw_call_logs')
        .select('*, agent:profiles(name, email, avatar_url), task:tasks(task_type)')
        .eq('status', 'completed')
        .order('end_time', { ascending: false })
        .limit(10);

      setActiveCalls(active || []);
      setRecentCalls(recent || []);
    } catch (err) {
      console.error('Error fetching monitor data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCalls();
    // Was a Realtime subscription on raw_call_logs (event '*') — a high-churn
    // table that fanned out to every viewer. A 30s poll (paused while the tab
    // is hidden) is enough for a monitor view and costs no Realtime quota.
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchCalls();
    }, 30_000);
    return () => clearInterval(id);
  }, [fetchCalls]);

  const togglePlay = (url: string, id: string) => {
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setPlayingId(id);
      }
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4f7fc8]"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />
      
      {/* Live Monitor */}
      <div className="bg-white rounded-3xl border border-[#ebece6] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-[#f6f7f2] flex items-center justify-between bg-rose-50/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <h2 className="font-bold text-xs uppercase tracking-wider text-rose-600">Live Agent Activity</h2>
          </div>
          <span className="text-[10px] font-bold text-rose-500">{activeCalls.length} Agent(s) currently on call</span>
        </div>
        
        <div className="divide-y divide-[#f6f7f2]">
          {activeCalls.length === 0 ? (
            <div className="p-8 text-center text-[#9a9a94] text-xs font-medium italic">
              No active calls right now.
            </div>
          ) : (
            activeCalls.map((call) => (
              <div key={call.id} className="p-4 flex items-center justify-between hover:bg-[#f6f7f2]/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#eef4fc] flex items-center justify-center text-[#4f7fc8]">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-[#1c1c1c] text-sm">{call.agent?.name || 'Unknown Agent'}</div>
                    <div className="text-[10px] text-[#6b6b67] flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> 
                      Started {formatDistanceToNow(new Date(call.start_time))} ago
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-[#3a3a36]">{call.customer_phone}</div>
                    <div className="text-[9px] uppercase font-bold tracking-tighter text-[#6f9bdd]">
                      {call.task?.task_type?.replace('_', ' ') || 'Direct Call'}
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-rose-500 text-white rounded-full text-[10px] font-bold animate-pulse uppercase">
                    ON CALL
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent History & Recordings */}
      <div className="bg-white rounded-3xl border border-[#ebece6] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-[#f6f7f2] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#55c08f]" />
            <h2 className="font-bold text-xs uppercase tracking-wider text-[#55554f]">Recent Recordings</h2>
          </div>
          <div className="text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider">Last 10 Logs</div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#f6f7f2]/50 text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Agent</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Duration</th>
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4 text-right">Recording</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f6f7f2]">
              {recentCalls.map((call) => (
                <tr key={call.id} className="hover:bg-[#f6f7f2]/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 rounded-lg bg-[#f0f0ec] flex items-center justify-center text-[#6b6b67] text-[10px] font-bold">
                         {call.agent?.name?.substring(0,1)}
                       </div>
                       <span className="font-bold text-[#3a3a36] text-xs">{call.agent?.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-mono text-[#55554f]">{call.customer_phone}</div>
                    <div className="text-[9px] text-[#9a9a94] uppercase font-bold">{call.task?.task_type?.replace('_', ' ')}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-[#6b6b67]">
                      {Math.floor(call.duration_seconds / 60)}:{(call.duration_seconds % 60).toString().padStart(2, '0')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[10px] text-[#9a9a94] font-medium">
                    {formatDistanceToNow(new Date(call.end_time || call.created_at))} ago
                  </td>
                  <td className="px-6 py-4 text-right">
                    {call.recording_url ? (
                      <button 
                        onClick={() => togglePlay(call.recording_url, call.id)}
                        className={cn(
                          "p-2 rounded-xl transition-all active:scale-95",
                          playingId === call.id ? "bg-[#1c1c1c] text-white" : "bg-[#eef4fc] text-[#4f7fc8] hover:bg-[#dfeafa]"
                        )}
                      >
                        {playingId === call.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                    ) : (
                      <span className="text-[9px] font-bold text-[#d4d5cd] uppercase italic">No Recording</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

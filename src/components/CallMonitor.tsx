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
    
    // Subscribe to real-time changes
    const channel = supabase
      .channel('call-monitor-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_call_logs' }, () => {
        fetchCalls();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchCalls]);

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
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />
      
      {/* Live Monitor */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-rose-50/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <h2 className="font-black text-xs uppercase tracking-widest text-rose-600">Live Agent Activity</h2>
          </div>
          <span className="text-[10px] font-bold text-rose-500">{activeCalls.length} Agent(s) currently on call</span>
        </div>
        
        <div className="divide-y divide-gray-50">
          {activeCalls.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs font-medium italic">
              No active calls right now.
            </div>
          ) : (
            activeCalls.map((call) => (
              <div key={call.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm">{call.agent?.name || 'Unknown Agent'}</div>
                    <div className="text-[10px] text-gray-500 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> 
                      Started {formatDistanceToNow(new Date(call.start_time))} ago
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-gray-700">{call.customer_phone}</div>
                    <div className="text-[9px] uppercase font-black tracking-tighter text-blue-500">
                      {call.task?.task_type?.replace('_', ' ') || 'Direct Call'}
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-rose-500 text-white rounded-full text-[10px] font-black animate-pulse uppercase">
                    ON CALL
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent History & Recordings */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h2 className="font-black text-xs uppercase tracking-widest text-gray-600">Recent Recordings</h2>
          </div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Last 10 Logs</div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Agent</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Duration</th>
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4 text-right">Recording</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentCalls.map((call) => (
                <tr key={call.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 text-[10px] font-bold">
                         {call.agent?.name?.substring(0,1)}
                       </div>
                       <span className="font-bold text-gray-700 text-xs">{call.agent?.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-mono text-gray-600">{call.customer_phone}</div>
                    <div className="text-[9px] text-gray-400 uppercase font-bold">{call.task?.task_type?.replace('_', ' ')}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-gray-500">
                      {Math.floor(call.duration_seconds / 60)}:{(call.duration_seconds % 60).toString().padStart(2, '0')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[10px] text-gray-400 font-medium">
                    {formatDistanceToNow(new Date(call.end_time || call.created_at))} ago
                  </td>
                  <td className="px-6 py-4 text-right">
                    {call.recording_url ? (
                      <button 
                        onClick={() => togglePlay(call.recording_url, call.id)}
                        className={cn(
                          "p-2 rounded-xl transition-all active:scale-95",
                          playingId === call.id ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                        )}
                      >
                        {playingId === call.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                    ) : (
                      <span className="text-[9px] font-black text-gray-300 uppercase italic">No Recording</span>
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

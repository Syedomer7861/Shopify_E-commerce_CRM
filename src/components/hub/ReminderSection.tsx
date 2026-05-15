"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Bell, Plus, Trash2, Loader2, Clock, Calendar, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { cn, timeAgo } from "@/lib/utils";
import toast from "react-hot-toast";

export function ReminderSection() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [tableError, setTableError] = useState(false);
  const [newReminder, setNewReminder] = useState({ title: "", date: "", time: "" });
  const supabase = useMemo(() => createClient(), []);
  const fetchReminders = useCallback(async () => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setReminders([
        { id: '1', title: 'Daily Team Standup', remind_at: new Date(Date.now() + 3600000).toISOString() },
        { id: '2', title: 'Product Inventory Check', remind_at: new Date(Date.now() + 86400000).toISOString() },
        { id: '3', title: 'Old Reminder', remind_at: new Date(Date.now() - 3600000).toISOString() },
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('personal_reminders')
        .select('*')
        .order('remind_at', { ascending: true });

      if (error) {
        if (error.code === '42P01') {
          setTableError(true);
          return;
        }
        throw error;
      }
      setReminders(data || []);
      setTableError(false);
    } catch (err) {
      // Missing table error handled via tableError state
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  async function addReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!newReminder.title || !newReminder.date || !newReminder.time) return;

    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      const remindAt = new Date(`${newReminder.date}T${newReminder.time}`);
      const mockReminder = {
        id: Math.random().toString(36).substr(2, 9),
        title: newReminder.title,
        remind_at: remindAt.toISOString()
      };
      setReminders([...reminders, mockReminder].sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime()));
      setNewReminder({ title: "", date: "", time: "" });
      setIsAdding(false);
      toast.success("Reminder set! (Demo)");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const remindAt = new Date(`${newReminder.date}T${newReminder.time}`);

      const { data, error } = await supabase
        .from('personal_reminders')
        .insert({
          user_id: user.id,
          title: newReminder.title,
          remind_at: remindAt.toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      setReminders([...reminders, data].sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime()));
      setNewReminder({ title: "", date: "", time: "" });
      setIsAdding(false);
      toast.success("Reminder set!");
    } catch (err) {
      toast.error("Failed to set reminder");
    }
  }

  async function deleteReminder(id: string) {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setReminders(reminders.filter(r => r.id !== id));
      toast.success("Reminder cancelled (Demo)");
      return;
    }

    try {
      const { error } = await supabase.from('personal_reminders').delete().eq('id', id);
      if (error) throw error;
      setReminders(reminders.filter(r => r.id !== id));
      toast.success("Reminder cancelled");
    } catch (err) {
      toast.error("Failed to cancel reminder");
    }
  }

  if (tableError) {
    return (
      <div className="card p-12 text-center bg-rose-50 border-rose-100">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
          <Bell className="w-8 h-8 text-rose-500 animate-pulse" />
        </div>
        <h3 className="text-xl font-black text-rose-900 mb-2">Reminders Not Initialized</h3>
        <p className="text-sm text-rose-700/60 max-w-md mx-auto mb-8 leading-relaxed">
          The personal reminders table is missing. Please run the setup script in the Supabase SQL Editor.
        </p>
        <div className="bg-[#1c1c1c] text-white p-4 rounded-2xl text-[11px] font-mono inline-block mb-4">
          scratch/setup_hub.sql
        </div>
        <div>
          <button 
            onClick={() => window.location.reload()}
            className="text-xs font-black text-rose-900 uppercase tracking-widest hover:underline"
          >
            Refresh after running script
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center">
            <Bell className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#1c1c1c] tracking-tight">Smart Reminders</h3>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Never miss a critical task</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const audio = new Audio('/notification.mp3');
              audio.volume = 1.0;
              audio.play().catch(e => toast.error("Click anywhere on page first!"));
              toast.success("Testing sound...");
            }}
            className="btn-secondary !text-[10px] !py-2 !px-4 flex items-center gap-2"
          >
            <Bell className="w-3.5 h-3.5" /> Test Audio
          </button>
          
          <button
            onClick={() => setIsAdding(true)}
            className="btn-primary !bg-rose-500 hover:!bg-rose-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Set Reminder
          </button>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={addReminder} className="card p-8 bg-white border-rose-100 shadow-xl shadow-rose-500/5 animate-in zoom-in-95 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Reminder Title</label>
              <input
                type="text"
                placeholder="What should we remind you about?..."
                className="input"
                required
                value={newReminder.title}
                onChange={e => setNewReminder({ ...newReminder, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Date</label>
              <input
                type="date"
                className="input"
                required
                value={newReminder.date}
                onChange={e => setNewReminder({ ...newReminder, date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Time</label>
              <input
                type="time"
                className="input"
                required
                value={newReminder.time}
                onChange={e => setNewReminder({ ...newReminder, time: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-50">
            <button type="button" onClick={() => setIsAdding(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary !bg-[#1c1c1c] !text-white">Save Reminder</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="py-10 text-center text-gray-300">
            <Loader2 className="w-8 h-8 animate-spin mx-auto" />
          </div>
        ) : reminders.length === 0 ? (
          <div className="py-12 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
             <AlertCircle className="w-10 h-10 text-gray-200 mx-auto mb-3" />
             <p className="text-gray-400 font-medium">You have no upcoming reminders.</p>
          </div>
        ) : (
          reminders.map(reminder => {
            const isPast = new Date(reminder.remind_at) < new Date();
            return (
              <div key={reminder.id} className={cn(
                "flex items-center gap-6 p-5 rounded-2xl border transition-all group",
                isPast ? "bg-gray-50 border-gray-100 opacity-60" : "bg-white border-[#eceae4] hover:border-rose-200 hover:shadow-lg hover:shadow-rose-500/5"
              )}>
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                  isPast ? "bg-gray-200" : "bg-rose-50"
                )}>
                  <Clock className={cn("w-6 h-6", isPast ? "text-gray-400" : "text-rose-500")} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-black text-[#1c1c1c] truncate">{reminder.title}</h4>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      <Calendar className="w-3 h-3" />
                      {new Date(reminder.remind_at).toLocaleDateString()}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-gray-200" />
                    <span className="text-[10px] font-bold text-[#1c1c1c]/60 uppercase tracking-widest">
                      {new Date(reminder.remind_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div className="text-right flex items-center gap-4">
                  {!isPast && (
                     <div className="hidden md:block">
                        <div className="text-[9px] font-black text-rose-500 uppercase tracking-tighter bg-rose-50 px-2 py-1 rounded">Upcoming</div>
                     </div>
                  )}
                  <button
                    onClick={() => deleteReminder(reminder.id)}
                    className="p-2 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

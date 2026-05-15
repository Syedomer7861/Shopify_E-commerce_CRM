"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { CheckCircle2, Circle, Plus, Trash2, Loader2, ListTodo, Star } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export function TodoSection() {
  const [todos, setTodos] = useState<any[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [tableError, setTableError] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const fetchTodos = useCallback(async () => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setTodos([
        { id: '1', text: 'Finish monthly sales report', priority: 'high', is_completed: false, created_at: new Date().toISOString() },
        { id: '2', text: 'Review team performance metrics', priority: 'medium', is_completed: true, created_at: new Date().toISOString() },
        { id: '3', text: 'Update training documentation', priority: 'low', is_completed: false, created_at: new Date().toISOString() },
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('personal_todos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          setTableError(true);
          return;
        }
        throw error;
      }
      setTodos(data || []);
      setTableError(false);
    } catch (err: any) {
      // Missing table error handled via tableError state
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTodo.trim()) return;

    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      const mockTodo = {
        id: Math.random().toString(36).substr(2, 9),
        text: newTodo.trim(),
        priority: 'medium',
        is_completed: false,
        created_at: new Date().toISOString()
      };
      setTodos([mockTodo, ...todos]);
      setNewTodo("");
      toast.success("Task added (Demo)");
      return;
    }

    setAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('personal_todos')
        .insert({
          user_id: user.id,
          text: newTodo.trim(),
          priority: 'medium'
        })
        .select()
        .single();

      if (error) throw error;
      setTodos([data, ...todos]);
      setNewTodo("");
      toast.success("Task added");
    } catch (err: any) {
      toast.error("Table not ready? Check scratch/setup_hub.sql");
    } finally {
      setAdding(false);
    }
  }

  async function toggleTodo(id: string, is_completed: boolean) {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setTodos(todos.map(t => t.id === id ? { ...t, is_completed: !is_completed } : t));
      toast.success("Status updated (Demo)");
      return;
    }

    try {
      const { error } = await supabase
        .from('personal_todos')
        .update({ is_completed: !is_completed })
        .eq('id', id);

      if (error) throw error;
      setTodos(todos.map(t => t.id === id ? { ...t, is_completed: !is_completed } : t));
    } catch (err: any) {
      toast.error("Failed to update status");
    }
  }

  async function deleteTodo(id: string) {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setTodos(todos.filter(t => t.id !== id));
      toast.success("Task removed (Demo)");
      return;
    }

    try {
      const { error } = await supabase
        .from('personal_todos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setTodos(todos.filter(t => t.id !== id));
      toast.success("Task removed");
    } catch (err) {
      // Missing table error handled via tableError state
    } finally { }
  }

  if (tableError) {
    return (
      <div className="card p-12 text-center bg-rose-50 border-rose-100">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
          <Star className="w-8 h-8 text-rose-500 animate-pulse" />
        </div>
        <h3 className="text-xl font-black text-rose-900 mb-2">Hub Not Initialized</h3>
        <p className="text-sm text-rose-700/60 max-w-md mx-auto mb-8 leading-relaxed">
          The personal hub tables are missing from your database. Please run the setup script in the Supabase SQL Editor.
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
    <div className="card p-8 bg-white shadow-sm border-[#eceae4]">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <ListTodo className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <h3 className="text-xl font-black text-[#1c1c1c] tracking-tight">Your Tasks</h3>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Stay organized and productive</p>
        </div>
      </div>

      <form onSubmit={addTodo} className="mb-8">
        <div className="relative flex flex-col sm:block gap-3">
          <input
            type="text"
            placeholder="What needs to be done?..."
            className="w-full bg-[#f8f7f4] border-2 border-transparent focus:border-[#1c1c1c] focus:bg-white rounded-2xl px-6 py-4 text-sm font-medium transition-all outline-none sm:pr-32"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
          />
          <button
            type="submit"
            disabled={adding || !newTodo.trim()}
            className="btn-primary flex items-center justify-center gap-2 sm:absolute sm:right-2 sm:top-1/2 sm:-translate-y-1/2 !py-4 sm:!py-2.5 !px-6 sm:!px-4"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Task
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {loading ? (
          <div className="py-10 text-center text-gray-300">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-widest">Loading tasks...</p>
          </div>
        ) : todos.length === 0 ? (
          <div className="py-12 text-center bg-[#f8f7f4] rounded-3xl border-2 border-dashed border-gray-200">
            <Star className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-400">Your todo list is empty.</p>
            <p className="text-[10px] text-gray-300 uppercase font-bold mt-1">Ready to start something new?</p>
          </div>
        ) : (
          todos.map((todo) => (
            <div
              key={todo.id}
              className={cn(
                "flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 group",
                todo.is_completed 
                  ? "bg-gray-50 border-gray-100 opacity-60" 
                  : "bg-white border-[#eceae4] hover:border-gray-300 hover:shadow-lg hover:shadow-gray-100"
              )}
            >
              <button
                onClick={() => toggleTodo(todo.id, todo.is_completed)}
                className={cn(
                  "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                  todo.is_completed 
                    ? "bg-emerald-500 border-emerald-500 text-white" 
                    : "border-gray-200 hover:border-emerald-500 text-transparent"
                )}
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
              
              <span className={cn(
                "flex-1 text-sm font-medium",
                todo.is_completed ? "line-through text-gray-400" : "text-[#1c1c1c]"
              )}>
                {todo.text}
              </span>

              <button
                onClick={() => deleteTodo(todo.id)}
                className="p-2 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { StickyNote, Plus, Trash2, Loader2, Save, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { isDemoMode } from "@/lib/demo";

export function NoteSection() {
  const [mounted, setMounted] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [tableError, setTableError] = useState(false);
  const [newNote, setNewNote] = useState({ title: "", content: "" });

  useEffect(() => {
    setMounted(true);
  }, []);
  const supabase = useMemo(() => createClient(), []);



  const fetchNotes = useCallback(async () => {
    const isDemo = isDemoMode();
    if (isDemo) {
      setNotes([
        { id: '1', title: 'Product Launch Ideas', content: 'Consider bundling Krill Oil with the new Wellness Kit for a 15% discount.', created_at: new Date().toISOString() },
        { id: '2', title: 'Meeting Notes', content: 'Team sync at 4 PM. Discuss the new CRM presentation mode implementation.', created_at: new Date().toISOString() },
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('personal_notes')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          setTableError(true);
          return;
        }
        throw error;
      }
      setNotes(data || []);
      setTableError(false);
    } catch (err) {
      // Missing table error handled via tableError state
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  async function addNote() {
    if (!newNote.content.trim()) return;

    const isDemo = isDemoMode();
    if (isDemo) {
      const mockNote = {
        id: Math.random().toString(36).substr(2, 9),
        title: newNote.title.trim() || "Untitled Note",
        content: newNote.content.trim(),
        created_at: new Date().toISOString()
      };
      setNotes([mockNote, ...notes]);
      setNewNote({ title: "", content: "" });
      setIsAdding(false);
      toast.success("Note saved (Demo)");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('personal_notes')
        .insert({
          user_id: user.id,
          title: newNote.title.trim() || "Untitled Note",
          content: newNote.content.trim()
        })
        .select()
        .single();

      if (error) throw error;
      setNotes([data, ...notes]);
      setNewNote({ title: "", content: "" });
      setIsAdding(false);
      toast.success("Note saved");
    } catch (err) {
      toast.error("Failed to save note");
    }
  }

  async function deleteNote(id: string) {
    const isDemo = isDemoMode();
    if (isDemo) {
      setNotes(notes.filter(n => n.id !== id));
      toast.success("Note deleted (Demo)");
      return;
    }

    try {
      const { error } = await supabase.from('personal_notes').delete().eq('id', id);
      if (error) throw error;
      setNotes(notes.filter(n => n.id !== id));
      toast.success("Note deleted");
    } catch (err) {
      toast.error("Failed to delete note");
    }
  }

  if (tableError) {
    return (
      <div className="card p-12 text-center bg-blue-50 border-blue-100">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
          <StickyNote className="w-8 h-8 text-blue-500 animate-pulse" />
        </div>
        <h3 className="text-xl font-black text-blue-900 mb-2">Notes Not Initialized</h3>
        <p className="text-sm text-blue-700/60 max-w-md mx-auto mb-8 leading-relaxed">
          The personal notes table is missing. Please run the setup script in the Supabase SQL Editor.
        </p>
        <div className="bg-[#1c1c1c] text-white p-4 rounded-2xl text-[11px] font-mono inline-block mb-4">
          scratch/setup_hub.sql
        </div>
        <div>
          <button 
            onClick={() => window.location.reload()}
            className="text-xs font-black text-blue-900 uppercase tracking-widest hover:underline"
          >
            Refresh after running script
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
            <StickyNote className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#1c1c1c] tracking-tight">Private Notes</h3>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Quick ideas and reminders</p>
          </div>
        </div>
        
        <button
          onClick={() => setIsAdding(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Note
        </button>
      </div>

      {isAdding && (
        <div className="card p-6 bg-amber-50 border-amber-200 animate-in fade-in slide-in-from-top-4 duration-300">
          <input
            type="text"
            placeholder="Title (Optional)..."
            className="w-full bg-transparent border-none text-lg font-black text-[#1c1c1c] placeholder:text-amber-900/30 focus:ring-0 px-0 mb-2"
            value={newNote.title}
            onChange={e => setNewNote({ ...newNote, title: e.target.value })}
          />
          <textarea
            placeholder="Write your idea here..."
            className="w-full bg-transparent border-none text-sm text-amber-900 focus:ring-0 px-0 min-h-[100px] resize-none"
            value={newNote.content}
            onChange={e => setNewNote({ ...newNote, content: e.target.value })}
          />
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-xs font-bold text-amber-900/50 hover:text-amber-900 transition-colors">
              Cancel
            </button>
            <button onClick={addNote} className="btn-primary !bg-amber-900 !text-white flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Note
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-10 text-center text-gray-300">
            <Loader2 className="w-8 h-8 animate-spin mx-auto" />
          </div>
        ) : notes.length === 0 && !isAdding ? (
          <div className="col-span-full py-20 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
             <StickyNote className="w-12 h-12 text-gray-100 mx-auto mb-4" />
             <p className="text-gray-400 font-medium">No notes yet. Start by creating one!</p>
          </div>
        ) : (
          notes.map(note => (
            <div key={note.id} className="card p-6 bg-white hover:shadow-xl hover:shadow-gray-100 transition-all group relative overflow-hidden flex flex-col">
              <div className="absolute top-0 left-0 w-full h-1 bg-blue-400 opacity-20" />
              <div className="flex justify-between items-start mb-4">
                <h4 className="text-sm font-black text-[#1c1c1c] truncate flex-1">{note.title}</h4>
                <button aria-label="Close"
                  onClick={() => deleteNote(note.id)}
                  className="p-1 text-gray-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-[#5f5f5d] leading-relaxed whitespace-pre-wrap flex-1 italic">
                {note.content}
              </p>
              <div className="mt-6 flex items-center justify-between text-[9px] font-bold text-gray-300 uppercase tracking-widest">
                <span>{mounted ? new Date(note.created_at).toLocaleDateString() : "---"}</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">Private Note</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

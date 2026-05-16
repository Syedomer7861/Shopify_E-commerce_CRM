"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Send, Phone, MoreVertical, Paperclip, Smile, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Avatar } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface WhatsAppChatProps {
  phone: string;
  customerName: string;
  customerId: string;
}

export function WhatsAppChat({ phone, customerName, customerId }: WhatsAppChatProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      try {
        // 1. Fetch inbound from webhook_logs
        const { data: inbound } = await supabase
          .from('webhook_logs')
          .select('*')
          .eq('source', 'whatsapp')
          .order('created_at', { ascending: true });

        // 2. Filter inbound client-side for precision (phone mapping)
        const filteredInbound = (inbound || []).filter(m => {
          const from = m.payload?.from || "";
          return from.includes(phone) || phone.includes(from);
        });

        // 3. Fetch outbound from call_logs
        const { data: outbound } = await supabase
          .from('call_logs')
          .select('*')
          .eq('outcome', 'whatsapp')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: true });

        // 4. Merge and sort
        const merged = [
          ...filteredInbound.map(m => ({
            id: m.id,
            text: m.payload.body || "Media/Button Response",
            type: 'inbound',
            created_at: m.created_at
          })),
          ...(outbound || []).map(m => ({
            id: m.id,
            text: m.note ? m.note.replace(/^WhatsApp: "(.*)"$/, '$1') : "WhatsApp sent",
            type: 'outbound',
            created_at: m.created_at
          }))
        ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        setMessages(merged);
      } catch (err) {
        console.error("Chat fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    
    if (phone && customerId) {
      fetchHistory();
    }
  }, [phone, customerId, supabase]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    if (!input.trim()) return;
    const msg = input;
    setInput("");
    
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: msg }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages(prev => [...prev, { 
          id: Date.now(), 
          text: msg, 
          type: 'outbound', 
          created_at: new Date().toISOString() 
        }]);
      } else {
        toast.error("Failed to send: " + data.error);
        setInput(msg); // restore
      }
    } catch (err) {
      toast.error("Bridge connection failed");
      setInput(msg);
    }
  }

  return (
    <div className="flex flex-col h-[500px] bg-[#f0f2f5] rounded-xl overflow-hidden border border-gray-200 shadow-inner">
      {/* Chat Header */}
      <div className="px-4 py-3 bg-[#f0f2f5] border-b border-gray-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Avatar name={customerName} size="sm" />
          <div>
            <div className="text-sm font-bold text-gray-800 leading-tight">{customerName}</div>
            <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
               WhatsApp Active
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-gray-400">
          <Phone className="w-4 h-4 cursor-pointer hover:text-gray-600 transition-colors" />
          <MoreVertical className="w-4 h-4 cursor-pointer hover:text-gray-600 transition-colors" />
        </div>
      </div>

      {/* Message List */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ddd5] bg-opacity-40"
        style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')", backgroundBlendMode: 'overlay' }}
      >
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.type === 'outbound' ? 'justify-end' : 'justify-start'}`}>
            <div className={cn(
              "max-w-[85%] px-3 py-2 rounded-lg text-[13px] shadow-sm relative group",
              m.type === 'outbound' 
                ? 'bg-[#dcf8c6] text-gray-800 rounded-tr-none' 
                : 'bg-white text-gray-800 rounded-tl-none'
            )}>
              {m.text}
              <div className="text-[9px] text-gray-400 mt-1 text-right tabular-nums">
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              
              {/* Tail effect using CSS-like absolute positioning */}
              <div className={cn(
                "absolute top-0 w-2 h-2",
                m.type === 'outbound' 
                  ? "right-[-8px] border-l-[8px] border-l-[#dcf8c6] border-b-[8px] border-b-transparent" 
                  : "left-[-8px] border-r-[8px] border-r-white border-b-[8px] border-b-transparent"
              )} />
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Encrypting Chat...</span>
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center text-[10px] text-gray-400 py-8 italic font-medium px-12">
            No WhatsApp history found for this customer. Start a new conversation below.
          </div>
        )}
      </div>

      {/* Chat Input */}
      <div className="px-3 py-3 bg-[#f0f2f5] flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <button 
            onClick={async () => {
              const lastInbound = [...messages].reverse().find(m => m.type === 'inbound');
              try {
                const res = await fetch("/api/ai/suggest-reply", {
                  method: "POST",
                  body: JSON.stringify({ 
                    customerId, 
                    lastMessage: lastInbound?.text || "",
                    taskType: "general" 
                  })
                });
                const data = await res.json();
                if (data.suggestion) setInput(data.suggestion);
              } catch (e) {
                toast.error("AI Suggestion failed");
              }
            }}
            className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1 rounded-md flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
          >
            <Loader2 className="w-3 h-3 animate-pulse" /> AI Suggest Reply
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Smile className="w-6 h-6 text-gray-500 cursor-pointer hover:text-gray-700" />
          <Paperclip className="w-5 h-5 text-gray-500 cursor-pointer hover:text-gray-700" />
          <div className="flex-1 relative">
            <input 
              className="w-full bg-white border-none rounded-lg py-2 px-4 text-sm focus:ring-1 focus:ring-emerald-500 shadow-sm"
              placeholder="Type a message"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
          </div>
          <button 
            onClick={handleSend} 
            disabled={!input.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white p-2.5 rounded-full shadow-sm transition-all transform active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

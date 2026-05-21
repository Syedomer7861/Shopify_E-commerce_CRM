"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Send, Phone, MoreVertical, Paperclip, Smile, Loader2, BookOpen } from 'lucide-react';
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

  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [customerContext, setCustomerContext] = useState<any>(null);
  const [suggesting, setSuggesting] = useState(false);

  // 1. Fetch customer context & recent orders
  useEffect(() => {
    async function fetchContext() {
      if (!customerId) return;
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('name, alt_phone, custom_meta, orders(order_number, total_price, line_items, ordered_at)')
          .eq('id', customerId)
          .maybeSingle();
        if (error) throw error;
        setCustomerContext(data);
      } catch (err) {
        console.error("Failed to fetch customer context for templates:", err);
      }
    }
    fetchContext();
  }, [customerId, supabase]);

  // 2. Fetch active campaign templates from database
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/templates");
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch (err) {
        console.error("Failed to fetch templates:", err);
      }
    }
    fetchTemplates();
  }, []);

  // 3. Resolve template placeholders dynamically
  const handleApplyTemplate = (tpl: any) => {
    let body = tpl.body;

    const firstName = customerContext?.name?.split(" ")[0] || customerName.split(" ")[0];
    
    // Sort orders by ordered_at to get the absolute latest order details
    const sortedOrders = customerContext?.orders 
      ? [...customerContext.orders].sort((a: any, b: any) => new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime()) 
      : [];
    const lastOrder = sortedOrders[0] || customerContext?.orders?.[0];
    const productName = lastOrder?.line_items?.[0]?.name || "your order";
    const orderNo = lastOrder?.order_number || "order";
    const abandonLink = customerContext?.custom_meta?.ABANDONLINK || "https://cureforever.in/cart";

    const resolved = body
      .replace(/{{name}}/g, firstName)
      .replace(/{{product}}/g, productName)
      .replace(/{{order_no}}/g, orderNo)
      .replace(/{{abandon_link}}/g, abandonLink);

    setInput(resolved);
    setShowTemplates(false);
    toast.success(`Loaded template: "${tpl.name}"`);
  };

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
      <div className="px-3 py-3 bg-[#f0f2f5] flex flex-col gap-2 shrink-0 relative">
        {/* Templates Dropdown Popover */}
        {showTemplates && (
          <div className="absolute bottom-full left-3 mb-2 p-2 bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl flex flex-col gap-1 w-72 max-h-60 overflow-y-auto z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
              Select Message Template
            </div>
            {templates.length > 0 ? (
              templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleApplyTemplate(tpl)}
                  className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 rounded-xl transition-all group flex flex-col gap-0.5"
                >
                  <span className="text-[11px] font-bold text-gray-800 group-hover:text-emerald-700 transition-colors">
                    {tpl.name}
                  </span>
                  <span className="text-[9px] text-gray-400 line-clamp-1">
                    {tpl.body}
                  </span>
                </button>
              ))
            ) : (
              // Fallback templates if database returns empty
              [
                { id: 'f1', name: 'Abandoned Checkout Recovery', body: 'Hi {{name}} 👋, we noticed you left some wellness items in your cart! 🛒 Can we help you complete your purchase? Use code RECOVER5 for 5% off! 🌿\n\nLink: {{abandon_link}}' },
                { id: 'f2', name: 'Post-Purchase Feedback', body: 'Hi {{name}} 👋, thank you for your recent order! How was your experience with CureForever? We\'d love to hear your honest feedback. 🌿' },
                { id: 'f3', name: '30-Day Refill Reminder', body: 'Hi {{name}}! It\'s been about a month since your last CureForever order. Is it time for a refill to keep your wellness routine going? 💊' },
                { id: 'f4', name: 'COD Order Verification', body: 'Hi {{name}} 👋, thanks for ordering {{product}} (Order {{order_no}})! Just confirming your COD order before we ship it out today. Should we go ahead? ✅' }
              ].map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleApplyTemplate(tpl)}
                  className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 rounded-xl transition-all group flex flex-col gap-0.5"
                >
                  <span className="text-[11px] font-bold text-gray-800 group-hover:text-emerald-700 transition-colors">
                    {tpl.name}
                  </span>
                  <span className="text-[9px] text-gray-400 line-clamp-1">
                    {tpl.body}
                  </span>
                </button>
              ))
            )}
            <div className="h-px bg-gray-100 my-1" />
            <button
              onClick={() => setShowTemplates(false)}
              className="w-full py-1.5 text-center text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button 
            onClick={async () => {
              if (suggesting) return;
              setSuggesting(true);
              const lastInbound = [...messages].reverse().find(m => m.type === 'inbound');
              try {
                const res = await fetch("/api/ai/suggest-reply", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ 
                    customerId, 
                    lastMessage: lastInbound?.text || "",
                    taskType: "general" 
                  })
                });
                const data = await res.json();
                if (data.suggestion) {
                  setInput(data.suggestion);
                  if (data.isMock) {
                    toast.success("AI: Suggestion loaded (Local fallback)");
                  } else {
                    toast.success("Gemini: Dynamic reply generated!");
                  }
                }
              } catch (e) {
                toast.error("AI Suggestion failed");
              } finally {
                setSuggesting(false);
              }
            }}
            disabled={suggesting}
            className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            {suggesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
            ) : (
              <Smile className="w-3.5 h-3.5" />
            )}
            AI Suggest Reply
          </button>

          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="text-[10px] font-black uppercase tracking-[0.1em] text-indigo-700 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
          >
            <BookOpen className="w-3.5 h-3.5" /> Templates
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

"use client";
import { useState } from "react";
import { Phone, CheckCircle, Clock, SkipForward, MessageSquare, Calendar, Send, Paperclip, X, Globe } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Avatar, TaskTypeBadge, TaskStatusBadge, Modal } from "./ui";
import { createClient } from "@/lib/supabase";
import { formatDate, TASK_TYPE_CONFIG, cn, getTaskProductName } from "@/lib/utils";
import type { Task, Customer, Order, AbandonedCart } from "@/types";
interface TaskCardProps {
  task: Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart };
  onComplete?: (id: string, outcome: string, note: string) => void;
  onReschedule?: (id: string, date: string, reason: string) => void;
  onSkip?: (id: string) => void;
  onWhatsApp?: () => void;
  whatsappSettings?: any;
  compact?: boolean;
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  review: "Hi {{name}} 👋, thank you for ordering {{product}}! How was your experience? We'd love to hear your feedback. 🌿\n\nPlease leave us a review here: https://search.google.com/local/writereview?placeid=ChIJv5_GsCGRyzsR2_y1wjbi3Ck",
  reorder: "Hi {{name}}! It's been a while since your last {{product}} order. Time for a refill? 💊 Use code REFILL10 for 10% off!",
  final_followup: "Hi {{name}}, just checking in one last time regarding your {{product}} journey. We're here if you need anything! 🙏",
  recovery: "Hi {{name}} 👋, we noticed you left some items in your cart! 🛒 Can we help you complete your purchase? Use code RECOVER5 for 5% off! 🌿",
};

export default function TaskCard({ task, onComplete, onReschedule, onSkip, onWhatsApp, whatsappSettings, compact }: TaskCardProps) {
  const [doneModal, setDoneModal] = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState(false);
  const [waModal, setWaModal] = useState(false);
  const [outcome, setOutcome] = useState("done");
  const [note, setNote] = useState("");
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [waFile, setWaFile] = useState<File | null>(null);
  const [sendingWa, setSendingWa] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const cfg = TASK_TYPE_CONFIG[task.task_type];
  const isDone = task.status === "done" || task.status === "cancelled";
  const isOverdue = task.status === "overdue";
  
  const product = getTaskProductName(task);
  
  // Handle line items for the details modal
  const rawItems = task.order?.line_items || task.abandoned_cart?.line_items || [];
  const metaItem = rawItems.find((i: any) => i.__metadata);
  const meta = metaItem?.payload || (task.abandoned_cart as any)?.custom_meta || (task.order as any)?.custom_meta;
  
  let items = Array.isArray(rawItems) ? rawItems.filter((i: any) => !i.__metadata) : [];
  
  // VIRTUAL ITEM INJECTION: If no items found but we have a product name (from URL), inject it.
  if (items.length === 0 && product && product !== "your items" && product !== "—" && product !== "Wellness Refill") {
    items = [{
      name: product,
      price: task.order?.total_price || task.abandoned_cart?.total_price || 0,
      quantity: 1,
      variant: "Default Variant"
    }];
  }
  
  const daysSince = task.order?.delivered_at
    ? Math.round((Date.now() - new Date(task.order.delivered_at).getTime()) / 86400000)
    : null;

  const totalAmount = task.order?.total_price || task.abandoned_cart?.total_price || 0;
  
  // Calculate subtotal from items with robust property mapping
  let subtotal = task.order?.subtotal || task.abandoned_cart?.subtotal || 
    items.reduce((s: number, i: any) => {
      const price = Number(i.price || i.productPrice || i.amount || 0);
      const qty = Number(i.quantity || i.qty || i.productQuantity || 1);
      return s + (price * qty);
    }, 0);

  // If subtotal is STILL 0 but we have a total, assume subtotal = total (for simple checkout payloads)
  if (subtotal === 0 && totalAmount > 0) subtotal = totalAmount;

  let discountAmount = task.order?.total_discounts || 
    task.abandoned_cart?.total_discounts ||
    Number(meta?.total_discount || 0) ||
    Number(meta?.DISCOUNTAMOUNT || 0) || 
    Number(meta?.prepaidDiscount || 0) || 
    Number(meta?.discount_amount || 0) ||
    Number(task.customer?.custom_meta?.prepaidDiscount || 0) ||
    Number(task.customer?.custom_meta?.discount || 0);

  let shippingCharges = task.order?.shipping_charges || 
    Number(meta?.SHIPPINGCHARGES || 0) || 
    Number(meta?.shipping_charges || 0) ||
    Number(meta?.shipping_cost || 0) ||
    Number(task.customer?.custom_meta?.shipping_charges || 0);

  // Final Inference Logic
  if (subtotal > totalAmount && discountAmount === 0) {
    discountAmount = Math.max(0, subtotal - totalAmount + shippingCharges);
  } else if (totalAmount > subtotal && shippingCharges === 0) {
    shippingCharges = Math.max(0, totalAmount - subtotal + discountAmount);
  }

  // Traffic Source Detection
  const getUtm = (key: string) => {
    // 1. Check direct meta
    if (meta?.[key]) return meta[key];
    if (meta?.cart_attributes?.[key]) return meta.cart_attributes[key];
    if (meta?.custom_attributes?.[key]) return meta.custom_attributes[key];
    
    // 2. Check URL params
    const url = String(meta?.landing_page_url || meta?.cart_attributes?.landing_page_url || "");
    if (url.includes("?")) {
      const search = url.split("?")[1];
      const params = new URLSearchParams(search);
      if (params.get(key)) return params.get(key);
    }
    return null;
  };

  const utmSource = getUtm("utm_source");
  const utmMedium = getUtm("utm_medium");
  const utmCampaign = getUtm("utm_campaign");
  const trafficSource = utmSource ? `${utmSource} / ${utmMedium || "direct"}` : null;


  function handleDone() {
    onComplete?.(task.id, outcome, note);
    setDoneModal(false);
    setNote(""); setOutcome("done");
  }

  function handleReschedule() {
    if (!newDate) return toast.error("Please pick a date");
    onReschedule?.(task.id, newDate, reason);
    setRescheduleModal(false);
    setNewDate(""); setReason("");
  }

  async function handleSendWa() {
    setSendingWa(true);
    try {
      let imagePath = undefined;
      
      // 1. Upload file if present
      if (waFile) {
        const formData = new FormData();
        formData.append("file", waFile);
        
        const uploadRes = await fetch("/api/whatsapp/upload", {
          method: "POST",
          body: formData
        });
        
        const uploadData = await uploadRes.json();
        if (!uploadData.ok) throw new Error(uploadData.error || "File upload failed");
        imagePath = uploadData.filePath;
      }

      // 2. Send WhatsApp through bridge
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: task.customer.phone,
          message: waMessage,
          imagePath
        }),
      });
      
      const data = await res.json();
      if (data.ok) {
        toast.success("WhatsApp sent!");
        
        // 3. Log to History
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const logNote = waFile ? `WhatsApp: "${waMessage}" (File: ${waFile.name})` : `WhatsApp: "${waMessage}"`;
        
        const { error: logErr } = await supabase.from("call_logs").insert({
          task_id: task.id,
          customer_id: task.customer_id,
          outcome: "whatsapp",
          note: logNote,
          agent_name: user?.email || "Agent"
        });

        if (logErr) {
          console.error("Failed to log WhatsApp sent:", logErr);
          toast.error("WhatsApp sent, but history log failed. Check DB constraints.");
        } else {
          onWhatsApp?.();
        }

        setWaModal(false);
        setWaFile(null); // Clear file after send
      } else {
        toast.error(data.error || "Failed to send");
      }
    } catch (err: any) {
      toast.error(err.message || "Bridge connection failed");
    } finally {
      setSendingWa(false);
    }
  }

  function openWa() {
    const template = DEFAULT_TEMPLATES[task.task_type as keyof typeof DEFAULT_TEMPLATES] || "";
    const personalised = template
      .replace("{{name}}", task.customer.name)
      .replace("{{product}}", product);
    setWaMessage(personalised);
    setWaModal(true);
  }

  return (
    <>
      <div 
        onClick={() => setShowDetail(true)}
        className={cn(
          "card p-4 border-l-4 transition-all cursor-pointer group/card",
          cfg.accent,
          isDone && "opacity-60",
          isOverdue && "border-l-rose-500",
          "hover:shadow-md hover:border-r hover:border-r-gray-100 hover:scale-[1.005]"
        )}
      >
        <div className="flex items-start gap-4">
          <Avatar name={task.customer.name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <Link 
                  href={`/customers/${task.customer_id}`} 
                  onClick={(e) => e.stopPropagation()} 
                  className="font-bold text-forest text-sm group-hover/card:text-blue-600 transition-colors flex items-center gap-2 hover:underline"
                >
                  {task.customer.name}
                  {isDone && <span className="badge bg-emerald-50 text-emerald-600 text-[10px]">DONE</span>}
                </Link>
                <div 
                  onClick={(e) => e.stopPropagation()} 
                  className="inline-block"
                >
                  <a href={`tel:${task.customer.phone}`} className="text-[11px] text-gray-500 hover:text-blue-600 flex items-center gap-1 mt-0.5">
                    <Phone className="w-2.5 h-2.5" /> {task.customer.phone}
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isOverdue ? <span className="badge bg-rose-50 border-rose-200 text-rose-700">Overdue</span> : <TaskTypeBadge type={task.task_type} />}
                {daysSince !== null && (
                  <span className="badge bg-gray-50 border-gray-200 text-gray-500">{daysSince}d since delivery</span>
                )}
              </div>
            </div>

            <div className="mt-2 text-xs text-gray-400 font-medium flex items-center min-w-0">
              <span className="text-gray-600 flex-shrink-0">
                {task.order?.order_number || task.abandoned_cart?.cart_token?.slice(0, 8) || "—"}
              </span> 
              <span className="mx-1.5 flex-shrink-0">·</span> 
              <span className="truncate flex-1 min-w-0" title={product}>{product}</span> 
              <span className="mx-1.5 flex-shrink-0">·</span> 
              <span className="flex-shrink-0 whitespace-nowrap">Due: {formatDate(task.due_date)}</span>
              {task.order?.delivered_at && (
                <>
                  <span className="mx-1.5 flex-shrink-0 text-emerald-400">·</span>
                  <span className="flex-shrink-0 whitespace-nowrap text-emerald-600 font-bold">Delivered: {formatDate(task.order.delivered_at)}</span>
                </>
              )}
            </div>

            {!isDone && !compact && (
              <div className="flex items-center gap-2 mt-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setDoneModal(true)} className="btn-primary text-[10px] py-1 px-3 h-8">
                  <CheckCircle className="w-3 h-3" /> Log Call
                </button>
                <button onClick={openWa} className="btn-secondary text-[10px] py-1 px-3 h-8 text-emerald-600 border-emerald-100 hover:bg-emerald-50">
                  <Send className="w-3 h-3" /> WhatsApp
                </button>
                <button onClick={() => setRescheduleModal(true)} className="btn-secondary text-[10px] py-1 px-3 h-8">
                  <Calendar className="w-3 h-3" /> Reschedule
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details Modal */}
      <Modal open={showDetail} onClose={() => setShowDetail(false)} title={`Task Details — ${task.customer.name}`} maxWidth="max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Customer Column */}
          <div className="md:col-span-2 space-y-6">
            <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <Avatar name={task.customer.name} size="lg" />
              <div>
                <Link href={`/customers/${task.customer_id}`} className="font-bold text-forest hover:underline hover:text-blue-600 transition-colors">
                  {task.customer.name}
                </Link>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <span className={cn("w-2 h-2 rounded-full", isOverdue ? "bg-rose-500" : "bg-emerald-500")} />
                  {TASK_TYPE_CONFIG[task.task_type].label}
                </div>
              </div>
            </div>
            
            {trafficSource && (
              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
                <div className="text-[10px] text-blue-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Traffic Source
                </div>
                <div className="text-xs font-semibold text-blue-700 capitalize">
                  {trafficSource}
                  {utmCampaign && <span className="text-[10px] text-blue-400 font-normal ml-2 truncate">({utmCampaign})</span>}
                </div>
              </div>
            )}

            <div className="space-y-4 px-1">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Phone Number</div>
                  <a href={`tel:${task.customer.phone}`} className="text-sm font-semibold hover:text-blue-600 transition-colors">{task.customer.phone}</a>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Email Address</div>
                  {task.customer.email ? (
                    <a href={`mailto:${task.customer.email}`} className="text-sm font-semibold truncate max-w-[180px] block hover:text-emerald-600 transition-colors">
                      {task.customer.email}
                    </a>
                  ) : (
                    <div className="text-sm font-semibold text-gray-400 italic">No email provided</div>
                  )}
                </div>
              </div>

              {task.customer.address && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 flex-shrink-0 mt-0.5">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Shipping Address</div>
                    <div className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                      {task.customer.address}
                      {(task.customer.city || task.customer.state || task.customer.zip) && (
                        <div className="mt-1 pb-1 text-[11px] font-medium text-gray-500 border-t border-gray-100 pt-1">
                          {[task.customer.city, task.customer.state, task.customer.zip].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Transaction Column */}
          <div className="md:col-span-3 space-y-5">
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none">
                  {task.order ? "Order Details" : "Abandoned Cart"}
                </h4>
                <div className="text-[10px] font-mono text-gray-400 uppercase leading-none">
                  ID: {task.order?.order_number || task.abandoned_cart?.cart_token?.slice(0, 10)}
                </div>
              </div>
              <div className="p-4">
                {/* Date Row */}
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-50">
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                    {task.order ? "Order Date" : "Abandoned At"}
                  </div>
                  <div className="text-xs font-semibold text-gray-700">
                    {formatDate(task.order?.ordered_at || task.abandoned_cart?.abandoned_at || new Date().toISOString())}
                  </div>
                </div>

                {task.order?.delivered_at && (
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-50">
                    <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-tight">
                      Delivered Date
                    </div>
                    <div className="text-xs font-bold text-emerald-600">
                      {formatDate(task.order.delivered_at)}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {items.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 justify-between pb-3 last:pb-0 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-800 line-clamp-1">{item.name || item.title}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {item.variant || item.productVariant || "Default Variant"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-forest">₹{item.price || item.productPrice || item.amount}</div>
                        <div className="text-[10px] text-gray-400">Qty: {item.quantity || item.qty || item.productQuantity || 1}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500 px-1">
                    <span>Subtotal</span>
                    <span>₹{subtotal}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-xs text-rose-500 px-1 font-medium italic">
                      <span>Discount Applied</span>
                      <span>-₹{discountAmount}</span>
                    </div>
                  )}
                  {shippingCharges > 0 && (
                    <div className="flex justify-between text-xs text-gray-500 px-1">
                      <span>Shipping</span>
                      <span>₹{shippingCharges}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-forest px-1 pt-1">
                    <span>Total Amount</span>
                    <span className="text-forest underline decoration-lime decoration-2 underline-offset-4">₹{totalAmount}</span>
                  </div>
                </div>
              </div>
            </div>

            {task.task_type === "recovery" && (task.abandoned_cart as any)?.custom_meta?.ABANDONLINK && (
               <a 
                href={(task.abandoned_cart as any).custom_meta.ABANDONLINK} 
                target="_blank" 
                className="btn-secondary w-full justify-center bg-blue-50 border-blue-100 text-blue-700 font-bold hover:bg-blue-100"
              >
                 Open Abandoned Cart 🛒
               </a>
            )}
            
            <div className="flex items-center gap-2 pt-2">
               <button onClick={() => { setShowDetail(false); setDoneModal(true); }} className="btn-primary flex-1 justify-center py-2.5">
                 Log Call Outcome
               </button>
               <button onClick={() => { setShowDetail(false); openWa(); }} className="btn-secondary flex-1 justify-center py-2.5 text-emerald-600">
                 WhatsApp
               </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* WhatsApp Modal */}
      <Modal open={waModal} onClose={() => { setWaModal(false); setWaFile(null); }} title={`WhatsApp — ${task.customer.name}`}
        footer={<>
          <button className="btn-secondary" onClick={() => { setWaModal(false); setWaFile(null); }}>Cancel</button>
          <button className="btn-primary" onClick={handleSendWa} disabled={sendingWa}>
            {sendingWa ? "Sending..." : "Send via Bridge"}
          </button>
        </>}
      >
        <div className="space-y-4">
          <div className="text-[11px] text-gray-400">Sending to: <a href={`tel:${task.customer.phone}`} className="font-bold text-gray-700 hover:text-emerald-600 transition-colors">{task.customer.phone}</a></div>
          
          {/* Quick Presets */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(DEFAULT_TEMPLATES).map(([key, defaultTpl]) => {
              const customTpl = whatsappSettings ? (
                key === "review" ? whatsappSettings.whatsapp_review_template :
                key === "reorder" ? whatsappSettings.whatsapp_reorder_template :
                key === "recovery" ? whatsappSettings.whatsapp_recovery_template :
                key === "final_followup" ? whatsappSettings.whatsapp_final_template : null
              ) : null;
              
              const tpl = customTpl || defaultTpl;
              
              return (
                <button 
                  key={key} 
                  className={cn(
                    "text-[10px] px-2 py-1 rounded bg-gray-50 border border-gray-200 text-gray-500 uppercase font-bold tracking-wider hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all",
                    // Highlight current task type by default
                    task.task_type === key && "bg-lime-50 border-lime-200 text-lime-700",
                    waMessage === tpl.replace("{{name}}", task.customer.name || "there").replace("{{product}}", product) && "bg-emerald-600 text-white border-emerald-600"
                  )} 
                  onClick={() => {
                    let msg = tpl.replace("{{name}}", task.customer.name || "there").replace("{{product}}", product);
                    if (key === "recovery") {
                      const abandonLink = meta?.ABANDONLINK || task.customer.custom_meta?.ABANDONLINK || "https://cureforever.in/cart";
                      msg = msg.replace("{{abandon_link}}", abandonLink);
                    }
                    setWaMessage(msg);
                  }}
                >
                  {key.replace("_", " ")}
                </button>
              );
            })}
          </div>

          <textarea className="input resize-none h-32 text-sm" value={waMessage} onChange={e => setWaMessage(e.target.value)} />
          
          {/* File Attachment */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 rounded bg-gray-50 border border-dashed border-gray-300 text-gray-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/50 cursor-pointer transition-all">
              <Paperclip className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{waFile ? "Change File" : "Attach File (Media/PDF)"}</span>
              <input 
                type="file" 
                className="hidden" 
                onChange={e => setWaFile(e.target.files?.[0] || null)} 
              />
            </label>
            
            {waFile && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-emerald-50 border border-emerald-100 text-emerald-700">
                <span className="text-[10px] font-bold truncate max-w-[150px]">{waFile.name}</span>
                <button 
                  onClick={() => setWaFile(null)}
                  className="p-0.5 hover:bg-emerald-100 rounded-full transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Mark Done Modal */}
      <Modal open={doneModal} onClose={() => setDoneModal(false)} title={`Log Call — ${task.customer.name}`}
        footer={<>
          <button className="btn-secondary" onClick={() => setDoneModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleDone}>Save</button>
        </>}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Outcome</label>
            <select className="select" value={outcome} onChange={e => setOutcome(e.target.value)}>
              <option value="done">{task.task_type === "recovery" ? "Recovery Successful / Completed" : "Completed"}</option>
              <option value="no_answer">No Answer</option>
              <option value="rescheduled">Will Call Back</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
            <textarea className="input resize-none h-24" placeholder="Enter call notes..." value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Reschedule Modal */}
      <Modal open={rescheduleModal} onClose={() => setRescheduleModal(false)} title={`Reschedule — ${task.customer.name}`}
        footer={<>
          <button className="btn-secondary" onClick={() => setRescheduleModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleReschedule}>Reschedule</button>
        </>}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">New Date</label>
            <input type="date" className="input" value={newDate} onChange={e => setNewDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Reason</label>
            <input type="text" className="input" placeholder="Reason for rescheduling..." value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>
      </Modal>
    </>
  );
}

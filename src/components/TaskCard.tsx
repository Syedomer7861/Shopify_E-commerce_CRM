"use client";
import { useState } from "react";
import { Phone, CheckCircle, Clock, SkipForward, MessageSquare, Calendar, Send, Paperclip, X, Globe, Search, AlertCircle } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Avatar, TaskTypeBadge, TaskStatusBadge, Modal } from "./ui";
import ShiprocketOrderView from "./ShiprocketOrderView";
import { createClient } from "@/lib/supabase";
import { formatDate, TASK_TYPE_CONFIG, cn, getTaskProductName, initials, timeAgo } from "@/lib/utils";
import type { Task, Customer, Order, AbandonedCart } from "@/types";
import { logAuditEvent } from "@/lib/audit";
import { useChat } from "@/context/ChatContext";
import { useRouter } from "next/navigation";
import RTOClaimGenerator from "./RTOClaimGenerator";
interface TaskCardProps {
  task: Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart };
  onComplete?: (id: string, outcome: string, note: string, disposition?: string, followUpAction?: string) => void;
  onReschedule?: (id: string, date: string, reason: string) => void;
  onSkip?: (id: string) => void;
  onWhatsApp?: () => void;
  whatsappSettings?: any;
  compact?: boolean;
  isAdmin?: boolean;
  agents?: { id: string; name: string }[];
  onReassign?: (taskId: string, newOwnerId: string) => void;
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  cod_verify: "Hi {{name}} 👋, thanks for ordering {{product}} from CureForever! Just a quick check to confirm your COD order before we ship it out. Should we go ahead? ✅",
  prepaid_confirm: "Hi {{name}} 👋, thank you for choosing CureForever! We’ve received your prepaid order for {{product}}. Our team is preparing it for dispatch. 🌿",
  dispatched: "Great news {{name}}! Your {{product}} has been dispatched 🚚. You can track it here: https://cureforever.shiprocket.co/tracking . It should reach you soon! 🌿",
  out_for_delivery: "Hi {{name}}, your CureForever order for {{product}} is out for delivery today! 📦 Keep your phone handy; our delivery partner will call you shortly. 🌿",
  failed_attempt: "Hi {{name}}, we tried to deliver your order today but couldn't reach you. 📦 We will try again tomorrow. Please let us know if you need to update anything! 🙏",
  review: "Hi {{name}} 👋, thank you for ordering {{product}}! How was your experience? We'd love to hear your feedback. 🌿\n\nPlease leave us a review here: https://search.google.com/local/writereview?placeid=ChIJv5_GsCGRyzsR2_y1wjbi3Ck",
  reorder: "Hi {{name}}! It's been a while since your last {{product}} order. Time for a refill? 💊 Use code REFILL10 for 10% off!",
  recovery: "Hi {{name}} 👋, we noticed you left some items in your cart! 🛒 Can we help you complete your purchase? Use code SAVE5 for 5% off! {{abandon_link}} 🌿",
  issue_resolution: "Hi {{name}}, we noticed an issue with your recent order for {{product}}. Our team is reviewing it and will help resolve it quickly.",
  transit_update: "Hi {{name}} 👋, we see your order for {{product}} is currently in transit! 🚚 You can track it here: https://cureforever.shiprocket.co/tracking . We'll update you once it's out for delivery! 🌿",
  ndr_resolution: "Hi {{name}} 👋, we see a delivery issue for {{product}}. 📦 Could you please share an alternate number or confirm your address landmark? This will help us ensure successful delivery! 🌿",
  loyalty_gift: "Hi {{name}}! 🎁 As a valued CureForever customer, we've added a special surprise to your next order of {{product}}. Just use code LOYALTY at checkout! 🌿",
};

export default function TaskCard({ task, onComplete, onReschedule, onSkip, onWhatsApp, whatsappSettings, compact, isAdmin, agents, onReassign }: TaskCardProps) {
  const supabase = createClient();
  const [doneModal, setDoneModal] = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState(false);
  const [waModal, setWaModal] = useState(false);
  const [emailModal, setEmailModal] = useState(false);
  const [outcome, setOutcome] = useState("done");
  const [note, setNote] = useState("");
  const [disposition, setDisposition] = useState("interested");
  const [followUpAction, setFollowUpAction] = useState("");
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [waFile, setWaFile] = useState<File | null>(null);
  const [sendingWa, setSendingWa] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailFile, setEmailFile] = useState<File | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [sendWaInLog, setSendWaInLog] = useState(false);
  const [logWaMessage, setLogWaMessage] = useState("");

  const abandonedCart = (Array.isArray(task.abandoned_cart) ? task.abandoned_cart[0] : task.abandoned_cart) as AbandonedCart | undefined;
  const order = (Array.isArray(task.order) ? task.order[0] : task.order) as Order | undefined;

  const cfg = TASK_TYPE_CONFIG[task.task_type];
  const isDone = task.status === "done" || task.status === "cancelled";
  const isOverdue = task.status === "overdue";
  
  const product = getTaskProductName({ ...task, abandoned_cart: abandonedCart, order: order });
  
  // Handle line items for the details modal
  const rawItems = order?.line_items || abandonedCart?.line_items || [];
  const metaItem = rawItems.find((i: any) => i.__metadata);
  const meta = metaItem?.payload || (abandonedCart as any)?.custom_meta || (order as any)?.custom_meta;
  
  let items = Array.isArray(rawItems) ? rawItems.filter((i: any) => !i.__metadata) : [];
  
  // VIRTUAL ITEM INJECTION: If no items found but we have a product name (from URL), inject it.
  if (items.length === 0 && product && product !== "your items" && product !== "—" && product !== "Wellness Refill") {
    items = [{
      name: product,
      price: order?.total_price || abandonedCart?.total_price || 0,
      quantity: 1,
      variant: "Default Variant"
    }];
  }
  
  const daysSince = order?.delivered_at
    ? Math.round((Date.now() - new Date(order.delivered_at).getTime()) / 86400000)
    : null;

  const totalAmount = order?.total_price || abandonedCart?.total_price || 0;
  
  // Calculate subtotal from items with robust property mapping
  let subtotal = order?.subtotal || abandonedCart?.subtotal || 
    items.reduce((s: number, i: any) => {
      const price = Number(i.price || i.productPrice || i.amount || 0);
      const qty = Number(i.quantity || i.qty || i.productQuantity || 1);
      return s + (price * qty);
    }, 0);

  // If subtotal is STILL 0 but we have a total, assume subtotal = total (for simple checkout payloads)
  if (subtotal === 0 && totalAmount > 0) subtotal = totalAmount;

  let discountAmount = order?.total_discounts || 
    abandonedCart?.total_discounts ||
    Number(meta?.total_discount || 0) ||
    Number(meta?.DISCOUNTAMOUNT || 0) || 
    Number(meta?.prepaidDiscount || 0) || 
    Number(meta?.discount_amount || 0) ||
    Number(task.customer?.custom_meta?.prepaidDiscount || 0) ||
    Number(task.customer?.custom_meta?.discount || 0);

  let shippingCharges = order?.shipping_charges || 
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
    const url = String(
      meta?.landing_page_url || 
      meta?.cart_attributes?.landing_page_url || 
      meta?.custom_attributes?.landing_page_url || 
      ""
    );
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
  const trafficSource = utmSource ? `${utmSource} / ${utmMedium || "direct"}${utmCampaign ? ` (${utmCampaign})` : ""}` : null;

  // Extraction for Action Links
  const metadataItemForLink = (abandonedCart?.line_items as any[])?.find(i => i.__metadata);
  const rawMeta = metadataItemForLink?.payload || (abandonedCart as any)?.custom_meta;
  
  // 🚀 HIGH PRIORITY: Check if landing_page_url is actually a recovery link (Fastrr behavior)
  const landingUrl = String(rawMeta?.landing_page_url || rawMeta?.cart_attributes?.landing_page_url || "");
  let checkoutUrl = (landingUrl.includes("cart-resume-id") && landingUrl.includes("guest-abandon-payload")) 
    ? landingUrl 
    : ((abandonedCart as any)?.custom_meta?.ABANDONLINK || metadataItemForLink?.payload?.checkout_url);
  
  // 🔗 FALLBACK: Construct link if missing or incomplete
  if (abandonedCart?.cart_token) {
    const token = abandonedCart.cart_token;
    const isFastrr = token.length > 20;
    
    if (!checkoutUrl || (isFastrr && !checkoutUrl.includes("guest-abandon-payload"))) {
      if (isFastrr) {
        // Construct Fastrr Link with pre-fill payload
        const customer = task.customer;
        const firstName = customer.name?.split(" ")[0] || "";
        const lastName = customer.name?.split(" ").slice(1).join(" ") || "";
        
        const prefillData = {
          prefill_address: JSON.stringify({
            pincode: customer.zip || "",
            firstName: firstName,
            lastName: lastName,
            phone: customer.phone || "",
            line1: customer.address || "",
            line2: "",
            city: customer.city || "",
            state: customer.state || "",
            country: "India",
            email: customer.email || ""
          }),
          items: (abandonedCart?.line_items as any[])?.filter(i => !i.__metadata).map(i => ({
            variant_id: String(i.variant_id),
            quantity: i.quantity
          })),
          token: token,
          email: customer.email || "",
          phone: customer.phone || "",
          firstName: firstName,
          lastName: lastName
        };
        const encodedPayload = btoa(unescape(encodeURIComponent(JSON.stringify(prefillData))));
        // Add JWT header prefix to match Shiprocket format
        const jwtPayload = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${encodedPayload}`;
        checkoutUrl = `https://cureforever.in/?cart-resume-id=${token}&type=report&guest-abandon-payload=${jwtPayload}`;
      } else if (!checkoutUrl) {
        // Shopify Format fallback
        checkoutUrl = `https://cureforever.in/cart/${token}`;
      }
    }
  }



  async function handleDone() {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    
    if (sendWaInLog && logWaMessage) {
        setSendingWa(true);
        try {
            const res = await fetch("/api/whatsapp/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: task.customer.phone,
                    message: logWaMessage
                }),
            });
            const data = await res.json();
            if (data.ok) toast.success("Follow-up WhatsApp sent!");
        } catch (err) {
            console.error("Failed to send WhatsApp from log:", err);
        } finally {
            setSendingWa(false);
        }
    }

    // [ADMIN NOTIFY] Task Completion
    const { sendAdminNotification } = await import("@/lib/notifications");
    const agentName = (task as any).assigned_profile?.name || "Agent";
    const detailString = task.order ? `Order: ${task.order.order_number}` : task.abandoned_cart ? `Cart: ${task.abandoned_cart.cart_token?.slice(-8)}` : "";
    
    await sendAdminNotification(
      `✅ *Task Completed*\n*Agent:* ${agentName}\n*Customer:* ${task.customer.name}\n*Type:* ${TASK_TYPE_CONFIG[task.task_type].label}\n*Outcome:* ${outcome.replace(/_/g, ' ').toUpperCase()}\n${detailString}`,
      "info",
      "task_completion"
    );

    if (user?.id) {
        const { logActivity } = await import("@/lib/activity-logger");
        logActivity({
            agent_id: user.id,
            activity_type: "task_completion",
            description: `Completed ${task.task_type.replace("_", " ")} for ${task.customer.name}`,
            metadata: {
                task_id: task.id,
                task_type: task.task_type,
                customer_name: task.customer.name,
                outcome: outcome,
                order_id: task.order_id,
                cart_id: task.abandoned_cart_id
            }
        });
    }

    onComplete?.(task.id, outcome, note, disposition, followUpAction);
    setDoneModal(false);
    // Reset - Use 'done' as default which is verified allowed
    setNote(""); setOutcome("done"); setDisposition("connected_interested"); setFollowUpAction("");
    setSendWaInLog(false); setLogWaMessage("");
  }

  const { setActiveChannel } = useChat();
  const router = useRouter();

  async function handleTaskChat() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return toast.error("Please login to chat");

      // 1. Check if task channel exists
      let { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('type', 'task')
        .eq('metadata->task_id', task.id)
        .maybeSingle();

      if (!channel) {
        // 2. Create task channel
        const { data: newChannel, error: createError } = await supabase
          .from('channels')
          .insert({
            name: `Task: ${task.customer.name}`,
            type: 'task',
            created_by: user.id,
            metadata: { 
              task_id: task.id,
              task_title: product,
              customer_name: task.customer.name
            }
          })
          .select()
          .single();

        if (createError) throw createError;
        channel = newChannel;

        // 3. Add members (current user)
        await supabase.from('channel_members').insert({
          channel_id: channel.id,
          user_id: user.id,
          role: 'admin'
        });
      }

      // 4. Navigate and set active
      setActiveChannel(channel);
      router.push('/chat');
    } catch (err: any) {
      console.error("Task chat error:", err.message);
      toast.error("Failed to start task chat");
    }
  }

  function handleReschedule() {
    if (!newDate) return toast.error("Please pick a date");
    
    // [ADMIN NOTIFY] Reschedule
    import("@/lib/notifications").then(({ sendAdminNotification }) => {
      const agentName = (task as any).assigned_profile?.name || "Agent";
      sendAdminNotification(
        `📅 *Task Rescheduled*\n*Agent:* ${agentName}\n*Customer:* ${task.customer.name}\n*New Date:* ${newDate}\n*Reason:* ${reason || "Not specified"}`,
        "info",
        "task_reschedule"
      );
    });

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
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const logNote = waFile ? `WhatsApp: "${waMessage}" (File: ${waFile.name})` : `WhatsApp: "${waMessage}"`;
        
        const { error: logErr } = await supabase.from("call_logs").insert({
          task_id: task.id,
          customer_id: task.customer_id,
          outcome: "whatsapp",
          disposition: "follow_up_later",
          follow_up_action: "Manual WhatsApp sent",
          note: logNote,
          agent_name: user?.email || "Agent"
        });

        if (logErr) {
          console.error("Failed to log WhatsApp sent:", logErr);
          toast.error("WhatsApp sent, but history log failed. Check DB constraints.");
        } else {
          setWaFile(null); // Clear file after send

          // 4. Log to Agent Activity (NEW)
          if (user?.id) {
            const { logActivity } = await import("@/lib/activity-logger");
            logActivity({
              agent_id: user.id,
              activity_type: "whatsapp",
              description: `Sent WhatsApp to ${task.customer.name}: ${waMessage.slice(0, 50)}...`,
              metadata: {
                task_id: task.id,
                task_type: task.task_type,
                customer_name: task.customer.name,
                message_len: waMessage.length,
                order_id: task.order_id,
                cart_id: task.abandoned_cart_id
              }
            });
          }

          // [ADMIN NOTIFY] WhatsApp Sent
          const { sendAdminNotification } = await import("@/lib/notifications");
          const agentName = (task as any).assigned_profile?.name || user?.email || "Agent";
          await sendAdminNotification(
            `💬 *WhatsApp Sent*\n*Agent:* ${agentName}\n*Customer:* ${task.customer.name}\n*Message:* ${waMessage.slice(0, 100)}${waMessage.length > 100 ? "..." : ""}`,
            "info",
            "whatsapp_send"
          );

          setWaModal(false);
        }
      } else {
        toast.error(data.error || "Failed to send");
      }
    } catch (err: any) {
      toast.error(err.message || "Bridge connection failed");
    } finally {
      setSendingWa(false);
    }
  }


  async function handleSendEmail() {
    if (!task.customer.email) return toast.error("Customer has no email address");
    setSendingEmail(true);
    try {
      let attachments: any[] = [];
      if (emailFile) {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
          reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
          };
          reader.readAsDataURL(emailFile);
        });
        const base64Content = await base64Promise;
        attachments.push({
          filename: emailFile.name,
          content: base64Content,
          contentType: emailFile.type || "application/octet-stream"
        });
      }

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: task.customer.email,
          subject: emailSubject,
          message: emailMessage,
          attachments
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Email sent!");
        setEmailModal(false);
        setEmailFile(null);

        // Log to Activity
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (user?.id) {
          const { logActivity } = await import("@/lib/activity-logger");
          logActivity({
            agent_id: user.id,
            activity_type: "email_sent",
            description: `Sent Email to ${task.customer.name}: ${emailSubject}`,
            metadata: {
              task_id: task.id,
              customer_name: task.customer.name,
              subject: emailSubject,
              has_attachment: !!emailFile
            }
          });
        }
      } else {
        toast.error(data.error || "Failed to send Email");
      }
    } catch (err: any) {
      toast.error(err.message || "Email API Error");
    } finally {
      setSendingEmail(false);
    }
  }

  function openWa() {
    let type = task.task_type;
    // Smart default based on order payment status
    if (type === "recovery" && !checkoutUrl) type = "recovery"; // keep as is
    else if (task.order?.payment_status === "pending" || task.order?.payment_status === "unpaid") type = "cod_verify";
    
    const template = DEFAULT_TEMPLATES[type as keyof typeof DEFAULT_TEMPLATES] || DEFAULT_TEMPLATES[task.task_type as keyof typeof DEFAULT_TEMPLATES] || "";
    let msg = template
      .replace("{{name}}", task.customer.name || "there")
      .replace("{{product}}", product);
    
    if (msg.includes("{{abandon_link}}")) {
      const abandonLink = checkoutUrl || "https://cureforever.in/cart";
      msg = msg.replace("{{abandon_link}}", abandonLink);
    }
    
    setWaMessage(msg);
    setWaModal(true);
  }


  function openEmail() {
    const template = DEFAULT_TEMPLATES[task.task_type as keyof typeof DEFAULT_TEMPLATES] || "";
    let msg = template
      .replace("{{name}}", task.customer.name || "there")
      .replace("{{product}}", product);
    
    if (msg.includes("{{abandon_link}}")) {
      const abandonLink = checkoutUrl || "https://cureforever.in/cart";
      msg = msg.replace("{{abandon_link}}", abandonLink);
    }
    
    setEmailSubject(`${TASK_TYPE_CONFIG[task.task_type].label} - CureForever`);
    setEmailMessage(msg);
    setEmailModal(true);
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
                  className="font-bold text-[#1c1c1c] text-sm group-hover/card:text-[#1c1c1c]/80 transition-colors flex items-center gap-2 hover:underline"
                >
                  {task.customer.name}
                  {isDone && <span className="badge bg-blue-50 text-blue-600 text-[10px]">DONE</span>}
                </Link>
                <div 
                  onClick={(e) => e.stopPropagation()} 
                  className="inline-block"
                >
                  <a href={`tel:${task.customer.phone}`} className="text-[11px] text-gray-500 hover:text-[#1c1c1c] flex items-center gap-1 mt-0.5">
                    <Phone className="w-2.5 h-2.5" /> {task.customer.phone}
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isOverdue ? <span className="badge bg-rose-50 border-rose-200 text-rose-700">Overdue</span> : <TaskTypeBadge type={task.task_type} />}
                {typeof task.priority_score === "number" && task.priority_score > 0 && (
                  <span className="badge bg-gray-50 border-gray-200 text-gray-700">Priority {task.priority_score}</span>
                )}
                {(task as any).assigned_profile?.name && !isAdmin && (
                  <span className="badge bg-sky-50 border-sky-200 text-sky-700">Owner {(task as any).assigned_profile.name}</span>
                )}
                {isAdmin && agents && agents.length > 0 && (
                  <select 
                    value={task.assigned_to || ""} 
                    onChange={(e) => { e.stopPropagation(); onReassign?.(task.id, e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                    className="badge bg-sky-50 border-sky-200 text-sky-700 cursor-pointer outline-none hover:bg-sky-100 font-medium"
                  >
                    <option value="" disabled>Unassigned</option>
                    {agents.map(a => <option key={a.id} value={a.id}>Owner {a.name}</option>)}
                  </select>
                )}
                {daysSince !== null && (
                  <span className="badge bg-gray-50 border-gray-200 text-gray-500">{daysSince}d since delivery</span>
                )}
              </div>
            </div>

            <div className="mt-2 text-xs text-gray-400 font-medium flex items-center min-w-0">
              <span className="text-gray-600 flex-shrink-0 flex items-center gap-1">
                {task.order ? (
                  <>Order: {task.order.order_number || task.order.shopify_order_id?.slice(-8)}</>
                ) : task.abandoned_cart ? (
                  <>Cart: {task.abandoned_cart.cart_token?.slice(-12) || task.abandoned_cart.id.slice(0, 8)}</>
                ) : (
                  "—"
                )}
              </span> 
              <span className="mx-1.5 flex-shrink-0">·</span> 
              <span className="truncate flex-1 min-w-0" title={product}>{product}</span> 
              <span className="mx-1.5 flex-shrink-0">·</span> 
              <span className="flex-shrink-0 whitespace-nowrap">Due: {formatDate(task.due_date)}</span>
              {task.order?.delivered_at && (
                <>
                  <span className="mx-1.5 flex-shrink-0 text-blue-400">·</span>
                  <span className="flex-shrink-0 whitespace-nowrap text-blue-600 font-bold">Delivered: {formatDate(task.order.delivered_at)}</span>
                </>
              )}
            </div>

            {!isDone && !compact && (
              <div className="flex items-center gap-2 mt-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setDoneModal(true)} className="btn-primary text-[10px] py-1 px-4 h-8 rounded-lg">
                  <CheckCircle className="w-3 h-3" /> Log Call
                </button>
                <button onClick={openWa} className="btn-secondary text-[10px] py-1 px-4 h-8 text-[#1c1c1c] border-[#1c1c1c]/20 hover:bg-[#1c1c1c]/5">
                  <Send className="w-3 h-3" /> WhatsApp
                </button>
                <button onClick={openEmail} className="btn-secondary text-[10px] py-1 px-4 h-8 text-[#1c1c1c] border-[#1c1c1c]/20 hover:bg-[#1c1c1c]/5">
                  <MessageSquare className="w-3 h-3" /> Email
                </button>
                <button onClick={() => setRescheduleModal(true)} className="btn-secondary text-[10px] py-1 px-4 h-8">
                  <Calendar className="w-3 h-3" /> Reschedule
                </button>
              </div>
            )}
        </div>
      </div>
    </div>

    <Modal 
        open={showDetail} 
        onClose={() => setShowDetail(false)} 
        title={(
          <span>
            {task.order ? 'Order Details' : 'Abandoned Cart'} — {task.customer.name} (
            <a href={`tel:${task.customer.phone}`} className="text-blue-600 hover:underline">{task.customer.phone}</a>
            {task.customer.email ? (
              <> / <a href={`mailto:${task.customer.email}`} className="text-blue-600 hover:underline">{task.customer.email}</a></>
            ) : null}
            )
          </span>
        )} 
        maxWidth="max-w-6xl"
        footer={(
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1c1c1c]/10 flex items-center justify-center text-[#1c1c1c] text-[10px] font-bold">
                {initials((task as any).assigned_profile?.name || "U")}
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Assigned Agent</div>
                <div className="text-xs font-bold text-[#1c1c1c]">{(task as any).assigned_profile?.name || "Unassigned"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowDetail(false); handleTaskChat(); }} className="btn-secondary text-xs py-2 px-6 flex items-center gap-2 text-[#1c1c1c] border-[#1c1c1c]/20 hover:bg-[#1c1c1c]/5">
                <MessageSquare className="w-3 h-3" /> Chat with Team
              </button>
              <button onClick={() => { setShowDetail(false); setDoneModal(true); }} className="btn-primary text-xs py-2 px-8">
                Log Call Outcome
              </button>
              <button onClick={() => { setShowDetail(false); openWa(); }} className="btn-secondary text-xs py-2 px-8 text-[#1c1c1c] border-[#1c1c1c]/20 hover:bg-[#1c1c1c]/5">
                WhatsApp
              </button>
              <button onClick={() => { setShowDetail(false); openEmail(); }} className="btn-secondary text-xs py-2 px-8 text-[#1c1c1c] border-[#1c1c1c]/20 hover:bg-[#1c1c1c]/5">
                Email
              </button>
              <button onClick={() => setShowDetail(false)} className="btn-secondary text-xs py-2 px-6 text-gray-500">
                Close
              </button>
            </div>
          </div>
        )}
      >
        <div className="flex flex-col">
          {(() => {
            const orderObj = Array.isArray(task.order) ? task.order[0] : task.order;
            const abandonedObj = Array.isArray(task.abandoned_cart) ? task.abandoned_cart[0] : task.abandoned_cart;
            
            if (orderObj) {
              const oId = [orderObj.shopify_order_id, orderObj.order_number, orderObj.id]
                .find(id => id && String(id).trim().length > 0);
              
              if (!oId) {
                return (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mb-4">
                      <Search className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Incomplete Order Data</h3>
                    <p className="text-gray-500 max-w-xs mt-2">
                      This order record is present in the CRM but is missing the necessary IDs to fetch details from Shiprocket.
                    </p>
                  </div>
                );
              }
              
              return (
                <div className="bg-gray-50 -m-5 -mt-4 rounded-xl overflow-hidden min-h-[60vh]">
                  <ShiprocketOrderView orderId={String(oId)} />
                </div>
              );
            }
            
            return (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {/* Customer Column */}
              <div className="md:col-span-2 space-y-6">
                <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <Avatar name={task.customer.name} size="lg" />
                  <div>
                    <Link href={`/customers/${task.customer_id}`} className="font-bold text-[#1c1c1c] hover:underline hover:text-[#1c1c1c]/80 transition-colors">
                      {task.customer.name}
                    </Link>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <span className={cn("w-2 h-2 rounded-full", isOverdue ? "bg-rose-500" : "bg-[#1c1c1c]")} />
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
                    </div>
                  </div>
                )}

                {meta?.rtoPredict && (
                  <div className={cn(
                    "p-3 rounded-xl border flex flex-col gap-1",
                    meta.rtoPredict.toLowerCase() === 'high' 
                      ? "bg-rose-50 border-rose-100 text-rose-700" 
                      : "bg-emerald-50 border-emerald-100 text-emerald-700"
                  )}>
                    <div className={cn(
                      "text-[10px] uppercase font-bold tracking-wider flex items-center gap-1",
                      meta.rtoPredict.toLowerCase() === 'high' ? "text-rose-400" : "text-emerald-400"
                    )}>
                      <CheckCircle className="w-3 h-3" /> RTO Risk Level
                    </div>
                    <div className="text-sm font-bold flex items-center gap-2">
                      {meta.rtoPredict.toUpperCase()}
                      {meta.rtoPredict.toLowerCase() === 'high' && (
                        <span className="text-[10px] bg-rose-100 px-1.5 py-0.5 rounded-full">CAUTION</span>
                      )}
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
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                      <Search className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                        {task.order ? "Shopify Order ID" : "Fastrr Cart ID"}
                      </div>
                      <div className="text-sm font-mono font-bold text-gray-700">
                        {checkoutUrl ? (
                          <a href={checkoutUrl} target="_blank" className="hover:text-blue-600 underline decoration-blue-200 hover:decoration-blue-400 transition-all">
                            {order?.shopify_order_id || order?.order_number || abandonedCart?.cart_token || "—"}
                          </a>
                        ) : (
                          order?.shopify_order_id || order?.order_number || abandonedCart?.cart_token || "—"
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Email Address</div>
                      {task.customer.email ? (
                        <a href={`mailto:${task.customer.email}`} className="text-sm font-semibold truncate max-w-[180px] block hover:text-blue-600 transition-colors">
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
                      Abandoned Cart
                    </h4>
                    <div className="text-[10px] font-mono text-gray-400 uppercase leading-none">
                      ID: {task.abandoned_cart?.cart_token?.slice(0, 10)}
                    </div>
                  </div>
                  <div className="p-4">
                    {/* Date Row */}
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-50">
                      <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                        Abandoned At
                      </div>
                      <div className="text-xs font-semibold text-gray-700">
                        {formatDate(abandonedCart?.abandoned_at || task.created_at)} 
                        <span className="text-gray-400 font-normal ml-1">
                          ({timeAgo(abandonedCart?.abandoned_at || task.created_at)})
                        </span>
                      </div>
                    </div>

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
                            <div className="text-xs font-bold text-[#1c1c1c]">₹{item.price || item.productPrice || item.amount}</div>
                            <div className="text-[10px] text-gray-400 font-medium">Qty: {item.quantity || item.qty || item.productQuantity || 1}</div>
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
                      <div className="flex justify-between text-sm font-bold text-[#1c1c1c] px-1 pt-1">
                        <span>Total Amount</span>
                        <span className="text-[#1c1c1c] underline decoration-[#1c1c1c]/20 decoration-2 underline-offset-4">₹{totalAmount}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {checkoutUrl && (
                  <a 
                    href={checkoutUrl} 
                    target="_blank" 
                    className="btn-secondary w-full justify-center bg-blue-50 border-blue-100 text-blue-700 font-bold hover:bg-blue-100"
                  >
                    Open Abandoned Cart 🛒
                  </a>
                )}
                
                {task.manager_action === 'rejected' && (
                  <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl mt-4 animate-pulse-slow">
                    <div className="flex items-center gap-2 text-rose-700 font-black text-[10px] uppercase tracking-widest mb-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Flagged for Revision
                    </div>
                    <p className="text-xs font-bold text-rose-900 leading-relaxed italic">
                      &ldquo;{task.manager_note || "Manager requested a revision of this task resolution."}&rdquo;
                    </p>
                  </div>
                )}
                

                {order?.delivery_status === 'rto' && (
                  <div className="mt-4">
                    <RTOClaimGenerator order={order} customer={task.customer} />
                  </div>
                )}
              </div>
            </div>
          );
        })()}
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
          <div className="text-[11px] text-gray-400">Sending to: <a href={`tel:${task.customer.phone}`} className="font-bold text-gray-700 hover:text-blue-600 transition-colors">{task.customer.phone}</a></div>
          
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
                    "text-[10px] px-2 py-1 rounded bg-gray-50 border border-gray-200 text-gray-500 uppercase font-bold tracking-wider hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all",
                    // Highlight current task type by default
                    task.task_type === key && "bg-blue-50 border-blue-200 text-blue-700",
                    waMessage === tpl.replace("{{name}}", task.customer.name || "there").replace("{{product}}", product) && "bg-[#1c1c1c] text-white border-[#1c1c1c]"
                  )} 
                  onClick={() => {
                    let msg = tpl.replace("{{name}}", task.customer.name || "there").replace("{{product}}", product);
                    if (msg.includes("{{abandon_link}}")) {
                      const abandonLink = checkoutUrl || meta?.ABANDONLINK || task.customer.custom_meta?.ABANDONLINK || "https://cureforever.in/cart";
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
            <label className="flex items-center gap-2 px-3 py-2 rounded bg-gray-50 border border-dashed border-gray-300 text-gray-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/50 cursor-pointer transition-all">
              <Paperclip className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{waFile ? "Change File" : "Attach File (Media/PDF)"}</span>
              <input 
                type="file" 
                className="hidden" 
                onChange={e => setWaFile(e.target.files?.[0] || null)} 
              />
            </label>
            
            {waFile && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-blue-50 border border-blue-100 text-blue-700">
                <span className="text-[10px] font-bold truncate max-w-[150px]">{waFile.name}</span>
                <button 
                  onClick={() => setWaFile(null)}
                  className="p-0.5 hover:bg-blue-100 rounded-full transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>


      {/* Email Modal */}
      <Modal open={emailModal} onClose={() => { setEmailModal(false); setEmailFile(null); }} title={`Email — ${task.customer.name}`}
        footer={<>
          <button className="btn-secondary" onClick={() => { setEmailModal(false); setEmailFile(null); }}>Cancel</button>
          <button className="btn-primary" onClick={handleSendEmail} disabled={sendingEmail}>
            {sendingEmail ? "Sending..." : "Send Email"}
          </button>
        </>}
      >
        <div className="space-y-4">
          <div className="text-[11px] text-gray-400">Sending to: <span className="font-bold text-gray-700">{task.customer.email || "No email provided"}</span></div>
          
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
                    "text-[10px] px-2 py-1 rounded bg-gray-50 border border-gray-200 text-gray-500 uppercase font-bold tracking-wider hover:bg-[#1c1c1c] hover:text-white transition-all",
                    task.task_type === key && "bg-[#1c1c1c] text-white",
                    emailMessage === tpl.replace("{{name}}", task.customer.name || "there").replace("{{product}}", product) && "ring-2 ring-[#1c1c1c]"
                  )} 
                  onClick={() => {
                    let msg = tpl.replace("{{name}}", task.customer.name || "there").replace("{{product}}", product);
                    if (msg.includes("{{abandon_link}}")) {
                      const abandonLink = checkoutUrl || meta?.ABANDONLINK || task.customer.custom_meta?.ABANDONLINK || "https://cureforever.in/cart";
                      msg = msg.replace("{{abandon_link}}", abandonLink);
                    }
                    setEmailMessage(msg);
                    setEmailSubject(`${key.replace("_", " ").toUpperCase()} - CureForever`);
                  }}
                >
                  {key.replace("_", " ")}
                </button>
              );
            })}
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Subject</label>
            <input type="text" className="input text-sm" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Message</label>
            <textarea className="input resize-none h-48 text-sm" value={emailMessage} onChange={e => setEmailMessage(e.target.value)} />
          </div>

          {/* File Attachment */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 rounded bg-gray-50 border border-dashed border-gray-300 text-gray-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/50 cursor-pointer transition-all">
              <Paperclip className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{emailFile ? "Change Attachment" : "Attach Document/Image"}</span>
              <input 
                type="file" 
                className="hidden" 
                onChange={e => setEmailFile(e.target.files?.[0] || null)} 
              />
            </label>
            
            {emailFile && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-blue-50 border border-blue-100 text-blue-700">
                <span className="text-[10px] font-bold truncate max-w-[150px]">{emailFile.name}</span>
                <button 
                  onClick={() => setEmailFile(null)}
                  className="p-0.5 hover:bg-blue-100 rounded-full transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={doneModal} onClose={() => setDoneModal(false)} title={`Log Call — ${task.customer.name}`}
        footer={<>
          <button className="btn-secondary" onClick={() => setDoneModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleDone} disabled={sendingWa}>
             {sendingWa ? "Logging & Sending..." : "Save Outcome"}
          </button>
        </>}
      >
        <div className="space-y-4">
          {/* QUICK ACTIONS GALLERY */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">⚡ Quick Actions</label>
            <div className="flex flex-wrap gap-2">
              <button 
                type="button"
                onClick={() => {
                  setOutcome("no_answer");
                  setDisposition("no_answer_logged");
                  setNote("Called 3 times, no response. Toggled WhatsApp follow-up.");
                  setSendWaInLog(true);
                  if (!logWaMessage) {
                    const tpl = DEFAULT_TEMPLATES[task.task_type as keyof typeof DEFAULT_TEMPLATES] || "";
                    setLogWaMessage(tpl.replace("{{name}}", task.customer.name).replace("{{product}}", product));
                  }
                }}
                className="px-2.5 py-1.5 rounded bg-orange-50 border border-orange-100 text-[10px] font-bold text-orange-700 hover:bg-orange-600 hover:text-white transition-all flex items-center gap-1.5"
              >
                📞 No Answer + WA
              </button>
              <button 
                type="button"
                onClick={() => {
                  setOutcome("rescheduled");
                  setDisposition("busy_call_later");
                  setNote("Customer was busy, requested a callback later.");
                }}
                className="px-2.5 py-1.5 rounded bg-blue-50 border border-blue-100 text-[10px] font-bold text-blue-700 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-1.5"
              >
                ⏳ Busy / Call Later
              </button>
              <button 
                type="button"
                onClick={() => {
                  setOutcome("done");
                  setDisposition("connected_bought");
                  setNote("Customer confirmed they have already purchased. Workflow complete.");
                }}
                className="px-2.5 py-1.5 rounded bg-blue-50 border border-blue-100 text-[10px] font-bold text-blue-700 hover:bg-[#1c1c1c] hover:text-white transition-all flex items-center gap-1.5"
              >
                ✅ Already Bought
              </button>
              <button 
                type="button"
                onClick={() => {
                  setOutcome("no_answer");
                  setDisposition("wrong_number");
                  setNote("The number is invalid or wrong. Flagged for verification.");
                }}
                className="px-2.5 py-1.5 rounded bg-rose-50 border border-rose-100 text-[10px] font-bold text-rose-700 hover:bg-rose-600 hover:text-white transition-all flex items-center gap-1.5"
              >
                ❌ Wrong Number
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Outcome</label>
              <select className="select py-1 text-xs font-semibold" value={outcome} onChange={e => setOutcome(e.target.value)}>
                <option value="done" className="text-blue-600 font-bold">✔ Successful / Resolved</option>
                <option value="no_answer" className="text-orange-600">⚠ No Answer / Unreachable</option>
                <option value="rescheduled" className="text-blue-600">📅 Will Call Back / Rescheduled</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Disposition</label>
              <select className="select py-1 text-xs" value={disposition} onChange={e => setDisposition(e.target.value)}>
                <optgroup label="Success/Connected">
                  <option value="connected_interested">Interested / Hot Lead</option>
                  <option value="connected_bought">Purchased / Already Bought</option>
                  <option value="connected_support">Support Needed / Query</option>
                  <option value="callback_requested">Callback Requested</option>
                  <option value="busy_call_later">Busy - Call Later</option>
                </optgroup>
                <optgroup label="Rejections / Flags">
                  <option value="not_interested">Not Interested / Reject</option>
                  <option value="fake_order">Fake Order / Fraud / Junk</option>
                  <option value="rto_requested">RTO Requested by Customer</option>
                  <option value="wrong_number">Wrong Number / Invalid</option>
                  <option value="invalid_lead">Spam / Invalid Lead</option>
                  <option value="language_barrier">Language Barrier</option>
                </optgroup>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Internal Note / Agent Comments</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(function() {
                const type = task.task_type;
                let presets = [
                  { label: "Refill Done", text: "Customer confirmed they have already purchased the refill from the website. No further follow-up needed for this cycle." },
                  { label: "No Answer", text: "Multiple call attempts made but the customer did not answer. No response on WhatsApp either. Will follow up later." },
                  { label: "Wrong Number", text: "The number provided in the record is incorrect or belongs to someone else. Requesting data team to verify." }
                ];

                if (type === 'review') {
                  presets = [
                    { label: "Great Results", text: "Customer is very happy with the results. Reported improved energy and wellness. Highly satisfied." },
                    { label: "Slow Progress", text: "Customer reports no visible change yet. Advised that natural supplements take time. Asked for patience." },
                    { label: "Inconsistent", text: "Customer admitted to forgetting doses. Re-educated on daily routine importance." },
                    { label: "Quality Conc.", text: "Customer had questions regarding packaging/texture. Provided technical clarity." },
                    { label: "Review Given", text: "Customer has promised to leave a 5-star review via the link shared." },
                  ];
                } else if (type === 'reorder') {
                  presets = [
                    { label: "Discount Req", text: "Customer requested a discount code. Provided a loyalty coupon; they promised to buy soon." },
                    { label: "Stock Issue", text: "Customer has enough stock for now. Will reorder after 15 days." },
                    { label: "Price Issue", text: "Customer finds it expensive. Explained premium quality and sourcing. They will think about it." },
                    { label: "Will buy later", text: "Customer is interested but out of town. Requested callback in 1 week." },
                    { label: "Trust Issue", text: "Customer hesitant about long-term use. Provided safety certifications and dosage guide." },
                  ];
                } else if (type === 'recovery') {
                  presets = [
                    { label: "Recovered", text: "Successfully converted the cart into an order during the call." },
                    { label: "Payment Fail", text: "Customer tried to buy but payment failed. Guided on alternative methods/COD." },
                    { label: "High Shipping", text: "Customer cancelled due to shipping charges. Offered a shipping waiver coupon." },
                    { label: "Ingredients", text: "Customer hesitant about ingredients. Explained the formulation in detail. Convinced." },
                  ];
                } else if (type === 'issue_resolution') {
                  presets = [
                    { label: "Damaged", text: "Customer reported damaged packaging. Initiated replacement request via Logistics." },
                    { label: "Missing Item", text: "Received parcel but items are missing. Verifying with warehouse footage." },
                    { label: "Wrong Item", text: "Customer received a different product. Initiated return-exchange process." },
                    { label: "Refusal", text: "Customer refused delivery at doorstep. Trying to convince for re-attempt." },
                  ];
                } else if (type === 'transit_update') {
                  presets = [
                    { label: "Address Change", text: "Customer requested delivery to a new address. Updated Shiprocket and Warehouse." },
                    { label: "Delayed Logi", text: "Order stuck at hub. Raised escalation with Shiprocket support." },
                    { label: "Call for Deliv", text: "Requested rider to call customer before arriving. Instruction added to AWB." },
                  ];
                }

                return presets.map(p => (
                  <button 
                    key={p.label}
                    type="button"
                    onClick={() => setNote(p.text)}
                    className="px-2 py-1 rounded bg-gray-50 border border-gray-100 text-[10px] font-bold text-gray-500 hover:bg-[#1c1c1c] hover:text-white hover:border-[#1c1c1c] transition-all"
                  >
                    {p.label}
                  </button>
                ));
              })()}
            </div>
            <textarea className="input resize-none h-20 text-xs" placeholder="Add detailed call notes for future reference..." value={note} onChange={e => setNote(e.target.value)} />
          </div>

          <div className="pt-2 border-t border-gray-50">
             <label className="flex items-center gap-2 cursor-pointer group mb-2">
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300 text-[#1c1c1c] focus:ring-[#1c1c1c] cursor-pointer"
                  checked={sendWaInLog}
                  onChange={e => {
                    setSendWaInLog(e.target.checked);
                    if (e.target.checked && !logWaMessage) {
                        const tpl = DEFAULT_TEMPLATES[task.task_type as keyof typeof DEFAULT_TEMPLATES] || "";
                        setLogWaMessage(tpl.replace("{{name}}", task.customer.name).replace("{{product}}", product));
                    }
                  }}
                />
                <span className="text-xs font-bold text-gray-600 group-hover:text-[#1c1c1c] transition-colors">Follow up via WhatsApp?</span>
             </label>
             
             {sendWaInLog && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                   <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                      {Object.keys(DEFAULT_TEMPLATES).map(key => (
                         <button 
                            key={key}
                            onClick={() => {
                                const tpl = DEFAULT_TEMPLATES[key as keyof typeof DEFAULT_TEMPLATES] || "";
                                setLogWaMessage(tpl.replace("{{name}}", task.customer.name).replace("{{product}}", product));
                            }}
                            className={cn(
                                "whitespace-nowrap px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter transition-all",
                                logWaMessage.includes(key.replace("_", " ")) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            )}
                         >
                            {key.replace("_", " ")}
                         </button>
                      ))}
                   </div>
                   <textarea 
                     className="input resize-none h-24 text-xs bg-blue-50/20 border-blue-100" 
                     placeholder="Type follow-up message..." 
                     value={logWaMessage} 
                     onChange={e => setLogWaMessage(e.target.value)} 
                   />
                </div>
             )}
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

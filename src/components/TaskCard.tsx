"use client";
import { useState, useMemo, useEffect } from "react";
import { 
  Search, 
  RefreshCw, 
  Trash2, 
  MoreVertical, 
  Phone, 
  Mail, 
  Calendar, 
  MessageSquare, 
  ExternalLink, 
  AlertTriangle, 
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Truck,
  Zap,
  TrendingUp,
  MapPin,
  AlertCircle,
  CheckCircle,
  Clock,
  SkipForward,
  Send,
  Paperclip,
  X,
  Globe,
  Loader2
} from "lucide-react";
import { getLogisticsIntelligence, LogisticsRecommendation } from "@/lib/logistics-engine";
import { getUpsellSuggestions, UpsellSuggestion } from "@/lib/upsell-engine";
import Link from "next/link";
import toast from "react-hot-toast";
import { Avatar, TaskTypeBadge, TaskStatusBadge, Modal } from "./ui";
import ShiprocketOrderView from "./ShiprocketOrderView";
import NDRActionModal from "./NDRActionModal";
import { createClient } from "@/lib/supabase";
import { formatDate, TASK_TYPE_CONFIG, cn, getTaskProductName, initials, timeAgo } from "@/lib/utils";
import type { Task, Customer, Order, AbandonedCart } from "@/types";
import { logAuditEvent } from "@/lib/audit";
import { useChat } from "@/context/ChatContext";
import { useRouter } from "next/navigation";
import RTOClaimGenerator from "./RTOClaimGenerator";
import { WhatsAppChat } from "./chat/WhatsAppChat";
import ClickToCallModal from "./ClickToCallModal";

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

const BATTLE_SCRIPTS: Record<string, Record<string, string>> = {
  recovery: {
    default: "{greeting} {name} 👋, I noticed you were looking at our {product}. Is there anything I can help you with? We can offer a special 10% discount if you complete your order in the next 2 hours!",
    whale: "{greeting} {name}, as one of our valued VIPs, we've reserved your {product}. I can personally ensure priority dispatch if you'd like to finalize this now. Use code VIPFREE for free shipping.",
    bargain_hunter: "{greeting} {name}! Great news—the {product} you liked is currently at its best price. Grab it before the sale ends tonight!"
  },
  ndr_resolution: {
    default: "{greeting} {name}, regarding your order for {product}. We noticed a delivery attempt failed. Could you please confirm your alternate number and any landmark? I'll personally ensure the rider reaches you tomorrow.",
    risky: "{greeting} {name}, our delivery partner reported they couldn't find your location for the {product} delivery. Should I share an alternate address or a specific instruction with the courier hub for you?"
  },
  transit_update: {
    default: "{greeting} {name}! Your order for {product} is currently moving through our logistics network. I'm monitoring it closely to ensure it reaches you on time. Any specific delivery time preference?",
    delayed: "{greeting} {name}, I noticed a slight delay in the transit of your {product}. I've already escalated this with the courier hub to prioritize your package. Appreciate your patience!"
  },
  cod_verify: {
    default: "{greeting} {name}, confirming your COD order for {product}. To ensure smooth delivery, could you please confirm your complete address and a landmark near your house?",
    risky: "{greeting} {name}, regarding your order for {product}. We noticed some delivery issues in your area previously. Would you like to convert this to a prepaid order? We'll add a free gift as a thank you!",
    risky_returner: "{greeting} {name}, calling to verify your recent order. Since this is a high-value COD, we require a quick verbal confirmation of the delivery address to proceed with dispatch."
  },
  welcome_call: {
    default: "Welcome to CureForever, {name}! We're excited to have you. Your order for {product} is being packed. How did you hear about us?"
  },
  win_back: {
    default: "{greeting} {name}, we've missed you! It's been a while since your last order of {product}. We have a new formulation you'll love. Can I send you a trial pack?"
  }
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const getBattleScript = (
  taskType: string, 
  segment: string, 
  name: string, 
  product: string, 
  orderStatus?: string,
  sentiment?: string,
  isUrgent?: boolean,
  rtoProbability?: number
) => {
  let effectiveTaskType = taskType;
  // If the task is a recovery task but they actually placed an order, switch to a more relevant script
  if (taskType === 'recovery' && orderStatus && orderStatus !== 'pending') {
    if (orderStatus === 'out_for_delivery' || orderStatus === 'in_transit') effectiveTaskType = 'transit_update';
    else if (orderStatus === 'delivered') effectiveTaskType = 'review';
    else if (orderStatus === 'rto' || orderStatus === 'failed') effectiveTaskType = 'ndr_resolution';
  }
  
  if (sentiment === 'negative') {
    return `${getGreeting()} ${name} 👋, I'm reaching out personally from CureForever Care. I saw your feedback regarding ${product} and want to make sure we resolve any concerns you have with priority care. How can we support you best? 🌿`;
  }
  
  const scripts = BATTLE_SCRIPTS[effectiveTaskType] || BATTLE_SCRIPTS['recovery'];
  const template = scripts[segment] || scripts['default'];
  
  let finalScript = template
    .replace(/{greeting}/g, getGreeting())
    .replace(/{name}/g, name)
    .replace(/{product}/g, product);
    
  if (isUrgent) {
    finalScript += " ⚡ P.S. I have marked this request as High Priority with our shipping desk for instant fulfillment!";
  }
  
  if (taskType === 'cod_verify' && rtoProbability && rtoProbability > 30) {
    finalScript += " 💡 Tip: Convert this to prepaid online and get a flat ₹50 discount + a free natural supplement booster! Shall I share the payment link?";
  }
  
  return finalScript;
};

export default function TaskCard({ task, onComplete, onReschedule, onSkip, onWhatsApp, whatsappSettings, compact, isAdmin, agents, onReassign }: TaskCardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  const supabase = useMemo(() => createClient(), []);
  const [doneModal, setDoneModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showNDRModal, setShowNDRModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details');
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
  const [sendWaInLog, setSendWaInLog] = useState(false);
  const [logWaMessage, setLogWaMessage] = useState("");
  const [processingManager, setProcessingManager] = useState(false);
  const [showClickToCall, setShowClickToCall] = useState(false);

  const handleManagerAction = async (e: React.MouseEvent, action: 'approved' | 'rejected') => {
    e.stopPropagation();
    if (processingManager) return;
    setProcessingManager(true);
    try {
      const { error } = await supabase.from("tasks").update({
        is_processed_by_manager: action !== 'rejected', 
        manager_processed_at: new Date().toISOString(),
        manager_action: action,
        status: action === 'rejected' ? 'due' : 'done' 
      }).eq("id", task.id);
      
      if (error) throw error;
      toast.success(action === 'approved' ? "Task Approved" : "Task Flagged for Revision");
      if (showDetail) setShowDetail(false);
      window.location.reload();
    } catch (err) {
      toast.error("Failed to process manager action");
    } finally {
      setProcessingManager(false);
    }
  };

  const [logistics, setLogistics] = useState<LogisticsRecommendation | null>(null);
  const [upsells, setUpsells] = useState<UpsellSuggestion[]>([]);

  useEffect(() => {
    async function fetchIntelligence() {
      const pincode = task.customer?.zip || (task as any).order?.shipping_address?.zip;
      if (pincode) {
        const intelligence = await getLogisticsIntelligence(supabase, pincode);
        setLogistics(intelligence);
      }
      
      const items = (task as any).order?.line_items || [];
      if (items.length > 0) {
        setUpsells(getUpsellSuggestions(items));
      }
    }
    fetchIntelligence();
  }, [task, supabase]);

  const abandonedCart = (Array.isArray(task.abandoned_cart) ? task.abandoned_cart[0] : task.abandoned_cart) as AbandonedCart | undefined;
  const order = (Array.isArray(task.order) ? task.order[0] : task.order) as Order | undefined;

  const cfg = TASK_TYPE_CONFIG[task.task_type];
  const isDone = task.status === "done" || task.status === "cancelled";
  const isOverdue = task.status === "overdue";
  
  const product = getTaskProductName({ ...task, abandoned_cart: abandonedCart, order: order });

  const generateAiSuggestion = (type: string, disp: string, name: string, prod: string) => {
    const firstName = name.split(" ")[0];
    const suggestions: Record<string, Record<string, string>> = {
      connected_interested: {
        recovery: `Spoke with ${firstName}. They were busy during checkout but remain highly interested in ${prod}. Guided them through the payment process and sent a direct recovery link.`,
        cod_verify: `Verified order for ${prod} with ${firstName}. They confirmed the address and promised to be available for delivery. Customer seems genuine.`,
        welcome_call: `Had a warm welcome call with ${firstName}. They are excited to try ${prod}. Verified address and provided basic usage instructions.`,
        vip_followup: `Conducted VIP priority call with ${firstName}. Expressed gratitude for their high-value order of ${prod}. Provided direct contact for any future needs.`,
        reorder: `Followed up with ${firstName} for a refill. They had a great experience with the first bottle and agreed to reorder ${prod}.`,
        review: `${firstName} reported excellent results with ${prod}. They promised to leave a positive 5-star review on the website.`,
        win_back: `Successfully re-engaged ${firstName}. They had been busy but were happy to hear from us. Provided a loyalty discount for their next ${prod} purchase.`
      },
      connected_bought: {
        all: `Confirmed with ${firstName} that they have already purchased ${prod}. Task completed as they are now back in the active customer loop.`
      },
      not_interested: {
        all: `${firstName} decided not to proceed with the purchase of ${prod} at this time. Cited personal reasons or changed their mind.`
      },
      busy_call_later: {
        all: `${firstName} was busy or in a meeting. Requested a callback later in the day to discuss ${prod}.`
      },
      no_answer_logged: {
        all: `Attempted to reach ${firstName} multiple times. No response. Sent a follow-up WhatsApp message regarding ${prod}.`
      },
      wrong_number: {
        all: `The number for ${firstName} is invalid or belongs to someone else. Flagged for data verification.`
      }
    };

    const dispMap = suggestions[disp] || suggestions["all"];
    if (!dispMap) return "";
    return dispMap[type] || dispMap["all"] || "";
  };

  useEffect(() => {
    const isNoteEmpty = !note || note.length < 10;
    if (isNoteEmpty && disposition && disposition !== "interested") {
      const suggestion = generateAiSuggestion(task.task_type, disposition, task.customer.name, product);
      if (suggestion) setNote(suggestion);
    }
  }, [disposition, task.task_type, task.customer.name, product, note]);
  
  const rawItems = order?.line_items || abandonedCart?.line_items || [];
  const metaItem = rawItems.find((i: any) => i.__metadata);
  const meta = metaItem?.payload || (abandonedCart as any)?.custom_meta || (order as any)?.custom_meta;
  
  let items = Array.isArray(rawItems) ? rawItems.filter((i: any) => !i.__metadata) : [];
  
  if (items.length === 0 && product && product !== "your items" && product !== "—" && product !== "Wellness Refill") {
    items = [{
      name: product,
      price: order?.total_price || abandonedCart?.total_price || 0,
      quantity: 1,
      variant: "Default Variant"
    }];
  }
  
  const daysSince = mounted && order?.delivered_at
    ? Math.round((Date.now() - new Date(order.delivered_at).getTime()) / 86400000)
    : null;

  const totalAmount = order?.total_price || abandonedCart?.total_price || 0;
  
  let subtotal = order?.subtotal || abandonedCart?.subtotal || 
    items.reduce((s: number, i: any) => {
      const price = Number(i.price || i.productPrice || i.amount || 0);
      const qty = Number(i.quantity || i.qty || i.productQuantity || 1);
      return s + (price * qty);
    }, 0);

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

  if (subtotal > totalAmount && discountAmount === 0) {
    discountAmount = Math.max(0, subtotal - totalAmount + shippingCharges);
  } else if (totalAmount > subtotal && shippingCharges === 0) {
    shippingCharges = Math.max(0, totalAmount - subtotal + discountAmount);
  }

  const getUtm = (key: string) => {
    if (meta?.[key]) return meta[key];
    if (meta?.cart_attributes?.[key]) return meta.cart_attributes[key];
    if (meta?.custom_attributes?.[key]) return meta.custom_attributes[key];
    
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

  const metadataItemForLink = (abandonedCart?.line_items as any[])?.find(i => i.__metadata);
  const rawMeta = metadataItemForLink?.payload || (abandonedCart as any)?.custom_meta;
  
  const landingUrl = String(rawMeta?.landing_page_url || rawMeta?.cart_attributes?.landing_page_url || "");
  let checkoutUrl = (landingUrl.includes("cart-resume-id") && landingUrl.includes("guest-abandon-payload")) 
    ? landingUrl 
    : ((abandonedCart as any)?.custom_meta?.ABANDONLINK || metadataItemForLink?.payload?.checkout_url);
  
  if (abandonedCart?.cart_token) {
    const token = abandonedCart.cart_token;
    const isFastrr = token.length > 20;
    
    if (!checkoutUrl || (isFastrr && !checkoutUrl.includes("guest-abandon-payload"))) {
      if (isFastrr) {
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
        const jwtPayload = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${encodedPayload}`;
        checkoutUrl = `https://cureforever.in/?cart-resume-id=${token}&type=report&guest-abandon-payload=${jwtPayload}`;
      } else if (!checkoutUrl) {
        checkoutUrl = `https://cureforever.in/cart/${token}`;
      }
    }
  }

  async function handleDone() {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success("Demo: Task outcome logged (local only)");
      onComplete?.(task.id, outcome, note, disposition, followUpAction);
      setDoneModal(false);
      return;
    }
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

      let { data: channel } = await supabase
        .from('channels')
        .select('*')
        .eq('type', 'task')
        .eq('metadata->task_id', task.id)
        .maybeSingle();

      if (!channel) {
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

        await supabase.from('channel_members').insert({
          channel_id: channel.id,
          user_id: user.id,
          role: 'admin'
        });
      }

      setActiveChannel(channel);
      router.push('/chat');
    } catch (err: any) {
      console.error("Task chat error:", err.message);
      toast.error("Failed to start task chat");
    }
  }

  function handleReschedule() {
    if (!newDate) return toast.error("Please pick a date");
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success(`Demo: Task rescheduled to ${newDate} (local only)`);
      onReschedule?.(task.id, newDate, reason);
      setRescheduleModal(false);
      return;
    }
    
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
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setSendingWa(true);
      setTimeout(() => {
        toast.success("Demo: WhatsApp sent (simulated)");
        setWaModal(false);
        setSendingWa(false);
      }, 1000);
      return;
    }
    setSendingWa(true);
    try {
      let imagePath = undefined;
      
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
          setWaFile(null); 

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
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setSendingEmail(true);
      setTimeout(() => {
        toast.success("Demo: Email sent (simulated)");
        setEmailModal(false);
        setSendingEmail(false);
      }, 1000);
      return;
    }
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
    if (type === "recovery" && !checkoutUrl) type = "recovery";
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
  const logisticsMetrics = useMemo(() => {
    if (!logistics) return null;
    const successRate = 100 - logistics.rto_probability;
    const riskLevel = logistics.rto_probability > 40 ? 'high' : logistics.rto_probability > 15 ? 'medium' : 'low';
    return { successRate, riskLevel };
  }, [logistics]);

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
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border",
                    task.customer?.segment === 'whale' ? "bg-amber-50 text-amber-700 border-amber-100" :
                    task.customer?.segment === 'risky' ? "bg-rose-50 text-rose-700 border-rose-100" :
                    "bg-gray-50 text-gray-600 border-gray-100"
                  )}>
                    {task.customer?.segment?.toUpperCase() || 'STANDARD'}
                  </div>
                  {(task as any).is_urgent && (
                    <div className="flex items-center gap-1 bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse shadow-lg shadow-rose-500/20">
                       <Zap className="w-2.5 h-2.5" /> URGENT
                    </div>
                  )}
                  {(task as any).sentiment === 'negative' && (
                    <div className="flex items-center gap-1 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                       <AlertCircle className="w-2.5 h-2.5" /> NEGATIVE SENTIMENT
                    </div>
                  )}
                </div>
                <Link 
                  href={`/customers/${task.customer_id}`} 
                  onClick={(e) => e.stopPropagation()} 
                  className="font-bold text-[#1c1c1c] text-sm group-hover/card:text-[#1c1c1c]/80 transition-colors flex items-center gap-2 hover:underline"
                >
                  {task.customer.name}
                  {task.status === "done" && <span className="badge bg-blue-50 text-blue-600 text-[10px]">DONE</span>}
                  {task.status === "cancelled" && <span className="badge bg-gray-50 text-gray-400 text-[10px]">CANCELLED</span>}
                </Link>
                <div 
                  onClick={(e) => e.stopPropagation()} 
                  className="inline-block"
                >
                  <div className="flex items-center gap-2 mt-0.5">
                    <a 
                      href={`tel:${task.customer.phone}`} 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowClickToCall(true);
                      }}
                      className="text-[11px] text-gray-500 hover:text-[#1c1c1c] flex items-center gap-1"
                    >
                      <Phone className="w-2.5 h-2.5" /> {task.customer.phone}
                    </a>
                    <a href={`sms:${task.customer.phone}`} className="text-[11px] text-gray-500 hover:text-[#1c1c1c] flex items-center gap-1 border-l border-gray-200 pl-2">
                      <Mail className="w-2.5 h-2.5" /> SMS
                    </a>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isOverdue ? <span className="badge bg-rose-50 border-rose-200 text-rose-700">Overdue</span> : <TaskTypeBadge type={task.task_type} />}
                {typeof task.priority_score === "number" && task.priority_score > 0 && (
                  <span className="badge bg-gray-50 border-gray-200 text-gray-700">Priority {task.priority_score}</span>
                )}
                {(task as any).assigned_profile?.name && !isAdmin && (
                  <div className="flex items-center gap-1.5">
                    <span className="badge bg-sky-50 border-sky-200 text-sky-700">Owner {(task as any).assigned_profile.name}</span>
                    {(task as any).assigned_profile?.live_state?.action === 'on_call' && (task as any).assigned_profile?.live_state?.entityId === task.id && (
                      <span className="badge bg-rose-500 border-rose-600 text-white animate-pulse flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-white" /> LIVE CALL
                      </span>
                    )}
                  </div>
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

            <div className="mt-2 text-[9px] md:text-xs text-gray-400 font-medium flex flex-wrap items-center gap-y-1.5 min-w-0">
              <span className="text-gray-600 flex-shrink-0 flex items-center gap-1">
                {task.order ? (
                  <>Order: {task.order.order_number || task.order.shopify_order_id?.slice(-8)}</>
                ) : task.abandoned_cart ? (
                  <>Cart: {task.abandoned_cart.cart_token?.slice(-12) || task.abandoned_cart.id.slice(0, 8)}</>
                ) : (
                  "—"
                )}
              </span> 
              <span className="hidden md:inline mx-1.5 flex-shrink-0">·</span> 
              <span className="truncate w-full md:w-auto md:max-w-[200px] min-w-0 md:px-0 order-3 md:order-none text-[#1c1c1c]/70" title={product}>{product}</span> 
              <span className="hidden md:inline mx-1.5 flex-shrink-0">·</span> 
              <span className="flex-shrink-0 whitespace-nowrap ml-auto md:ml-0 bg-[#eceae4] md:bg-transparent px-1.5 md:px-0 py-0.5 md:py-0 rounded-md md:rounded-none text-[#1c1c1c] md:text-gray-400 font-bold md:font-medium text-[10px] md:text-xs">Due: {mounted ? formatDate(task.due_date) : "—"}</span>
              {task.order?.delivered_at && (
                <>
                  <span className="hidden md:inline mx-1.5 flex-shrink-0 text-blue-400">·</span>
                  <span className="flex-shrink-0 whitespace-nowrap text-blue-600 font-bold ml-1.5 md:ml-0">Delivered: {mounted ? formatDate(task.order.delivered_at) : "—"}</span>
                </>
              )}
            </div>

            {!isDone && !compact && (
              <div className="flex items-center gap-2 mt-3 flex-wrap sm:flex-nowrap" onClick={(e) => e.stopPropagation()}>
                {task.task_type === 'manager_audit' ? (
                  <>
                    <button onClick={(e) => handleManagerAction(e, 'rejected')} disabled={processingManager} className="flex items-center justify-center gap-1.5 px-3 h-8 bg-[#f7f4ed] border border-rose-100 text-rose-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm">
                      <AlertCircle className="w-3 h-3" /> Flag Revision
                    </button>
                    <button onClick={(e) => handleManagerAction(e, 'approved')} disabled={processingManager} className="flex items-center justify-center gap-1.5 px-3 h-8 bg-[#1c1c1c] text-[#f7f4ed] rounded-lg text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50" style={{ boxShadow: "rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px" }}>
                      {processingManager ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Approve Resolution
                    </button>
                    {(task.order || task.order_id) && (
                      <button onClick={(e) => { e.stopPropagation(); setShowNDRModal(true); }} className="flex items-center justify-center gap-1.5 px-3 h-8 bg-amber-500 text-[#f7f4ed] rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all active:scale-[0.98] shadow-sm shadow-amber-100">
                        <Zap className="w-3 h-3 fill-current" /> Trigger Shiprocket Action
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => setShowClickToCall(true)} 
                      className="btn-primary text-[10px] py-1 px-4 h-8 rounded-lg flex items-center gap-1.5"
                    >
                      <Phone className="w-3 h-3 fill-current" /> Call
                    </button>
                    <button onClick={() => setDoneModal(true)} className="btn-secondary text-[10px] py-1 px-4 h-8 text-[#1c1c1c] border-[#1c1c1c]/20 hover:bg-[#1c1c1c]/5 bg-white shadow-sm">
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
                  </>
                )}
              </div>
            )}
        </div>
      </div>
    </div>

    <Modal 
        open={showDetail} 
        onClose={() => setShowDetail(false)} 
        title={(
          <div className="flex items-center gap-6 flex-wrap">
            <span className="font-bold">Task Details — {task.customer.name}</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-gray-100 p-0.5 rounded-lg">
                 <button 
                   onClick={() => setActiveTab('details')}
                   className={cn(
                     "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all",
                     activeTab === 'details' ? "bg-white text-[#1c1c1c] shadow-sm" : "text-gray-400 hover:text-gray-600"
                   )}
                 >
                   Overview
                 </button>
                 <button 
                   onClick={() => setActiveTab('chat')}
                   className={cn(
                     "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1.5",
                     activeTab === 'chat' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400 hover:text-emerald-500"
                   )}
                 >
                   <MessageSquare className="w-3 h-3 text-emerald-500" /> Live Chat
                 </button>
              </div>

              {!isDone && (
                <div className="flex items-center gap-2 border-l pl-4 border-gray-200">
                  {task.task_type === 'manager_audit' ? (
                    <>
                      <button onClick={(e) => handleManagerAction(e, 'rejected')} disabled={processingManager} className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#f7f4ed] border border-rose-100 text-rose-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm">
                        <AlertCircle className="w-3 h-3" /> Flag Revision
                      </button>
                      <button onClick={(e) => handleManagerAction(e, 'approved')} disabled={processingManager} className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#1c1c1c] text-[#f7f4ed] rounded-lg text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50" style={{ boxShadow: "rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px" }}>
                        {processingManager ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Approve Resolution
                      </button>
                      {(task.order || task.order_id) && (
                        <button onClick={(e) => { e.stopPropagation(); setShowNDRModal(true); }} className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 text-[#f7f4ed] rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all active:scale-[0.98] shadow-sm shadow-amber-100">
                          <Zap className="w-3 h-3 fill-current" /> Trigger Shiprocket Action
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => setShowClickToCall(true)} 
                        className="btn-primary text-[10px] py-1 px-3 h-7 rounded-md flex items-center gap-1.5"
                      >
                        <Phone className="w-3 h-3 fill-current" /> Call
                      </button>
                      <button onClick={() => setDoneModal(true)} className="btn-secondary text-[10px] py-1 px-3 h-7 text-[#1c1c1c] border-[#1c1c1c]/20 hover:bg-[#1c1c1c]/5 bg-white shadow-sm">
                        <CheckCircle className="w-3 h-3" /> Log Call
                      </button>
                      <button onClick={openWa} className="btn-secondary text-[10px] py-1 px-3 h-7 text-[#1c1c1c] border-[#1c1c1c]/20 hover:bg-[#1c1c1c]/5 bg-white shadow-sm">
                        <Send className="w-3 h-3" /> WhatsApp
                      </button>
                      <button onClick={openEmail} className="btn-secondary text-[10px] py-1 px-3 h-7 text-[#1c1c1c] border-[#1c1c1c]/20 hover:bg-[#1c1c1c]/5 bg-white shadow-sm">
                        <MessageSquare className="w-3 h-3" /> Email
                      </button>
                      <button onClick={() => setRescheduleModal(true)} className="btn-secondary text-[10px] py-1 px-3 h-7 bg-white shadow-sm">
                        <Calendar className="w-3 h-3" /> Reschedule
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        maxWidth="max-w-6xl"
      >
        <div className="flex flex-col">
          {activeTab === 'chat' ? (
            <div className="-m-5">
              <WhatsAppChat phone={task.customer.phone} customerName={task.customer.name} customerId={task.customer.id} />
            </div>
          ) : (
            <div className="flex flex-col gap-6 lg:gap-8 pb-8">
               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
                  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 h-full">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer Profile</div>
                      <Link href={`/customers/${task.customer_id}`} className="text-[10px] font-bold text-blue-600 hover:underline">View Full Profile</Link>
                    </div>
                    <div className="flex items-center gap-3 pb-4 border-b border-gray-50">
                      <Avatar name={task.customer.name} className="w-10 h-10" />
                      <div>
                        <div className="font-bold text-gray-900">{task.customer.name}</div>
                        <div className="text-[10px] font-medium text-gray-500 flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" /> {task.customer.city || "Unknown City"}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {trafficSource && (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-400">SOURCE</span>
                          <span className="text-[10px] font-bold text-gray-700">{trafficSource}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-400">PHONE</span>
                        <a href={`tel:${task.customer.phone}`} className="text-[10px] font-bold text-blue-600">{task.customer.phone}</a>
                      </div>
                      {task.customer.email && (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-400">EMAIL</span>
                          <span className="text-[10px] font-bold text-gray-700 truncate max-w-[120px]">{task.customer.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {(task as any).metadata?.risk_level && (
                     <div className={cn(
                       "p-4 rounded-2xl border-2 space-y-3 h-full",
                       (task as any).metadata.risk_level === 'CRITICAL' ? "bg-rose-50 border-rose-200 shadow-rose-100" : "bg-amber-50 border-amber-200 shadow-amber-100"
                     )}>
                        <div className="flex items-center justify-between">
                           <div className={cn(
                             "text-[10px] font-black uppercase tracking-widest flex items-center gap-2",
                             (task as any).metadata.risk_level === 'CRITICAL' ? "text-rose-600" : "text-amber-600"
                           )}>
                              <AlertCircle className="w-4 h-4" /> {(task as any).metadata.risk_level} RISK
                           </div>
                           <div className="text-[10px] font-bold text-gray-400">SCORE: {((task.priority_score || 0) - 110)}%</div>
                        </div>
                        <div className="space-y-1.5">
                          {(task as any).metadata.risk_reasons?.map((reason: string, i: number) => (
                            <div key={i} className="text-[10px] font-bold text-gray-700 flex items-start gap-2 leading-tight">
                              <span className="text-rose-400 flex-shrink-0 mt-0.5">•</span> {reason}
                            </div>
                          ))}
                        </div>
                     </div>
                  )}
                  {logistics && logisticsMetrics && (
                    <div className="bg-sky-50 border border-sky-100 p-5 rounded-2xl space-y-4 h-full">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black text-sky-600 uppercase tracking-widest flex items-center gap-2">
                          <Truck className="w-4 h-4" /> Logistics Intel
                        </div>
                        <div className={cn(
                          "text-[9px] font-black px-2 py-0.5 rounded-full",
                          logisticsMetrics.riskLevel === 'low' ? "bg-emerald-100 text-emerald-700" : 
                          logisticsMetrics.riskLevel === 'medium' ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                        )}>
                          {logisticsMetrics.riskLevel.toUpperCase()} RTO RISK
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-500 font-medium">Historical Success Rate</span>
                          <span className="font-black text-sky-700">{logisticsMetrics.successRate}%</span>
                        </div>
                        <div className="pt-3 border-t border-sky-200/50">
                          <div className="text-[9px] font-black text-sky-400 uppercase mb-2">Recommended Carrier</div>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                              <Truck className="w-4 h-4 text-sky-600" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-sky-900">{logistics.best_carrier}</div>
                              <div className="text-[9px] font-medium text-sky-600">Based on {logistics.rto_probability}% probability</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {upsells.length > 0 && (
                    <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl space-y-4 h-full">
                      <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Perfect Pair Upsell
                      </div>
                      <div className="space-y-3">
                        {upsells.map((upsell, i) => (
                          <div key={i} className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-bold text-gray-900">{upsell.product_name}</div>
                              <div className="text-[10px] font-black text-emerald-600">₹{upsell.price}</div>
                            </div>
                            <div className="text-[10px] text-gray-500 font-medium leading-relaxed italic">
                              &ldquo;{upsell.script}&rdquo;
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="bg-gradient-to-br from-[#111] via-[#1a1a1a] to-[#242424] text-white p-5 rounded-2xl border border-gray-800 shadow-2xl relative overflow-hidden group flex flex-col h-full">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Zap className="w-12 h-12 text-blue-400" />
                    </div>
                    
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[10px] font-black text-blue-400 uppercase tracking-[0.25em] flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 fill-current animate-pulse text-blue-400" /> Advanced AI Script
                      </div>
                      <div className="flex items-center gap-1.5 bg-blue-950/40 border border-blue-900/30 px-2 py-0.5 rounded-md">
                        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" />
                        <span className="text-[8px] font-black text-blue-300 uppercase tracking-widest">Compiler Live</span>
                      </div>
                    </div>

                    {/* Active dynamic indicators */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {/* Greeting indicator */}
                      <span className="text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-300 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-blue-400" /> 
                        {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 17 ? "Afternoon" : "Evening"} Active
                      </span>

                      {/* Sentiment indicator */}
                      {((task as any).sentiment === 'negative') ? (
                        <span className="text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded bg-rose-950/40 border border-rose-900/30 text-rose-300 flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5 text-rose-400" /> Empathy Mode Engaged
                        </span>
                      ) : (
                        <span className="text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded bg-emerald-950/40 border border-emerald-900/30 text-emerald-300 flex items-center gap-1">
                          <CheckCircle className="w-2.5 h-2.5 text-emerald-400" /> Positive Tone Active
                        </span>
                      )}

                      {/* Urgency indicator */}
                      {(task as any).is_urgent && (
                        <span className="text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded bg-amber-950/40 border border-amber-900/30 text-amber-300 flex items-center gap-1 animate-pulse">
                          <Zap className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> Priority Hook Applied
                        </span>
                      )}

                      {/* Logistics indicator */}
                      {task.task_type === 'cod_verify' && logistics?.rto_probability && logistics.rto_probability > 30 && (
                        <span className="text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded bg-indigo-950/40 border border-indigo-900/30 text-indigo-300 flex items-center gap-1">
                          <TrendingUp className="w-2.5 h-2.5 text-indigo-400" /> Prepaid Conversion Up
                        </span>
                      )}
                    </div>
                    
                    <div className="bg-[#0b0b0b]/60 border border-[#222] p-4 rounded-xl mb-4 flex-1 flex flex-col justify-center">
                      <p className="text-xs font-bold leading-relaxed italic text-gray-200">
                        &ldquo;{getBattleScript(
                          task.task_type, 
                          task.customer.segment, 
                          task.customer.name.split(' ')[0], 
                          product,
                          order?.delivery_status,
                          (task as any).sentiment,
                          (task as any).is_urgent,
                          logistics?.rto_probability
                        )}&rdquo;
                      </p>
                    </div>

                    <button 
                      onClick={() => {
                        const script = getBattleScript(
                          task.task_type, 
                          task.customer.segment, 
                          task.customer.name.split(' ')[0], 
                          product, 
                          order?.delivery_status,
                          (task as any).sentiment,
                          (task as any).is_urgent,
                          logistics?.rto_probability
                        );
                        navigator.clipboard.writeText(script);
                        toast.success("Script copied!");
                      }}
                      className="w-full text-[9px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 hover:scale-[1.01] active:scale-[0.99] border border-white/5 px-3 py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" /> Copy AI Battle Script
                    </button>
                  </div>
               </div>
               <div className="space-y-6 min-w-0 w-full">
                  {(() => {
                    const orderObj = Array.isArray(task.order) ? task.order[0] : task.order;
                    if (orderObj) {
                      const oId = [orderObj.shopify_order_id, orderObj.order_number, orderObj.id].find(id => id && String(id).trim().length > 0);
                      if (oId) {
                        return (
                          <div className="bg-gray-50 -m-5 md:-m-0 rounded-2xl overflow-hidden min-h-[50vh] border border-gray-100 shadow-sm">
                            <ShiprocketOrderView orderId={String(oId)} />
                          </div>
                        );
                      }
                    }
                    return (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                               <CheckSquare className="w-4 h-4" />
                            </div>
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Abandoned Cart Detail</h4>
                          </div>
                          <div className="text-[10px] font-bold text-gray-400">ID: {abandonedCart?.cart_token?.slice(-12) || "—"}</div>
                        </div>
                        <div className="p-6">
                           <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-50">
                              <div>
                                <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Abandoned At</div>
                                <div className="text-xs font-bold text-gray-900">{formatDate(abandonedCart?.abandoned_at || task.created_at)}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Status</div>
                                <div className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-black">ABANDONED</div>
                              </div>
                           </div>
                           <div className="space-y-4">
                              {items.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-4 group">
                                  <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0 group-hover:bg-blue-50 transition-colors">
                                    <Paperclip className="w-5 h-5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-gray-900 truncate">{item.name || item.title}</div>
                                    <div className="text-[10px] font-medium text-gray-500">{item.variant || "Default Variant"}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-black text-gray-900">₹{item.price || 0}</div>
                                    <div className="text-[10px] font-bold text-gray-400">Qty: {item.quantity || 1}</div>
                                  </div>
                                </div>
                              ))}
                           </div>
                           <div className="mt-8 pt-6 border-t border-gray-100 space-y-2">
                              <div className="flex justify-between text-xs font-medium text-gray-500">
                                <span>Subtotal</span>
                                <span>₹{subtotal}</span>
                              </div>
                              {discountAmount > 0 && (
                                <div className="flex justify-between text-xs font-bold text-rose-500 italic">
                                  <span>Discount Applied</span>
                                  <span>-₹{discountAmount}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-base font-black text-gray-900 pt-2">
                                <span>Total Recoverable</span>
                                <span className="text-blue-600">₹{totalAmount}</span>
                              </div>
                           </div>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap gap-4">
                     {checkoutUrl && (
                        <a href={checkoutUrl} target="_blank" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 group w-fit">
                           <ExternalLink className="w-5 h-5 group-hover:scale-110 transition-transform" />
                           <span className="text-xs font-black uppercase tracking-widest">Open Recovery Link</span>
                        </a>
                     )}
                     <button onClick={() => setWaModal(true)} className="bg-[#25D366] hover:bg-[#128C7E] text-white px-6 py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 group w-fit">
                        <MessageSquare className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-black uppercase tracking-widest">WhatsApp Customer</span>
                     </button>
                  </div>
                  {task.manager_action === 'rejected' && (
                    <div className="bg-rose-50 border-2 border-rose-100 p-5 rounded-2xl">
                      <div className="flex items-center gap-2 text-rose-700 font-black text-[10px] uppercase tracking-widest mb-2">
                        <AlertTriangle className="w-4 h-4" /> Manager Revision Requested
                      </div>
                      <p className="text-sm font-bold text-rose-900 leading-relaxed italic bg-white/50 p-3 rounded-xl">
                        &ldquo;{task.manager_note}&rdquo;
                      </p>
                    </div>
                  )}
                  {order?.delivery_status === 'rto' && (
                    <RTOClaimGenerator order={order} customer={task.customer} />
                  )}
               </div>
            </div>
          )}
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
            <button 
              className={cn(
                "text-[10px] px-2.5 py-1 rounded bg-blue-600 text-white font-black uppercase tracking-wider hover:bg-blue-700 transition-all flex items-center gap-1 shadow-sm",
                waMessage === getBattleScript(task.task_type, task.customer.segment, task.customer.name.split(' ')[0], product, order?.delivery_status, (task as any).sentiment, (task as any).is_urgent, logistics?.rto_probability) && "ring-2 ring-blue-400"
              )} 
              onClick={() => {
                const msg = getBattleScript(
                  task.task_type, 
                  task.customer.segment, 
                  task.customer.name.split(' ')[0], 
                  product, 
                  order?.delivery_status,
                  (task as any).sentiment,
                  (task as any).is_urgent,
                  logistics?.rto_probability
                );
                setWaMessage(msg);
              }}
            >
              🚀 AI Tactical Script
            </button>
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
                      const abandonLink = checkoutUrl || "https://cureforever.in/cart";
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
            <button 
              className={cn(
                "text-[10px] px-2.5 py-1 rounded bg-blue-600 text-white font-black uppercase tracking-wider hover:bg-blue-700 transition-all flex items-center gap-1 shadow-sm",
                emailMessage === getBattleScript(task.task_type, task.customer.segment, task.customer.name.split(' ')[0], product, order?.delivery_status, (task as any).sentiment, (task as any).is_urgent, logistics?.rto_probability) && "ring-2 ring-blue-400"
              )} 
              onClick={() => {
                const msg = getBattleScript(
                  task.task_type, 
                  task.customer.segment, 
                  task.customer.name.split(' ')[0], 
                  product, 
                  order?.delivery_status,
                  (task as any).sentiment,
                  (task as any).is_urgent,
                  logistics?.rto_probability
                );
                setEmailMessage(msg);
                setEmailSubject(`AI Tactical Script - CureForever`);
              }}
            >
              🚀 AI Tactical Script
            </button>
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
                      const abandonLink = checkoutUrl || "https://cureforever.in/cart";
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

      {showNDRModal && (
        <NDRActionModal 
          open={showNDRModal}
          onClose={() => setShowNDRModal(false)}
          shipmentId={((task.order as any)?.shiprocket_order_id || task.order?.tracking_number) || ""}
          orderNumber={task.order?.order_number || ""}
          awb={task.order?.tracking_number || ""}
          shiprocketOrderId={(task.order as any)?.shiprocket_order_id || ""}
          onSuccess={() => {
             setShowNDRModal(false);
             window.location.reload();
          }}
        />
      )}

      {showClickToCall && (
        <ClickToCallModal 
          open={showClickToCall}
          onClose={() => setShowClickToCall(false)}
          customerName={task.customer.name}
          customerPhone={task.customer.phone}
          taskId={task.id}
        />
      )}
    </>
  );
}

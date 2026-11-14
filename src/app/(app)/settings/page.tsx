"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { Save, RefreshCw, Trash2, ToggleLeft, ToggleRight, Bell, Sliders, Package, Database, AlertCircle, Loader2, Plus, Search, X, Send, Paperclip, Smartphone, QrCode, CheckCircle2, WifiOff, ShoppingBag, Zap, Mail, Check, ShieldCheck, ListPlus, FileInput } from "lucide-react";
import { PageHeader, Modal, SyncProgressBar } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn, toDbDateString } from "@/lib/utils";
import toast from "react-hot-toast";
import { AccessDenied } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { TwoFactorCard } from "@/components/auth/TwoFactorCard";
import { CustomFieldsManager } from "@/components/settings/CustomFieldsManager";
import { WebFormsManager } from "@/components/settings/WebFormsManager";
import { Settings, ProductOverride } from "@/types";

interface PipelineItem {
  id: string;
  customer: { id: string; name: string; phone?: string; whatsapp_reminders_enabled?: boolean };
  called_at?: string;
  note?: string;
  type?: string;
  isAuto?: boolean;
  isManual?: boolean;
  isWorkflow?: boolean;
  task_type?: string;
  due_date?: string;
  workflowName?: string;
}

interface PipelineState {
  sent: PipelineItem[];
  waiting: PipelineItem[];
}

type Tab = "general" | "fields" | "forms" | "security" | "telephony" | "notifications" | "email" | "overrides" | "shopify" | "shiprocket" | "database";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000000";

import { getTemplateVariables, personaliseTemplate } from "@/lib/whatsapp";

const WA_PRESETS: Record<string, string[]> = {
  wa_welcome_template: [
    "Hi {{name}} 👋, welcome to the CureForever family! 🌿 We're thrilled to have you here. This is our official WhatsApp channel for order updates and support. If you need anything, just reply to this message! 🙏",
    "Welcome to CureForever, {{name}}! 🌿 We're so glad you've chosen us for your wellness journey. Stay tuned for order updates right here! ✨"
  ],
  wa_order_placed_template: [
    "Hi {{name}}! 🎉 Your order {{order_no}} for {{product}} has been successfully placed! 🛒 We're currently preparing it for shipment. We'll send you another update as soon as it's on the way! 🚀",
    "Order Confirmed: {{order_no}}! ✅ Hi {{name}}, we've received your order for {{product}}. Our team is packing it with care. We will notify you once it's out for delivery! 📦"
  ],
  wa_order_transit_template: [
    "Great news, {{name}}! 🚚 Your order {{order_no}} is now in transit and will be with you shortly! You can track your package here: {{tracking_link}}. Get ready to start your wellness journey! 🌿✨",
    "Hi {{name}}, your package {{order_no}} is on the move! 🚛 Check its progress here: {{tracking_link}}. We can't wait for you to receive it! ✨"
  ],
  wa_order_delivered_template: [
    "Hi {{name}} 👋, our records show that your order {{order_no}} for {{product}} has been delivered! 🎁 We hope you love it. 🌿 How was your experience? We'd love to hear your feedback! 🙏",
    "Delivered! ✅ Hi {{name}}, we hope you're enjoying your {{product}}. 🌿 Your feedback helps us grow—please let us know how your experience was! 🙏✨"
  ],
  wa_cart_abandoned_template: [
    "Hi {{name}} 👋, we noticed you left some items in your cart! 🛒 Don't miss out on your {{product}}. To help you complete your order, here's a special 10% discount! Use code HEALTH10 at checkout. 💊\n\nFinish here: {{abandon_link}}",
    "Forgot something, {{name}}? 🛒 Your {{product}} is still waiting! 💊 Complete your purchase now and use code RECOVER5 for 5% off. 🌿\n\nLink: {{abandon_link}}"
  ],
  wa_reorder_template: [
    "Hi {{name}}! 👋 Hope you're doing well. It's been a few weeks since your last order of *{{product}}*. 💊 Time for a refill? Click here to order again: cureforever.in",
    "Time to replenish, {{name}}! 🌿 Your course of {{product}} should be finishing soon. 💊 Keep your wellness streak alive—order your refill here: cureforever.in 🙏✨"
  ]
};

const EMAIL_PRESETS: Record<string, { subject: string, body: string }[]> = {
  email_welcome_template: [
    { subject: "Welcome to CureForever! 🌿", body: "Hi {{name}} 👋, welcome to the CureForever family! 🌿 We're thrilled to have you here. Our mission is to provide you with the finest Ayurvedic & Nutraceutical solutions. If you have any questions, simply reply to this email! 🙏" },
    { subject: "CureForever: Your Wellness Journey Starts Here! ✨", body: "Welcome aboard, {{name}}! 🌿 We're so glad you've chosen us. Stay tuned for health tips and order updates right here! ✨" }
  ],
  email_order_placed_template: [
    { subject: "Order Confirmed: {{order_no}} ✅", body: "Hi {{name}}! 🎉 Your order {{order_no}} for {{product}} has been successfully placed! 🛒 We're currently preparing it for shipment. We'll notify you as soon as it's on the way! 🚀" },
    { subject: "CureForever: We've received your order! 📦", body: "Order Confirmed: {{order_no}}! ✅ Hi {{name}}, we've received your order for {{product}}. Our team is packing it with care. We will notify you once it's out for delivery! 📦" }
  ],
  email_order_transit_template: [
    { subject: "Your order {{order_no}} is in transit! 🚚", body: "Great news, {{name}}! 🚚 Your order {{order_no}} is now in transit and will be with you shortly! You can track your package here: {{tracking_link}}. Get ready to start your wellness journey! 🌿✨" },
    { subject: "On the move! 🚛 Order {{order_no}} update", body: "Hi {{name}}, your package {{order_no}} is on the move! 🚛 Check its progress here: {{tracking_link}}. We can't wait for you to receive it! ✨" }
  ],
  email_order_delivered_template: [
    { subject: "Delivered! 🎁 Your order {{order_no}} has arrived", body: "Hi {{name}} 👋, our records show that your order {{order_no}} for {{product}} has been delivered! 🎁 We hope you love it. 🌿 How was your experience? We'd love to hear your feedback! 🙏" },
    { subject: "Order {{order_no}} Delivered ✅ - How was it?", body: "Delivered! ✅ Hi {{name}}, we hope you're enjoying your {{product}}. 🌿 Your feedback helps us grow—please let us know how your experience was! 🙏✨" }
  ],
  email_cart_abandoned_template: [
    { subject: "Still interested in your items? 🛒", body: "Hi {{name}} 👋, we noticed you left some items in your cart! 🛒 Don't miss out on your {{product}}. To help you complete your order, here's a special 10% discount! Use code HEALTH10 at checkout. 💊\n\nFinish here: {{abandon_link}}" },
    { subject: "CureForever: Your cart is waiting! 🌿", body: "Forgot something, {{name}}? 🛒 Your {{product}} is still waiting! 💊 Complete your purchase now and use code RECOVER5 for 5% off. 🌿\n\nLink: {{abandon_link}}" }
  ],
  email_reorder_template: [
    { subject: "Time for a refill? 🌿 {{product}}", body: "Hi {{name}}! 👋 Hope you're doing well. It's been a few weeks since your last order of {{product}}. 💊 Time for a refill? Click here to order again: https://cureforever.in" },
    { subject: "Don't run out! 🌿 Replenish your {{product}}", body: "Time to replenish, {{name}}! 🌿 Your course of {{product}} should be finishing soon. 💊 Keep your wellness streak alive—order your refill here: https://cureforever.in 🙏✨" }
  ]
};

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((searchParams.get("tab") as Tab) || "general");
  const supabase = useMemo(() => createClient(), []);


  const [settings, setSettings] = useState<Settings>({
    id: SETTINGS_ID,
    review_offset_days: 5,
    reorder_offset_days: 20,
    final_offset_days: 30,
    inactive_threshold_days: 45,
    whatsapp_enabled: false,
    whatsapp_bridge_url: "http://localhost:3001",
    whatsapp_review_template: "",
    whatsapp_reorder_template: "",
    whatsapp_recovery_template: "",
    whatsapp_final_template: "",
    whatsapp_app_id: "",
    whatsapp_app_secret: "",
    whatsapp_phone_id: "",
    whatsapp_token: "",
    whatsapp_verify_token: "",
    whatsapp_admin_phone: "",
    meta_review_name: "",
    meta_reorder_name: "",
    meta_recovery_name: "",
    meta_final_name: "",
    recovery_delay_hours: 24,
    whatsapp_send_time: "10:00",
    shopify_store_domain: "",
    shopify_api_key: "",
    shopify_client_id: "",
    shopify_api_secret: "",
    shopify_refresh_token: "",
    shopify_token_expires_at: null,
    wa_auto_welcome: false,
    wa_auto_order_placed: false,
    wa_auto_order_transit: false,
    wa_auto_order_delivered: false,
    wa_auto_cart_abandoned: false,
    wa_auto_reorder: false,
    wa_speed_preset: "safe",
    wa_min_delay: 30,
    wa_max_delay: 90,
    wa_welcome_template: "",
    wa_order_placed_template: "",
    wa_order_transit_template: "",
    wa_order_delivered_template: "",
    wa_cart_abandoned_template: "",
    wa_reorder_template: "",
    wa_auto_out_for_delivery: false,
    wa_out_for_delivery_template: "",
    wa_auto_delivery_failed: false,
    wa_delivery_failed_template: "",
    wa_auto_stale_shipment: false,
    wa_stale_shipment_template: "",
    wa_auto_final_followup: false,
    wa_final_followup_template: "",
    gmail_client_id: "",
    gmail_client_secret: "",
    gmail_project_id: "",
    gmail_auth_uri: "https://accounts.google.com/o/oauth2/auth",
    gmail_token_uri: "https://oauth2.googleapis.com/token",
    gmail_auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    gmail_redirect_uris: [],
    gmail_refresh_token: "",
    email_auto_welcome: false,
    email_auto_order_placed: false,
    email_auto_order_transit: false,
    email_auto_order_delivered: false,
    email_auto_cart_abandoned: false,
    email_auto_reorder: false,
    email_welcome_subject: "",
    email_welcome_template: "",
    email_order_placed_subject: "",
    email_order_placed_template: "",
    email_order_transit_subject: "",
    email_order_transit_template: "",
    email_order_delivered_subject: "",
    email_order_delivered_template: "",
    email_cart_abandoned_subject: "",
    email_cart_abandoned_template: "",
    email_reorder_subject: "",
    email_reorder_template: "",
    telephony_provider: "none",
    twilio_account_sid: "",
    twilio_auth_token: "",
    twilio_caller_id: "",
    exotel_sid: "",
    exotel_token: "",
    exotel_caller_id: "",
    sms_fallback_enabled: false,
    sms_provider: "twilio",
    sms_twilio_sid: "",
    sms_twilio_token: "",
    sms_twilio_number: "",
    updated_at: new Date().toISOString()
  });
  const [testingCall, setTestingCall] = useState(false);
  const [testCallPhone, setTestCallPhone] = useState("");
  const [testingSMS, setTestingSMS] = useState(false);
  const [testSMSPhone, setTestSMSPhone] = useState("");

  async function handleTestCall() {
    if (!testCallPhone) {
      toast.error("Please enter a phone number to test dialing");
      return;
    }
    setTestingCall(true);
    try {
      const res = await fetch("/api/calls/test-dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: testCallPhone,
          provider: settings.telephony_provider,
          twilio_sid: settings.twilio_account_sid,
          twilio_token: settings.twilio_auth_token,
          twilio_caller_id: settings.twilio_caller_id,
          exotel_sid: settings.exotel_sid,
          exotel_token: settings.exotel_token,
          exotel_caller_id: settings.exotel_caller_id,
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to initiate test call");
      toast.success("Test call initiated successfully! Check your phone.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTestingCall(false);
    }
  }

  async function handleTestSMS() {
    if (!testSMSPhone) {
      toast.error("Please enter a phone number to test SMS");
      return;
    }
    setTestingSMS(true);
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: testSMSPhone,
          provider: settings.sms_provider,
          twilio_sid: settings.sms_twilio_sid,
          twilio_token: settings.sms_twilio_token,
          twilio_number: settings.sms_twilio_number,
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to send test SMS");
      toast.success("Test SMS sent successfully!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTestingSMS(false);
    }
  }

  const [pipeline, setPipeline] = useState<PipelineState>({ sent: [], waiting: [] });
  const [fetchingPipeline, setFetchingPipeline] = useState(false);
  const [overrides, setOverrides] = useState<ProductOverride[]>([]);
  const [availableProducts, setAvailableProducts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [maskedCount, setMaskedCount] = useState<number | null>(null);
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());

  // Ticking clock for live countdowns
  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [newOverride, setNewOverride] = useState({
    shopify_product_id: "",
    product_name: "",
    review_offset_days: 0,
    reorder_offset_days: 0,
    final_offset_days: 0,
    course_duration_days: 30,
    usage_notes: "",
    is_priority: false,
    upsell_product_name: ""
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmModal, setConfirmModal] = useState<{ open: boolean; type: "customers" | "orders" | "tasks" | "abandoned_carts" | null }>({ open: false, type: null });
  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [waStatus, setWaStatus] = useState<{ ready?: boolean; state?: string; error?: string; qr?: string | null }>({ state: "INITIALISING" });
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLastSync() {
      try {
        const { data } = await supabase
          .from("webhook_logs")
          .select("created_at")
          .eq("source", "system_sync")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) setLastSync(data.created_at);
      } catch (err) {
        console.error("Failed to fetch sync stats", err);
      }
    }
    fetchLastSync();
  }, [supabase]);
  const [manualWaModal, setManualWaModal] = useState(false);
  const [manualWaTaskId, setManualWaTaskId] = useState("");
  const [manualWaCustomerName, setManualWaCustomerName] = useState("");
  const [manualWaMessage, setManualWaMessage] = useState("");
  const [manualWaFile, setManualWaFile] = useState<File | null>(null);
  const [sendingManualWa, setSendingManualWa] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [testingShopify, setTestingShopify] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    active: boolean;
    progress: number;
    message: string;
    isComplete: boolean;
    error: string | null;
  }>({
    active: false,
    progress: 0,
    message: "",
    isComplete: false,
    error: null,
  });

  const { profile, loading: profileLoading } = useCurrentProfile();


  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      const data = await res.json();
      if (!data.ready) {
        try {
          const qrRes = await fetch("/api/whatsapp/qr");
          const qrData = await qrRes.json();
          setWaStatus({ ...data, qr: qrData.qr || null });
        } catch {
          setWaStatus({ ...data, qr: null });
        }
      } else {
        setWaStatus({ ...data, qr: null });
      }
    } catch (err) {
      setWaStatus({ state: "DISCONNECTED", qr: null });
    }
  }, []);

  const fetchMaskedCount = useCallback(async () => {
    try {
      const { count } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .or('phone.ilike.%x%,phone.ilike.%_SR_%');
      setMaskedCount(count);
    } catch (e) {
      console.error("Failed to fetch masked count:", e);
    }
  }, [supabase]);

  const fetchPipelineData = useCallback(async () => {
    setFetchingPipeline(true);
    try {
      const today = toDbDateString(new Date());
      const now = new Date();
      
      const { data: waitingTasks } = await supabase
        .from("tasks")
        .select(`
          id, task_type, 
          customer:customers (id, name, phone, whatsapp_reminders_enabled)
        `)
        .eq("due_date", today)
        .eq("status", "pending")
        .in("task_type", ["review", "reorder", "recovery", "final_followup", "issue_resolution"])
        .limit(15);

      const { data: workflowInstances } = await supabase
        .from("workflow_instances")
        .select(`
          id, next_run_at, status, 
          customer:customers (id, name),
          workflows (name)
        `)
        .eq("status", "active")
        .lte("next_run_at", new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString())
        .order("next_run_at", { ascending: true })
        .limit(10);

      const { data: sentLogs } = await supabase
        .from("whatsapp_messages")
        .select("*, customer:customers(name)")
        .eq("direction", "outbound")
        .gte("created_at", today + "T00:00:00Z")
        .order("created_at", { ascending: false })
        .limit(15);

      const formattedWaiting = [
        ...(waitingTasks || [])
          .filter((t: any) => t.customer?.whatsapp_reminders_enabled !== false)
          .map(t => ({ ...t, isManual: true })),
        ...(workflowInstances || []).map((w: any) => ({
          id: w.id,
          isWorkflow: true,
          task_type: "automation",
          customer: w.customer,
          due_date: w.next_run_at,
          workflowName: w.workflows?.name
        }))
      ].sort((a: any, b: any) => {
        const dateA = a.isWorkflow ? new Date(a.due_date).getTime() : new Date(today).getTime();
        const dateB = b.isWorkflow ? new Date(b.due_date).getTime() : new Date(today).getTime();
        return dateA - dateB;
      });

      setPipeline({ 
        sent: (sentLogs || []).map((l: any) => ({
          id: l.id,
          customer: l.customer as { id: string, name: string },
          called_at: l.created_at,
          note: l.body,
          type: l.type,
          isAuto: !!l.meta_message_id
        })), 
        waiting: (formattedWaiting as any[]).map((w: any) => ({
          ...w,
          customer: Array.isArray(w.customer) ? w.customer[0] : w.customer
        }))
      });
    } catch (err) {
      console.error("Pipeline fetch error:", err);
    } finally {
      setFetchingPipeline(false);
    }
  }, [supabase]);

  const fetchAvailableProducts = useCallback(async () => {
    try {
      const { data: oData } = await supabase.from("orders").select("line_items");
      const allOrders = [...(oData || [])];
      const productsMap = new Map();

      allOrders.forEach(order => {
        const items = Array.isArray(order.line_items) ? order.line_items : [];
        items.forEach((item: any) => {
          const rawId = item.product_id || item.id || item.title || item.name;
          const name = item.title || item.name || item.product_name;
          if (rawId && name) {
            const id = String(rawId);
            productsMap.set(id, name);
          }
        });
      });

      const products = Array.from(productsMap).map(([id, name]) => ({ id, name }));
      setAvailableProducts(products);
    } catch (err) {
      console.error("Error fetching unique products:", err);
    }
  }, [supabase]);

  const startSyncStream = async (endpoint: string) => {
    setSyncStatus({ active: true, progress: 0, message: "Connecting...", isComplete: false, error: null });
    setSaving(true);
    
    try {
      const response = await fetch(`${endpoint}?stream=true`, { method: "POST" });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      if (!response.body) throw new Error("Response body is null");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.replace("data: ", ""));
              if (data.error) {
                setSyncStatus(prev => ({ ...prev, error: data.error, active: false }));
                toast.error(data.error);
                return;
              }
              
              setSyncStatus(prev => ({
                ...prev,
                progress: data.progress ?? prev.progress,
                message: data.message ?? prev.message,
                isComplete: data.progress === 100
              }));

              if (data.progress === 100) {
                 setSyncStatus(prev => ({ ...prev, active: false }));
                 toast.success(data.message || "Sync Complete!", { duration: 5000 });
                 fetchPipelineData();
                 fetchMaskedCount();
              }
            } catch (e) {
              console.error("Error parsing SSE chunk:", e);
            }
          }
        }
      }
    } catch (err: any) {
      setSyncStatus(prev => ({ ...prev, error: err.message, active: false }));
      toast.error("Sync failed: " + err.message);
    } finally {
      setSaving(false);
      setTimeout(() => {
        setSyncStatus(prev => ({ ...prev, active: false }));
      }, 5000);
    }
  };


  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      // settings is one row per org - this page used to always read/write
      // the single legacy SETTINGS_ID row (a leftover from before
      // multi-tenancy), so every org except whichever one happens to still
      // own that literal id got either someone else's settings or an RLS
      // rejection on save ("new row violates row-level security policy for
      // table settings" - org_id didn't match). Resolve the caller's own
      // org first, same as getSystemSettings() on the server side.
      const { data: { user } } = await supabase.auth.getUser();
      const { data: myProfile } = await supabase.from("profiles").select("org_id").eq("id", user?.id).maybeSingle();
      const orgId = myProfile?.org_id;

      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle();

      if (data) {
        setSettings(data);
      } else if (orgId) {
        // Every org gets a blank row via the seed_default_settings trigger
        // on signup; create one on demand rather than leaving this page
        // with nothing to read if that ever doesn't fire.
        const { data: newRow } = await supabase.from("settings").insert({ org_id: orgId }).select().single();
        if (newRow) setSettings(newRow);
      }
      
      const { data: ovr } = await supabase.from("product_overrides").select("*");
      setOverrides(ovr || []);
      
      fetchPipelineData();
      fetchMaskedCount();
    } catch (err) {
      console.error("Error fetching settings:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, fetchPipelineData, fetchMaskedCount]);

  useEffect(() => {
    fetchSettings();
    fetchAvailableProducts();
    
    // WhatsApp status polling — 15s is fresh enough for a connection light,
    // and skip while the tab is backgrounded.
    fetchStatus();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchStatus();
    }, 15000);

    return () => {
      clearInterval(interval);
    };
  }, [fetchSettings, fetchAvailableProducts, fetchStatus]);

  useEffect(() => {
    const authStatus = searchParams.get("auth");
    if (authStatus === "success") {
      toast.success("Gmail authenticated successfully!");
      fetchSettings();
      // Clean URL
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("auth");
      router.replace(`/settings?tab=${tab}&${newParams.toString()}`);
    } else if (authStatus === "error") {
      toast.error("Gmail authentication failed.");
    }
  }, [searchParams, fetchSettings, router, tab]);





  async function handleOpenManualWa(task: any) {
    setFetchingPipeline(true);
    try {
      // 1. Fetch full task details to get order/items etc
      const { data: fullTask } = await supabase
        .from("tasks")
        .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*)")
        .eq("id", task.id)
        .single();
      
      if (!fullTask) throw new Error("Could not find task details");

      // 2. Generate personalized message (logic mirrors the cron job)
      const customer = fullTask.customer;
      const order = fullTask.order;
      const abandonedCart = fullTask.abandoned_cart;
      let template = "";
      if (task.task_type === "review") {
        template = settings.whatsapp_review_template || "Hi {{name}} 👋, thank you for ordering {{product}}! How was your experience? We'd love to hear your feedback. 🌿\n\nPlease leave us a review here: https://search.google.com/local/writereview?placeid=ChIJv5_GsCGRyzsR2_y1wjbi3Ck";
      } else if (task.task_type === "reorder") {
        template = settings.whatsapp_reorder_template || "Hi {{name}}! It's been a while since your last {{product}} order. Time for a refill? 💊 Use code REFILL10 for 10% off!";
      } else if (task.task_type === "recovery") {
        template = settings.whatsapp_recovery_template || "Hi {{name}} 👋, we noticed you left some items in your cart! 🛒 Can we help you complete your purchase? Use code RECOVER5 for 5% off! 🌿";
      } else if (task.task_type === "final_followup") {
        template = settings.whatsapp_final_template || "Hi {{name}}, just checking in one last time regarding your {{product}} journey. We're here if you need anything! 🙏";
      } else if (task.task_type === "issue_resolution") {
        template = "Hi {{name}}, we noticed an issue with your recent order for {{product}}. Our team is reviewing it and will help resolve it quickly.";
      }

      const variables = getTemplateVariables(customer, order, abandonedCart, fullTask);
      const msg = personaliseTemplate(template, variables);

      setManualWaTaskId(task.id);
      setManualWaCustomerName(customer.name);
      setManualWaMessage(msg);
      setManualWaFile(null);
      setManualWaModal(true);
    } catch (err: any) {
      toast.error("Failed to load draft: " + err.message);
    } finally {
      setFetchingPipeline(false);
    }
  }

  async function handleManualSend() {
    setSendingManualWa(true);
    try {
      let mediaData = null;
      let mimetype = null;
      let filename = null;

      if (manualWaFile) {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
          reader.onload = () => resolve(reader.result?.toString().split(",")[1]);
          reader.readAsDataURL(manualWaFile);
        });
        mediaData = await base64Promise;
        mimetype = manualWaFile.type;
        filename = manualWaFile.name;
      }

      const res = await fetch("/api/whatsapp/send-queued", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          taskId: manualWaTaskId, 
          customMessage: manualWaMessage,
          mediaData,
          mimetype,
          filename
        })
      });

      if (res.ok) {
        toast.success("Message sent successfully!");
        setManualWaModal(false);
        fetchPipelineData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to send");
      }
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setSendingManualWa(false);
    }
  }

  async function handleRepairDates() {
    setSaving(true);
    try {
      const res = await fetch("/api/tasks/repair-dates", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Repaired successfully!");
        // Re-run task generator to show the fix in the queue
        await fetch("/api/cron/task-generator", { method: "POST" });
        fetchPipelineData();
      } else {
        toast.error(data.error || "Repair failed");
      }
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }



  async function recalculateTasks(currentSettings: any) {
    try {
      // 1. Fetch all pending tasks with their order's delivered_at and product_id
      // Including order_id and customer_id to satisfy NOT NULL constraints during upsert
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select(`
          id, 
          task_type, 
          order_id, 
          customer_id,
          orders (
            delivered_at,
            line_items
          )
        `)
        .eq("status", "pending");

      if (error || !tasks) throw error || new Error("No pending tasks found");

      // 2. Fetch overrides for fast lookup
      const { data: overrideData } = await supabase.from("product_overrides").select("*");
      const overridesMap = new Map(overrideData?.map(o => [o.shopify_product_id, o]) || []);

      const updates = [];
      const addDays = (d: string, n: number) => {
        const r = new Date(d);
        r.setDate(r.getDate() + n);
        return r.toISOString().split("T")[0];
      };

      for (const t of tasks) {
        const order = Array.isArray(t.orders) ? t.orders[0] : (t.orders as any);
        if (!order?.delivered_at) continue;

        const lineItem = order.line_items?.[0];
        const override = overrideData?.find(o => 
          o.shopify_product_id === String(lineItem?.product_id) || 
          o.shopify_product_id === String(lineItem?.id) || 
          o.shopify_product_id === lineItem?.title ||
          o.product_name === lineItem?.title
        );

        let newDueDate = "";
        if (t.task_type === "review") {
          newDueDate = addDays(order.delivered_at, override?.review_offset_days ?? currentSettings.review_offset_days);
        } else if (t.task_type === "reorder") {
          newDueDate = addDays(order.delivered_at, override?.reorder_offset_days ?? currentSettings.reorder_offset_days);
        } else if (t.task_type === "final_followup") {
          newDueDate = addDays(order.delivered_at, override?.final_offset_days ?? currentSettings.final_offset_days);
        }

        if (newDueDate) {
          updates.push({ 
            id: t.id, 
            order_id: t.order_id,
            customer_id: t.customer_id,
            task_type: t.task_type,
            due_date: newDueDate 
          });
        }
      }

      // 3. Bulk Update
      if (updates.length > 0) {
        const { error: upErr } = await supabase.from("tasks").upsert(updates, { onConflict: 'id' });
        if (upErr) throw upErr;
        toast.success(`Aligned ${updates.length} pending tasks.`);
      }
    } catch (err: any) {
      console.error("Recalculation error:", err);
      toast.error("Task alignment failed: " + err.message);
    }
  }

  const handleImportGmailJson = (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      const installed = data.installed || data.web;
      if (!installed) throw new Error("Invalid Google JSON format");
      
      setSettings({
        ...settings,
        gmail_client_id: installed.client_id || "",
        gmail_client_secret: installed.client_secret || "",
        gmail_project_id: installed.project_id || "",
        gmail_auth_uri: installed.auth_uri || "https://accounts.google.com/o/oauth2/auth",
        gmail_token_uri: installed.token_uri || "https://oauth2.googleapis.com/token",
        gmail_auth_provider_x509_cert_url: installed.auth_provider_x509_cert_url || "https://www.googleapis.com/oauth2/v1/certs",
        gmail_redirect_uris: installed.redirect_uris || []
      });
      toast.success("Gmail configuration imported!");
    } catch (e: any) {
      toast.error("Failed to parse JSON: " + e.message);
    }
  };

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    let fallbackTriggered = false;
    try {
      // 1. Fetch current DB state to ensure we don't overwrite sensitive tokens saved via callback.
      // settings.id (this org's real row), not the deprecated single-row
      // SETTINGS_ID - every org but the one that happens to still have that
      // literal placeholder id would otherwise always read back nothing here,
      // silently dropping any refresh token an OAuth callback had just saved.
      const { data: currentDbSettings } = await supabase
        .from("settings")
        .select("gmail_refresh_token, shopify_refresh_token")
        .eq("id", settings.id)
        .maybeSingle();

      const finalSettings = { ...settings };
      
      // Preserve tokens if local state is empty but DB has them
      if (!finalSettings.gmail_refresh_token && currentDbSettings?.gmail_refresh_token) {
        finalSettings.gmail_refresh_token = currentDbSettings.gmail_refresh_token;
      }
      if (!finalSettings.shopify_refresh_token && currentDbSettings?.shopify_refresh_token) {
        finalSettings.shopify_refresh_token = currentDbSettings.shopify_refresh_token;
      }

      let { error } = await supabase.from("settings").upsert(finalSettings);
      
      // Enhanced backward-compatible save path: If DB migration hasn't been run, strip new columns and retry.
      if (error && (
        String(error.message || "").includes("column") || 
        String(error.message || "").includes("schema cache")
      )) {
        fallbackTriggered = true;
        console.warn("Detected schema mismatch, attempting legacy save fallback...", error.message);
        
        const newColumns = [
          "shopify_client_id", "shopify_token_expires_at", "shopify_api_secret", "shopify_refresh_token",
          "whatsapp_app_id", "whatsapp_app_secret", "whatsapp_phone_id", "whatsapp_token", "whatsapp_verify_token",
          "whatsapp_admin_phone", "meta_review_name", "meta_reorder_name", "meta_recovery_name", "meta_final_name",
          "wa_auto_welcome", "wa_auto_order_placed", "wa_auto_order_transit", "wa_auto_order_delivered",
          "wa_auto_cart_abandoned", "wa_auto_reorder", "wa_welcome_template", "wa_order_placed_template",
          "wa_speed_preset", "wa_min_delay", "wa_max_delay",
          "wa_order_transit_template", "wa_order_delivered_template", "wa_cart_abandoned_template", "wa_reorder_template",
          "wa_auto_out_for_delivery", "wa_out_for_delivery_template", "wa_auto_delivery_failed", "wa_delivery_failed_template",
          "wa_auto_stale_shipment", "wa_stale_shipment_template", "wa_auto_final_followup", "wa_final_followup_template",
          "gmail_client_id", "gmail_client_secret", "gmail_project_id", "gmail_auth_uri", "gmail_token_uri",
          "gmail_auth_provider_x509_cert_url", "gmail_redirect_uris", "gmail_refresh_token",
          "email_auto_welcome", "email_auto_order_placed", "email_auto_order_transit", "email_auto_order_delivered",
          "email_auto_cart_abandoned", "email_auto_reorder", "email_welcome_subject", "email_welcome_template",
          "email_order_placed_subject", "email_order_placed_template", "email_order_transit_subject", "email_order_transit_template",
          "email_order_delivered_subject", "email_order_delivered_template", "email_cart_abandoned_subject", "email_cart_abandoned_template",
          "email_reorder_subject", "email_reorder_template",
          "telephony_provider", "twilio_account_sid", "twilio_auth_token", "twilio_caller_id", "exotel_sid", "exotel_token", "exotel_caller_id",
          "sms_fallback_enabled", "sms_provider", "sms_twilio_sid", "sms_twilio_token", "sms_twilio_number"
        ];

        const legacySettings = { ...settings };
        newColumns.forEach(col => delete (legacySettings as any)[col]);

        const retry = await supabase.from("settings").upsert(legacySettings);
        error = retry.error || null;
      }
      
      if (error) throw error;
      
      // Auto-recalculate tasks for global alignment
      await recalculateTasks(settings);
      await logAuditEvent({
        entityType: "settings",
        entityId: settings.id,
        action: "update",
        summary: "Updated system settings",
      });
      
      if (fallbackTriggered) {
        toast.success("Saved in Legacy Mode! (New WhatsApp fields were skipped. Please run the SQL migration.)", { duration: 6000 });
      } else {
        toast.success("Settings saved and tasks aligned!");
      }
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestShopifyConnection() {
    setTestingShopify(true);
    try {
      const res = await fetch("/api/shopify/test");
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Connection test failed");
      }
      const shopLabel = data.shopName ? ` (${data.shopName})` : "";
      toast.success(`Shopify connection successful${shopLabel}`);
    } catch (err: any) {
      toast.error(`Shopify test failed: ${err.message}`);
    } finally {
      setTestingShopify(false);
    }
  }

  async function handleDeepSync() {
    setSaving(true);
    try {
      toast.loading("Initiating 48-hour recovery audit...", { id: "deep-sync" });
      const res = await fetch("/api/sync/shopify?full=true");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      
      const report = data.report;
      toast.success(`Audit Complete: Synced ${report.abandoned.synced} checkouts and ${report.orders.synced} orders.`, { id: "deep-sync", duration: 5000 });
      
      await logAuditEvent({
        entityType: "sync",
        entityId: "shopify-deep",
        action: "execute",
        summary: `Executed 48h deep sync. Found ${report.abandoned.synced} carts.`,
      });
    } catch (err: any) {
      toast.error(`Deep sync failed: ${err.message}`, { id: "deep-sync" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddOverride() {
    if (!newOverride.shopify_product_id) return toast.error("Please select a product");
    setSaving(true);
    try {
      const { error } = await supabase.from("product_overrides").upsert({
        id: editingId || undefined,
        shopify_product_id: newOverride.shopify_product_id,
        product_name: newOverride.product_name,
        review_offset_days: newOverride.review_offset_days || null,
        reorder_offset_days: newOverride.reorder_offset_days || null,
        final_offset_days: newOverride.final_offset_days || null,
        course_duration_days: newOverride.course_duration_days || 30,
        usage_notes: newOverride.usage_notes || null,
        is_priority: newOverride.is_priority || false,
        upsell_product_name: newOverride.upsell_product_name || null
      }, { onConflict: 'shopify_product_id' });
      if (error) throw error;
      
      // Alignment also happens for overrides
      await recalculateTasks(settings);
      await logAuditEvent({
        entityType: "product_override",
        entityId: newOverride.shopify_product_id,
        action: "upsert",
        summary: `Saved override for ${newOverride.product_name}`,
      });
      
      toast.success("Override saved and tasks aligned!");
      setShowAddOverride(false);
      setNewOverride({ 
        shopify_product_id: "", 
        product_name: "", 
        review_offset_days: 0, 
        reorder_offset_days: 0, 
        final_offset_days: 0,
        course_duration_days: 30,
        usage_notes: "",
        is_priority: false,
        upsell_product_name: ""
      });
      fetchSettings();
    } catch (err: any) {
      toast.error("Failed to add override: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSaving(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const XLSX = await import("xlsx");
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) throw new Error("File is empty");

        const batch = data.map((row: any) => ({
          shopify_product_id: (row['Product ID'] || row['Product Name'] || "").toString().trim(),
          product_name: (row['Product Name'] || row['Product ID'] || "").toString().trim(),
          review_offset_days: parseInt(row['Review Days']) || 5,
          reorder_offset_days: parseInt(row['Reorder Days']) || 20,
          final_offset_days: parseInt(row['Final Days']) || 30,
          course_duration_days: parseInt(row['Course Days']) || 30,
          usage_notes: row['Usage Notes'] || "",
          is_priority: (row['Is Priority']?.toString().toLowerCase() === 'true'),
          upsell_product_name: row['Upsell Product'] || ""
        })).filter(x => x.shopify_product_id);

        const { error } = await supabase.from("product_overrides").upsert(batch, { onConflict: 'shopify_product_id' });
        if (error) throw error;

        await recalculateTasks(settings);
        fetchSettings();
        toast.success(`Succesfully imported ${batch.length} products`);
      } catch (err: any) {
        toast.error("Import failed: " + err.message);
      } finally {
        setSaving(false);
        e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadOverrideTemplate = async () => {
    const template = [
      {
        "Product Name": "Example Biotin Tablets",
        "Product ID": "biotin-handle-or-name",
        "Review Days": 5,
        "Reorder Days": 20,
        "Final Days": 30,
        "Course Days": 30,
        "Usage Notes": "1 tab daily after breakfast",
        "Upsell Product": "Liver Detox Tabs",
        "Is Priority": "FALSE"
      }
    ];
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Overrides");
    XLSX.writeFile(wb, "codecrest_override_template.xlsx");
    toast.success("Template Downloaded!");
  };

  async function handleClearData(type: "customers" | "orders" | "tasks" | "abandoned_carts") {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from(type).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      await logAuditEvent({
        entityType: type,
        action: "bulk_delete",
        summary: `Cleared all records from ${type}`,
      });
      toast.success(`All ${type} cleared successfully`);
      setConfirmModal({ open: false, type: null });
    } catch (err: any) {
      toast.error(`Failed to clear ${type}: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  }

  if (profileLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Loading settings...</p>
      </div>
    );
  }

  // This page shows real Shopify/Shiprocket API credentials and writes to
  // the real settings row on Save. The demo persona is given role: "admin"
  // so the rest of the app opens up for a walkthrough, but this specific
  // page stays blocked even for it - there's nothing here worth showcasing,
  // and the downside (leaking or overwriting live credentials on screen) is
  // real.
  if (profile?.id === "demo-presenter-id") {
    return <AccessDenied title="Settings Unavailable in Demo Mode" desc="System configuration is disabled during a demo session to protect live API credentials." />;
  }

  if (!isAdmin(profile)) {
    return <AccessDenied title="System Settings Locked" desc="Only administrators can modify system-level configurations and API integrations." />;
  }

  return (
    <div className="animate-fade-in max-w-3xl">
      <PageHeader title="Settings" subtitle="Configure your CRM behaviour, integrations, and notifications" />

      {syncStatus.active && (
        <div className="mb-8 card p-5 bg-[#eceae4]/30 shadow-inner animate-in slide-in-from-top-4 duration-500">
          <SyncProgressBar 
            progress={syncStatus.progress} 
            message={syncStatus.message} 
            isComplete={syncStatus.isComplete}
            error={syncStatus.error}
          />
        </div>
      )}

      <div className="flex border-b border-[#eceae4] mb-8 gap-0 overflow-x-auto scroller-hide">
        {[
          { key: "general", label: "Preferences", icon: Sliders },
          { key: "fields", label: "Custom Fields", icon: ListPlus },
          { key: "forms", label: "Web Forms", icon: FileInput },
          { key: "security", label: "Security", icon: ShieldCheck },
          { key: "telephony", label: "Telephony", icon: Smartphone },
          { key: "notifications", label: "WhatsApp Hub", icon: Bell },
          { key: "email", label: "Email API", icon: Mail },
          { key: "overrides", label: "Product Rules", icon: Package },
          { key: "shopify", label: "Shopify API", icon: ShoppingBag },
          { key: "shiprocket", label: "Logistics", icon: Package },
          { key: "database", label: "System Health", icon: Database },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className={cn("flex items-center gap-2.5 px-6 py-3.5 text-[10px] font-bold uppercase tracking-[0.2em] border-b-2 transition-all whitespace-nowrap",
              tab === t.key ? "border-[#1c1c1c] text-[#1c1c1c]" : "border-transparent text-[#5f5f5d] hover:text-[#1c1c1c] opacity-50"
            )}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "fields" && <CustomFieldsManager canEdit={isAdmin(profile)} />}
      {tab === "forms" && <WebFormsManager />}

      {/* GENERAL */}
      {tab === "general" && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2">Cycle Configuration</h3>
            <p className="text-xs text-[#5f5f5d] mb-6 leading-relaxed">Define the temporal triggers for your customer retention sequences. Changes here propagate to all active pending tasks.</p>
            
            {[
              { label: "Engagement window (Review)", field: "review_offset_days", desc: "Interval before post-delivery feedback request", max: 30 },
              { label: "Refill trigger (Reorder)", field: "reorder_offset_days", desc: "Calculated threshold for replenishment call", max: 60 },
              { label: "Retention anchor (Final)", field: "final_offset_days", desc: "Terminal follow-up before archival", max: 90 },
              { label: "Churn threshold (Inactive)", field: "inactive_threshold_days", desc: "Dormancy limit for active customer status", max: 180 },
            ].map(f => (
              <div key={f.field} className="flex flex-col sm:flex-row sm:items-center justify-between py-6 border-b border-[#eceae4]/50 last:border-0 gap-3 sm:gap-8">
                <div className="flex-1">
                  <div className="text-xs font-bold text-[#1c1c1c]">{f.label}</div>
                  <div className="text-[11px] text-[#5f5f5d] mt-1 font-medium opacity-60">{f.desc}</div>
                </div>
                <div className="flex items-center gap-6">
                  <input type="range" min={1} max={f.max} value={settings[f.field]} step={1}
                    onChange={e => setSettings({ ...settings, [f.field]: +e.target.value })}
                    className="w-32 accent-[#1c1c1c] cursor-pointer" />
                  <div className="w-20 text-right">
                    <span className="text-2xl font-bold text-[#1c1c1c] tabular-nums tracking-tighter">{settings[f.field]}</span>
                    <span className="text-[10px] text-[#5f5f5d] font-bold uppercase ml-1 opacity-50">Days</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3">
             <button onClick={handleRepairDates} disabled={saving} className="btn-secondary py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest">
                Force Realignment
             </button>
             <button onClick={handleSave} disabled={saving} className="btn-primary py-2.5 px-8 text-[10px] font-bold uppercase tracking-widest min-w-[140px]">
                {saving ? "Processing..." : "Commit Changes"}
             </button>
          </div>
        </div>
      )}

      {/* TELEPHONY */}
      {tab === "telephony" && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          {/* Cloud Telephony Gateway */}
          <div className="card overflow-hidden bg-[#fcfbf8]">
            <div className="px-6 py-4 bg-[#1c1c1c] text-[#f7f4ed] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Cloud Telephony</h3>
              </div>
              <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-lg border border-emerald-500/30 tracking-widest">ACTIVE</span>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-3 block opacity-60">Active Provider</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { key: "none", label: "None (Manual / Webhook)" },
                    { key: "demo", label: "Demo Mode (Simulation)" },
                    { key: "twilio", label: "Twilio Cloud" },
                    { key: "exotel", label: "Exotel Cloud (India)" },
                  ].map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setSettings({ ...settings, telephony_provider: p.key })}
                      className={cn(
                        "py-3 px-4 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all text-center",
                        settings.telephony_provider === p.key
                          ? "bg-[#1c1c1c] border-[#1c1c1c] text-white shadow-md shadow-black/10"
                          : "bg-white border-[#eceae4] text-[#5f5f5d] hover:border-[#1c1c1c]/30"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {settings.telephony_provider === "demo" && (
                <div className="space-y-4 pt-2 border-t border-[#eceae4]/50 animate-in fade-in duration-300">
                  <div className="bg-[#fcfbf8] border border-amber-200 bg-amber-50/30 rounded-2xl p-5">
                    <h4 className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Simulated Call Sandbox Active
                    </h4>
                    <p className="text-[10px] text-amber-800/80 font-semibold leading-relaxed">
                      In Simulation mode, calls will succeed instantly and progress through agent handset ring and customer ring simulation steps. No external Twilio/Exotel balance or setup is required. This is highly recommended for evaluation and offline training.
                    </p>
                  </div>

                  {/* Test Connection */}
                  <div className="bg-[#fcfbf8] border border-[#eceae4] rounded-2xl p-4 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-1">Verify Simulated Dialer</h4>
                      <p className="text-[10px] text-[#5f5f5d] font-medium leading-relaxed opacity-70">
                        Initiate a fast simulation callback loop to verify local raw log event streaming.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={testCallPhone}
                        onChange={e => setTestCallPhone(e.target.value)}
                        placeholder="Enter phone number"
                        className="input w-48 text-[10px] bg-white h-9 px-3 border border-[#eceae4] rounded-xl font-mono"
                      />
                      <button
                        onClick={handleTestCall}
                        disabled={testingCall}
                        className="btn-primary py-2 px-4 text-[9px] font-black uppercase tracking-widest shrink-0 h-9"
                      >
                        {testingCall ? "SIMULATING..." : "SIMULATE CALL"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {settings.telephony_provider === "twilio" && (
                <div className="space-y-4 pt-2 border-t border-[#eceae4]/50 animate-in fade-in duration-300">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Twilio Account SID</label>
                      <input
                        type="text"
                        value={settings.twilio_account_sid || ""}
                        onChange={e => setSettings({ ...settings, twilio_account_sid: e.target.value })}
                        placeholder="AC..."
                        className="input font-mono text-[10px] bg-[#fcfbf8]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Twilio Auth Token</label>
                      <input
                        type="password"
                        value={settings.twilio_auth_token || ""}
                        onChange={e => setSettings({ ...settings, twilio_auth_token: e.target.value })}
                        placeholder="••••••••••••••••••••••••••••••••"
                        className="input font-mono text-[10px] bg-[#fcfbf8]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Caller ID / Verified Twilio Number</label>
                      <input
                        type="text"
                        value={settings.twilio_caller_id || ""}
                        onChange={e => setSettings({ ...settings, twilio_caller_id: e.target.value })}
                        placeholder="+1234567890"
                        className="input font-mono text-[10px] bg-[#fcfbf8]"
                      />
                    </div>
                  </div>

                  {/* Test Connection */}
                  <div className="bg-[#fcfbf8] border border-[#eceae4] rounded-2xl p-4 flex items-center justify-between gap-4 mt-4">
                    <div className="flex-1">
                      <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-1">Verify Twilio Credentials</h4>
                      <p className="text-[10px] text-[#5f5f5d] font-medium leading-relaxed opacity-70">
                        Initiate a test phone call to verify Twilio API and outbound routing connectivity.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={testCallPhone}
                        onChange={e => setTestCallPhone(e.target.value)}
                        placeholder="Enter phone number (+91...)"
                        className="input w-48 text-[10px] bg-white h-9 px-3 border border-[#eceae4] rounded-xl font-mono"
                      />
                      <button
                        onClick={handleTestCall}
                        disabled={testingCall}
                        className="btn-primary py-2 px-4 text-[9px] font-black uppercase tracking-widest shrink-0 h-9"
                      >
                        {testingCall ? "DIALING..." : "TEST DIAL"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {settings.telephony_provider === "exotel" && (
                <div className="space-y-4 pt-2 border-t border-[#eceae4]/50 animate-in fade-in duration-300">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Exotel API Key / SID</label>
                      <input
                        type="text"
                        value={settings.exotel_sid || ""}
                        onChange={e => setSettings({ ...settings, exotel_sid: e.target.value })}
                        placeholder="Exotel Account SID..."
                        className="input font-mono text-[10px] bg-[#fcfbf8]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Exotel API Token</label>
                      <input
                        type="password"
                        value={settings.exotel_token || ""}
                        onChange={e => setSettings({ ...settings, exotel_token: e.target.value })}
                        placeholder="••••••••••••••••••••••••••••••••"
                        className="input font-mono text-[10px] bg-[#fcfbf8]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Exotel Virtual / Caller Number</label>
                      <input
                        type="text"
                        value={settings.exotel_caller_id || ""}
                        onChange={e => setSettings({ ...settings, exotel_caller_id: e.target.value })}
                        placeholder="080xxxxxxx"
                        className="input font-mono text-[10px] bg-[#fcfbf8]"
                      />
                    </div>
                  </div>

                  {/* Test Connection */}
                  <div className="bg-[#fcfbf8] border border-[#eceae4] rounded-2xl p-4 flex items-center justify-between gap-4 mt-4">
                    <div className="flex-1">
                      <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-1">Verify Exotel Credentials</h4>
                      <p className="text-[10px] text-[#5f5f5d] font-medium leading-relaxed opacity-70">
                        Initiate a test phone call to verify Exotel API integration and local virtual number routing.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={testCallPhone}
                        onChange={e => setTestCallPhone(e.target.value)}
                        placeholder="Enter phone number"
                        className="input w-48 text-[10px] bg-white h-9 px-3 border border-[#eceae4] rounded-xl font-mono"
                      />
                      <button
                        onClick={handleTestCall}
                        disabled={testingCall}
                        className="btn-primary py-2 px-4 text-[9px] font-black uppercase tracking-widest shrink-0 h-9"
                      >
                        {testingCall ? "DIALING..." : "TEST DIAL"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SMS Fallback Bridge */}
          <div className="card overflow-hidden bg-[#fcfbf8]">
            <div className="px-6 py-4 bg-[#1c1c1c]/5 border-b border-[#eceae4] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-[#5f5f5d]" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1c1c1c]">SMS Fallback Bridge</h3>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, sms_fallback_enabled: !settings.sms_fallback_enabled })}
                className="focus:outline-none transition-transform active:scale-95"
              >
                {settings.sms_fallback_enabled ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1c1c1c] border border-[#1c1c1c] rounded-xl shadow-md">
                    <ToggleRight className="w-4 h-4 text-white" />
                    <span className="text-[8px] font-black text-white uppercase tracking-widest">BRIDGE ACTIVE</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#eceae4] rounded-xl">
                    <ToggleLeft className="w-4 h-4 text-gray-400" />
                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">BRIDGE INACTIVE</span>
                  </div>
                )}
              </button>
            </div>

            <div className={cn("p-6 space-y-6 transition-all", !settings.sms_fallback_enabled && "opacity-40 pointer-events-none grayscale")}>
              <p className="text-xs text-[#5f5f5d] leading-relaxed mb-4">
                Configure Twilio SMS as a highly reliable secondary communications layer. The CRM will automatically and instantly redirect critical templates and messages to standard SMS if the recipient&apos;s WhatsApp delivery fails or API limits are hit.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Twilio Account SID</label>
                  <input
                    type="text"
                    value={settings.sms_twilio_sid || ""}
                    onChange={e => setSettings({ ...settings, sms_twilio_sid: e.target.value })}
                    placeholder="AC..."
                    className="input font-mono text-[10px] bg-[#fcfbf8]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Twilio Auth Token</label>
                  <input
                    type="password"
                    value={settings.sms_twilio_token || ""}
                    onChange={e => setSettings({ ...settings, sms_twilio_token: e.target.value })}
                    placeholder="••••••••••••••••••••••••••••••••"
                    className="input font-mono text-[10px] bg-[#fcfbf8]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Twilio SMS Phone Number / Short Code</label>
                  <input
                    type="text"
                    value={settings.sms_twilio_number || ""}
                    onChange={e => setSettings({ ...settings, sms_twilio_number: e.target.value })}
                    placeholder="+1234567890"
                    className="input font-mono text-[10px] bg-[#fcfbf8]"
                  />
                </div>
              </div>

              {/* SMS Test Connection */}
              <div className="bg-[#fcfbf8] border border-[#eceae4] rounded-2xl p-4 flex items-center justify-between gap-4 mt-4">
                <div className="flex-1">
                  <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-1">Test SMS Connection</h4>
                  <p className="text-[10px] text-[#5f5f5d] font-medium leading-relaxed opacity-70">
                    Send a test SMS to confirm API permissions and verify outbound mobile routing.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={testSMSPhone}
                    onChange={e => setTestSMSPhone(e.target.value)}
                    placeholder="Phone number (+91...)"
                    className="input w-48 text-[10px] bg-white h-9 px-3 border border-[#eceae4] rounded-xl font-mono"
                  />
                  <button
                    onClick={handleTestSMS}
                    disabled={testingSMS}
                    className="btn-primary py-2 px-4 text-[9px] font-black uppercase tracking-widest shrink-0 h-9"
                  >
                    {testingSMS ? "SENDING..." : "TEST SMS"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Manual Webhook dialing (MacroDroid) instructions */}
          <div className="card p-6">
            <h3 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-4 opacity-60">Manual Agent Handset Integration (MacroDroid)</h3>
            <p className="text-xs text-[#5f5f5d] mb-8 leading-relaxed">Establish a cost-free manual telephony channel by transforming any agent&apos;s Android device into an automated webhook caller via MacroDroid.</p>
            
            <div className="space-y-8">
              <div className="bg-[#fcfbf8] border border-[#eceae4] rounded-2xl p-6 space-y-6">
                  <div className="flex items-start gap-4">
                     <div className="w-6 h-6 bg-[#1c1c1c] rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#f7f4ed]">1</div>
                     <p className="text-[11px] text-[#1c1c1c] leading-relaxed font-medium">
                       Install <strong>MacroDroid</strong> from the Play Store on your agent&apos;s Android handset.
                     </p>
                  </div>
                  <div className="flex items-start gap-4">
                     <div className="w-6 h-6 bg-[#1c1c1c] rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#f7f4ed]">2</div>
                     <div className="flex-1">
                        <p className="text-[11px] text-[#1c1c1c] font-medium">Create a Macro that triggers on &quot;Outgoing Call Started&quot; or &quot;Ended&quot;, and set the Action to an HTTP POST request to this endpoint:</p>
                        <div className="mt-3 flex items-center gap-3 bg-[#f7f4ed] border border-[#eceae4] rounded-xl p-3">
                           <code className="text-[10px] text-[#1c1c1c] font-mono flex-1 break-all opacity-70">
                             {typeof window !== 'undefined' ? window.location.origin : ''}/api/calls/webhook
                           </code>
                           <button 
                             onClick={() => {
                               const url = `${window.location.origin}/api/calls/webhook`;
                               navigator.clipboard.writeText(url);
                               toast.success("Webhook URL Copied");
                             }}
                             className="w-8 h-8 flex items-center justify-center border border-[#eceae4] hover:bg-[#1c1c1c] hover:text-[#f7f4ed] rounded-lg text-[#5f5f5d] transition-all"
                           >
                              <Paperclip className="w-3.5 h-3.5" />
                           </button>
                        </div>
                     </div>
                  </div>
                  <div className="flex items-start gap-4">
                     <div className="w-6 h-6 bg-[#1c1c1c] rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#f7f4ed]">3</div>
                     <div className="flex-1">
                       <p className="text-[11px] text-[#1c1c1c] leading-relaxed font-medium mb-2">
                         Set the JSON Payload to include your agent&apos;s email and the customer&apos;s phone number. Example:
                       </p>
                       <pre className="text-[9px] font-mono bg-[#1c1c1c] text-[#f7f4ed] p-4 rounded-xl overflow-x-auto shadow-inner">
{`{
  "event": "started",
  "agent_email": "{agent_email_from_macrodroid}",
  "customer_phone": "{call_number}"
}`}
                       </pre>
                     </div>
                  </div>
                  <div className="flex items-start gap-4">
                     <div className="w-6 h-6 bg-[#1c1c1c] rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#f7f4ed]">4</div>
                     <p className="text-[11px] text-[#1c1c1c] leading-relaxed font-medium">
                       <strong>Auto-Recording (Optional):</strong> Enable &quot;Auto-record calls&quot; in the phone&apos;s native settings. Set MacroDroid to upload the recording file to the CRM upon call completion.
                     </p>
                  </div>
              </div>

              <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-6 shadow-2xl">
                <div className="flex gap-4">
                  <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">Manager Live Monitor</h4>
                    <p className="text-[11px] text-[#f7f4ed] leading-relaxed font-medium opacity-90">
                      Once configured, whenever an agent initiates a call, their status will instantly update to <span className="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">ON CALL</span> across the CRM. Managers can listen to recorded calls directly from the Audit Queue.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Commit Settings Button */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#eceae4]/50">
             <button onClick={handleSave} disabled={saving} className="btn-primary py-2.5 px-8 text-[10px] font-bold uppercase tracking-widest min-w-[140px]">
                {saving ? "Saving..." : "Commit Settings"}
             </button>
          </div>
        </div>
      )}

      {/* WHATSAPP */}
      {tab === "notifications" && (
        <div className="space-y-6">
            {/* Master Control Hub */}
            <div className="card p-6 border-[#1c1c1c]/10 bg-[#1c1c1c]/5 shadow-inner">
              <div className="flex items-center justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <div className={cn("w-2 h-2 rounded-full", settings.whatsapp_enabled ? "bg-emerald-500 animate-pulse" : "bg-gray-300")} />
                    <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest">WhatsApp Master Switch</h3>
                  </div>
                  <p className="text-[10px] text-[#5f5f5d] font-medium leading-relaxed italic opacity-60">
                    Turns all WhatsApp messaging on or off. When OFF, no automated or manual WhatsApp messages will send.
                  </p>
                </div>
                <button 
                  onClick={() => setSettings({ ...settings, whatsapp_enabled: !settings.whatsapp_enabled })}
                  className="focus:outline-none transition-transform active:scale-95"
                >
                  {settings.whatsapp_enabled ? (
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#1c1c1c] border border-[#1c1c1c] rounded-2xl shadow-lg shadow-black/10">
                      <ToggleRight className="w-5 h-5 text-white" />
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">ON</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#eceae4] rounded-2xl shadow-sm">
                      <ToggleLeft className="w-5 h-5 text-gray-400" />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">OFF</span>
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div className={cn("space-y-8 transition-all", !settings.whatsapp_enabled && "opacity-40 pointer-events-none grayscale")}>
              
              {/* Meta Cloud API (Official) */}
              <div className="card overflow-hidden bg-[#fcfbf8]">
                <div className="px-6 py-4 bg-[#1c1c1c] text-[#f7f4ed] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-4 h-4" />
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Enterprise Meta API</h3>
                  </div>
                  <span className="text-[9px] font-black bg-white/20 text-white px-2.5 py-1 rounded-lg border border-white/30 tracking-widest">PREMIUM</span>
                </div>
                
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="col-span-2">
                       <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">System Access Token</label>
                       <input 
                         type="password" 
                         value={settings.whatsapp_token || ""} 
                         onChange={e => setSettings({ ...settings, whatsapp_token: e.target.value })}
                         placeholder="EAAV..."
                         className="input font-mono text-[10px] bg-[#fcfbf8]" 
                       />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Phone Number ID</label>
                      <input 
                        type="text" 
                        value={settings.whatsapp_phone_id || ""} 
                        onChange={e => setSettings({ ...settings, whatsapp_phone_id: e.target.value })}
                        placeholder="123456789..."
                        className="input font-mono text-[10px] bg-[#fcfbf8]" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Meta App ID</label>
                      <input 
                        type="text" 
                        value={settings.whatsapp_app_id || ""} 
                        onChange={e => setSettings({ ...settings, whatsapp_app_id: e.target.value })}
                        placeholder="7890..."
                        className="input font-mono text-[10px] h-10 bg-[#fcfbf8]" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Meta App Secret</label>
                      <input 
                        type="password" 
                        value={settings.whatsapp_app_secret || ""} 
                        onChange={e => setSettings({ ...settings, whatsapp_app_secret: e.target.value })}
                        placeholder="••••••••"
                        className="input font-mono text-[10px] h-10 bg-[#fcfbf8]" 
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-[#eceae4]/50">
                    <label className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-2 block opacity-60">Webhook Configuration</label>
                    <p className="text-[10px] text-[#5f5f5d] mb-4 italic opacity-70">Configure these in Meta Dashboard &gt; Webhooks</p>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-1.5 opacity-60">Callback URL</div>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            readOnly 
                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/whatsapp`}
                            className="input font-mono text-[10px] h-9 bg-[#eceae4]/20 border-transparent text-[#5f5f5d] cursor-default" 
                          />
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/whatsapp`);
                              toast.success("URL Copied!");
                            }}
                            className="w-9 h-9 flex items-center justify-center border border-[#eceae4] rounded-lg hover:bg-[#eceae4] text-[#5f5f5d] hover:text-[#1c1c1c] transition-all"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-1.5 opacity-60">Verify Token</div>
                        <input 
                          type="text" 
                          value={settings.whatsapp_verify_token || ""} 
                          onChange={e => setSettings({ ...settings, whatsapp_verify_token: e.target.value })}
                          placeholder="MySecureToken123"
                          className="input font-mono text-[10px] h-9 bg-[#fcfbf8]" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* High Visibility QR Scanner (Only when pending) */}
              {/* High Visibility QR Scanner (Only when pending) */}
              {!waStatus.ready && waStatus.qr && (
                <div className="card overflow-hidden bg-[#fcfbf8] border-[#1c1c1c]/10">
                  <div className="px-6 py-4 bg-[#1c1c1c] text-[#f7f4ed] flex items-center gap-3">
                    <AlertCircle className="w-4 h-4" />
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]">Authenticating Bridge</h3>
                  </div>
                  <div className="p-10 text-center bg-[#eceae4]/10">
                    <p className="text-xs text-[#5f5f5d] mb-8 font-medium max-w-xs mx-auto leading-relaxed">Securely link your WhatsApp instance by scanning the cryptographic token below.</p>
                    <div className="inline-block p-6 bg-white rounded-3xl shadow-2xl border border-[#eceae4] relative group">
                        <Image 
                          src={waStatus.qr} 
                          alt="WhatsApp QR Code" 
                          width={208} 
                          height={208} 
                          className="relative z-10"
                          unoptimized
                        />
                       {!waStatus.qr && <div className="w-52 h-52 flex items-center justify-center text-[#eceae4]"><Loader2 className="w-10 h-10 animate-spin" /></div>}
                    </div>
                    <div className="mt-8 flex flex-col items-center gap-3">
                       <div className="flex items-center gap-3 text-[10px] text-[#1c1c1c] font-bold bg-white px-5 py-2 rounded-xl border border-[#eceae4] shadow-sm uppercase tracking-widest">
                          <WifiOff className="w-3.5 h-3.5 animate-pulse" /> Awaiting Handshake...
                       </div>
                       <button onClick={fetchStatus} className="text-[10px] text-[#5f5f5d] hover:text-[#1c1c1c] underline underline-offset-4 decoration-[#eceae4] transition-all font-bold uppercase tracking-widest">Refresh Sequence</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Legacy Bridge (Accordion) */}
              <details className="card border-[#eceae4]/60 bg-[#eceae4]/10 group">
                <summary className="px-6 py-4 text-[10px] font-bold text-[#5f5f5d] cursor-pointer hover:text-[#1c1c1c] transition-colors flex items-center justify-between uppercase tracking-widest list-none">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>WhatsApp Bridge (Local)</span>
                  </div>
                  <span className="text-[9px] bg-[#eceae4] text-[#1c1c1c] px-2 py-0.5 rounded-lg tracking-widest">v2.0</span>
                </summary>
                
                <div className="px-6 pb-6 pt-2 border-t border-[#eceae4]/50 space-y-5">
                  {waStatus.ready ? (
                    <div className="p-4 rounded-xl bg-[#1c1c1c] text-[#f7f4ed] flex items-center justify-between shadow-lg shadow-black/10">
                      <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Connected
                      </div>
                      <button onClick={fetchStatus} className="text-[9px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 underline underline-offset-4">Refresh Status</button>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest opacity-40">Not Connected</div>
                  )}
                  
                  <div>
                    <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-60">Bridge Server URL</label>
                    <input 
                      type="text" 
                      value={settings.whatsapp_bridge_url || ""} 
                      onChange={e => setSettings({ ...settings, whatsapp_bridge_url: e.target.value })}
                      placeholder="http://localhost:3001"
                      className="input font-mono text-[10px] h-10 bg-[#fcfbf8]" 
                    />
                  </div>
                </div>
              </details>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">Admin WhatsApp Number</label>
                  <input 
                    type="text" 
                    value={settings.whatsapp_admin_phone || ""} 
                    onChange={e => setSettings({ ...settings, whatsapp_admin_phone: e.target.value })}
                    placeholder="+91XXXXXXXXXX"
                    className="input font-mono text-[10px] bg-[#fcfbf8]" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">Daily Send Time</label>
                  <input 
                    type="time" 
                    value={settings.whatsapp_send_time || "10:00"} 
                    onChange={e => setSettings({ ...settings, whatsapp_send_time: e.target.value })}
                    className="input font-mono text-[10px] bg-[#fcfbf8]" 
                  />
                </div>
              </div>

              {/* Compact Status Bar */}
              <div className="pt-6 border-t border-[#eceae4]/50">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2.5 h-2.5 rounded-full animate-pulse", 
                      waStatus.ready ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]" : 
                      waStatus.state === "DISCONNECTED" ? "bg-rose-500" : "bg-amber-500")} />
                    <span className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-[0.2em]">
                      Status: <span className={cn(
                        waStatus.ready ? "text-emerald-600" : 
                        waStatus.state === "DISCONNECTED" ? "text-rose-600" : "text-amber-600"
                      )}>{waStatus.ready ? "Authenticated" : waStatus.state?.replace("_", " ") || "INITIALISING"}</span>
                    </span>
                  </div>
                  {!waStatus.ready && (
                     <button onClick={fetchStatus} className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c] transition-colors flex items-center gap-2">
                        <RefreshCw className={cn("w-3.5 h-3.5", saving && "animate-spin")} /> Re-run Scan
                     </button>
                  )}
                </div>
              </div>

              {/* Testing & Tools */}
              <div className="pt-8 mt-4 border-t border-[#eceae4]/50">
                <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-4">Diagnostics & Manual Triggers</h4>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Dispatch Daily Digest", icon: Send, onClick: async () => {
                      setSaving(true);
                      try {
                        const res = await fetch("/api/cron/daily-digest?force=true", { method: "POST" });
                        const data = await res.json();
                        if (data.sent) toast.success("Summary dispatched!");
                        else toast.error(data.error || "Dispatch failed");
                      } catch (err: any) { toast.error("Connection error: " + err.message); }
                      finally { setSaving(false); }
                    }},
                    { label: "Sync Reorder Rules", icon: RefreshCw, onClick: async () => {
                        setSaving(true);
                        try {
                          const res = await fetch("/api/cron/reorder-reminder?force=true", { method: "POST" });
                          const data = await res.json();
                          if (res.ok) toast.success(`Processed ${data.sent || 0} reminders`);
                          else toast.error(data.error || "Sync failed");
                        } catch (err: any) { toast.error("Connection error: " + err.message); }
                        finally { setSaving(false); }
                    }},
                    { label: "Force Recovery Cycle", icon: Send, onClick: async () => {
                        setSaving(true);
                        try {
                          const res = await fetch("/api/cron/recovery-reminder?force=true", { method: "POST" });
                          const data = await res.json();
                          if (res.ok) toast.success(`Recovered ${data.sent || 0} items`);
                          else toast.error(data.error || "Cycle failed");
                        } catch (err: any) { toast.error("Connection error: " + err.message); }
                        finally { setSaving(false); }
                    }},
                    { label: "Rebuild Task Pipeline", icon: RefreshCw, onClick: async () => {
                      setSaving(true);
                      try {
                        const res = await fetch("/api/cron/task-generator", { method: "POST" });
                        const data = await res.json();
                        toast.success(`Pipeline rebuilt: ${data.generated} tasks`);
                        fetchPipelineData();
                      } catch (err: any) { toast.error("Error: " + err.message); }
                      finally { setSaving(false); }
                    }}
                  ].map((btn, i) => (
                    <button key={i}
                      onClick={btn.onClick}
                      className="flex items-center justify-center gap-3 py-3 px-4 bg-[#fcfbf8] hover:bg-[#eceae4] text-[#1c1c1c] rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-[#eceae4] shadow-sm hover:shadow-md"
                    >
                      <btn.icon className="w-3.5 h-3.5" /> {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Automation Rules */}
              <div className="pt-8 mt-8 border-t border-gray-100">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Automation Rules</h4>
                <p className="text-[10px] text-gray-400 mb-6 italic">Enable these to send WhatsApp messages automatically when certain events occur. <strong>These will be sent instantly via the active bridge.</strong></p>
                
                {/* Anti-Ban Safeguard Speed Config */}
                <div className="border border-[#eceae4] rounded-lg p-3 bg-[#f7f4ed]/30 space-y-3 mb-6">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#1c1c1c]">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                    Anti-Ban Sending Speed Safeguard
                  </div>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    Standardizing random time delays between messages mimics natural human behaviour, significantly reducing the risk of your phone number being flagged or banned by WhatsApp/Meta.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-700 block mb-1">Speed Preset</label>
                      <select 
                        className="select text-xs bg-white"
                        value={settings.wa_speed_preset || "safe"}
                        onChange={e => {
                          const val = e.target.value;
                          let min = 30;
                          let max = 90;
                          if (val === "fast") { min = 10; max = 20; }
                          else if (val === "max_safe") { min = 60; max = 120; }
                          setSettings({ ...settings, wa_speed_preset: val, wa_min_delay: min, wa_max_delay: max });
                        }}
                      >
                        <option value="safe">Safe (30s - 90s delay) — Recommended</option>
                        <option value="fast">Fast (10s - 20s delay) — Aggressive</option>
                        <option value="max_safe">Max Safe (60s - 120s delay) — New Numbers</option>
                        <option value="custom">Custom delays...</option>
                      </select>
                    </div>
                    {(settings.wa_speed_preset === "custom" || !settings.wa_speed_preset) && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-gray-700 block mb-0.5">Min Delay (s)</label>
                          <input 
                            type="number" 
                            className="input text-xs bg-white" 
                            min={5}
                            value={settings.wa_min_delay || 30}
                            onChange={e => setSettings({ ...settings, wa_min_delay: Number(e.target.value) })}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-700 block mb-0.5">Max Delay (s)</label>
                          <input 
                            type="number" 
                            className="input text-xs bg-white" 
                            min={settings.wa_min_delay || 5}
                            value={settings.wa_max_delay || 90}
                            onChange={e => setSettings({ ...settings, wa_max_delay: Number(e.target.value) })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { label: "Auto Welcome", field: "wa_auto_welcome", templateField: "wa_welcome_template", desc: "Sent when a new customer is added to CRM" },
                    { label: "Order Confirmation", field: "wa_auto_order_placed", templateField: "wa_order_placed_template", desc: "Sent when an order is placed" },
                    { label: "Out for Delivery / Transit", field: "wa_auto_order_transit", templateField: "wa_order_transit_template", desc: "Sent when order ships" },
                    { label: "Delivery Confirmation / Review", field: "wa_auto_order_delivered", templateField: "wa_order_delivered_template", desc: "Sent when order is marked delivered" },
                    { label: "Abandoned Cart Alert", field: "wa_auto_cart_abandoned", templateField: "wa_cart_abandoned_template", desc: "Sent after checkout abandonment" },
                    { label: "Refill / Reorder Reminder", field: "wa_auto_reorder", templateField: "wa_reorder_template", desc: "Sent automatically on the refill due date" },
                    { label: "Out for Delivery (Final Mile)", field: "wa_auto_out_for_delivery", templateField: "wa_out_for_delivery_template", desc: "Sent the day the courier goes out to deliver" },
                    { label: "Delivery Attempt Failed", field: "wa_auto_delivery_failed", templateField: "wa_delivery_failed_template", desc: "Sent when the courier could not reach the customer" },
                    { label: "Stale Shipment Alert", field: "wa_auto_stale_shipment", templateField: "wa_stale_shipment_template", desc: "Sent when a shipment hasn't moved in transit for a while" },
                    { label: "Final Follow-up", field: "wa_auto_final_followup", templateField: "wa_final_followup_template", desc: "Sent as a last re-engagement attempt on stalled tasks" },
                  ].map(rule => (
                    <div key={rule.field} className="card p-4 border-gray-100 bg-gray-50/30">
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex-1">
                          <div className="text-xs font-bold text-[#1c1c1c]">{rule.label}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{rule.desc}</div>
                        </div>
                        <button 
                          onClick={() => setSettings({ ...settings, [rule.field]: !settings[rule.field] })}
                          className="focus:outline-none transition-transform active:scale-95"
                        >
                          {settings[rule.field] ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1c1c1c]/10 border border-[#1c1c1c]/20 rounded-full">
                              <ToggleRight className="w-4 h-4 text-[#1c1c1c]" />
                              <span className="text-[9px] font-black text-[#1c1c1c] uppercase">ACTIVE</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 border border-gray-200 rounded-full">
                              <ToggleLeft className="w-4 h-4 text-gray-400" />
                              <span className="text-[9px] font-black text-gray-500 uppercase">OFF</span>
                            </div>
                          )}
                        </button>
                      </div>

                      {settings[rule.field] && (
                        <div className="mt-4 animate-fade-in-down border-t border-[#1c1c1c]/5 pt-4">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest opacity-60">Message Content</label>
                              <div className="flex items-center gap-3">
                                <div className="text-[10px] font-bold text-[#5f5f5d] italic opacity-40">Proposals:</div>
                                <div className="flex gap-2">
                                  {WA_PRESETS[rule.templateField]?.map((preset, idx) => (
                                    <button 
                                      key={idx}
                                      onClick={() => {
                                        setSettings({ ...settings, [rule.templateField]: preset });
                                        toast.success("Template Loaded");
                                      }}
                                      className="flex items-center gap-2 px-3 py-1.5 bg-[#fcfbf8] border border-[#eceae4] rounded-lg text-[9px] font-bold text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-[#f7f4ed] hover:border-[#1c1c1c] transition-all shadow-sm group"
                                    >
                                      <Send className="w-3 h-3 opacity-40 group-hover:opacity-100" />
                                      {idx === 0 ? "Option Alpha" : "Option Beta"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                            
                            <div className="relative group">
                              <textarea 
                                value={settings[rule.templateField] || ""} 
                                onChange={e => setSettings({ ...settings, [rule.templateField]: e.target.value })}
                                className="relative w-full input text-xs min-h-[120px] font-medium leading-relaxed bg-[#fcfbf8] border-[#eceae4] focus:border-[#1c1c1c] rounded-xl p-5 shadow-sm"
                                placeholder="Draft your automated broadcast..."
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

               {/* Message Templates */}
               <div className="pt-10 mt-8 border-t border-[#eceae4]">
                <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-6">Task Specific Prototypes (Scheduled)</h4>
                
                <div className="space-y-8">
                  {[
                    { label: "Post-Purchase Review", field: "whatsapp_review_template", metaField: "meta_review_name", desc: "Requested automatically after delivery to gather customer feedback and build trust." },
                    { label: "Replenishment Prompt", field: "whatsapp_reorder_template", metaField: "meta_reorder_name", desc: "Scheduled to fire when a customer's supply is likely finishing, encouraging repeat orders." },
                    { label: "Retention Sequence", field: "whatsapp_recovery_template", metaField: "meta_recovery_name", desc: "Targeted at customers with abandoned carts to recover potentially lost revenue." },
                    { label: "Archival Notice", field: "whatsapp_final_template", metaField: "meta_final_name", desc: "A final re-engagement touchpoint for long-term inactive customers before moving to archival status." },
                  ].map(t => (
                    <div key={t.field} className="grid grid-cols-3 gap-6">
                      <div className="col-span-2">
                        <div className="flex flex-col mb-3">
                          <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest opacity-60 mb-1">{t.label}</label>
                          <p className="text-[9px] text-[#5f5f5d] font-medium opacity-50 italic">{t.desc}</p>
                        </div>
                        <textarea 
                          value={settings[t.field] || ""} 
                          onChange={e => setSettings({ ...settings, [t.field]: e.target.value })}
                          className="input text-xs min-h-[100px] font-medium leading-relaxed bg-[#fcfbf8] border-[#eceae4] rounded-xl p-4"
                          placeholder="Refine follow-up logic..."
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-60">Meta ID</label>
                        <input 
                          type="text" 
                          value={settings[t.metaField] || ""} 
                          onChange={e => setSettings({ ...settings, [t.metaField]: e.target.value })}
                          placeholder="review_v1"
                          className="input font-mono text-[10px] bg-[#eceae4]/20 border-transparent h-10" 
                        />
                        <p className="text-[9px] text-[#5f5f5d] mt-2 opacity-50 italic">Must mirror the approved namespace in Meta Dashboard.</p>
                      </div>
                      <div className="col-span-3 h-px bg-[#eceae4]/50 my-2" />
                    </div>
                  ))}

                  <div className="bg-[#1c1c1c] text-[#f7f4ed] rounded-xl p-5 shadow-lg shadow-black/10">
                    <h5 className="text-[10px] font-bold uppercase tracking-widest mb-3 opacity-60">System Attributes</h5>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                      <div className="text-[10px] font-bold flex justify-between"><span>{"{{name}}"}</span> <span className="opacity-40">Full Name</span></div>
                      <div className="text-[10px] font-bold flex justify-between"><span>{"{{first_name}}"}</span> <span className="opacity-40">First Name</span></div>
                      <div className="text-[10px] font-bold flex justify-between"><span>{"{{order_no}}"}</span> <span className="opacity-40">Order ID</span></div>
                      <div className="text-[10px] font-bold flex justify-between"><span>{"{{product}}"}</span> <span className="opacity-40">Primary Item</span></div>
                      <div className="text-[10px] font-bold flex justify-between"><span>{"{{items_list}}"}</span> <span className="opacity-40">All Items</span></div>
                      <div className="text-[10px] font-bold flex justify-between"><span>{"{{total_amount}}"}</span> <span className="opacity-40">Amount</span></div>
                      <div className="text-[10px] font-bold flex justify-between"><span>{"{{tracking_no}}"}</span> <span className="opacity-40">Ship ID</span></div>
                      <div className="text-[10px] font-bold flex justify-between"><span>{"{{tracking_link}}"}</span> <span className="opacity-40">Track URL</span></div>
                      <div className="text-[10px] font-bold flex justify-between"><span>{"{{abandon_link}}"}</span> <span className="opacity-40">Cart URL</span></div>
                      <div className="text-[10px] font-bold flex justify-between"><span>{"{{city}}"}</span> <span className="opacity-40">City</span></div>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-between border-t border-[#eceae4]/50">
                    <div>
                      <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-1 opacity-60">Recovery Sequence Latency</label>
                      <p className="text-[10px] text-[#5f5f5d] italic opacity-50">Hours elapsed before cart abandonment trigger</p>
                    </div>
                    <div className="flex items-center gap-4">
                       <input 
                        type="number" 
                        step="0.01"
                        value={settings.recovery_delay_hours} 
                        onChange={e => setSettings({ ...settings, recovery_delay_hours: parseFloat(e.target.value) })}
                        className="input text-[10px] font-bold text-[#1c1c1c] w-20 bg-[#fcfbf8] h-10 text-center" 
                      />
                      {settings.recovery_delay_hours === 0.25 && <span className="text-[10px] bg-[#1c1c1c] text-white px-2 py-1 rounded font-bold tracking-widest">RAPID</span>}
                    </div>
                  </div>
                </div>
              </div>

               {/* Automation Command Center */}
               <div className="pt-10 mt-8 border-t border-[#eceae4]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest">Live Pipeline Monitoring</h4>
                    <p className="text-[10px] text-[#5f5f5d] mt-1 opacity-60 font-medium">Real-time visibility into administrative communication flows</p>
                  </div>
                  <button onClick={fetchPipelineData} aria-label="Refresh" title="Refresh" className="w-9 h-9 flex items-center justify-center hover:bg-[#eceae4] rounded-lg text-[#5f5f5d] transition-all">
                    <RefreshCw className={cn("w-3.5 h-3.5", fetchingPipeline && "animate-spin")} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Column 1: Recently Sent */}
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest px-1 opacity-40">Recently Dispatched</h5>
                      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2 scroller-hide">
                         {pipeline.sent.length === 0 ? (
                           <div className="text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest p-8 border border-dashed border-[#eceae4] rounded-2xl text-center opacity-30 bg-[#eceae4]/10">No recent activity</div>
                         ) : pipeline.sent.map(log => (
                           <div key={log.id} className="p-4 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl group transition-all hover:border-[#1c1c1c]/30 shadow-sm">
                             <div className="flex justify-between items-start mb-1">
                               <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-[#1c1c1c] truncate uppercase tracking-widest">{log.customer?.name || "Customer"}</span>
                                  {log.isAuto && <span className="text-[8px] px-1.5 py-0.5 bg-[#1c1c1c] text-white rounded font-bold uppercase tracking-tighter">Auto</span>}
                                </div>
                                <span className="text-[9px] text-[#5f5f5d] font-bold opacity-40 tabular-nums">{log.called_at && mounted ? new Date(log.called_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}</span>
                             </div>
                             <div className="text-[9px] text-[#5f5f5d] font-medium truncate opacity-60 leading-relaxed">{log.note}</div>
                           </div>
                         ))}
                      </div>
                    </div>

                    {/* Column 2: In Queue */}
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest px-1 opacity-40">Queued for Dispatch</h5>
                      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2 scroller-hide">
                         {pipeline.waiting.length === 0 ? (
                           <div className="text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest p-8 border border-dashed border-[#eceae4] rounded-2xl text-center opacity-30 bg-[#eceae4]/10">Queue finalized</div>
                         ) : pipeline.waiting.map(task => {
                            const [h, m] = (settings.whatsapp_send_time || "10:00").split(":");
                            const target = new Date();
                            target.setHours(parseInt(h), parseInt(m), 0, 0);
                            let isOverdue = target.getTime() - new Date().getTime() < 0;
                            let timeText = `Launch at ${settings.whatsapp_send_time || "10:00"}`;
                             
                            if (!mounted) {
                               timeText = "--:--:--";
                            } else if (task.isWorkflow) {
                                const runTime = new Date(task.due_date || "");
                                const diff = runTime.getTime() - now.getTime();
                                if (diff < 0) {
                                   timeText = "Processing Now";
                                   isOverdue = true;
                                } else {
                                   const hours = Math.floor(diff / 3600000);
                                   const mins = Math.floor((diff % 3600000) / 60000);
                                   const secs = Math.floor((diff % 60000) / 1000);
                                   timeText = `Auto: ${hours > 0 ? hours + "h " : ""}${mins}m ${secs}s`;
                                   isOverdue = false;
                                }
                             } else if (!isOverdue) {
                                const diffMs = target.getTime() - now.getTime();
                                const hours = Math.floor(diffMs / 3600000);
                                const mins = Math.floor((diffMs % 3600000) / 60000);
                                const secs = Math.floor((diffMs % 60000) / 1000);
                                timeText = `Wait: ${hours > 0 ? hours + "h " : ""}${mins}m ${secs}s`;
                             } else {
                               timeText = "Ready for execution";
                             }

                           return (
                             <div key={task.id} className="p-4 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl group hover:border-[#1c1c1c]/30 transition-all shadow-sm">
                               <div className="flex justify-between items-start mb-2">
                                 <div>
                                   <div className="flex items-center gap-2 mb-1">
                                     <div className="text-[10px] font-bold text-[#1c1c1c] truncate uppercase tracking-widest">{task.customer?.name || "Customer"}</div>
                                     {task.isWorkflow ? (
                                       <span className="text-[8px] px-1.5 py-0.5 bg-[#1c1c1c] text-white rounded font-bold uppercase tracking-tighter">Auto</span>
                                     ) : (
                                       <span className="text-[8px] px-1.5 py-0.5 bg-[#eceae4] text-[#5f5f5d] rounded font-bold uppercase tracking-tighter">Manual</span>
                                     )}
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <span className={cn("text-[9px] font-bold uppercase tracking-widest", isOverdue ? "text-[#1c1c1c]" : "text-[#5f5f5d] opacity-50")}>
                                       {timeText}
                                     </span>
                                     <span className="text-[8px] px-2 py-0.5 bg-[#eceae4]/30 border border-[#eceae4] text-[#5f5f5d] rounded-lg font-bold uppercase tracking-widest">
                                       {task.isWorkflow ? (task.workflowName || "Workflow") : (task.task_type || "manual").replace("_", " ")}
                                     </span>
                                   </div>
                                 </div>
                                 <button 
                                   onClick={() => handleOpenManualWa(task)}
                                   className="w-8 h-8 flex items-center justify-center bg-[#1c1c1c] text-[#f7f4ed] rounded-lg transition-all opacity-0 group-hover:opacity-100 shadow-lg shadow-black/10 hover:scale-105 active:scale-95"
                                   title="Execute Broadcast"
                                 >
                                   <Send className="w-3.5 h-3.5" />
                                 </button>
                               </div>
                             </div>
                           );
                         })}
                       </div>
                    </div>
                  </div>
               </div>

              <div className="flex justify-end mt-8 pt-8 border-t border-gray-100">
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
        </div>
      )}

      {/* EMAIL API */}
      {tab === "email" && (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-2">
              <Mail className="w-4 h-4 text-[#1c1c1c]" />
              <h3 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest">Google OAuth Configuration</h3>
            </div>
            <p className="text-xs text-[#5f5f5d] mb-6 leading-relaxed">Configure your Gmail API credentials to enable automated email communications and re-engagement campaigns.</p>

            <div className="bg-[#1c1c1c]/5 border border-[#1c1c1c]/10 rounded-2xl p-5 mb-8">
              <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-3 opacity-60">Fast Import (credentials.json)</label>
              <textarea 
                className="w-full h-24 bg-white border-[#eceae4] rounded-xl p-4 text-[10px] font-mono mb-3"
                placeholder='Paste your Google credentials JSON here...'
                onChange={(e) => {
                  if (e.target.value.trim().startsWith('{')) {
                    handleImportGmailJson(e.target.value);
                  }
                }}
              />
              <p className="text-[9px] text-[#5f5f5d] italic opacity-50">Download the JSON from Google Cloud Console (APIs & Services {">"} Credentials {">"} OAuth 2.0 Client IDs) and paste it here to automatically populate the fields below.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block opacity-60">Client ID</label>
                <input 
                  type="text" 
                  value={settings.gmail_client_id || ""} 
                  onChange={e => setSettings({ ...settings, gmail_client_id: e.target.value })}
                  placeholder="2570...apps.googleusercontent.com"
                  className="input font-mono text-[10px] bg-[#fcfbf8]" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block opacity-60">Client Secret</label>
                <input 
                  type="password" 
                  value={settings.gmail_client_secret || ""} 
                  onChange={e => setSettings({ ...settings, gmail_client_secret: e.target.value })}
                  placeholder="GOCSPX-..."
                  className="input font-mono text-[10px] bg-[#fcfbf8]" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block opacity-60">Project ID</label>
                <input 
                  type="text" 
                  value={settings.gmail_project_id || ""} 
                  onChange={e => setSettings({ ...settings, gmail_project_id: e.target.value })}
                  placeholder="your_webhook_secret_2025"
                  className="input font-mono text-[10px] bg-[#fcfbf8]" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block opacity-60">Redirect URIs</label>
                <input 
                  type="text" 
                  value={settings.gmail_redirect_uris?.join(", ") || ""} 
                  onChange={e => setSettings({ ...settings, gmail_redirect_uris: e.target.value.split(",").map(u => u.trim()).filter(u => u) })}
                  placeholder="http://localhost, https://..."
                  className="input font-mono text-[10px] bg-[#fcfbf8]" 
                />
              </div>
            </div>

            <details className="mt-8 pt-8 border-t border-[#eceae4]/50 group">
              <summary className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest cursor-pointer opacity-40 hover:opacity-100 transition-opacity list-none flex items-center gap-2">
                Advanced Endpoints <Sliders className="w-3 h-3" />
              </summary>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block opacity-60">Auth URI</label>
                  <input 
                    type="text" 
                    value={settings.gmail_auth_uri || ""} 
                    onChange={e => setSettings({ ...settings, gmail_auth_uri: e.target.value })}
                    className="input font-mono text-[10px] bg-[#fcfbf8]" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block opacity-60">Token URI</label>
                  <input 
                    type="text" 
                    value={settings.gmail_token_uri || ""} 
                    onChange={e => setSettings({ ...settings, gmail_token_uri: e.target.value })}
                    className="input font-mono text-[10px] bg-[#fcfbf8]" 
                  />
                </div>
              </div>
            </details>
          </div>

          <div className="flex justify-end gap-3">
             {settings.gmail_refresh_token ? (
               <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                 <Check className="w-3.5 h-3.5" />
                 <span className="text-[10px] font-bold uppercase tracking-widest">Authenticated</span>
               </div>
             ) : (
               <a 
                 href="/api/auth/google" 
                 target="_blank"
                 rel="noopener noreferrer"
                 className="flex items-center gap-2 px-6 py-2.5 bg-[#fcfbf8] hover:bg-[#eceae4] text-[#1c1c1c] rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-[#eceae4] shadow-sm hover:shadow-md"
               >
                 <ShieldCheck className="w-4 h-4" /> Authorize Gmail
               </a>
             )}
             <button onClick={handleSave} disabled={saving} className="btn-primary py-2.5 px-8 text-[10px] font-bold uppercase tracking-widest min-w-[140px]">
                {saving ? "Processing..." : "Commit Gmail Settings"}
             </button>
          </div>

          {/* Email Automation Rules */}
          <div className="pt-10 mt-10 border-t border-[#eceae4]">
            <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-500" /> Branded Email Automations
            </h4>
            <p className="text-[10px] text-[#5f5f5d] mb-8 italic">Enable these to send professional, branded HTML emails automatically. These will be wrapped in a high-fidelity template.</p>
            
            <div className="space-y-6">
              {[
                { label: "Welcome Email", field: "email_auto_welcome", subjectField: "email_welcome_subject", templateField: "email_welcome_template", desc: "Sent when a new customer is added to CRM" },
                { label: "Order Confirmation", field: "email_auto_order_placed", subjectField: "email_order_placed_subject", templateField: "email_order_placed_template", desc: "Sent when an order is successfully placed" },
                { label: "Shipping Update", field: "email_auto_order_transit", subjectField: "email_order_transit_subject", templateField: "email_order_transit_template", desc: "Sent when an order is shipped or in transit" },
                { label: "Delivery & Feedback", field: "email_auto_order_delivered", subjectField: "email_order_delivered_subject", templateField: "email_order_delivered_template", desc: "Sent when an order is delivered" },
                { label: "Cart Recovery", field: "email_auto_cart_abandoned", subjectField: "email_cart_abandoned_subject", templateField: "email_cart_abandoned_template", desc: "Sent after a customer abandons their cart" },
                { label: "Refill Reminder", field: "email_auto_reorder", subjectField: "email_reorder_subject", templateField: "email_reorder_template", desc: "Sent when it's time for a product refill" },
              ].map(rule => (
                <div key={rule.field} className="card p-6 border-[#eceae4] bg-[#fcfbf8]/50">
                  <div className="flex items-center justify-between gap-4 mb-6">
                    <div className="flex-1">
                      <div className="text-xs font-bold text-[#1c1c1c] tracking-tight">{rule.label}</div>
                      <div className="text-[10px] text-[#5f5f5d] mt-1 font-medium">{rule.desc}</div>
                    </div>
                    <button 
                      onClick={() => setSettings({ ...settings, [rule.field]: !settings[rule.field] })}
                      className="focus:outline-none transition-transform active:scale-95"
                    >
                      {settings[rule.field] ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1c1c1c] text-[#f7f4ed] rounded-full shadow-lg shadow-black/10">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span className="text-[9px] font-black uppercase tracking-widest">ACTIVE</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#eceae4] text-[#5f5f5d] rounded-full">
                          <ToggleLeft className="w-3.5 h-3.5 opacity-40" />
                          <span className="text-[9px] font-black uppercase tracking-widest">DISABLED</span>
                        </div>
                      )}
                    </button>
                  </div>

                  {settings[rule.field] && (
                    <div className="space-y-4 pt-6 border-t border-[#eceae4] animate-fade-in-down">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest opacity-40">Configure Template</label>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-[#5f5f5d] italic mr-1">Load Preset:</span>
                          {EMAIL_PRESETS[rule.templateField]?.map((preset, idx) => (
                            <button 
                              key={idx}
                              onClick={() => {
                                setSettings({ 
                                  ...settings, 
                                  [rule.subjectField]: preset.subject,
                                  [rule.templateField]: preset.body 
                                });
                                toast.success("Template & Subject Loaded");
                              }}
                              className="px-2.5 py-1 bg-white border border-[#eceae4] rounded-lg text-[9px] font-bold text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-white transition-all shadow-sm"
                            >
                              Variant {idx + 1}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-1.5 block opacity-60">Subject Line</label>
                          <input 
                            type="text" 
                            value={settings[rule.subjectField] || ""} 
                            onChange={e => setSettings({ ...settings, [rule.subjectField]: e.target.value })}
                            placeholder="e.g. Welcome to the family! 🌿"
                            className="input text-xs bg-white border-[#eceae4] font-medium" 
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-1.5 block opacity-60">Email Body (Plain Text)</label>
                          <textarea 
                            value={settings[rule.templateField] || ""} 
                            onChange={e => setSettings({ ...settings, [rule.templateField]: e.target.value })}
                            className="input text-xs min-h-[120px] bg-white border-[#eceae4] font-medium leading-relaxed p-4"
                            placeholder="Write your message here... You can use {{name}}, {{product}}, etc."
                          />
                          <p className="text-[9px] text-[#5f5f5d] mt-2 italic opacity-50">Note: New lines will automatically be converted to breaks. Branded header & footer are added automatically.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end mt-10">
            <button className="btn-primary py-3 px-10 text-[10px] font-bold uppercase tracking-widest" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving Configuration..." : "Save All Email Settings"}
            </button>
          </div>
        </div>
      )}

      {/* SHOPIFY */}
      {tab === "shopify" && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-4 opacity-60">Admin API Integration</h3>
            <p className="text-xs text-[#5f5f5d] mb-8 leading-relaxed">Establish a direct secure tunnel to Shopify GraphQL endpoints for high-fidelity data extraction and identity resolution.</p>
            
            <div className="space-y-8">
              <div>
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">Store URL</label>
                <input 
                  type="text" 
                  value={settings.shopify_store_domain || ""} 
                  onChange={e => setSettings({ ...settings, shopify_store_domain: e.target.value })}
                  placeholder="e.g. yourstore.myshopify.com"
                  className="input text-[10px] font-bold bg-[#fcfbf8]" 
                />
                <p className="text-[9px] text-[#5f5f5d] mt-2 opacity-50">Your primary myshopify.com domain.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">Admin API Access Token</label>
                <input 
                  type="password" 
                  value={settings.shopify_api_key || ""} 
                  onChange={e => setSettings({ ...settings, shopify_api_key: e.target.value })}
                  placeholder="shpat_••••••••••••••••••••••••"
                  className="input font-mono text-[10px] bg-[#fcfbf8]" 
                />
                <p className="text-[9px] text-[#5f5f5d] mt-2 leading-relaxed opacity-50">Required scopes: <strong>read_orders, read_customers</strong>. Generated in Shopify Admin &gt; Develop Apps.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">Webhook Signing Secret</label>
                <input 
                  type="password" 
                  value={settings.shopify_webhook_secret || ""} 
                  onChange={e => setSettings({ ...settings, shopify_webhook_secret: e.target.value })}
                  placeholder="X-Shopify-Hmac-Sha256"
                  className="input font-mono text-[10px] bg-[#fcfbf8]" 
                />
                <p className="text-[9px] text-[#5f5f5d] mt-2 leading-relaxed opacity-50">Used to authenticate event payloads. Found in <strong>Notifications &gt; Webhooks</strong>.</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">OAuth Client ID</label>
                  <input
                    type="text"
                    value={settings.shopify_client_id || ""}
                    onChange={e => setSettings({ ...settings, shopify_client_id: e.target.value })}
                    placeholder="Optional"
                    className="input font-mono text-[10px] bg-[#fcfbf8]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">OAuth Client Secret</label>
                  <input
                    type="password"
                    value={settings.shopify_api_secret || ""}
                    onChange={e => setSettings({ ...settings, shopify_api_secret: e.target.value })}
                    placeholder="Optional"
                    className="input font-mono text-[10px] bg-[#fcfbf8]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">Refresh Token</label>
                <input
                  type="password"
                  value={settings.shopify_refresh_token || ""}
                  onChange={e => setSettings({ ...settings, shopify_refresh_token: e.target.value })}
                  placeholder="Offline refresh token"
                  className="input font-mono text-[10px] bg-[#fcfbf8]"
                />
              </div>

              {settings.shopify_token_expires_at && (
                <div className="text-[10px] font-bold text-[#1c1c1c] bg-[#eceae4]/30 border border-[#eceae4] rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="opacity-60 uppercase tracking-widest">Token Lifecycle Ends:</span>
                  <span className="font-mono">{new Date(settings.shopify_token_expires_at).toLocaleString()}</span>
                </div>
              )}

              <div className="pt-8 border-t border-[#eceae4]/50 flex items-center justify-between">
                <div>
                   <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest">Autonomous Sentinel</h4>
                   <p className="text-[11px] text-[#5f5f5d] mt-1 font-medium opacity-60">
                     {lastSync 
                       ? `Last background sync: ${new Date(lastSync).toLocaleString()}` 
                       : "Self-healing identity resolution via Shopify lookup"}
                   </p>
                </div>
                <div className={cn(
                  "px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest border transition-all", 
                  settings.shopify_api_key ? "bg-[#1c1c1c] text-[#f7f4ed] border-[#1c1c1c]" : "bg-[#eceae4]/30 text-[#5f5f5d] border-[#eceae4]"
                )}>
                  {settings.shopify_api_key ? "ACTIVE" : "OFFLINE"}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button className="btn-secondary py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest" onClick={handleTestShopifyConnection} disabled={testingShopify}>
              {testingShopify ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-2" />}
              {testingShopify ? "Validating..." : "Ping Shopify API"}
            </button>
            <button
              className="btn-secondary py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest border-[#1c1c1c]/10 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-100 transition-all"
              onClick={handleDeepSync}
              disabled={saving || !settings.shopify_api_key}
            >
              <Zap className={cn("w-3.5 h-3.5 mr-2", saving && "animate-pulse")} /> Run 48h Recovery Audit
            </button>
            <button
              className="btn-primary py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest bg-[#1c1c1c] hover:bg-[#1c1c1c]/90 text-[#f7f4ed]"
              onClick={() => startSyncStream("/api/sync/shopify")}
              disabled={saving || !settings.shopify_api_key}
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-2", syncStatus.active && "animate-spin")} /> Sync Catalog
            </button>
          </div>

          {/* This tab had no way to persist the Store URL/token/secret fields
              above - Ping/Audit/Sync all act on whatever's already in the DB
              and are disabled until shopify_api_key is set, which could never
              happen through this tab alone. Every other settings tab ends
              with this same Save Settings button; this one just didn't. */}
          <div className="flex justify-end pt-8 mt-8 border-t border-[#eceae4]">
            <button className="btn-primary bg-[#1c1c1c] text-[#f7f4ed] py-3 px-8 text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-black/10" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Save className="w-3.5 h-3.5 mr-2" />}
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {/* SHIPROCKET */}

      {tab === "shiprocket" && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-4 opacity-60">Shiprocket Integration</h3>
            <p className="text-xs text-[#5f5f5d] mb-8 leading-relaxed">Connect to Shiprocket for real-time shipment tracking and delivery status updates.</p>
            
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">Email</label>
                <input 
                  type="email" 
                  value={settings.shiprocket_email || ""} 
                  onChange={e => setSettings({ ...settings, shiprocket_email: e.target.value })}
                  placeholder="e.g. api-user@yourdomain.com"
                  className="input text-[10px] font-bold bg-[#fcfbf8]" 
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">Password</label>
                <input 
                  type="password" 
                  value={settings.shiprocket_password || ""} 
                  onChange={e => setSettings({ ...settings, shiprocket_password: e.target.value })}
                  placeholder="••••••••"
                  className="input text-[10px] font-bold bg-[#fcfbf8]" 
                />
              </div>
            </div>

            <div className="pt-8 border-t border-[#eceae4]/50">
               <div className="flex items-center justify-between mb-6">
                  <div>
                     <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2">
                       <Zap className="w-3.5 h-3.5 text-[#1c1c1c]" /> Fastrr Checkout Sync
                     </h4>
                     <p className="text-[11px] text-[#5f5f5d] mt-1 font-medium opacity-60">Import abandoned carts from Fastrr checkout</p>
                  </div>
               </div>

               <div className="bg-[#fcfbf8] border border-[#eceae4] rounded-2xl p-6 space-y-4">
                  <div className="flex items-start gap-4">
                     <div className="w-6 h-6 bg-[#1c1c1c] rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#f7f4ed]">1</div>
                     <p className="text-[11px] text-[#1c1c1c] leading-relaxed font-medium">
                       Navigate to <strong>Shiprocket Dashboard</strong> &gt; <strong>Checkout</strong> &gt; <strong>Settings</strong> &gt; <strong>Webhooks</strong>.
                     </p>
                  </div>
                  <div className="flex items-start gap-4">
                     <div className="w-6 h-6 bg-[#1c1c1c] rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#f7f4ed]">2</div>
                     <div className="flex-1">
                        <p className="text-[11px] text-[#1c1c1c] font-medium">Create a new webhook for the <strong>&quot;Abandoned Cart&quot;</strong> event:</p>
                        <div className="mt-3 flex items-center gap-3 bg-[#f7f4ed] border border-[#eceae4] rounded-xl p-3">
                           {/* Was hardcoded to a Tailscale address on one developer
                               machine, so abandoned-cart webhooks were dropped
                               whenever that PC was off. Derive it from the current
                               origin, like every other webhook on this page. */}
                           <code className="text-[10px] text-[#1c1c1c] font-mono flex-1 break-all opacity-70">
                             {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/shiprocket
                           </code>
                           <button
                             onClick={() => {
                               const url = `${window.location.origin}/api/webhooks/shiprocket`;
                               navigator.clipboard.writeText(url);
                               toast.success("URL Copied");
                             }}
                             className="w-8 h-8 flex items-center justify-center hover:bg-[#eceae4] rounded-lg text-[#1c1c1c] transition-all"
                           >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                           </button>
                        </div>
                     </div>
                  </div>
                  <div className="flex items-start gap-4">
                     <div className="w-6 h-6 bg-[#1c1c1c] rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#f7f4ed]">3</div>
                     {/* Used to point admins at SHIPROCKET_WEBHOOK_TOKEN (a
                         single env var shared by every org) instead of the
                         Webhook Secret field a few lines down on this same
                         tab, which is this org's own and is what the webhook
                         handler actually checks first. */}
                     <p className="text-[11px] text-[#1c1c1c] leading-relaxed font-medium">
                       Set header <code className="bg-[#eceae4]/30 px-2 py-0.5 rounded font-mono text-[#1c1c1c]">x-shiprocket-secret</code> to the <strong>Webhook Secret</strong> value you set below, then save.
                     </p>
                  </div>
               </div>
            </div>

            <div className="bg-[#1c1c1c] text-[#f7f4ed] rounded-2xl p-6 mb-8 relative overflow-hidden shadow-xl shadow-black/10">
              <div className="absolute top-0 right-0 p-6 opacity-5">
                <WifiOff className="w-16 h-16" />
              </div>
              <div className="flex gap-4 relative z-10">
                <AlertCircle className="w-5 h-5 text-white shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2 opacity-60">Webhook Setup Instructions</h4>
                  <p className="text-[11px] leading-relaxed opacity-80 font-medium">
                    1. Go to Shiprocket &gt; Settings &gt; Webhooks.<br />
                    2. Add a webhook using the URL below.<br />
                    3. Subscribe to: <strong>Order/Shipment Creation, Tracking Updates,</strong> and <strong>Abandoned Carts</strong>.
                  </p>
                </div>
              </div>
            </div>

            {/* Localhost Warning */}
            {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
              <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-6 mb-8 shadow-2xl">
                <div className="flex gap-4">
                  <WifiOff className="w-5 h-5 text-rose-500 shrink-0" />
                  <div>
                    <h4 className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-2">Can&apos;t Reach Localhost</h4>
                    <p className="text-[11px] text-[#f7f4ed] leading-relaxed font-medium">
                      Administrative oversight is compromised. Shiprocket cannot reach <span className="underline decoration-rose-500/50 italic text-[#eceae4]">localhost</span> from the cloud.
                      <br /><br />
                      <span className="text-rose-500 font-bold uppercase tracking-widest">Remedy:</span> Implement an <span className="bg-white/10 px-2 py-0.5 rounded-lg text-[#eceae4]">ngrok</span> tunnel or deploy to a reachable staging environment to restore live cart visibility.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">Webhook URL</label>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    readOnly 
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/shiprocket`}
                    className="input font-mono text-[10px] bg-[#eceae4]/30 text-[#1c1c1c] cursor-default border-transparent" 
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/shiprocket`);
                      toast.success("URL Copied");
                    }}
                    className="w-10 h-10 flex items-center justify-center border border-[#eceae4] rounded-xl hover:bg-[#1c1c1c] hover:text-[#f7f4ed] hover:border-[#1c1c1c] text-[#5f5f5d] transition-all"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-60">Webhook Secret (X-Shiprocket-Secret)</label>
                <input 
                  type="text" 
                  value={settings.shiprocket_webhook_secret || ""} 
                  onChange={e => setSettings({ ...settings, shiprocket_webhook_secret: e.target.value })}
                  placeholder="Private verification string..."
                  className="input font-mono text-[10px] bg-[#fcfbf8]" 
                />
                <p className="text-[9px] text-[#5f5f5d] mt-2 opacity-50 italic">Must mirror the secret string defined in your Shiprocket Webhook settings.</p>
              </div>

              <div className="pt-10 mt-8 border-t border-[#eceae4]">
                 <div className="flex items-center gap-3 mb-6">
                    <Database className="w-4 h-4 text-[#1c1c1c]" />
                    <h3 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest">Import Past Fastrr Carts</h3>
                 </div>
                 <div className="flex items-center gap-8 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl p-6">
                    <div className="flex-1">
                        <p className="text-[11px] text-[#5f5f5d] leading-relaxed font-medium">
                        Import old abandoned carts from a CSV exported from <strong>Checkout &gt; Abandoned Cart</strong>. Customers will be matched automatically and recovery tasks created.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <input
                            type="file"
                            ref={fileInputRef as any}
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                setSyncStatus({ active: true, progress: 10, message: "Reading file...", isComplete: false, error: null });
                                
                                const reader = new FileReader();
                                reader.onload = async (evt) => {
                                try {
                                    const data = evt.target?.result;
                                    const XLSX = await import("xlsx");
                                    const workbook = XLSX.read(data, { type: 'binary' });
                                    const sheetName = workbook.SheetNames[0];
                                    const sheet = workbook.Sheets[sheetName];
                                    const rows = XLSX.utils.sheet_to_json(sheet);

                                    setSyncStatus(prev => ({ ...prev, progress: 30, message: `Uploading ${rows.length} carts...` }));

                                    const res = await fetch("/api/sync/fastrr-import", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ rows })
                                    });

                                    const result = await res.json();
                                    if (res.ok) {
                                        setSyncStatus({
                                            active: true,
                                            progress: 100,
                                            message: `Success! Synced ${result.report.synced_carts} carts.`,
                                            isComplete: true,
                                            error: null
                                        });
                                        toast.success(`Successfully imported ${result.report.synced_carts} abandoned carts!`);
                                        fetchPipelineData();
                                    } else {
                                        throw new Error(result.error || "Import failed");
                                    }
                                } catch (err: any) {
                                    setSyncStatus(prev => ({ ...prev, active: false, error: err.message }));
                                    toast.error(err.message);
                                }
                                };
                                reader.readAsBinaryString(file);
                            }}
                            className="hidden"
                            accept=".csv,.xlsx,.xls"
                        />
                        <button 
                            onClick={() => (fileInputRef as any).current?.click()}
                            className="btn-primary bg-[#1c1c1c] hover:bg-[#1c1c1c]/90 text-[#f7f4ed] py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-black/10"
                            disabled={saving}
                        >
                            <Plus className="w-3.5 h-3.5 mr-2" /> Upload CSV
                        </button>
                    </div>
                 </div>
              </div>

              <div className="pt-10 mt-8 border-t border-[#eceae4]">
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                     <div>
                        <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest">Manual Sync</h4>
                        <p className="text-[11px] text-[#5f5f5d] mt-1 font-medium opacity-60">Pull the latest orders and customer data directly from Shiprocket</p>
                     </div>
                      <button
                        onClick={() => startSyncStream("/api/sync/shiprocket")}
                        className="btn-primary bg-[#1c1c1c] text-[#f7f4ed] py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-black/10"
                        disabled={saving}
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5 mr-2", syncStatus.active && "animate-spin")} /> Run Sync
                      </button>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#eceae4]/50 pt-8">
                     <div className="flex-1 pr-12">
                        <div className="flex items-center gap-3 mb-2">
                           <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest">Phone Number Recovery</h4>
                           {maskedCount !== null && maskedCount > 0 && (
                             <span className="px-2 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-lg tracking-widest uppercase">
                               {maskedCount} Masked
                             </span>
                           )}
                           {maskedCount === 0 && (
                             <span className="px-2 py-0.5 bg-[#1c1c1c] text-[#f7f4ed] text-[9px] font-black rounded-lg tracking-widest uppercase">
                               Optimized
                             </span>
                           )}
                        </div>
                        <p className="text-[11px] text-[#5f5f5d] leading-relaxed font-medium opacity-60">
                          Attempts to recover real phone numbers for masked orders.
                          <span className="text-[#1c1c1c] block mt-1 font-bold">Duplicate customer records will be merged automatically.</span>
                        </p>
                     </div>
                     <button
                      onClick={() => {
                        if (confirm("Run phone number recovery? (Processes up to 100 records per run)")) {
                          startSyncStream("/api/sync/unmask");
                        }
                      }}
                      className={cn(
                        "btn-primary py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest shadow-xl transition-all",
                        maskedCount && maskedCount > 0
                          ? "bg-[#1c1c1c] text-[#f7f4ed] shadow-black/10"
                          : "bg-[#eceae4]/50 text-[#5f5f5d] shadow-none cursor-not-allowed border-[#eceae4]"
                      )}
                      disabled={syncStatus.active || maskedCount === 0}
                     >
                       {syncStatus.active ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5 mr-2" />}
                       {syncStatus.active ? "Recovering..." : "Recover Phone Numbers"}
                     </button>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#eceae4]/50 pt-8">
                     <div>
                        <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest">Pending Webhooks</h4>
                        <p className="text-[11px] text-[#5f5f5d] mt-1 font-medium opacity-60">Process any webhook events that are still waiting</p>
                     </div>
                     <button 
                      onClick={() => startSyncStream("/api/sync/all")}
                      className="btn-secondary py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest"
                      disabled={saving}
                     >
                       <RefreshCw className={cn("w-3.5 h-3.5 mr-2", syncStatus.active && "animate-spin")} /> Process Queue
                     </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-8 mt-8 border-t border-[#eceae4]">
            <button className="btn-primary bg-[#1c1c1c] text-[#f7f4ed] py-3 px-8 text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-black/10" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Save className="w-3.5 h-3.5 mr-2" />}
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {/* Manual Dispatch Modal */}
      <Modal open={manualWaModal} onClose={() => setManualWaModal(false)} title="Send Manual Message"
        footer={<>
          <button className="btn-secondary py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest" onClick={() => setManualWaModal(false)}>Cancel</button>
          <button className="btn-primary bg-[#1c1c1c] text-[#f7f4ed] py-2.5 px-8 text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-black/10" onClick={handleManualSend} disabled={sendingManualWa}>
            {sendingManualWa ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Send className="w-3.5 h-3.5 mr-2" />}
            {sendingManualWa ? "Sending..." : "Send Now"}
          </button>
        </>}
      >
        <div className="space-y-6 py-4">
          <div className="bg-[#1c1c1c] text-[#f7f4ed] p-5 rounded-2xl flex gap-4 shadow-xl">
             <AlertCircle className="w-4 h-4 text-white shrink-0 mt-0.5" />
             <div className="text-[10px] font-bold uppercase tracking-widest leading-relaxed opacity-80">
                Sends a message to <span className="text-white">{manualWaCustomerName}</span> right now and marks this task as <span className="text-white">Resolved</span>.
             </div>
          </div>

          <div>
            <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-40">Message</label>
            <textarea
              className="input text-xs h-40 leading-relaxed bg-[#fcfbf8] border-[#eceae4] rounded-2xl p-5"
              value={manualWaMessage}
              onChange={e => setManualWaMessage(e.target.value)}
              placeholder="Type your message..."
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-40">Attachment (Optional)</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-3 px-5 py-3 border border-dashed border-[#eceae4] rounded-xl hover:border-[#1c1c1c] hover:bg-[#eceae4]/30 transition-all cursor-pointer text-[#5f5f5d]">
                <Paperclip className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{manualWaFile ? "Replace File" : "Attach File"}</span>
                <input type="file" className="hidden" onChange={e => setManualWaFile(e.target.files?.[0] || null)} />
              </label>
              {manualWaFile && (
                <div className="text-[10px] bg-[#1c1c1c] text-[#f7f4ed] font-bold px-4 py-2 rounded-xl flex items-center gap-3 shadow-lg shadow-black/10">
                  <span className="truncate max-w-[180px]">{manualWaFile.name}</span>
                  <button aria-label="Remove" onClick={() => setManualWaFile(null)} className="w-5 h-5 flex items-center justify-center hover:bg-white/10 rounded-full"><X className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* OVERRIDES */}
      {tab === "overrides" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-6 p-6 bg-[#fcfbf8] rounded-2xl border border-[#eceae4]">
             <div>
                <h4 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest">Product Lifecycle Management</h4>
                <p className="text-[11px] text-[#5f5f5d] font-medium opacity-60">Define custom offsets and administrative logic per catalog entity</p>
             </div>
             <div className="flex gap-3">
                <button 
                  className="w-10 h-10 flex items-center justify-center border border-[#eceae4] rounded-xl text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-[#f7f4ed] hover:border-[#1c1c1c] transition-all" 
                  onClick={() => downloadOverrideTemplate()}
                  title="Download CSV Schema"
                >
                  <Package className="w-4 h-4" />
                </button>
                <div className="relative">
                  <button 
                    className="w-10 h-10 flex items-center justify-center border border-[#eceae4] rounded-xl text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-[#f7f4ed] hover:border-[#1c1c1c] transition-all" 
                    onClick={() => document.getElementById('bulk-import')?.click()}
                    title="Bulk Import"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <input 
                    type="file" 
                    id="bulk-import" 
                    className="hidden" 
                    accept=".xlsx,.csv" 
                    onChange={handleBulkImport} 
                  />
                </div>
                <button 
                  className="btn-primary bg-[#1c1c1c] text-[#f7f4ed] py-2 px-6 text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-black/10" 
                  onClick={() => {
                    setEditingId(null);
                    setNewOverride({
                      shopify_product_id: "",
                      product_name: "",
                      review_offset_days: 0,
                      reorder_offset_days: 0,
                      final_offset_days: 0,
                      course_duration_days: 30,
                      usage_notes: "",
                      is_priority: false,
                      upsell_product_name: ""
                    });
                    setShowAddOverride(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-2" /> Add Override
                </button>
             </div>
          </div>

          {overrides.length === 0 ? (
            <div className="card p-20 text-center border-dashed border-[#eceae4]">
              <p className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest opacity-20">No product overrides defined.</p>
            </div>
          ) : overrides.map(o => (
            <div key={o.id} className="card p-6 border-[#eceae4] hover:border-[#1c1c1c]/30 transition-all">
              <div className="flex items-start justify-between gap-6 mb-6">
                <div>
                  <div className="text-[11px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-1">{o.product_name}</div>
                  <div className="text-[9px] text-[#5f5f5d] font-mono opacity-40">{o.shopify_product_id}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button className="w-8 h-8 flex items-center justify-center bg-[#fcfbf8] border border-[#eceae4] rounded-lg text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-[#f7f4ed] hover:border-[#1c1c1c] transition-all shadow-sm" onClick={() => {
                    setEditingId(o.id);
                    setNewOverride({
                      shopify_product_id: o.shopify_product_id,
                      product_name: o.product_name,
                      review_offset_days: o.review_offset_days || 0,
                      reorder_offset_days: o.reorder_offset_days || 0,
                      final_offset_days: o.final_offset_days || 0,
                      course_duration_days: o.course_duration_days || 30,
                      usage_notes: o.usage_notes || "",
                      is_priority: o.is_priority || false,
                      upsell_product_name: o.upsell_product_name || ""
                    });
                    setShowAddOverride(true);
                  }}>
                    <Sliders className="w-3.5 h-3.5" />
                  </button>
                  <button className="w-8 h-8 flex items-center justify-center bg-[#fcfbf8] border border-[#eceae4] rounded-lg text-rose-500 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all shadow-sm" onClick={async () => {
                     if (confirm("Permanently delete this product override?")) {
                       await supabase.from("product_overrides").delete().eq("id", o.id);
                       await recalculateTasks(settings);
                       fetchSettings();
                       toast.success("Override Deleted");
                     }
                  }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-8">
                {[
                  { label: "Review Latency", value: o.review_offset_days },
                  { label: "Reorder Trigger", value: o.reorder_offset_days },
                  { label: "Sequence Exit", value: o.final_offset_days },
                  { label: "Course Length", value: o.course_duration_days },
                ].map(f => (
                  <div key={f.label}>
                    <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-40">{f.label}</label>
                    <div className="text-[10px] font-bold text-[#1c1c1c] tabular-nums">{f.value || 0} Days</div>
                  </div>
                ))}
              </div>
              
              {(o.usage_notes || o.upsell_product_name || o.is_priority) && (
                <div className="mt-6 pt-6 border-t border-[#eceae4]/50 grid grid-cols-2 gap-8">
                  {o.usage_notes && (
                    <div className="col-span-2">
                       <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest block mb-2 opacity-40">Operational Notes</label>
                       <p className="text-[10px] text-[#1c1c1c] font-medium italic opacity-70 leading-relaxed">&quot;{o.usage_notes}&quot;</p>
                    </div>
                  )}
                  <div className="flex items-center gap-6">
                    {o.is_priority && (
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest">High Priority Boost</span>
                      </div>
                    )}
                    {o.upsell_product_name && (
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-3 h-3 text-[#1c1c1c] opacity-40" />
                        <span className="text-[9px] font-black text-[#1c1c1c] uppercase tracking-widest opacity-60">Upsell: {o.upsell_product_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}


      {/* SECURITY: personal sign-in protection for the signed-in admin */}
      {tab === "security" && (
        <div className="space-y-6">
          <TwoFactorCard />
        </div>
      )}

      {/* DANGER ZONE */}
      {tab === "database" && (
        <div className="space-y-6">
          <div className="card p-0 border-rose-200 overflow-hidden shadow-2xl">
            <div className="bg-rose-500 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-white" />
                <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Danger Zone</h3>
              </div>
              <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Irreversible</span>
            </div>
            <div className="p-8 space-y-8 bg-[#fcfbf8]">
              {[
                { type: "customers", label: "Delete All Customers", desc: "Permanently deletes every customer record, their orders, and task history." },
                { type: "orders", label: "Delete All Orders", desc: "Permanently deletes all historical order data." },
                { type: "tasks", label: "Delete All Tasks", desc: "Permanently deletes all scheduled messages and call logs." },
                { type: "abandoned_carts", label: "Delete All Abandoned Carts", desc: "Permanently deletes all recovered cart data and recovery leads." },
              ].map(d => (
                <div key={d.type} className="flex items-center justify-between gap-12 group">
                  <div className="flex-1">
                    <div className="text-[11px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-1 group-hover:text-rose-500 transition-colors">{d.label}</div>
                    <div className="text-[10px] text-[#5f5f5d] font-medium opacity-60 leading-relaxed">{d.desc}</div>
                  </div>
                  <button onClick={() => { setPurgeConfirmText(""); setConfirmModal({ open: true, type: d.type as any }); }} className="btn-primary bg-rose-500 hover:bg-rose-600 text-white py-2 px-6 text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-rose-500/20">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Override Modal */}
      <Modal open={showAddOverride} onClose={() => setShowAddOverride(false)} title={editingId ? "Edit Override" : "Add Override"}
        footer={<>
          <button className="btn-secondary py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest" onClick={() => setShowAddOverride(false)}>Cancel</button>
          <button className="btn-primary bg-[#1c1c1c] text-[#f7f4ed] py-2.5 px-8 text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-black/10" onClick={handleAddOverride} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : (editingId ? <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> : <Plus className="w-3.5 h-3.5 mr-2" />)}
            {saving ? "Saving..." : (editingId ? "Save Changes" : "Add Override")}
          </button>
        </>}
      >
        <div className="space-y-6 py-4">
          <div>
            <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-40">Product</label>
            <select 
              className="input text-[11px] font-bold bg-[#fcfbf8] border-[#eceae4] rounded-xl h-12 disabled:opacity-30"
              disabled={!!editingId}
              value={newOverride.shopify_product_id}
              onChange={e => {
                const p = availableProducts.find(x => x.id === e.target.value);
                setNewOverride({ ...newOverride, shopify_product_id: e.target.value, product_name: p?.name || "" });
              }}
            >
              <option value="">-- Choose Product --</option>
              {editingId && !availableProducts.find(p => p.id === newOverride.shopify_product_id) && (
                <option value={newOverride.shopify_product_id}>{newOverride.product_name}</option>
              )}
              {[...availableProducts].sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-40">Review</label>
              <input type="number" className="input text-[10px] font-bold bg-[#fcfbf8] h-12 text-center" value={newOverride.review_offset_days} onChange={e => setNewOverride({ ...newOverride, review_offset_days: +e.target.value })} />
            </div>
            <div>
              <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-40">Reorder</label>
              <input type="number" className="input text-[10px] font-bold bg-[#fcfbf8] h-12 text-center" value={newOverride.reorder_offset_days} onChange={e => setNewOverride({ ...newOverride, reorder_offset_days: +e.target.value })} />
            </div>
            <div>
              <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-40">Exit</label>
              <input type="number" className="input text-[10px] font-bold bg-[#fcfbf8] h-12 text-center" value={newOverride.final_offset_days} onChange={e => setNewOverride({ ...newOverride, final_offset_days: +e.target.value })} />
            </div>
            <div>
              <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-40">Duration</label>
              <input type="number" className="input text-[10px] font-bold bg-[#1c1c1c] text-[#f7f4ed] h-12 text-center border-transparent" value={newOverride.course_duration_days} onChange={e => setNewOverride({ ...newOverride, course_duration_days: +e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
             <div>
                <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-40">Notes</label>
                <textarea
                  value={newOverride.usage_notes}
                  onChange={e => setNewOverride({...newOverride, usage_notes: e.target.value})}
                  className="input text-[10px] h-20 resize-none bg-[#fcfbf8] border-[#eceae4] rounded-xl p-3 font-medium"
                  placeholder="e.g. usage instructions..."
                />
             </div>
             <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-40">Upsell Product</label>
                  <input
                    type="text"
                    value={newOverride.upsell_product_name}
                    onChange={e => setNewOverride({...newOverride, upsell_product_name: e.target.value})}
                    className="input text-[10px] font-bold bg-[#fcfbf8] h-11"
                    placeholder="Complementary product..."
                  />
                </div>
                
                <div className="flex items-center justify-between p-4 bg-[#fcfbf8] rounded-xl border border-[#eceae4]">
                    <div>
                      <div className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest">Priority Boost</div>
                      <div className="text-[8px] text-[#5f5f5d] italic opacity-60">Elevate task score (+50)</div>
                    </div>
                    <button 
                      onClick={() => setNewOverride({...newOverride, is_priority: !newOverride.is_priority})}
                      className={cn("w-10 h-6 rounded-full transition-all relative", newOverride.is_priority ? "bg-[#1c1c1c]" : "bg-[#eceae4]")}
                    >
                      <div className={cn("w-4 h-4 bg-white rounded-full absolute top-1 transition-all", newOverride.is_priority ? "right-1" : "left-1")} />
                    </button>
                </div>
             </div>
          </div>

          <div className="p-4 bg-[#1c1c1c] text-[#f7f4ed] text-[10px] font-bold uppercase tracking-widest rounded-2xl flex gap-4 shadow-xl">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="opacity-80 leading-relaxed">Task due dates for orders using this product will update immediately when saved.</p>
          </div>
        </div>
      </Modal>

      {/* Clear Confirmation Modal */}
      <Modal open={confirmModal.open} onClose={() => setConfirmModal({ open: false, type: null })} title="Confirm Deletion"
        footer={<>
          <button className="btn-secondary py-2.5 px-6 text-[10px] font-bold uppercase tracking-widest" onClick={() => setConfirmModal({ open: false, type: null })}>Cancel</button>
          <button
            className="btn-primary bg-rose-500 text-white py-2.5 px-8 text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => confirmModal.type && handleClearData(confirmModal.type)}
            disabled={isDeleting || purgeConfirmText !== confirmModal.type}
          >
            {isDeleting ? "Deleting..." : "Permanently Delete"}
          </button>
        </>}
      >
        <div className="space-y-4">
          <div className="p-6 bg-rose-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-2xl flex gap-4 shadow-2xl">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="leading-relaxed">Warning: this cannot be undone. All matching data will be permanently deleted.</p>
          </div>
          <div>
            <label className="text-[9px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2 block opacity-60">
              Type <span className="font-mono normal-case text-rose-600">{confirmModal.type}</span> to confirm
            </label>
            <input
              type="text"
              className="input font-mono text-sm"
              value={purgeConfirmText}
              onChange={e => setPurgeConfirmText(e.target.value)}
              placeholder={confirmModal.type || ""}
              autoComplete="off"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

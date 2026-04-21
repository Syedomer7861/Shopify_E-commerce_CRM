"use client";
import { useState, useEffect, useRef } from "react";
import { Save, RefreshCw, Trash2, ToggleLeft, ToggleRight, Bell, Sliders, Package, Database, AlertCircle, Loader2, Plus, Search, X, Send, Paperclip, Smartphone, QrCode, CheckCircle2, WifiOff, ShoppingBag, Zap } from "lucide-react";
import { PageHeader, Modal, SyncProgressBar } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn, toDbDateString } from "@/lib/utils";
import toast from "react-hot-toast";
import { AccessDenied } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import * as XLSX from "xlsx";

type Tab = "general" | "notifications" | "overrides" | "shopify" | "shiprocket" | "database";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000000";

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

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<any>({
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
    wa_welcome_template: "",
    wa_order_placed_template: "",
    wa_order_transit_template: "",
    wa_order_delivered_template: "",
    wa_cart_abandoned_template: "",
    wa_reorder_template: ""
  });
  const [pipeline, setPipeline] = useState<{ sent: any[], waiting: any[] }>({ sent: [], waiting: [] });
  const [fetchingPipeline, setFetchingPipeline] = useState(false);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [availableProducts, setAvailableProducts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [maskedCount, setMaskedCount] = useState<number | null>(null);
  const [showAddOverride, setShowAddOverride] = useState(false);
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
  const [waStatus, setWaStatus] = useState<{ ready?: boolean; state?: string; error?: string; qr?: string | null }>({ state: "INITIALISING" });
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

  const supabase = createClient();

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

  const fetchStatus = async () => {
    try {
      // Fetch connection status
      const res = await fetch("/api/whatsapp/status");
      const data = await res.json();
      
      // Also fetch QR if not ready
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
  };

  useEffect(() => {
    fetchSettings();
    fetchAvailableProducts();
    
    // WhatsApp status polling
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);

    // Auto-sync for products (Realtime)
    const channel = supabase
      .channel('setting-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => fetchAvailableProducts())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      // Fetch the most recently updated settings row
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("id", SETTINGS_ID)
        .maybeSingle();

      if (data) {
        setSettings(data);
      } else {
        // Create the master row if it's missing
        const { data: newRow } = await supabase.from("settings").insert({ id: SETTINGS_ID }).select().single();
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
  }

  async function fetchMaskedCount() {
    try {
      const { count } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .or('phone.ilike.%x%,phone.ilike.%_SR_%');
      setMaskedCount(count);
    } catch (e) {
      console.error("Failed to fetch masked count:", e);
    }
  }

  async function fetchPipelineData() {
    setFetchingPipeline(true);
    try {
      const today = toDbDateString(new Date());
      
      // 1. Waiting Queue (Today's pending reminders)
      const { data: waiting } = await supabase
        .from("tasks")
        .select(`
          id, task_type, 
          customer:customers (id, name, phone, whatsapp_reminders_enabled)
        `)
        .eq("due_date", today)
        .eq("status", "pending")
        .in("task_type", ["review", "reorder", "recovery", "final_followup", "issue_resolution"])
        .limit(10);

      // 2. Recently Sent (Today's WhatsApp logs)
      const { data: sent } = await supabase
        .from("call_logs")
        .select("*, customer:customers(name)")
        .eq("outcome", "whatsapp")
        .gte("called_at", today + "T00:00:00Z")
        .order("called_at", { ascending: false })
        .limit(10);

      setPipeline({ 
        sent: (sent || []), 
        waiting: (waiting || []).filter((t: any) => t.customer?.whatsapp_reminders_enabled !== false) 
      });
    } catch (err) {
      console.error("Pipeline fetch error:", err);
    } finally {
      setFetchingPipeline(false);
    }
  }

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
      let productStr = "your items";
      let link = "https://cureforever.in/cart";

      if (task.task_type === "review") {
        template = settings.whatsapp_review_template || "Hi {{name}} 👋, thank you for ordering {{product}}! How was your experience? We'd love to hear your feedback. 🌿\n\nPlease leave us a review here: https://search.google.com/local/writereview?placeid=ChIJv5_GsCGRyzsR2_y1wjbi3Ck";
        productStr = order?.line_items?.[0]?.name || order?.line_items?.[0]?.title || "your previous order";
      } else if (task.task_type === "reorder") {
        template = settings.whatsapp_reorder_template || "Hi {{name}}! It's been a while since your last {{product}} order. Time for a refill? 💊 Use code REFILL10 for 10% off!";
        productStr = order?.line_items?.[0]?.name || "your previous order";
      } else if (task.task_type === "recovery") {
        template = settings.whatsapp_recovery_template || "Hi {{name}} 👋, we noticed you left some items in your cart! 🛒 Can we help you complete your purchase? Use code RECOVER5 for 5% off! 🌿";
        productStr = abandonedCart?.line_items?.[0]?.name || abandonedCart?.line_items?.[0]?.title || "your items";
        link = abandonedCart?.custom_meta?.ABANDONLINK || customer.custom_meta?.ABANDONLINK || link;
      } else if (task.task_type === "final_followup") {
        template = settings.whatsapp_final_template || "Hi {{name}}, just checking in one last time regarding your {{product}} journey. We're here if you need anything! 🙏";
        productStr = order?.line_items?.[0]?.name || "your previous order";
      } else if (task.task_type === "issue_resolution") {
        template = "Hi {{name}}, we noticed an issue with your recent order for {{product}}. Our team is reviewing it and will help resolve it quickly.";
        productStr = order?.line_items?.[0]?.name || "your recent order";
      }

      const msg = template
        .replace(/{{name}}/g, customer.name || "there")
        .replace(/{{product}}/g, productStr)
        .replace(/{{abandon_link}}/g, link)
        .replace(/{{order_no}}/g, order?.order_number || "your order");

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

  async function fetchAvailableProducts() {
    try {
      // Fetch unique products from the canonical orders table
      const { data: oData } = await supabase.from("orders").select("line_items");
      const allOrders = [...(oData || [])];
      const productsMap = new Map();

      allOrders.forEach(order => {
        const items = Array.isArray(order.line_items) ? order.line_items : [];
        items.forEach((item: any) => {
          const id = item.product_id || item.id || item.title || item.name;
          const name = item.title || item.name || item.product_name;
          if (id && name) productsMap.set(id, name);
        });
      });

      const products = Array.from(productsMap).map(([id, name]) => ({ id, name }));
      setAvailableProducts(products);
    } catch (err) {
      console.error("Error fetching unique products:", err);
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

        const productId = order.line_items?.[0]?.product_id || order.line_items?.[0]?.id || order.line_items?.[0]?.title;
        const override: any = overridesMap.get(productId);

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

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      let { error } = await supabase.from("settings").upsert(settings);
      if (error && (
        String(error.message || "").includes("shopify_client_id") || 
        String(error.message || "").includes("shopify_api_secret") ||
        String(error.message || "").includes("shopify_refresh_token")
      )) {
        // Backward-compatible save path for environments where migration isn't applied yet.
        const { 
          shopify_client_id, 
          shopify_token_expires_at, 
          shopify_api_secret, 
          shopify_refresh_token, 
          ...legacySettings 
        } = settings;
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
      
      toast.success("Settings saved and tasks aligned!");
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
      });
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

  const downloadOverrideTemplate = () => {
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
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Overrides");
    XLSX.writeFile(wb, "cureforever_override_template.xlsx");
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

  if (!hasPermission(profile, "manage_team")) {
    return <AccessDenied title="Settings Locked" desc="Only admins or users with management access can change settings." />;
  }

  return (
    <div className="animate-fade-in max-w-3xl">
      <PageHeader title="Settings" subtitle="Configure your CRM behaviour, integrations, and notifications" />

      {syncStatus.active && (
        <div className="mb-6 card p-4 border-[#2D1E6F]/20 bg-[#2D1E6F]/[0.02] shadow-sm animate-in slide-in-from-top-4 duration-500">
          <SyncProgressBar 
            progress={syncStatus.progress} 
            message={syncStatus.message} 
            isComplete={syncStatus.isComplete}
            error={syncStatus.error}
          />
        </div>
      )}

      <div className="flex border-b border-gray-200 mb-6 gap-0 overflow-x-auto">
        {[
          { key: "general", label: "General", icon: Sliders },
          { key: "notifications", label: "WhatsApp", icon: Bell },
          { key: "overrides", label: "Product Overrides", icon: Package },
          { key: "shopify", label: "Shopify", icon: ShoppingBag },
          { key: "shiprocket", label: "Shiprocket", icon: Package },
          { key: "database", label: "Danger Zone", icon: Database },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap",
              tab === t.key ? "border-[#2D1E6F] text-[#2D1E6F]" : "border-transparent text-gray-500 hover:text-gray-700"
            )}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* GENERAL */}
      {tab === "general" && (
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Follow-up Timing</h3>
            <p className="text-xs text-gray-400 mb-4">Days after delivery to trigger each follow-up call. <strong>Saving will automatically update existing tasks.</strong></p>
            
            {[
              { label: "Review call offset", field: "review_offset_days", desc: "Days after delivery to request a review", max: 30 },
              { label: "Reorder call offset", field: "reorder_offset_days", desc: "Days after delivery to prompt a reorder", max: 60 },
              { label: "Final follow-up offset", field: "final_offset_days", desc: "Last touchpoint before marking inactive", max: 90 },
              { label: "Inactive threshold", field: "inactive_threshold_days", desc: "Days without order to mark customer inactive", max: 180 },
            ].map(f => (
              <div key={f.field} className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0 gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium text-[#2D1E6F]">{f.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{f.desc}</div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={f.max} value={settings[f.field]} step={1}
                    onChange={e => setSettings({ ...settings, [f.field]: +e.target.value })}
                    className="w-32 accent-[#2D1E6F]" />
                  <div className="w-16 text-center">
                    <span className="text-lg font-bold text-[#2D1E6F]">{settings[f.field]}</span>
                    <span className="text-xs text-gray-400 ml-1">days</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving & Aligning..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {/* WHATSAPP */}
      {tab === "notifications" && (
        <div className="space-y-5">
            <div className={cn("space-y-6 transition-all", !settings.whatsapp_enabled && "opacity-40 pointer-events-none")}>
              
              {/* Meta Cloud API (Official) */}
              <div className="card overflow-hidden border-[#2D1E6F]/10 bg-gradient-to-br from-white to-[#2D1E6F]/5">
                <div className="px-5 py-3 bg-[#2D1E6F] text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">Official Meta Cloud API</h3>
                  </div>
                  <span className="text-[10px] font-black bg-white/20 text-white px-2 py-0.5 rounded border border-white/30">PREMIUM</span>
                </div>
                
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                       <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Cloud System Access Token</label>
                       <input 
                         type="password" 
                         value={settings.whatsapp_token || ""} 
                         onChange={e => setSettings({ ...settings, whatsapp_token: e.target.value })}
                         placeholder="EAAV..."
                         className="input font-mono text-xs" 
                       />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Phone Number ID</label>
                      <input 
                        type="text" 
                        value={settings.whatsapp_phone_id || ""} 
                        onChange={e => setSettings({ ...settings, whatsapp_phone_id: e.target.value })}
                        placeholder="123456789..."
                        className="input font-mono text-xs" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Meta App ID</label>
                      <input 
                        type="text" 
                        value={settings.whatsapp_app_id || ""} 
                        onChange={e => setSettings({ ...settings, whatsapp_app_id: e.target.value })}
                        placeholder="7890..."
                        className="input font-mono text-xs" 
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-blue-100/50">
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Webhook Configuration</label>
                    <p className="text-[10px] text-gray-400 mb-3 italic">Set these in Meta Dashboard &gt; Webhooks &gt; WhatsApp Business Account</p>
                    
                    <div className="space-y-3">
                      <div>
                        <div className="text-[9px] font-bold text-[#2D1E6F] mb-1">Callback URL</div>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            readOnly 
                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/whatsapp`}
                            className="input font-mono text-[10px] h-8 bg-gray-50 text-gray-500 cursor-default" 
                          />
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/whatsapp`);
                              toast.success("URL Copied!");
                            }}
                            className="px-2 border border-gray-200 rounded hover:bg-gray-50 text-gray-400 hover:text-[#2D1E6F] transition-colors"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-[#2D1E6F] mb-1">Verify Token</div>
                        <input 
                          type="text" 
                          value={settings.whatsapp_verify_token || ""} 
                          onChange={e => setSettings({ ...settings, whatsapp_verify_token: e.target.value })}
                          placeholder="MySecureToken123"
                          className="input font-mono text-[10px] h-8 bg-blue-50/30 border-blue-100" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* High Visibility QR Scanner (Only when pending) */}
              {!waStatus.ready && waStatus.qr && (
                <div className="card border-amber-200 bg-gradient-to-br from-amber-50/50 to-white overflow-hidden mb-6">
                  <div className="px-5 py-3 bg-amber-500 text-white flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">Action Required: Scan QR Code</h3>
                  </div>
                  <div className="p-8 text-center bg-white/40">
                    <p className="text-xs text-gray-600 mb-6 font-medium">Please scan this QR code with your WhatsApp app to enable the Local Bridge.</p>
                    <div className="inline-block p-4 bg-white rounded-2xl shadow-xl border border-amber-100 relative group">
                       <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                       <img src={waStatus.qr} alt="QR" className="w-48 h-48 relative z-10" />
                       {!waStatus.qr && <div className="w-48 h-48 flex items-center justify-center text-gray-300"><Loader2 className="w-8 h-8 animate-spin" /></div>}
                    </div>
                    <div className="mt-6 flex flex-col items-center gap-2">
                       <div className="flex items-center gap-2 text-[10px] text-amber-600 font-bold bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                          <WifiOff className="w-3 h-3" /> WAITING FOR DISCOVERY...
                       </div>
                       <button onClick={fetchStatus} className="text-[10px] text-gray-400 hover:text-[#2D1E6F] underline transition-colors">Not seeing a QR? Click here to refresh</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Legacy Bridge (Accordion) */}
              <details className="card border-gray-100 opacity-60">
                <summary className="px-5 py-3 text-xs font-bold text-gray-500 cursor-pointer hover:text-[#2D1E6F] transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Legacy Local Bridge (wa_server.js) Settings</span>
                  </div>
                  <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">FALLBACK</span>
                </summary>
                
                <div className="px-5 pb-5 pt-2 border-t border-gray-50 space-y-4">
                  {waStatus.ready ? (
                    <div className="p-4 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-800 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4" /> Connected
                      </div>
                      <button onClick={fetchStatus} className="text-[10px] text-blue-600 underline">Refresh Status</button>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-[10px] text-gray-400 italic">Technical settings below. Scanner is shown above when active.</div>
                  )}
                  
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Bridge Endpoint URL</label>
                    <input 
                      type="text" 
                      value={settings.whatsapp_bridge_url || ""} 
                      onChange={e => setSettings({ ...settings, whatsapp_bridge_url: e.target.value })}
                      placeholder="http://localhost:3001"
                      className="input font-mono text-[10px] h-9" 
                    />
                  </div>
                </div>
              </details>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Admin Phone (Reports)</label>
                  <input 
                    type="text" 
                    value={settings.whatsapp_admin_phone || ""} 
                    onChange={e => setSettings({ ...settings, whatsapp_admin_phone: e.target.value })}
                    placeholder="+91XXXXXXXXXX"
                    className="input font-mono text-xs" 
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Preferred Send Time</label>
                  <input 
                    type="time" 
                    value={settings.whatsapp_send_time || "10:00"} 
                    onChange={e => setSettings({ ...settings, whatsapp_send_time: e.target.value })}
                    className="input font-mono text-xs" 
                  />
                </div>
              </div>

              {/* Compact Status Bar */}
              <div className="pt-4 border-t border-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full animate-pulse", 
                      waStatus.ready ? "bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.5)]" : 
                      waStatus.state === "DISCONNECTED" ? "bg-rose-500" : "bg-amber-500")} />
                    <span className="text-xs font-semibold text-gray-700">
                      Status: <span className={cn(
                        waStatus.ready ? "text-blue-600" : 
                        waStatus.state === "DISCONNECTED" ? "text-rose-600" : "text-amber-600"
                      )}>{waStatus.ready ? "CONNECTED" : waStatus.state?.replace("_", " ") || "UNKNOWN"}</span>
                    </span>
                  </div>
                  {!waStatus.ready && (
                     <button onClick={fetchStatus} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors border border-blue-100 font-bold">
                        <RefreshCw className={cn("w-3 h-3 inline mr-1", saving && "animate-spin")} /> Retry Discovery
                     </button>
                  )}
                </div>
              </div>

              {/* Testing & Tools */}
              <div className="pt-6 mt-6 border-t border-gray-100">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Testing & Tools</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const res = await fetch("/api/cron/daily-digest?force=true", { method: "POST" });
                        const data = await res.json();
                        if (data.sent) toast.success("Summary sent to your WhatsApp!");
                        else toast.error(data.error || "Failed to send summary");
                      } catch (err: any) { toast.error("Connection error: " + err.message); }
                      finally { setSaving(false); }
                    }}
                    className="flex items-center justify-center gap-2 py-2 px-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded text-[11px] font-semibold transition-colors border border-gray-200"
                  >
                    <Send className="w-3 h-3" /> Send Daily Summary
                  </button>
                    <button 
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const res = await fetch("/api/cron/reorder-reminder?force=true", { method: "POST" });
                          const data = await res.json();
                          if (res.ok) toast.success(`Sent ${data.sent || 0} reorder reminders!`);
                          else toast.error(data.error || "Failed to run reminders");
                        } catch (err: any) { toast.error("Connection error: " + err.message); }
                        finally { setSaving(false); }
                      }}
                      className="flex items-center justify-center gap-2 py-2 px-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded text-[11px] font-semibold transition-colors border border-gray-200"
                    >
                      <RefreshCw className="w-3 h-3" /> Run Reorder Reminders
                    </button>
                    <button 
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const res = await fetch("/api/cron/recovery-reminder?force=true", { method: "POST" });
                          const data = await res.json();
                          if (res.ok) toast.success(`Sent ${data.sent || 0} recovery reminders!`);
                          else toast.error(data.error || "Failed to run reminders");
                        } catch (err: any) { toast.error("Connection error: " + err.message); }
                        finally { setSaving(false); }
                      }}
                      className="flex items-center justify-center gap-2 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded text-[11px] font-semibold transition-colors border border-blue-100"
                    >
                      <Send className="w-3 h-3" /> Run Recovery Reminders
                    </button>
                  <button 
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const res = await fetch("/api/cron/task-generator", { method: "POST" });
                        const data = await res.json();
                        toast.success(`Generated ${data.generated} new tasks!`);
                        fetchPipelineData();
                      } catch (err: any) { toast.error("Error: " + err.message); }
                      finally { setSaving(false); }
                    }}
                    className="flex items-center justify-center gap-2 py-2 px-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded text-[11px] font-semibold transition-colors border border-gray-200"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh Task Queue
                  </button>
                  <button 
                    onClick={handleRepairDates}
                    className="flex items-center justify-center gap-2 py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded text-[11px] font-semibold transition-colors border border-amber-100"
                  >
                    <AlertCircle className="w-3 h-3" /> Repair 1970 Dates
                  </button>
                </div>
              </div>

              {/* Automation Rules */}
              <div className="pt-8 mt-8 border-t border-gray-100">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Automation Rules</h4>
                <p className="text-[10px] text-gray-400 mb-6 italic">Enable these to send WhatsApp messages automatically when certain events occur. <strong>These will be sent instantly via the active bridge.</strong></p>
                
                <div className="space-y-4">
                  {[
                    { label: "Auto Welcome", field: "wa_auto_welcome", templateField: "wa_welcome_template", desc: "Sent when a new customer is added to CRM" },
                    { label: "Order Confirmation", field: "wa_auto_order_placed", templateField: "wa_order_placed_template", desc: "Sent when an order is placed" },
                    { label: "Out for Delivery / Transit", field: "wa_auto_order_transit", templateField: "wa_order_transit_template", desc: "Sent when order ships" },
                    { label: "Delivery Confirmation / Review", field: "wa_auto_order_delivered", templateField: "wa_order_delivered_template", desc: "Sent when order is marked delivered" },
                    { label: "Abandoned Cart Alert", field: "wa_auto_cart_abandoned", templateField: "wa_cart_abandoned_template", desc: "Sent after checkout abandonment" },
                    { label: "Refill / Reorder Reminder", field: "wa_auto_reorder", templateField: "wa_reorder_template", desc: "Sent automatically on the refill due date" },
                  ].map(rule => (
                    <div key={rule.field} className="card p-4 border-gray-100 bg-gray-50/30">
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex-1">
                          <div className="text-xs font-bold text-[#2D1E6F]">{rule.label}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{rule.desc}</div>
                        </div>
                        <button 
                          onClick={() => setSettings({ ...settings, [rule.field]: !settings[rule.field] })}
                          className="focus:outline-none transition-transform active:scale-95"
                        >
                          {settings[rule.field] ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-[#2D1E6F]/10 border border-[#2D1E6F]/20 rounded-full">
                              <ToggleRight className="w-4 h-4 text-[#2D1E6F]" />
                              <span className="text-[9px] font-black text-[#2D1E6F] uppercase">ACTIVE</span>
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
                        <div className="mt-4 animate-fade-in-down border-t border-[#2D1E6F]/5 pt-4">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-black text-[#2D1E6F]/40 uppercase tracking-widest">Message Content</label>
                              <div className="flex items-center gap-2">
                                <div className="text-[10px] font-bold text-gray-300 italic">Recommended:</div>
                                <div className="flex gap-1.5">
                                  {WA_PRESETS[rule.templateField]?.map((preset, idx) => (
                                    <button 
                                      key={idx}
                                      onClick={() => {
                                        setSettings({ ...settings, [rule.templateField]: preset });
                                        toast.success("Ready to use!");
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#2D1E6F]/10 rounded-lg text-[10px] font-bold text-[#2D1E6F] hover:bg-[#2D1E6F] hover:text-white hover:border-[#2D1E6F] transition-all shadow-sm hover:shadow-[#2D1E6F]/20 group"
                                    >
                                      <Send className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                                      {idx === 0 ? "Option A" : "Option B"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                            
                            <div className="relative group">
                              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#2D1E6F]/10 to-[#2D1E6F]/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                              <textarea 
                                value={settings[rule.templateField] || ""} 
                                onChange={e => setSettings({ ...settings, [rule.templateField]: e.target.value })}
                                className="relative w-full input text-xs min-h-[100px] font-medium leading-relaxed bg-white border-[#2D1E6F]/10 focus:border-[#2D1E6F] rounded-xl p-4 shadow-sm"
                                placeholder="Type your automated message..."
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
              <div className="pt-8 mt-8 border-t border-gray-100">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Task Follow-up Templates (Scheduled)</h4>
                
                <div className="space-y-6">
                  {[
                    { label: "Review Reminder", field: "whatsapp_review_template", metaField: "meta_review_name", desc: "Sent after delivery to request feedback" },
                    { label: "Reorder Reminder", field: "whatsapp_reorder_template", metaField: "meta_reorder_name", desc: "Sent for refill prompts" },
                    { label: "Abandoned Cart Recovery", field: "whatsapp_recovery_template", metaField: "meta_recovery_name", desc: "Sent to recover incomplete checkouts" },
                    { label: "Final Follow-up", field: "whatsapp_final_template", metaField: "meta_final_name", desc: "Last touchpoint for inactive customers" },
                  ].map(t => (
                    <div key={t.field} className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <div className="flex justify-between items-end mb-1.5">
                          <label className="text-xs font-bold text-gray-700">{t.label} (Legacy Text)</label>
                        </div>
                        <textarea 
                          value={settings[t.field] || ""} 
                          onChange={e => setSettings({ ...settings, [t.field]: e.target.value })}
                          className="input text-xs min-h-[80px] font-medium leading-relaxed bg-gray-50/50"
                          placeholder="Type your message here..."
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[#2D1E6F] mb-1.5 block">Official Meta Name</label>
                        <input 
                          type="text" 
                          value={settings[t.metaField] || ""} 
                          onChange={e => setSettings({ ...settings, [t.metaField]: e.target.value })}
                          placeholder="review_v1"
                          className="input font-mono text-[10px] bg-[#2D1E6F]/5 border-[#2D1E6F]/10" 
                        />
                        <p className="text-[9px] text-gray-400 mt-1.5">Must match the approved name in Meta Dashboard.</p>
                      </div>
                      <div className="col-span-3 h-px bg-gray-50 my-2" />
                    </div>
                  ))}

                  <div className="bg-[#2D1E6F]/5 border border-[#2D1E6F]/10 rounded-lg p-3">
                    <h5 className="text-[10px] font-bold text-[#2D1E6F] uppercase mb-2">Variables Guide</h5>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div className="text-[10px] text-[#2D1E6F]/80 flex justify-between"><span>{"{{name}}"}</span> <span className="text-[#2D1E6F]/50">Customer Name</span></div>
                      <div className="text-[10px] text-[#2D1E6F]/80 flex justify-between"><span>{"{{product}}"}</span> <span className="text-[#2D1E6F]/50">First Item Name</span></div>
                      <div className="text-[10px] text-[#2D1E6F]/80 flex justify-between"><span>{"{{abandon_link}}"}</span> <span className="text-[#2D1E6F]/50">Recovery URL</span></div>
                      <div className="text-[10px] text-[#2D1E6F]/80 flex justify-between"><span>{"{{order_no}}"}</span> <span className="text-[#2D1E6F]/50">Order Number</span></div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">Abandoned Cart Recovery Delay</label>
                    <div className="flex items-center gap-2">
                       <input 
                        type="number" 
                        step="0.01"
                        value={settings.recovery_delay_hours} 
                        onChange={e => setSettings({ ...settings, recovery_delay_hours: parseFloat(e.target.value) })}
                        className="input text-xs w-20" 
                      />
                      <span className="text-xs text-gray-400 font-medium">hours after abandonment </span>
                      {settings.recovery_delay_hours === 0.25 && <span className="text-[10px] bg-[#2D1E6F]/10 text-[#2D1E6F] px-1.5 py-0.5 rounded font-bold">15 MINS</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Automation Command Center */}
              <div className="pt-8 mt-8 border-t border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Automation Pipeline</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">Visibility into today's communication status</p>
                  </div>
                  <button onClick={fetchPipelineData} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-[#2D1E6F] transition-colors">
                    <RefreshCw className={cn("w-3.5 h-3.5", fetchingPipeline && "animate-spin")} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   {/* Column 1: Recently Sent */}
                   <div className="space-y-2">
                     <h5 className="text-[10px] font-bold text-gray-700 uppercase px-1">Recently Sent (Today)</h5>
                     <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                        {pipeline.sent.length === 0 ? (
                          <div className="text-[10px] text-gray-400 italic p-3 border border-dashed rounded text-center">No recent activity</div>
                        ) : pipeline.sent.map(log => (
                          <div key={log.id} className="p-2 bg-[#2D1E6F]/5 border border-[#2D1E6F]/10 rounded group transition-all hover:bg-[#2D1E6F]/10">
                            <div className="flex justify-between items-start">
                              <span className="text-[10px] font-bold text-[#2D1E6F] truncate max-w-[100px]">{log.customer?.name || "Customer"}</span>
                              <span className="text-[8px] text-[#2D1E6F]/60 font-mono">{new Date(log.called_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="text-[9px] text-[#2D1E6F]/80 truncate mt-0.5 line-clamp-1">{log.note}</div>
                          </div>
                        ))}
                     </div>
                   </div>

                   {/* Column 2: In Queue */}
                   <div className="space-y-2">
                     <h5 className="text-[10px] font-bold text-gray-700 uppercase px-1">In Queue (Waiting)</h5>
                     <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                        {pipeline.waiting.length === 0 ? (
                          <div className="text-[10px] text-gray-400 italic p-3 border border-dashed rounded text-center">Queue is empty</div>
                        ) : pipeline.waiting.map(task => {
                          const [h, m] = (settings.whatsapp_send_time || "10:00").split(":");
                          const now = new Date();
                          const target = new Date();
                          target.setHours(parseInt(h), parseInt(m), 0, 0);
                          const diffMs = target.getTime() - now.getTime();
                          const diffMin = Math.round(diffMs / 60000);
                          
                          let timeText = `Scheduled for ${settings.whatsapp_send_time || "10:00"}`;
                          let isOverdue = diffMs < 0;
                          
                          if (!isOverdue) {
                            const hours = Math.floor(diffMin / 60);
                            const mins = diffMin % 60;
                            timeText = `Sends in ${hours > 0 ? hours + "h " : ""}${mins}m`;
                          } else {
                            timeText = "Ready to send";
                          }

                          return (
                            <div key={task.id} className="flex gap-2 p-1 bg-white border border-[#2D1E6F]/20 rounded-2xl shadow-sm backdrop-blur-xl bg-[#2D1E6F]/[0.02] group hover:border-[#2D1E6F]/40 transition-all">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="text-[10px] font-bold text-gray-700 truncate max-w-[100px]">{task.customer?.name || "Customer"}</div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={cn("text-[8px] font-bold uppercase tracking-tight", isOverdue ? "text-[#2D1E6F]" : "text-gray-400")}>
                                      {timeText}
                                    </span>
                                    <span className="text-[8px] px-1 py-0.5 bg-gray-50 border border-gray-100 text-gray-400 rounded-full font-bold uppercase tracking-widest">{task.task_type.replace("_", " ")}</span>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => handleOpenManualWa(task)}
                                  className="p-1.5 bg-gray-50 hover:bg-[#2D1E6F] text-gray-400 hover:text-white rounded transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                                  title="Review & Send Now"
                                >
                                  <Send className="w-3 h-3" />
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

      {/* SHOPIFY */}
      {tab === "shopify" && (
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4 border-b border-gray-100 pb-2">Shopify Direct Bypass</h3>
            <p className="text-[10px] text-gray-400 mb-6 italic">Connect to Shopify Admin API to fetch unmasked customer contact details. Shopify data is never masked, making this the most reliable source for your CRM.</p>
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Store Domain</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={settings.shopify_store_domain || ""} 
                    onChange={e => setSettings({ ...settings, shopify_store_domain: e.target.value })}
                    placeholder="e.g. cureforever.myshopify.com"
                    className="input text-xs" 
                  />
                </div>
                <p className="text-[9px] text-gray-400 mt-1.5">Your official myshopify.com domain.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Admin API Access Token</label>
                <input 
                  type="password" 
                  value={settings.shopify_api_key || ""} 
                  onChange={e => setSettings({ ...settings, shopify_api_key: e.target.value })}
                  placeholder="shpat_••••••••••••••••••••••••"
                  className="input font-mono text-xs" 
                />
                <p className="text-[9px] text-gray-400 mt-1.5 leading-relaxed">Generated in Shopify Admin &gt; Settings &gt; App and sales channels &gt; Develop apps.<br/>Required scope: <strong>read_orders, read_customers</strong></p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">OAuth Client ID (Optional)</label>
                <input
                  type="text"
                  value={settings.shopify_client_id || ""}
                  onChange={e => setSettings({ ...settings, shopify_client_id: e.target.value })}
                  placeholder="For auto-refresh mode"
                  className="input font-mono text-xs"
                />
                <p className="text-[9px] text-gray-400 mt-1.5 leading-relaxed">Optional. Add with API Secret to auto-refresh short-lived Shopify tokens.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Client Secret (Required for Refresh)</label>
                <input
                  type="password"
                  value={settings.shopify_api_secret || ""}
                  onChange={e => setSettings({ ...settings, shopify_api_secret: e.target.value })}
                  placeholder="For auto-refresh mode"
                  className="input font-mono text-xs"
                />
                <p className="text-[9px] text-gray-400 mt-1.5 leading-relaxed">Saved in settings and used only for token refresh calls.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Refresh Token (Required for 24h Token Auto-Refresh)</label>
                <input
                  type="password"
                  value={settings.shopify_refresh_token || ""}
                  onChange={e => setSettings({ ...settings, shopify_refresh_token: e.target.value })}
                  placeholder="The persistent token used to get new access tokens"
                  className="input font-mono text-xs"
                />
                <p className="text-[9px] text-gray-400 mt-1.5 leading-relaxed">If your token expires every 24h, paste the most recent <strong>refresh_token</strong> from your Postman response here. The CRM will handle it automatically from then on.</p>
              </div>

              {settings.shopify_token_expires_at && (
                <div className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  Current token refreshes before: <span className="font-mono">{new Date(settings.shopify_token_expires_at).toLocaleString()}</span>
                </div>
              )}

              <div className="pt-6 border-t border-gray-50 flex items-center justify-between">
                <div>
                   <h4 className="text-sm font-semibold text-gray-700">Sentinel Unmasking Mode</h4>
                   <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">Automatically attempt Shopify lookup when masked data arrives.</p>
                </div>
                <div className="flex items-center gap-2">
                   <span className={cn("text-[9px] font-black px-2 py-0.5 rounded border transition-all", 
                     settings.shopify_api_key ? "bg-[#2D1E6F]/10 text-[#2D1E6F] border-[#2D1E6F]/20" : "bg-gray-50 text-gray-400 border-gray-100")}>
                     {settings.shopify_api_key ? "SENTINEL ACTIVE" : "INACTIVE"}
                   </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button className="btn-secondary" onClick={handleTestShopifyConnection} disabled={testingShopify}>
              {testingShopify ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {testingShopify ? "Testing..." : "Test Shopify Connection"}
            </button>
            <button 
              className="flex items-center justify-center gap-2 py-2 px-4 bg-[#2D1E6F] hover:bg-[#2D1E6F]/90 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
              onClick={() => startSyncStream("/api/sync/shopify")}
              disabled={saving || !settings.shopify_api_key}
            >
              <RefreshCw className={cn("w-4 h-4", syncStatus.active && "animate-spin")} /> Pull Shopify API
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save Shopify Settings"}
            </button>
          </div>
        </div>
      )}

      {/* SHIPROCKET */}
      {tab === "shiprocket" && (
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4 border-b border-gray-100 pb-2">Shiprocket API Credentials</h3>
            <p className="text-[10px] text-gray-400 mb-4 italic">Required for full order history and delivery status synchronization. Created in Shiprocket Panel &gt; Settings &gt; API.</p>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">API Email</label>
                <input 
                  type="email" 
                  value={settings.shiprocket_email || ""} 
                  onChange={e => setSettings({ ...settings, shiprocket_email: e.target.value })}
                  placeholder="e.g. api-user@yourdomain.com"
                  className="input text-xs" 
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">API Password</label>
                <input 
                  type="password" 
                  value={settings.shiprocket_password || ""} 
                  onChange={e => setSettings({ ...settings, shiprocket_password: e.target.value })}
                  placeholder="••••••••"
                  className="input text-xs" 
                />
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100">
               <div className="flex items-center justify-between mb-4">
                  <div>
                     <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                       <Zap className="w-4 h-4 text-orange-500 fill-orange-500" /> Fastrr Checkout (Automated Sync)
                     </h4>
                     <p className="text-[11px] text-gray-400 mt-1">Receive real-time abandoned cart data directly from your Fastrr/Shiprocket checkout panel.</p>
                  </div>
               </div>

               <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                     <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-orange-600">1</span>
                     </div>
                     <p className="text-[11px] text-orange-800 leading-relaxed">
                       Open your <strong>Shiprocket Dashboard</strong> &gt; <strong>Checkout</strong> (Solutions) &gt; <strong>Settings</strong> &gt; <strong>Webhooks</strong>.
                     </p>
                  </div>
                  <div className="flex items-start gap-3">
                     <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-orange-600">2</span>
                     </div>
                     <div className="flex-1">
                        <p className="text-[11px] text-orange-800">Add a new webhook for the <strong>"Abandoned Cart"</strong> event:</p>
                        <div className="mt-2 flex items-center gap-2 bg-white border border-orange-200 rounded-lg p-2">
                           <code className="text-[10px] text-orange-700 font-mono flex-1 break-all">
                             https://tenesha-unrecognizable-cristina.ngrok-free.dev/api/webhooks/shiprocket
                           </code>
                           <button 
                             onClick={() => {
                               const url = `https://tenesha-unrecognizable-cristina.ngrok-free.dev/api/webhooks/shiprocket`;
                               navigator.clipboard.writeText(url);
                               toast.success("Permanent URL copied!");
                             }}
                             className="p-1.5 hover:bg-orange-50 rounded text-orange-600 transition-colors"
                           >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                           </button>
                        </div>
                     </div>
                  </div>
                  <div className="flex items-start gap-3">
                     <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-orange-600">3</span>
                     </div>
                     <p className="text-[11px] text-orange-800 leading-relaxed">
                       Enter the Secret Header as: <code className="bg-white px-1.5 py-0.5 rounded border border-orange-200 font-mono">cureforever_shiprocket_sync_2026</code>
                     </p>
                  </div>
               </div>
            </div>

            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4 border-b border-gray-100 pb-2">Shiprocket Webhook Configuration</h3>
            
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mb-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <WifiOff className="w-12 h-12 text-amber-900" />
              </div>
              <div className="flex gap-3 relative z-10">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-900">Configure Shiprocket & Fastrr Webhooks</h4>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    1. Go to Shiprocket Dashboard &gt; Settings &gt; Webhooks.<br />
                    2. Add a new Webhook with the URL below using your secret token.<br />
                    3. Select events: <strong>Order Created, Shipment Created, Tracking Update</strong> AND <strong>Abandoned Cart</strong>.
                  </p>
                </div>
              </div>
            </div>

            {/* Localhost Warning */}
            {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-6 animate-pulse shadow-sm">
                <div className="flex gap-3">
                  <WifiOff className="w-5 h-5 text-red-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-black text-red-900 uppercase tracking-tighter">⚠️ Localhost Bottleneck Detected</h4>
                    <p className="text-[10px] text-red-700 mt-1 leading-relaxed font-bold">
                      Your CRM is running on <span className="underline italic">localhost</span>. Shiprocket's cloud servers **CANNOT** send real-time data to your computer.
                      <br /> 
                      <span className="text-red-900 font-black">Impact:</span> Real-time abandoned carts (like Aarti) will NOT appear automatically.
                      <br />
                      <span className="text-red-900 font-black">Fix:</span> Use <span className="bg-red-200 px-1 rounded">ngrok</span> or deploy to a public URL, then update Shiprocket.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Webhook Endpoint URL</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/shiprocket`}
                    className="input font-mono text-xs bg-gray-50 text-gray-500 cursor-default" 
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/shiprocket`);
                      toast.success("URL Copied!");
                    }}
                    className="p-2 border border-gray-200 rounded hover:bg-gray-50 text-gray-400 hover:text-[#2D1E6F] transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Webhook Secret Token (X-Shiprocket-Secret)</label>
                <input 
                  type="text" 
                  value={settings.shiprocket_webhook_secret || ""} 
                  onChange={e => setSettings({ ...settings, shiprocket_webhook_secret: e.target.value })}
                  placeholder="e.g. your_secret_token_here"
                  className="input font-mono text-xs" 
                />
                <p className="text-[10px] text-gray-400 mt-1">This token must match the one set in Shiprocket Dashboard for secure communication.</p>
              </div>

              <div className="pt-6 mt-6 border-t border-[#2D1E6F]/10 bg-[#2D1E6F]/5 -mx-5 px-5 pb-5 rounded-b-xl">
                 <div className="flex items-center gap-3 mb-4">
                    <ShoppingBag className="w-4 h-4 text-[#2D1E6F]" />
                    <h3 className="text-xs font-black text-[#2D1E6F] uppercase tracking-widest">Historical Fastrr Abandoned Sync</h3>
                 </div>
                 <div className="flex items-center gap-6">
                    <div className="flex-1">
                        <p className="text-[10px] text-[#2D1E6F]/70 leading-relaxed">
                        Export your abandoned cart list from <strong>Shiprocket Dashboard &gt; Checkout &gt; Abandoned Cart</strong> using the 'Download All' button, then upload it here to recover missing historical carts.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
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
                            className="flex items-center gap-2 py-3 px-6 bg-[#2D1E6F] hover:bg-[#2D1E6F]/90 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-[#2D1E6F]/10"
                            disabled={saving}
                        >
                            <Database className="w-4 h-4" /> Import Fastrr CSV
                        </button>
                    </div>
                 </div>
              </div>

              <div className="pt-6 mt-6 border-t border-gray-100">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                     <div>
                        <h4 className="text-sm font-semibold text-gray-700">Pull Shiprocket Data (Orders & Customers)</h4>
                        <p className="text-xs text-gray-400 mt-0.5">Contact Shiprocket API directly to pull ALL historical orders, abandoned carts, and missing identities.</p>
                     </div>
                      <button 
                        onClick={() => startSyncStream("/api/sync/shiprocket")}
                        className="flex items-center justify-center gap-2 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-bold transition-all shadow-sm shrink-0"
                        disabled={saving}
                      >
                        <RefreshCw className={cn("w-4 h-4", syncStatus.active && "animate-spin")} /> Pull Shiprocket API
                      </button>
                  </div>
                  
                  <div className="flex items-center justify-between border-t border-gray-50 pt-6">
                     <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2">
                           <h4 className="text-sm font-bold text-gray-700">Global Customer Unmasking</h4>
                           {maskedCount !== null && maskedCount > 0 && (
                             <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 text-[9px] font-black rounded border border-rose-100 flex items-center gap-1">
                               <AlertCircle className="w-2.5 h-2.5" /> {maskedCount} MASKED
                             </span>
                           )}
                           {maskedCount === 0 && (
                             <span className="px-1.5 py-0.5 bg-[#2D1E6F]/10 text-[#2D1E6F] text-[9px] font-black rounded border border-[#2D1E6F]/20 flex items-center gap-1">
                               <CheckCircle2 className="w-2.5 h-2.5" /> DATABASE CLEAN
                             </span>
                           )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                          Attempts to recover real phone numbers from Abandoned Carts, Shiprocket API, and Webhook History. 
                          <span className="text-[#2D1E6F] font-semibold block mt-0.5 italic">Duplicate records will be automatically merged.</span>
                        </p>
                     </div>
                     <button 
                      onClick={() => {
                        if (confirm("This will attempt to resolve real phone numbers for all masked customers. This run will process up to 100 records. Continue?")) {
                          startSyncStream("/api/sync/unmask");
                        }
                      }}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2.5 px-5 rounded-lg text-xs font-bold transition-all shadow-sm shrink-0",
                        maskedCount && maskedCount > 0 
                          ? "bg-[#2D1E6F] text-white hover:bg-[#2D1E6F]/90 shadow-[#2D1E6F]/10" 
                          : "bg-gray-50 text-gray-400 cursor-not-allowed"
                      )}
                      disabled={syncStatus.active || maskedCount === 0}
                     >
                       {syncStatus.active ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                       {syncStatus.active ? "Processing..." : "Run Unmask Tool"}
                     </button>
                  </div>
                  
                  <div className="flex items-center justify-between border-t border-gray-50 pt-4">
                     <div>
                        <h4 className="text-sm font-semibold text-gray-700">Process Local Webhook Queue</h4>
                        <p className="text-xs text-gray-400 mt-0.5">Force process any pending webhook logs and generate tasks dynamically.</p>
                     </div>
                     <button 
                      onClick={() => startSyncStream("/api/sync/all")}
                      className="flex items-center justify-center gap-2 py-2 px-4 bg-[#2D1E6F] hover:bg-[#2D1E6F]/90 text-white rounded-lg text-xs font-bold transition-all shadow-sm shrink-0"
                      disabled={saving}
                     >
                       <RefreshCw className={cn("w-4 h-4", syncStatus.active && "animate-spin")} /> Process Webhook Queue
                     </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Manual Dispatch Modal */}
      <Modal open={manualWaModal} onClose={() => setManualWaModal(false)} title={`Manual Dispatch — ${manualWaCustomerName}`}
        footer={<>
          <button className="btn-secondary" onClick={() => setManualWaModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleManualSend} disabled={sendingManualWa}>
            {sendingManualWa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sendingManualWa ? "Sending..." : "Send Immediately"}
          </button>
        </>}
      >
        <div className="space-y-4 py-2">
          <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg flex gap-3">
             <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
             <div className="text-[11px] text-amber-800 leading-relaxed font-medium">
                This will send the message below instantly and mark the customer's task as <strong>Done</strong>. Your changes here will only affect this single message.
             </div>
          </div>
          
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Personalized Message</label>
            <textarea 
              className="input text-xs h-32 leading-relaxed" 
              value={manualWaMessage} 
              onChange={e => setManualWaMessage(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Attachment (Optional)</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded hover:border-[#2D1E6F] hover:bg-[#2D1E6F]/5 transition-all cursor-pointer text-gray-500 hover:text-[#2D1E6F]">
                <Paperclip className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{manualWaFile ? "Change File" : "Choose File"}</span>
                <input type="file" className="hidden" onChange={e => setManualWaFile(e.target.files?.[0] || null)} />
              </label>
              {manualWaFile && (
                <div className="text-[10px] bg-[#2D1E6F]/5 text-[#2D1E6F] font-bold px-2 py-1 rounded flex items-center gap-2">
                  <span className="truncate max-w-[150px]">{manualWaFile.name}</span>
                  <button onClick={() => setManualWaFile(null)} className="p-0.5 hover:bg-[#2D1E6F]/10 rounded-full"><X className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* OVERRIDES */}
      {tab === "overrides" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
             <div>
                <h4 className="text-xs font-bold text-gray-700">Product Lifecycle Management</h4>
                <p className="text-[10px] text-gray-500">Configure offsets and course durations per product.</p>
             </div>
             <div className="flex gap-2">
                <button 
                  className="btn-secondary py-2 px-3 text-[10px] h-9" 
                  onClick={() => downloadOverrideTemplate()}
                >
                  <Package className="w-3.5 h-3.5" /> Template
                </button>
                <div className="relative">
                  <button 
                    className="btn-secondary py-2 px-3 text-[10px] h-9" 
                    onClick={() => document.getElementById('bulk-import')?.click()}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Bulk Import
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
                  className="btn-primary py-2 px-4 text-xs h-9" 
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
                  <Plus className="w-4 h-4" /> Add Override
                </button>
             </div>
          </div>

          {overrides.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">
              No product overrides configured.
            </div>
          ) : overrides.map(o => (
            <div key={o.id} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-sm font-semibold text-[#2D1E6F]">{o.product_name}</div>
                  <div className="text-[10px] text-gray-400 font-mono">ID: {o.shopify_product_id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary text-xs py-1 px-2 h-7" onClick={() => {
                    setEditingId(o.id);
                    setNewOverride({
                      shopify_product_id: o.shopify_product_id,
                      product_name: o.product_name,
                      review_offset_days: o.review_offset_days,
                      reorder_offset_days: o.reorder_offset_days,
                      final_offset_days: o.final_offset_days,
                      course_duration_days: o.course_duration_days || 30,
                      usage_notes: o.usage_notes || "",
                      is_priority: o.is_priority || false,
                      upsell_product_name: o.upsell_product_name || ""
                    });
                    setShowAddOverride(true);
                  }}>
                    <Sliders className="w-3 h-3" /> Edit
                  </button>
                  <button className="btn-danger text-xs py-1 px-2 h-7" onClick={async () => {
                     await supabase.from("product_overrides").delete().eq("id", o.id);
                     await recalculateTasks(settings);
                     fetchSettings();
                     toast.success("Override deleted and tasks aligned");
                  }}>
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Review offset", value: o.review_offset_days },
                  { label: "Reorder offset", value: o.reorder_offset_days },
                  { label: "Final offset", value: o.final_offset_days },
                  { label: "Course Duration", value: o.course_duration_days },
                ].map(f => (
                  <div key={f.label}>
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">{f.label}</label>
                    <div className="flex items-center gap-1 text-xs font-semibold text-gray-700">{f.value || 0} days</div>
                  </div>
                ))}
              </div>
              
              {(o.usage_notes || o.upsell_product_name || o.is_priority) && (
                <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-2 gap-4">
                  {o.usage_notes && (
                    <div className="col-span-2">
                       <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Usage Notes</label>
                       <p className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded italic border border-gray-100">"{o.usage_notes}"</p>
                    </div>
                  )}
                  {o.is_priority && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">High Priority Boost (+50)</span>
                    </div>
                  )}
                  {o.upsell_product_name && (
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-3 h-3 text-[#2D1E6F]" />
                      <span className="text-[10px] font-bold text-[#2D1E6F] uppercase tracking-wider">Upsell: {o.upsell_product_name}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}


      {/* DANGER ZONE */}
      {tab === "database" && (
        <div className="space-y-5">
          <div className="card p-0 border-rose-200 overflow-hidden">
            <div className="bg-rose-50 px-5 py-3 border-b border-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <h3 className="text-sm font-bold text-rose-900 uppercase tracking-wider">Danger Zone</h3>
            </div>
            <div className="p-5 space-y-6">
              {[
                { type: "customers", label: "Clear All Customers", desc: "Permanently delete all customers, their orders, and tasks." },
                { type: "orders", label: "Clear All Orders", desc: "Remove internal order history." },
                { type: "tasks", label: "Clear All Tasks", desc: "Delete all schedules and logs." },
                { type: "abandoned_carts", label: "Clear All Abandoned Carts", desc: "Remove all potential revenue records." },
              ].map(d => (
                <div key={d.type} className="flex items-center justify-between gap-4 pt-4 first:pt-0 border-t first:border-0 border-gray-100">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{d.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{d.desc}</div>
                  </div>
                  <button onClick={() => setConfirmModal({ open: true, type: d.type as any })} className="btn-danger whitespace-nowrap">
                    Clear {d.type}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Override Modal */}
      <Modal open={showAddOverride} onClose={() => setShowAddOverride(false)} title={editingId ? "Edit Product Override" : "Add Product Override"} 
        footer={<>
          <button className="btn-secondary" onClick={() => setShowAddOverride(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleAddOverride} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
            {saving ? "Aligning Tasks..." : (editingId ? "Save Changes" : "Add Override")}
          </button>
        </>}
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Select Product</label>
            <select 
              className="input text-xs disabled:opacity-50 disabled:bg-gray-50"
              disabled={!!editingId}
              value={newOverride.shopify_product_id}
              onChange={e => {
                const p = availableProducts.find(x => x.id === e.target.value);
                setNewOverride({ ...newOverride, shopify_product_id: e.target.value, product_name: p?.name || "" });
              }}
            >
              <option value="">-- Choose Product --</option>
              {/* Add the current editing product to options if it's missing from availableProducts */}
              {editingId && !availableProducts.find(p => p.id === newOverride.shopify_product_id) && (
                <option value={newOverride.shopify_product_id}>{newOverride.product_name}</option>
              )}
              {availableProducts.sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {editingId && <p className="text-[9px] text-gray-400 mt-1 italic">Note: Product cannot be changed while editing an existing override.</p>}
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Review (Days)</label>
              <input type="number" className="input text-xs" value={newOverride.review_offset_days} onChange={e => setNewOverride({ ...newOverride, review_offset_days: +e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Reorder (Days)</label>
              <input type="number" className="input text-xs" value={newOverride.reorder_offset_days} onChange={e => setNewOverride({ ...newOverride, reorder_offset_days: +e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Final (Days)</label>
              <input type="number" className="input text-xs" value={newOverride.final_offset_days} onChange={e => setNewOverride({ ...newOverride, final_offset_days: +e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#2D1E6F] uppercase block mb-1">Course Duration</label>
              <input type="number" className="input text-xs border-[#2D1E6F]/20 bg-[#2D1E6F]/5" value={newOverride.course_duration_days} onChange={e => setNewOverride({ ...newOverride, course_duration_days: +e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Usage Notes (Visible to Agent)</label>
                <textarea 
                  value={newOverride.usage_notes}
                  onChange={e => setNewOverride({...newOverride, usage_notes: e.target.value})}
                  className="input text-[10px] h-16 resize-none"
                  placeholder="e.g. Take 1 tab daily after breakfast"
                />
             </div>
             <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Upsell Suggestion</label>
                <input 
                  type="text"
                  value={newOverride.upsell_product_name}
                  onChange={e => setNewOverride({...newOverride, upsell_product_name: e.target.value})}
                  className="input text-[10px]"
                  placeholder="e.g. Liver Detox Tabs"
                />
                
                <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-100">
                    <div>
                      <div className="text-[9px] font-bold text-gray-700 uppercase">High Priority Boost</div>
                      <div className="text-[8px] text-gray-400 italic">Score tasks +50 higher</div>
                    </div>
                    <button 
                      onClick={() => setNewOverride({...newOverride, is_priority: !newOverride.is_priority})}
                      className={cn("p-1 rounded transition-all", newOverride.is_priority ? "text-[#2D1E6F] bg-[#2D1E6F]/10" : "text-gray-300 bg-white border border-gray-100")}
                    >
                      {newOverride.is_priority ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                </div>
             </div>
          </div>

          <div className="p-3 bg-amber-50 text-amber-700 text-[10px] rounded border border-amber-100 flex gap-2">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            <p><strong>Heads up:</strong> Saving this will instantly update the due dates for all pending tasks for this product based on the new timing.</p>
          </div>
        </div>
      </Modal>

      {/* Clear Confirmation Modal */}
      <Modal open={confirmModal.open} onClose={() => setConfirmModal({ open: false, type: null })} title={`Clear all ${confirmModal.type}?`}
        footer={<>
          <button className="btn-secondary" onClick={() => setConfirmModal({ open: false, type: null })}>Cancel</button>
          <button className="btn-danger" onClick={() => confirmModal.type && handleClearData(confirmModal.type)} disabled={isDeleting}>
            {isDeleting ? "Clearing..." : "Yes, Delete Everything"}
          </button>
        </>}
      >
        <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-lg flex gap-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p>This action is <strong>irreversible</strong>.</p>
        </div>
      </Modal>
    </div>
  );
}

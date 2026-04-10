"use client";
import { useState, useEffect } from "react";
import { Save, RefreshCw, Trash2, ToggleLeft, ToggleRight, Bell, Sliders, Package, Database, AlertCircle, Loader2, Plus, Search, X, Send, Paperclip, ShieldCheck, Zap } from "lucide-react";
import { PageHeader, Modal } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type Tab = "general" | "notifications" | "overrides" | "shiprocket" | "database";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000000";

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
    whatsapp_provider: "local",
    ultramsg_instance_id: "",
    ultramsg_token: "",
    whatsapp_review_template: "",
    whatsapp_reorder_template: "",
    whatsapp_recovery_template: "",
    whatsapp_final_template: "",
    recovery_delay_hours: 24,
    whatsapp_send_time: "10:00"
  });
  const [pipeline, setPipeline] = useState<{ sent: any[], waiting: any[] }>({ sent: [], waiting: [] });
  const [fetchingPipeline, setFetchingPipeline] = useState(false);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [availableProducts, setAvailableProducts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [newOverride, setNewOverride] = useState({
    shopify_product_id: "",
    product_name: "",
    review_offset_days: 0,
    reorder_offset_days: 0,
    final_offset_days: 0
  });

  const [confirmModal, setConfirmModal] = useState<{ open: boolean; type: "customers" | "orders" | "tasks" | "abandoned_carts" | null }>({ open: false, type: null });
  const [waStatus, setWaStatus] = useState<{ ready?: boolean; state?: string; error?: string }>({ state: "INITIALISING" });
  const [manualWaModal, setManualWaModal] = useState(false);
  const [manualWaTaskId, setManualWaTaskId] = useState("");
  const [manualWaCustomerName, setManualWaCustomerName] = useState("");
  const [manualWaMessage, setManualWaMessage] = useState("");
  const [manualWaFile, setManualWaFile] = useState<File | null>(null);
  const [sendingManualWa, setSendingManualWa] = useState(false);

  const supabase = createClient();

  const fetchStatus = async () => {
    try {
      const { data: settings } = await supabase.from("settings").select("*").single();
      const provider = settings?.whatsapp_provider || "local";
      
      const endpoint = provider === "cloud" ? "/api/whatsapp/cloud-status" : "/api/whatsapp/status";
      const res = await fetch(endpoint);
      const data = await res.json();
      setWaStatus(data);
    } catch (err) {
      setWaStatus({ state: "DISCONNECTED" });
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Order' }, () => fetchAvailableProducts())
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
    } catch (err) {
      console.error("Error fetching settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPipelineData() {
    setFetchingPipeline(true);
    try {
      const today = new Date().toLocaleDateString("en-CA");
      
      // 1. Waiting Queue (Today's pending reminders)
      const { data: waiting } = await supabase
        .from("tasks")
        .select(`
          id, task_type, 
          customer:customers (id, name, phone, whatsapp_reminders_enabled)
        `)
        .eq("due_date", today)
        .eq("status", "pending")
        .in("task_type", ["review", "reorder", "recovery", "final_followup"])
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
      // Fetch unique products from both "orders" (standard) and "Order" (legacy)
      const { data: oData } = await supabase.from("orders").select("line_items");
      const { data: legacyData } = await supabase.from("Order").select("line_items");
      
      const allOrders = [...(oData || []), ...(legacyData || [])];
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
      const { error } = await supabase.from("settings").upsert(settings);
      if (error) throw error;
      
      // Auto-recalculate tasks for global alignment
      await recalculateTasks(settings);
      
      toast.success("Settings saved and tasks aligned!");
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddOverride() {
    if (!newOverride.shopify_product_id) return toast.error("Please select a product");
    setSaving(true);
    try {
      const { error } = await supabase.from("product_overrides").upsert({
        shopify_product_id: newOverride.shopify_product_id,
        product_name: newOverride.product_name,
        review_offset_days: newOverride.review_offset_days || null,
        reorder_offset_days: newOverride.reorder_offset_days || null,
        final_offset_days: newOverride.final_offset_days || null,
      });
      if (error) throw error;
      
      // Alignment also happens for overrides
      await recalculateTasks(settings);
      
      toast.success("Override saved and tasks aligned!");
      setShowAddOverride(false);
      setNewOverride({ shopify_product_id: "", product_name: "", review_offset_days: 0, reorder_offset_days: 0, final_offset_days: 0 });
      fetchSettings();
    } catch (err: any) {
      toast.error("Failed to add override: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearData(type: "customers" | "orders" | "tasks" | "abandoned_carts") {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from(type).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      toast.success(`All ${type} cleared successfully`);
      setConfirmModal({ open: false, type: null });
    } catch (err: any) {
      toast.error(`Failed to clear ${type}: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-3xl">
      <PageHeader title="Settings" subtitle="Configure your CRM behaviour, integrations, and notifications" />

      <div className="flex border-b border-gray-200 mb-6 gap-0 overflow-x-auto">
        {[
          { key: "general", label: "General", icon: Sliders },
          { key: "notifications", label: "WhatsApp", icon: Bell },
          { key: "overrides", label: "Product Overrides", icon: Package },
          { key: "shiprocket", label: "Shiprocket", icon: Package },
          { key: "database", label: "Danger Zone", icon: Database },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap",
              tab === t.key ? "border-forest text-forest" : "border-transparent text-gray-500 hover:text-gray-700"
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
                  <div className="text-sm font-medium text-forest">{f.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{f.desc}</div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={f.max} value={settings[f.field]} step={1}
                    onChange={e => setSettings({ ...settings, [f.field]: +e.target.value })}
                    className="w-32 accent-forest" />
                  <div className="w-16 text-center">
                    <span className="text-lg font-bold text-forest">{settings[f.field]}</span>
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
            <div className="flex items-center gap-4 mb-6 p-1 bg-gray-50 rounded-xl border border-gray-100">
              <button 
                onClick={() => setSettings({ ...settings, whatsapp_provider: "local" })}
                className={cn("flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all", 
                  settings.whatsapp_provider === "local" ? "bg-white text-forest shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Local Bridge (Local PC)
              </button>
              <button 
                onClick={() => setSettings({ ...settings, whatsapp_provider: "cloud" })}
                className={cn("flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all", 
                  settings.whatsapp_provider === "cloud" ? "bg-white text-forest shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Cloud Instance (Scan & Go)
              </button>
            </div>

            <div className={cn("space-y-4 transition-all", !settings.whatsapp_enabled && "opacity-40 pointer-events-none")}>
              
              {settings.whatsapp_provider === "local" ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-xs font-bold text-gray-700">WhatsApp Bridge URL</label>
                      {typeof window !== "undefined" && window.location.hostname !== "localhost" && settings.whatsapp_bridge_url?.includes("localhost") && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md border border-rose-100 animate-pulse">
                          <ShieldCheck className="w-3 h-3" />
                          <span className="text-[10px] font-bold">Cloud-to-Local Warning</span>
                        </div>
                      )}
                    </div>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-forest transition-colors">
                        <Database className="w-4 h-4" />
                      </div>
                      <input 
                        type="text" 
                        value={settings.whatsapp_bridge_url || ""} 
                        onChange={e => setSettings({ ...settings, whatsapp_bridge_url: e.target.value })}
                        placeholder="http://localhost:3001"
                        className="input pl-10 font-mono text-xs h-11 bg-gray-50/50 border-gray-200 focus:bg-white transition-all shadow-sm" 
                      />
                    </div>
                  </div>

                  {/* Cloud connectivity guide */}
                  {typeof window !== "undefined" && window.location.hostname !== "localhost" && (
                    <div className="bg-forest rounded-2xl p-5 border border-white/10 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-lime/10 rounded-full blur-2xl group-hover:bg-lime/20 transition-all" />
                      <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-lime/10 flex items-center justify-center border border-lime/20">
                            <ShieldCheck className="w-5 h-5 text-lime" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white">Tunnel Required for Local Bridge</h4>
                            <p className="text-[10px] text-white/40">Bridge the gap between Vercel and your local machine</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <p className="text-xs text-white/60 leading-relaxed">
                            Since your CRM is live on Vercel, it cannot reach your <code className="text-lime px-1 rounded">localhost</code>. 
                            Use the **Cloud Instance** option to skip this setup entirely.
                          </p>

                          <div className="grid grid-cols-1 gap-3">
                            <div className="bg-black/40 rounded-xl p-3 border border-white/5">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[9px] font-bold text-white/30 tracking-widest uppercase">Start Ngrok Tunnel</span>
                              </div>
                              <code className="text-xs text-lime font-mono block select-all cursor-pointer bg-black/20 p-2 rounded-lg border border-lime/10 hover:border-lime/30 transition-all">
                                ngrok http 3001
                              </code>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-700">Instance ID</label>
                      <input 
                        type="text" 
                        value={settings.ultramsg_instance_id || ""} 
                        onChange={e => setSettings({ ...settings, ultramsg_instance_id: e.target.value })}
                        placeholder="instance12345"
                        className="input font-mono text-xs h-11 bg-gray-50/50 border-gray-200 focus:bg-white transition-all shadow-sm" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-700">API Token</label>
                      <input 
                        type="password" 
                        value={settings.ultramsg_token || ""} 
                        onChange={e => setSettings({ ...settings, ultramsg_token: e.target.value })}
                        placeholder="••••••••••••"
                        className="input font-mono text-xs h-11 bg-gray-50/50 border-gray-200 focus:bg-white transition-all shadow-sm" 
                      />
                    </div>
                  </div>

                  <div className="bg-forest rounded-2xl p-5 border border-white/10 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-lime/10 rounded-full blur-2xl group-hover:bg-lime/20 transition-all" />
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-lime/10 flex items-center justify-center border border-lime/20">
                          <Zap className="w-5 h-5 text-lime" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">Scan & Go Cloud Mode</h4>
                          <p className="text-[10px] text-white/40">Professional automation without a local PC</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3">
                          <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-4">
                            <div className="flex items-start gap-3">
                              <div className="w-5 h-5 rounded-full bg-lime text-forest flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</div>
                              <p className="text-[10px] text-white/60">Create an account at <a href="https://ultramsg.com" target="_blank" className="text-lime underline">ultramsg.com</a></p>
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="w-5 h-5 rounded-full bg-lime text-forest flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">2</div>
                              <p className="text-[10px] text-white/60">Scan the QR code to connect your WhatsApp session to their cloud server.</p>
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="w-5 h-5 rounded-full bg-lime text-forest flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">3</div>
                              <p className="text-[10px] text-white/60">Copy your <b>Instance ID</b> and <b>Token</b> into the fields above.</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
                          <span className="text-[10px] font-bold text-lime/60 uppercase tracking-widest leading-none">Cloud Native Engine Active</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

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

              {/* Status Indicator */}
              <div className="pt-4 border-t border-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full animate-pulse", 
                      waStatus.ready ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
                      waStatus.state === "DISCONNECTED" ? "bg-rose-500" : "bg-amber-500")} />
                    <span className="text-xs font-semibold text-gray-700">
                      Bridge Status: <span className={cn(
                        waStatus.ready ? "text-emerald-600" : 
                        waStatus.state === "DISCONNECTED" ? "text-rose-600" : "text-amber-600"
                      )}>{waStatus.state?.replace("_", " ") || "UNKNOWN"}</span>
                    </span>
                    <button 
                      onClick={async () => {
                        const res = await fetch("/api/whatsapp/restart", { method: "POST" });
                        const data = await res.json();
                        if (data.ok) {
                          toast.success("Restarting bridge...");
                          setTimeout(fetchStatus, 2000);
                        } else {
                          toast.error(data.error || "Failed to restart");
                        }
                      }}
                      className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-rose-500"
                      title="Reset Connection (Restart Bridge)"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={() => {
                        fetchStatus();
                        toast.success("Syncing status...");
                      }}
                      className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-forest"
                      title="Sync Status"
                    >
                      <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                    </button>
                  </div>
                  {waStatus.state === "QR_PENDING" && (
                    <a href="http://localhost:3001/qr" target="_blank" className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-100 transition-colors font-bold uppercase tracking-wider">
                      Scan QR Code
                    </a>
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
                      className="flex items-center justify-center gap-2 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded text-[11px] font-semibold transition-colors border border-emerald-100"
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

              {/* Message Templates */}
              <div className="pt-8 mt-8 border-t border-gray-100">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Message Templates</h4>
                
                <div className="space-y-6">
                  {[
                    { label: "Review Reminder", field: "whatsapp_review_template", desc: "Sent a few days after delivery to request feedback" },
                    { label: "Reorder Reminder", field: "whatsapp_reorder_template", desc: "Sent when customer is likely running low on product" },
                    { label: "Abandoned Cart Recovery", field: "whatsapp_recovery_template", desc: "Sent to recover incomplete checkouts" },
                    { label: "Final Follow-up", field: "whatsapp_final_template", desc: "Last touchpoint for inactive customers" },
                  ].map(t => (
                    <div key={t.field}>
                      <div className="flex justify-between items-end mb-1.5">
                        <div>
                          <label className="text-xs font-bold text-gray-700">{t.label}</label>
                          <div className="text-[10px] text-gray-400">{t.desc}</div>
                        </div>
                      </div>
                      <textarea 
                        value={settings[t.field] || ""} 
                        onChange={e => setSettings({ ...settings, [t.field]: e.target.value })}
                        className="input text-xs min-h-[80px] font-medium leading-relaxed bg-gray-50/50"
                        placeholder="Type your message here..."
                      />
                    </div>
                  ))}

                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3">
                    <h5 className="text-[10px] font-bold text-emerald-800 uppercase mb-2">Variables Guide</h5>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div className="text-[10px] text-emerald-700 flex justify-between"><span>{"{{name}}"}</span> <span className="text-emerald-500/70">Customer Name</span></div>
                      <div className="text-[10px] text-emerald-700 flex justify-between"><span>{"{{product}}"}</span> <span className="text-emerald-500/70">First Item Name</span></div>
                      <div className="text-[10px] text-emerald-700 flex justify-between"><span>{"{{abandon_link}}"}</span> <span className="text-emerald-500/70">Recovery URL</span></div>
                      <div className="text-[10px] text-emerald-700 flex justify-between"><span>{"{{order_no}}"}</span> <span className="text-emerald-500/70">Order Number</span></div>
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
                      {settings.recovery_delay_hours === 0.25 && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">15 MINS</span>}
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
                  <button onClick={fetchPipelineData} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-emerald-600 transition-colors">
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
                          <div key={log.id} className="p-2 bg-emerald-50/50 border border-emerald-100 rounded group transition-all hover:bg-emerald-50">
                            <div className="flex justify-between items-start">
                              <span className="text-[10px] font-bold text-emerald-800 truncate max-w-[100px]">{log.customer?.name || "Customer"}</span>
                              <span className="text-[8px] text-emerald-400 font-mono">{new Date(log.called_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="text-[9px] text-emerald-600/80 truncate mt-0.5 line-clamp-1">{log.note}</div>
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
                            <div key={task.id} className="p-2 bg-white border border-gray-100 rounded shadow-sm group hover:border-emerald-200 transition-all">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="text-[10px] font-bold text-gray-700 truncate max-w-[100px]">{task.customer?.name || "Customer"}</div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={cn("text-[8px] font-bold uppercase tracking-tight", isOverdue ? "text-emerald-600" : "text-gray-400")}>
                                      {timeText}
                                    </span>
                                    <span className="text-[8px] px-1 py-0.5 bg-gray-50 border border-gray-100 text-gray-400 rounded-full font-bold uppercase tracking-widest">{task.task_type.replace("_", " ")}</span>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => handleOpenManualWa(task)}
                                  className="p-1.5 bg-gray-50 hover:bg-emerald-600 text-gray-400 hover:text-white rounded transition-all opacity-0 group-hover:opacity-100 shadow-sm"
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

            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4 border-b border-gray-100 pb-2">Shiprocket Webhook Configuration</h3>
            
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mb-6">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-900">How to setup real-time sync</h4>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    1. Go to Shiprocket Dashboard &gt; Settings &gt; Webhooks.<br />
                    2. Add a new Webhook with the URL and Secret below.<br />
                    3. Select events: <strong>Order Created, Shipment Created, Tracking Update</strong>.
                  </p>
                </div>
              </div>
            </div>

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
                    className="p-2 border border-gray-200 rounded hover:bg-gray-50 text-gray-400 hover:text-forest transition-colors"
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

              <div className="pt-6 mt-6 border-t border-gray-100">
                <div className="flex items-center justify-between mb-4">
                   <div>
                      <h4 className="text-sm font-semibold text-gray-700">Manual Sync Controls</h4>
                      <p className="text-xs text-gray-400 mt-0.5">Force a full sync of all pending logs and tasks</p>
                   </div>
                   <button 
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const res = await fetch("/api/sync/all", { method: "POST" });
                        const data = await res.json();
                        if (data.success) {
                          toast.success(`Sync Complete!\nProcessed: ${data.report.logs.processed} logs\nGenerated: ${data.report.tasks.generated} tasks`);
                        } else throw new Error(data.error);
                      } catch (err: any) {
                        toast.error("Sync Failed: " + err.message);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all shadow-sm"
                   >
                     <RefreshCw className={cn("w-4 h-4", saving && "animate-spin")} /> Run Full System Sync
                   </button>
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
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded hover:border-emerald-500 hover:bg-emerald-50 transition-all cursor-pointer text-gray-500 hover:text-emerald-700">
                <Paperclip className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{manualWaFile ? "Change File" : "Choose File"}</span>
                <input type="file" className="hidden" onChange={e => setManualWaFile(e.target.files?.[0] || null)} />
              </label>
              {manualWaFile && (
                <div className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded flex items-center gap-2">
                  <span className="truncate max-w-[150px]">{manualWaFile.name}</span>
                  <button onClick={() => setManualWaFile(null)} className="p-0.5 hover:bg-emerald-100 rounded-full"><X className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* OVERRIDES */}
      {tab === "overrides" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="btn-primary py-2 px-4 text-xs" onClick={() => setShowAddOverride(true)}>
              <Plus className="w-4 h-4" /> Add Product Override
            </button>
          </div>

          {overrides.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">
              No product overrides configured.
            </div>
          ) : overrides.map(o => (
            <div key={o.id} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-sm font-semibold text-forest">{o.product_name}</div>
                  <div className="text-[10px] text-gray-400 font-mono">ID: {o.shopify_product_id}</div>
                </div>
                <button className="btn-danger text-xs py-1 px-2" onClick={async () => {
                   await supabase.from("product_overrides").delete().eq("id", o.id);
                   await recalculateTasks(settings);
                   fetchSettings();
                   toast.success("Override deleted and tasks aligned");
                }}>
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Review offset", value: o.review_offset_days },
                  { label: "Reorder offset", value: o.reorder_offset_days },
                  { label: "Final offset", value: o.final_offset_days },
                ].map(f => (
                  <div key={f.label}>
                    <label className="text-xs font-medium text-gray-600 block mb-1">{f.label}</label>
                    <div className="flex items-center gap-1 text-xs">{f.value || 0} days</div>
                  </div>
                ))}
              </div>
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

      {/* Add Override Modal */}
      <Modal open={showAddOverride} onClose={() => setShowAddOverride(false)} title="Add Product Override" 
        footer={<>
          <button className="btn-secondary" onClick={() => setShowAddOverride(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleAddOverride} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? "Aligning Tasks..." : "Add Override"}
          </button>
        </>}
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Select Product</label>
            <select 
              className="input text-xs"
              value={newOverride.shopify_product_id}
              onChange={e => {
                const p = availableProducts.find(x => x.id === e.target.value);
                setNewOverride({ ...newOverride, shopify_product_id: e.target.value, product_name: p?.name || "" });
              }}
            >
              <option value="">-- Choose Product --</option>
              {availableProducts.sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Review (Days)</label>
              <input type="number" className="input text-xs" value={newOverride.review_offset_days} onChange={e => setNewOverride({ ...newOverride, review_offset_days: +e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Reorder (Days)</label>
              <input type="number" className="input text-xs" value={newOverride.reorder_offset_days} onChange={e => setNewOverride({ ...newOverride, reorder_offset_days: +e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Final (Days)</label>
              <input type="number" className="input text-xs" value={newOverride.final_offset_days} onChange={e => setNewOverride({ ...newOverride, final_offset_days: +e.target.value })} />
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

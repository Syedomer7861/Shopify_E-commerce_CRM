"use client";
import { useState, useEffect, use } from "react";
import { ArrowLeft, Phone, Mail, ShoppingBag, PhoneCall, CheckSquare, FileText, AlertTriangle, RefreshCw, ToggleLeft, ToggleRight, MapPin, Home, Info, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, SegmentBadge, DeliveryBadge, TaskTypeBadge, TaskStatusBadge, Modal, Pagination } from "@/components/ui";
import ShiprocketOrderView from "@/components/ShiprocketOrderView";
import { createClient } from "@/lib/supabase";
import { cn, formatDate, formatDateTime, timeAgo, formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Customer, Order, Task, CallLog, AuditLog } from "@/types";
import { logAuditEvent } from "@/lib/audit";

export default function CustomerProfile({ params }: { params: { id: string } }) {
  const id = params.id;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tasks, setTasks] = useState<(Task & { order: Order })[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [tab, setTab] = useState<"timeline" | "orders" | "calls" | "tasks" | "notes">("timeline");
  const [notes, setNotes] = useState("");
  const [clearRtoModal, setClearRtoModal] = useState(false);
  const [unmasking, setUnmasking] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const supabase = createClient();

  useEffect(() => {
    setCurrentPage(1);
  }, [tab]);

  useEffect(() => {
    fetchCustomerData();
  }, [id]);

  async function fetchCustomerData() {
    setLoading(true);
    
    // 1. Fetch Customer
    const { data: custData } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();

    if (!custData) {
      toast.error("Customer not found");
      return;
    }

    // 2. Fetch Orders
    const { data: ordersData } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_id", id)
      .order("ordered_at", { ascending: false });

    // 3. Fetch Tasks
    const { data: tasksData } = await supabase
      .from("tasks")
      .select("*, order:orders(*), abandoned_cart:abandoned_carts(*)")
      .eq("customer_id", id)
      .order("due_date", { ascending: false });

    // 4. Fetch Calls
    const { data: callsData } = await supabase
      .from("call_logs")
      .select("*")
      .eq("customer_id", id)
      .order("called_at", { ascending: false });

    const { data: auditData } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    setCustomer(custData as any);
    setOrders((ordersData || []) as any);
    setTasks((tasksData || []) as any);
    setCalls((callsData || []) as any);
    setAudits(((auditData || []).filter((audit: any) => audit.entity_id === id || audit.metadata?.customerId === id)) as any);
    setNotes(custData.notes || "");
    setLoading(false);
  }

  async function handleSaveNote() {
    const { error } = await supabase
      .from("customers")
      .update({ notes } as any)
      .eq("id", id);

    if (error) return toast.error("Failed to save note");
    await logAuditEvent({
      entityType: "customer",
      entityId: id,
      action: "note_update",
      summary: `Updated notes for ${customer?.name}`,
    });

    // [ADMIN NOTIFY]
    const { sendAdminNotification } = await import("@/lib/notifications");
    await sendAdminNotification(
      `📝 *Note Updated*\n*Agent:* ${audits[0]?.actor_email || "Agent"}\n*Customer:* ${customer?.name}\n*Note:* ${notes.slice(0, 50)}${notes.length > 50 ? "..." : ""}`,
      "info"
    );

    toast.success("Note saved");
  }

  async function handleClearRTO() {
    const { error } = await supabase
      .from("customers")
      .update({ rto_flag: false, rto_count: 0 } as any)
      .eq("id", id);

    if (error) return toast.error("Failed to clear RTO flag");
    
    setCustomer(prev => prev ? { ...prev, rto_flag: false, rto_count: 0 } : null);
    setClearRtoModal(false);
    await logAuditEvent({
      entityType: "customer",
      entityId: id,
      action: "clear_rto",
      summary: `Cleared RTO flag for ${customer?.name || "customer"}`,
    });

    // [ADMIN NOTIFY]
    const { sendAdminNotification } = await import("@/lib/notifications");
    await sendAdminNotification(
      `🛡️ *RTO Flag Cleared*\n*Agent:* ${audits[0]?.actor_email || "Agent"}\n*Customer:* ${customer?.name}`,
      "alert"
    );

    toast.success("RTO flag cleared");
  }

  async function handleUnmask() {
    setUnmasking(true);
    const tid = toast.loading("Attempting Shopify Bypass & Recovery...", { id: "single-unmask" });
    try {
      // 1. Trigger the unmasking logic (passing a flag to process this specific customer)
      // Note: We use the batch API but it will intelligently handle this ID if we add support, 
      // or we can just run a targeted logic here. Simple way: call a focused endpoint.
      const res = await fetch("/api/sync/unmask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: id })
      });
      
      const data = await res.json();
      if (data.success && data.unmaskedCount > 0) {
        toast.success("Contact Unmasked Successfully!", { id: "single-unmask" });
        
        // [ADMIN NOTIFY]
        const { sendAdminNotification } = await import("@/lib/notifications");
        await sendAdminNotification(
          `✨ *Contact Unmasked (Healed)*\n*Agent:* ${audits[0]?.actor_email || "Agent"}\n*Customer:* ${customer?.name}`,
          "info"
        );

        // 🚀 SMART REDIRECT: If unmasking resulted in a merge, go to the new "Golden Record" ID
        if (data.redirectId && data.redirectId !== id) {
            router.push(`/customers/${data.redirectId}`);
        } else {
            await fetchCustomerData(); // Regular refresh
        }
      } else {
        toast.error("Could not recover unmasked details yet. Check Shopify settings.", { id: "single-unmask" });
      }
    } catch (err: any) {
      toast.error("Unmasking failed: " + err.message, { id: "single-unmask" });
    } finally {
      setUnmasking(false);
    }
  }

  if (loading || !customer) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <RefreshCw className="w-8 h-8 text-[#1c1c1c] animate-spin" />
      </div>
    );
  }

  const totalSpent = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);

  const tabs = [
    { key: "timeline", label: "Timeline", icon: Info, count: orders.length + calls.length + tasks.length + audits.length },
    { key: "orders", label: "Orders", icon: ShoppingBag, count: orders.length },
    { key: "calls", label: "Call Logs", icon: PhoneCall, count: calls.length },
    { key: "tasks", label: "Tasks", icon: CheckSquare, count: tasks.length },
    { key: "notes", label: "Notes", icon: FileText },
  ] as const;

  const timeline = [
    ...orders.map((order) => ({
      id: `order-${order.id}`,
      type: "order",
      at: order.ordered_at,
      title: `Order ${order.order_number || order.id}`,
      detail: `${order.line_items.map(l => l.name || l.title || "Product").join(", ")} · ${formatCurrency(Number(order.total_price) || 0)}`,
    })),
    ...tasks.map((task) => ({
      id: `task-${task.id}`,
      type: "task",
      at: task.created_at,
      title: `${task.task_type.replace("_", " ")} task created`,
      detail: `Due ${formatDate(task.due_date)} · ${task.status}`,
    })),
    ...calls.map((call) => ({
      id: `call-${call.id}`,
      type: "call",
      at: call.called_at,
      title: `Call outcome: ${call.outcome.replace("_", " ")}`,
      detail: [call.disposition?.replace(/_/g, " "), call.follow_up_action, call.note].filter(Boolean).join(" · "),
    })),
    ...audits.map((audit) => ({
      id: `audit-${audit.id}`,
      type: "audit",
      at: audit.created_at,
      title: audit.summary,
      detail: `${audit.action}${audit.actor_email ? ` · ${audit.actor_email}` : ""}`,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const paginatedTimeline = timeline.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const paginatedOrders = orders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const paginatedCalls = calls.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const paginatedTasks = tasks.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="animate-fade-in">
      <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1c1c1c] mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Customers
      </Link>

      {/* Header */}
      <div className="card p-5 mb-5">
        <div className="flex items-start gap-4 flex-wrap">
          <Avatar name={customer.name} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-display text-[#1c1c1c]">{customer.name}</h1>
              <SegmentBadge segment={customer.segment} rto={customer.rto_flag} />
              {customer.rto_flag && (
                <button onClick={() => setClearRtoModal(true)} className="text-xs text-orange-600 hover:text-orange-800 underline">
                  Clear RTO Flag
                </button>
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                    <Phone className="w-3.5 h-3.5" /> {customer.phone}
                  </a>
                  {(customer.phone.includes("x") || customer.phone.includes("X") || customer.phone.includes("_SR_")) && (
                    <button 
                      onClick={handleUnmask}
                      disabled={unmasking}
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase transition-all",
                        unmasking ? "bg-gray-100 text-gray-400" : "bg-[#1c1c1c]/10 text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-white"
                      )}
                    >
                      {unmasking ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Smartphone className="w-2.5 h-2.5" />}
                      Heal Contact
                    </button>
                  )}
                </div>
                {customer.alt_phone && (
                  <a href={`tel:${customer.alt_phone}`} className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:underline">
                    <Phone className="w-3 h-3" /> {customer.alt_phone} (Alt)
                  </a>
                )}
              </div>
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:underline">
                  <Mail className="w-3.5 h-3.5" /> {customer.email}
                </a>
              )}
              {/* WhatsApp Toggle */}
              <div className="flex items-center gap-2 px-3 py-1 bg-[#eceae4] text-[#1c1c1c] rounded-full border border-[#eceae4]">
                <span className="text-[10px] font-bold uppercase tracking-wider">WhatsApp Reminders</span>
                <button 
                  onClick={async () => {
                    const newValue = !(customer as any).whatsapp_reminders_enabled;
                    const { error } = await supabase
                      .from("customers")
                      .update({ whatsapp_reminders_enabled: newValue } as any)
                      .eq("id", id);
                    if (error) return toast.error("Failed to update reminder settings");
                    setCustomer(prev => prev ? { ...prev, whatsapp_reminders_enabled: newValue } as any : null);
                    await logAuditEvent({
                      entityType: "customer",
                      entityId: id,
                      action: "whatsapp_toggle",
                      summary: `${newValue ? "Enabled" : "Disabled"} WhatsApp reminders for ${customer.name}`,
                    });

                    // [ADMIN NOTIFY]
                    const { sendAdminNotification } = await import("@/lib/notifications");
                    await sendAdminNotification(
                      `🔔 *WhatsApp Reminders*\n*Agent:* ${audits[0]?.actor_email || "Agent"}\n*Customer:* ${customer.name}\n*Status:* ${newValue ? "✅ ENABLED" : "❌ DISABLED"}`,
                      "info"
                    );

                    toast.success(newValue ? "Enabled WhatsApp" : "Disabled WhatsApp");
                  }}
                  className="transition-colors"
                >
                  {(customer as any).whatsapp_reminders_enabled === true ? (
                    <ToggleRight className="w-5 h-5 text-[#1c1c1c]" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-[#5f5f5d]/40" />
                  )}
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-1">Customer since {formatDate(customer.created_at)}</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Orders", value: orders.length || 0 },
              { label: "Total Spent", value: formatCurrency(totalSpent) },
              { label: "RTO Count", value: customer.rto_count },
            ].map(s => (
              <div key={s.label} className="text-center bg-gray-50 rounded-lg px-4 py-3">
                <div className="text-lg font-bold text-[#1c1c1c]">{s.value}</div>
                <div className="text-[11px] text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Customer Details Card */}
      {(customer.address || customer.city || customer.state || customer.zip) && (
        <div className="card p-5 mb-5 border-l-4 border-l-[#1c1c1c] bg-[#eceae4]/10 animate-fade-in shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#1c1c1c]" /> Address & Location
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {customer.address && (
              <div className="flex items-start gap-2">
                <Home className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Street Address</div>
                  <div className="text-sm text-gray-700">{customer.address}</div>
                </div>
              </div>
            )}
            {customer.city && (
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">City</div>
                <div className="text-sm text-gray-700">{customer.city}</div>
              </div>
            )}
            {customer.state && (
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">State / Province</div>
                <div className="text-sm text-gray-700">{customer.state}</div>
              </div>
            )}
            {customer.zip && (
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">ZIP / Pin Code</div>
                <div className="text-sm text-gray-700 font-mono">{customer.zip}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Metadata Card */}
      {customer.custom_meta && Object.keys(customer.custom_meta).length > 0 && (
        <div className="card p-5 mb-5 border-l-4 border-l-purple-400 bg-purple-50/10 animate-fade-in shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-purple-500" /> Additional Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* Grouping Logic */}
            {[
              {
                title: "Recovery Details",
                keys: ["RECOVERSTATUS", "ABANDONLINK", "CHECKOUT STAGE", "SOURCE", "CHANNEL", "CHANNELID"]
              },
              {
                title: "Finance & Totals",
                keys: ["SUBTOTAL", "CARTTOTAL", "RECOVEREDREVENUE", "RECOVERABLE_REVENUE", "CODCHARGES", "SHIPPINGCHARGES", "PREPAIDDISCOUNT", "COUPONDISCOUNT"]
              },
              {
                title: "Order Info",
                keys: ["RECOVERFASTRRORDERID", "RECOVERPLATFORMORDERID", "RECOVERCLIENTORDERID", "RECOVERORDERCREATEDAT"]
              },
              {
                title: "Product Info",
                keys: ["PRODUCTNAME", "PRODUCTPRICE", "PRODUCTVARIANT", "PRODUCTQUANTITY"]
              },
              {
                title: "Communication",
                keys: ["COMMUNICATIONSENT", "NO_OFSMSSENT", "NO_OFWHATSAPPSENT", "COMMUNICATIONTIME"]
              }
            ].map(group => {
              const items = Object.entries(customer.custom_meta || {})
                .filter(([k]) => group.keys.includes(k.toUpperCase()));
                
              if (items.length === 0) return null;
              
              return (
                <div key={group.title} className="space-y-3">
                  <h4 className="text-[10px] font-bold text-purple-600 uppercase tracking-widest border-b border-purple-100 pb-1">{group.title}</h4>
                  <div className="space-y-2">
                    {items.map(([key, value]) => (
                      <div key={key} className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-medium truncate mb-0.5" title={key}>
                          {key.replace(/_/g, " ").replace(/RECOVER/i, "").trim() || key}
                        </span>
                        <div className="text-xs text-gray-700 font-semibold truncate max-w-full">
                          {key.toUpperCase() === "ABANDONLINK" ? (
                            <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                              View Cart <ShoppingBag className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            String(value)
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            
            {/* Ungrouped items */}
            {(() => {
              const groupedKeys = ["RECOVERSTATUS", "ABANDONLINK", "CHECKOUT STAGE", "SOURCE", "CHANNEL", "CHANNELID", "SUBTOTAL", "CARTTOTAL", "RECOVEREDREVENUE", "RECOVERABLE_REVENUE", "CODCHARGES", "SHIPPINGCHARGES", "PREPAIDDISCOUNT", "COUPONDISCOUNT", "RECOVERFASTRRORDERID", "RECOVERPLATFORMORDERID", "RECOVERCLIENTORDERID", "RECOVERORDERCREATEDAT", "PRODUCTNAME", "PRODUCTPRICE", "PRODUCTVARIANT", "PRODUCTQUANTITY", "COMMUNICATIONSENT", "NO_OFSMSSENT", "NO_OFWHATSAPPSENT", "COMMUNICATIONTIME"];
              const items = Object.entries(customer.custom_meta || {})
                .filter(([k]) => !groupedKeys.includes(k.toUpperCase()));
              
              if (items.length === 0) return null;
              
              return (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">Miscellaneous</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {items.map(([key, value]) => (
                      <div key={key} className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-medium mb-0.5 truncate">{key.replace(/_/g, " ")}</span>
                        <span className="text-xs text-gray-700 font-semibold">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4 gap-0 overflow-x-auto scroller-hide">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap",
              tab === t.key ? "border-[#1c1c1c] text-[#1c1c1c]" : "border-transparent text-gray-500 hover:text-gray-700"
            )}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {"count" in t && t.count > 0 && (
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                tab === t.key ? "bg-[#1c1c1c] text-white" : "bg-gray-100 text-gray-500"
              )}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "timeline" && (
        <div className="space-y-4">
          <div className="card divide-y divide-gray-50">
            {timeline.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No activity yet</div>}
            {paginatedTimeline.map(item => (
              <div key={item.id} className="p-4 flex items-start gap-3">
                <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0",
                  item.type === "order" ? "bg-[#1c1c1c]" :
                  item.type === "task" ? "bg-amber-500" :
                  item.type === "call" ? "bg-[#1c1c1c]/60" : "bg-violet-500"
                )} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#1c1c1c]">{item.title}</span>
                    <span className="text-xs text-gray-400">{formatDateTime(item.at)}</span>
                  </div>
                  {item.detail && <div className="text-xs text-gray-600 mt-1">{item.detail}</div>}
                </div>
              </div>
            ))}
          </div>
          <Pagination current={currentPage} total={timeline.length} pageSize={ITEMS_PER_PAGE} onChange={setCurrentPage} />
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-4">
          <div className="space-y-3">
            {orders.length === 0 && <div className="card p-8 text-center text-gray-400 text-sm">No orders yet</div>}
            {paginatedOrders.map(o => (
              <div 
                key={o.id} 
                onClick={() => {
                  const oid = [o.shopify_order_id, o.order_number, o.id].find(id => id && String(id).trim().length > 0);
                  if (oid) setSelectedOrderId(String(oid));
                }}
                className="card p-4 cursor-pointer hover:shadow-md hover:border-r hover:border-r-gray-100 transition-all hover:scale-[1.002] active:scale-[0.998]"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[#1c1c1c]">{o.order_number}</span>
                      <DeliveryBadge status={o.delivery_status} />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{o.line_items.filter((i: any) => !i.__metadata).map((l: any) => `${l.name || l.title || "Unknown Product"} × ${l.qty || l.quantity || 1}`).join(", ")}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      Ordered {formatDate(o.ordered_at)}
                      {o.delivered_at && ` · Delivered ${formatDate(o.delivered_at)}`}
                      {o.tracking_number && ` · AWB: ${o.tracking_number}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[#1c1c1c]">{formatCurrency(Number(o.total_price) || 0)}</div>
                    <div className="text-[11px] text-gray-400 uppercase">{o.source}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination current={currentPage} total={orders.length} pageSize={ITEMS_PER_PAGE} onChange={setCurrentPage} />
        </div>
      )}

      {tab === "calls" && (
        <div className="space-y-4">
          <div className="card divide-y divide-gray-50">
            {calls.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No call logs yet</div>}
            {paginatedCalls.map(cl => (
              <div key={cl.id} className="p-4 flex items-start gap-3">
                <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0",
                  cl.outcome === "done" ? "bg-[#1c1c1c]" : cl.outcome === "no_answer" ? "bg-amber-500" : "bg-rose-500"
                )} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#1c1c1c] capitalize">{cl.outcome.replace("_", " ")}</span>
                    <span className="text-xs text-gray-400">{formatDate(cl.called_at)}</span>
                  </div>
                  {cl.note && <div className="text-xs text-gray-600 mt-1 italic">&quot;{cl.note}&quot;</div>}
                  {(cl.disposition || cl.follow_up_action) && (
                    <div className="text-[11px] text-gray-500 mt-1">
                      {[cl.disposition?.replace(/_/g, " "), cl.follow_up_action].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {cl.agent_name && (
                    <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                      <span>by {cl.agent_name}</span>
                      {cl.agent_name.includes("System") && (
                        <span className="text-[9px] bg-[#eceae4] text-[#1c1c1c] px-1.5 py-0.5 rounded border border-[#eceae4] font-bold uppercase leading-none">Automated</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Pagination current={currentPage} total={calls.length} pageSize={ITEMS_PER_PAGE} onChange={setCurrentPage} />
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-4">
          <div className="space-y-3">
            {tasks.length === 0 && <div className="card p-8 text-center text-gray-400 text-sm">No tasks yet</div>}
            {paginatedTasks.map(t => (
              <div key={t.id} className="card p-4 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TaskTypeBadge type={t.task_type} />
                    <TaskStatusBadge status={t.status} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Due: {formatDate(t.due_date)} · {t.order?.order_number || t.abandoned_cart?.cart_token?.slice(0, 8) || "Abandoned Cart"}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination current={currentPage} total={tasks.length} pageSize={ITEMS_PER_PAGE} onChange={setCurrentPage} />
        </div>
      )}

      {tab === "notes" && (
        <div className="card p-4">
          <textarea className="input resize-none min-h-[120px] mb-3" placeholder="Add a note for this customer..."
            value={notes} onChange={e => setNotes(e.target.value)} />
          <button className="btn-primary" onClick={handleSaveNote}>Save Note</button>
        </div>
      )}

      {/* Clear RTO Modal */}
      <Modal open={clearRtoModal} onClose={() => setClearRtoModal(false)} title="Clear RTO Flag"
        footer={<>
          <button className="btn-secondary" onClick={() => setClearRtoModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleClearRTO}>Confirm</button>
        </>}
      >
        <p className="text-sm text-gray-600">Are you sure you want to clear the RTO flag for <strong>{customer.name}</strong>? Future orders will generate follow-up tasks normally.</p>
      </Modal>

      {/* Order Detail Modal */}
      <Modal 
        open={!!selectedOrderId} 
        onClose={() => setSelectedOrderId(null)} 
        title={`Order Details — ${customer.name}`}
        maxWidth="max-w-6xl"
      >
        <div className="bg-gray-50 -m-5 rounded-lg overflow-hidden min-h-[60vh]">
          {selectedOrderId && <ShiprocketOrderView orderId={selectedOrderId} />}
        </div>
      </Modal>
    </div>
  );
}

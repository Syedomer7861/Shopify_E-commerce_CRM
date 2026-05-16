"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { 
  Package, 
  Truck, 
  User, 
  MapPin, 
  Calendar, 
  CreditCard, 
  ChevronRight, 
  Box, 
  History,
  AlertCircle,
  ExternalLink,
  Printer,
  ChevronDown,
  Info,
  Zap,
  CheckCircle2,
  Image as ImageIcon
} from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

import NDRActionModal from "./NDRActionModal";

interface ShiprocketOrderViewProps {
  orderId: string;
}

export default function ShiprocketOrderView({ orderId }: ShiprocketOrderViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"activity" | "tracking">("activity");
  const [showNDRModal, setShowNDRModal] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async (silent = false) => {
    // Check for Demo Mode
    const isDemo = typeof document !== 'undefined' && document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      if (!silent) setLoading(true);
      // Simulate API delay
      await new Promise(r => setTimeout(r, 500));
      const { MOCK_ORDER_DETAIL } = await import("@/lib/mockData");
      setData(MOCK_ORDER_DETAIL as any);
      setLoading(false);
      return;
    }
    if (!orderId || orderId === "undefined" || orderId === "null") {
      setError("No valid Order ID was found for this task.");
      setLoading(false);
      return;
    }

    try {
      if (!silent && !data) setLoading(true);
      setError(null);
      const res = await fetch(`/api/orders/shiprocket/${orderId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [orderId, data]);

  useEffect(() => {
    setMounted(true);
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] animate-pulse">Fetching Logistics Intelligence...</div>
      </div>
    );
  }

  if (error || !data?.order) {
    return (
      <div className="p-10 text-center">
        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-gray-800">Connection Failed</h3>
        <p className="text-sm text-gray-500 mt-2">{error || "Could not retrieve order details from Shiprocket"}</p>
        <button 
          onClick={() => fetchData()}
          className="mt-6 px-6 py-2 bg-[#1c1c1c] text-white rounded-lg text-sm font-bold hover:bg-[#1c1c1c]/90 transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { order, tracking } = data;
  const status = order.status?.toUpperCase() || "PENDING";
  const shipment = order.shipments?.[0] || {};
  const trackingData = tracking?.tracking_data || {};
  const history = data.history || [];
  const trackingHistory = trackingData.shipment_track_activities || [];
  
  // Merge and Normalize Activities
  const combinedPulse = [
    ...trackingHistory.map((h: any) => ({
      date: h.date,
      activity: h.activity,
      location: h.location || "Logistics Hub",
      status: h.status || "TRANSIT",
      isHistory: false
    })),
    ...history.map((h: any) => ({
      date: h.created_at,
      activity: h.activity,
      location: "System",
      status: "ORDER",
      isHistory: true,
      description: h.description
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Guard: If no AWB and no Activity, cap UI status at "PENDING"
  const hasShippingActive = order.awb_code || combinedPulse.length > 0;
  const uiStatus = !hasShippingActive && (status === "DELIVERED" || status === "IN TRANSIT" || status === "SHIPPED") 
    ? "PENDING" 
    : status;

  const steps = [
    { label: "Ordered", status: ["PENDING", "NEW", "READY TO SHIP"], icon: Package },
    { label: "Shipped", status: ["SHIPPED", "IN TRANSIT", "OUT FOR DELIVERY", "DELIVERED"], icon: Truck },
    { label: "Out for Delivery", status: ["OUT FOR DELIVERY", "DELIVERED"], icon: Zap },
    { label: "Delivered", status: ["DELIVERED"], icon: CheckCircle2 }
  ];

  return (
    <div className="bg-[#f7f4ed] min-h-screen text-[#1c1c1c]">
      {/* Header Bar */}
      <div className="bg-[#f7f4ed] border-b border-[#eceae4] px-4 sm:px-6 py-4 sm:py-6 flex flex-col md:flex-row items-start md:items-center justify-between sticky top-0 z-20 shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-[#eceae4] p-3 rounded-xl">
            <Package className="w-5 h-5 text-[#1c1c1c]/60" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black flex items-center gap-2 tracking-tight flex-wrap">
              #{order.channel_order_id || order.id}
              <span className={cn(
                "text-[10px] px-2.5 py-1 rounded-lg uppercase font-black tracking-widest",
                status === "DELIVERED" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                status === "IN TRANSIT" || status === "SHIPPED" ? "bg-blue-50 text-blue-600 border border-blue-100" :
                "bg-amber-50 text-amber-700 border border-amber-100"
              )}>
                {data.is_local ? "AWAITING FULFILLMENT" : status}
              </span>
            </h1>
            <p className="text-[11px] text-[#5f5f5d]/40 font-black uppercase tracking-widest mt-0.5">
              {data.is_local ? "Syncing with Shiprocket..." : `Shiprocket System ID: ${order.id}`}
            </p>
          </div>
        </div>
        {!data.is_local && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto justify-start md:justify-end">
            {status === "NDR" && (
              <button 
                onClick={() => setShowNDRModal(true)}
                className="px-4 py-2.5 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all flex items-center gap-2 shadow-lg shadow-amber-100/50 active:scale-95 animate-pulse"
              >
                NDR Action <Zap className="w-3 h-3 fill-current" />
              </button>
            )}
            {(shipment.awb || order.awb_code) && (
              <a 
                href={`https://cureforever.shiprocket.co/tracking/${shipment.awb || order.awb_code}`}
                target="_blank"
                className="px-5 py-2.5 bg-[#1c1c1c] text-[#f7f4ed] rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2 shadow-xl"
                style={{ boxShadow: "rgba(255,255,255,0.1) 0px 1px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 1px inset" }}
              >
                Track Live <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {order.id && !data.is_local && (
              <a 
                href={String(order.id).length > 6 
                  ? `https://app.shiprocket.in/seller/orders/show/${order.id}`
                  : `https://app.shiprocket.in/seller/orders?search=${order.channel_order_id || order.id}`
                }
                target="_blank"
                className="p-3 bg-[#f7f4ed] border border-[#eceae4] rounded-xl hover:bg-[#eceae4] transition-all active:scale-95 shadow-sm"
                title="Open in Shiprocket Seller Panel"
              >
                <ImageIcon className="w-4 h-4 text-[#5f5f5d]" />
              </a>
            )}
            <button className="flex-1 sm:flex-initial px-4 py-2.5 bg-[#f7f4ed] border border-[#eceae4] text-[#5f5f5d] rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#eceae4] transition-all shadow-sm">
              Cancel order
            </button>
            <button 
              onClick={async (e) => {
                const btn = e.currentTarget;
                const originalContent = btn.innerHTML;
                try {
                  btn.disabled = true;
                  btn.innerHTML = '<span class="animate-spin inline-block">⏳</span>';
                  
                  const res = await fetch(`/api/orders/shiprocket/${order.id}/print`);
                  const json = await res.json();
                  
                  if (json.url) {
                    window.open(json.url, '_blank');
                  } else {
                    throw new Error(json.error || "No URL returned");
                  }
                } catch (err: any) {
                  alert(`Could not print invoice: ${err.message}`);
                } finally {
                  btn.disabled = false;
                  btn.innerHTML = originalContent;
                }
              }}
              className="p-3 bg-[#f7f4ed] border border-[#eceae4] rounded-xl hover:bg-[#eceae4] transition-all active:scale-95 disabled:opacity-50 shadow-sm"
              title="Print Invoice"
            >
              <Printer className="w-4 h-4 text-[#5f5f5d]" />
            </button>
          </div>
        )}
        
        <NDRActionModal 
          open={showNDRModal}
          onClose={() => setShowNDRModal(false)}
          shipmentId={String(shipment.id || order.shipment_id || "")}
          orderNumber={order.channel_order_id || order.id}
          onSuccess={() => fetchData()}
        />
      </div>

      {/* Premium Fulfillment Stepper */}
      <div className="bg-[#f7f4ed] border-b border-[#eceae4] px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between relative">
            {/* Background Line */}
            <div className="absolute top-1/2 left-0 w-full h-1 bg-[#eceae4] -translate-y-1/2 z-0" />
            
            {steps.map((step, idx, arr) => {
              const isActive = step.status.includes(uiStatus);
              const isPast = arr.findIndex(s => s.status.includes(uiStatus)) > idx;
              const isCurrent = step.status.includes(uiStatus);
              
              return (
                <div key={step.label} className="relative z-10 flex flex-col items-center group">
                  <div className={cn(
                    "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-xl border-4 border-[#f7f4ed]",
                    isPast ? "bg-blue-600 text-[#f7f4ed]" : 
                    isCurrent ? "bg-[#1c1c1c] text-[#f7f4ed] animate-pulse-slow ring-8 ring-[#1c1c1c]/10" : 
                    "bg-[#eceae4] text-[#5f5f5d]/40"
                  )}>
                    <step.icon className="w-5 h-5" />
                  </div>
                  <div className="absolute -bottom-8 whitespace-nowrap">
                    <span className={cn(
                      "text-[8px] sm:text-[9px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] transition-colors",
                      isCurrent ? "text-[#1c1c1c]" : "text-[#5f5f5d]/40"
                    )}>
                      {step.label}
                    </span>
                  </div>
                  {/* Progress filler line */}
                  {isPast && idx < arr.length - 1 && (
                    <div className="absolute top-1/2 left-full w-[calc(100%)] h-1 bg-blue-600 -translate-y-1/2 -z-10" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-[1400px] mx-auto">
        {/* Left Column: Details */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Order Details Card */}
          <section className="card bg-[#f7f4ed] border-[#eceae4] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-[#eceae4] flex items-center gap-3 bg-[#eceae4]/10">
              <History className="w-4 h-4 text-[#1c1c1c]/40" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1c1c1c]/60">Order Intelligence</h2>
              <div className={cn(
                "ml-auto flex items-center gap-1.5 text-[9px] px-2.5 py-1 rounded-lg font-black uppercase border",
                order.risk_factor === "HIGH" ? "bg-rose-50 text-rose-600 border-rose-100" : 
                order.risk_factor === "MEDIUM" ? "bg-amber-50 text-amber-600 border-amber-100" : 
                "bg-emerald-50 text-emerald-600 border-emerald-100"
              )}>
                RTO Risk: {order.risk_factor || "LOW"} <AlertCircle className="w-2.5 h-2.5" />
              </div>
            </div>
            <div className="p-8 grid grid-cols-2 lg:grid-cols-4 gap-8">
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Booking Date</label>
                <div className="text-sm font-bold text-[#1c1c1c]">{formatDate(order.created_at)}</div>
              </div>
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Origin Channel</label>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-[#95bf47] rounded-full flex items-center justify-center text-white text-[9px] font-black">S</div>
                  <span className="text-sm font-bold text-[#1c1c1c]">Shopify Direct</span>
                </div>
              </div>
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Pickup Location</label>
                <div className="text-sm font-bold text-[#1c1c1c] underline decoration-dotted underline-offset-4 cursor-help" title={order.pickup_address?.address}>
                  {order.pickup_address?.pickup_code || "Primary Warehouse"}
                </div>
              </div>
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Financial Status</label>
                <div className="text-sm font-bold text-[#1c1c1c] flex items-center gap-1.5">
                  ₹{order.total} <span className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded font-black border",
                    order.payment_method?.toLowerCase() === "prepaid" ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-orange-50 text-orange-600 border-orange-100"
                  )}>{order.payment_method?.toLowerCase() === "prepaid" ? "PREPAID" : "COD"}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Shipping Details Card */}
          <section className="card bg-[#f7f4ed] border-[#eceae4] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-[#eceae4] flex items-center gap-3 bg-[#eceae4]/10">
              <Truck className="w-4 h-4 text-[#1c1c1c]/40" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1c1c1c]/60">Transit Parameters</h2>
            </div>
            <div className="p-8 grid grid-cols-2 lg:grid-cols-4 gap-8">
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Logistics Partner</label>
                <div className="text-sm font-bold text-[#1c1c1c]">{shipment.courier || order.courier_name || "Unassigned"}</div>
              </div>
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">AWB Tracking</label>
                <div className="text-sm font-bold text-blue-600 flex items-center gap-1.5 cursor-pointer hover:underline">
                  {shipment.awb || order.awb_code || "—"}
                  {(shipment.awb || order.awb_code) && <ExternalLink className="w-3 h-3" />}
                </div>
              </div>
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Service Type</label>
                <div className="text-sm font-bold text-[#1c1c1c]">{order.courier_mode || (order.is_surface ? "Surface" : "Air Express")}</div>
              </div>
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Shipment ID</label>
                <div className="text-sm font-bold text-[#1c1c1c]">{order.shipment_pickup_id || "—"}</div>
              </div>
            </div>
          </section>

          {/* Package Details Card */}
          <section className="card bg-[#f7f4ed] border-[#eceae4] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-[#eceae4] flex items-center gap-3 bg-[#eceae4]/10">
              <Box className="w-4 h-4 text-[#1c1c1c]/40" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1c1c1c]/60">Physical Metrics</h2>
            </div>
            <div className="p-8 grid grid-cols-2 lg:grid-cols-4 gap-8">
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Dead Weight (Kg)</label>
                <div className="text-sm font-bold text-[#1c1c1c]">{order.weight || shipment.weight || "0.00"}</div>
              </div>
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">L x W x H (cm)</label>
                <div className="text-sm font-bold text-[#1c1c1c]">
                  {order.shiprocket_length && order.shiprocket_length > 0 
                    ? `${order.shiprocket_length} x ${order.shiprocket_width} x ${order.shiprocket_height}` 
                    : (order.dimensions || "—")}
                </div>
              </div>
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Volumetric (Kg)</label>
                <div className="text-sm font-bold text-[#1c1c1c]">{order.shiprocket_volumetric_weight || "0.000"}</div>
              </div>
              <div>
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Billable Weight</label>
                <div className="text-sm font-black text-emerald-600">
                  {Math.max(Number(order.weight || 0), Number(order.shiprocket_volumetric_weight || 0)).toFixed(2)} Kg
                </div>
              </div>
            </div>
          </section>

          {/* Customer Intelligence Card */}
          <section className="card bg-[#f7f4ed] border-[#eceae4] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-[#eceae4] flex items-center gap-3 bg-[#eceae4]/10">
              <User className="w-4 h-4 text-[#1c1c1c]/40" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1c1c1c]/60">Customer Profile</h2>
            </div>
            <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <div>
                  <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Recipient Name</label>
                  <div className="text-sm font-bold text-[#1c1c1c]">{order.customer_name || order.billing_customer_name}</div>
                </div>
                <div>
                  <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Verified Contact</label>
                  <div className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2">
                    {order.customer_phone || order.billing_phone}
                    <div className="w-4 h-4 bg-[#eceae4] rounded flex items-center justify-center cursor-pointer hover:bg-[#1c1c1c] hover:text-white transition-all">
                      <ChevronRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Communication</label>
                  <div className="text-xs font-bold text-[#5f5f5d]/60 italic truncate" title={order.customer_email || order.billing_email}>
                    {order.customer_email || order.billing_email || "no-email@shiprocket.com"}
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2 relative">
                <label className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-widest block mb-1.5">Destination Address</label>
                <div className="text-sm font-bold text-[#1c1c1c] leading-relaxed pr-24">
                  {order.billing_address || "—"}
                  {order.billing_address_2 ? `, ${order.billing_address_2}` : ""}
                  <br />
                  <span className="text-[#5f5f5d]/60 font-black uppercase text-[10px] tracking-tight">
                    {[order.billing_city, order.billing_state, order.billing_pincode].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="absolute right-0 bottom-0 text-center">
                  {(() => {
                    const score = order.risk_score || parseFloat(order.extra_info?.address_score || "0") * 100;
                    const category = order.extra_info?.address_category || "unknown";
                    const isValid = category.toLowerCase() === "valid" || score >= 70;
                    const isAmbiguous = category.toLowerCase() === "ambiguous" || (score < 70 && score >= 40);
                    
                    return (
                      <>
                        <div className={cn(
                          "w-14 h-14 rounded-2xl flex items-center justify-center border-4 border-[#f7f4ed] shadow-lg mb-2 mx-auto overflow-hidden",
                          isValid ? "bg-blue-600" : isAmbiguous ? "bg-amber-400" : "bg-rose-500"
                        )}>
                          <div className="w-full h-full flex items-center justify-center text-[#f7f4ed] text-[11px] font-black italic">
                            {score > 0 ? `${score.toFixed(0)}%` : "N/A"}
                          </div>
                        </div>
                        <div className={cn(
                          "text-[9px] font-black uppercase tracking-tight leading-tight",
                          isValid ? "text-blue-700" : isAmbiguous ? "text-amber-700" : "text-rose-700"
                        )}>
                          {category.toUpperCase()} <br/> ADDR SCORE
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </section>

          {/* Product Inventory Table */}
          <section className="card bg-[#f7f4ed] border-[#eceae4] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-[#eceae4] flex items-center gap-3 bg-[#eceae4]/10">
              <Package className="w-4 h-4 text-[#1c1c1c]/40" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1c1c1c]/60">Consolidated SKU Inventory</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#eceae4]/30 text-[9px] text-[#5f5f5d]/60 uppercase font-black border-b border-[#eceae4]">
                    <td className="px-8 py-4">Item Intelligence</td>
                    <td className="px-4 py-4">HSN</td>
                    <td className="px-4 py-4">SKU Code</td>
                    <td className="px-4 py-4 text-center">Qty</td>
                    <td className="px-4 py-4 text-right">Unit Rate</td>
                    <td className="px-8 py-4 text-right">Line Total</td>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {(order.order_items || order.products || []).map((item: any, i: number) => (
                    <tr key={i} className="border-b border-[#eceae4]/40 last:border-0 hover:bg-[#eceae4]/20 transition-colors">
                      <td className="px-8 py-5 font-black text-[#1c1c1c] max-w-[250px] truncate" title={item.name || item.product_name}>{item.name || item.product_name}</td>
                      <td className="px-4 py-5 text-[#5f5f5d]/60 font-bold tabular-nums">{item.hsn || item.hsn_code || "—"}</td>
                      <td className="px-4 py-5 text-[#5f5f5d]/60 font-black">{item.sku || "—"}</td>
                      <td className="px-4 py-5 text-center font-black tabular-nums">{item.units || item.quantity}</td>
                      <td className="px-4 py-5 text-right font-bold tabular-nums text-[#1c1c1c]">₹{item.selling_price || item.price}</td>
                      <td className="px-8 py-5 text-right font-black text-[#1c1c1c] tabular-nums">₹{item.total || (Number(item.selling_price || 0) * Number(item.units||1))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-[#eceae4]/20 p-8 flex flex-col items-end gap-2 border-t border-[#eceae4] uppercase">
              <div className="flex items-center gap-12 text-[10px] font-bold text-[#5f5f5d]/40">
                <span>Gross Value ({ (order.order_items || order.products || []).length } SKUs)</span>
                <span className="text-[#1c1c1c] w-20 text-right tabular-nums">₹{order.sub_total || order.total}</span>
              </div>
              <div className="flex items-center gap-12 text-sm font-black text-[#1c1c1c] pt-1">
                <span className="tracking-tighter">Order Settlement Total</span>
                <span className="text-[#1c1c1c] w-20 text-right tabular-nums text-lg tracking-tighter">₹{order.total}</span>
              </div>
            </div>
          </section>

        </div>

        {/* Right Column: Execution Timeline */}
        <div className="lg:col-span-1">
          <div className="card bg-[#f7f4ed] border-[#eceae4] rounded-2xl p-0 shadow-xl sticky top-24 overflow-hidden">
            <div className="flex border-b border-[#eceae4]">
              <button 
                onClick={() => setActiveTab("activity")}
                className={cn(
                  "flex-1 px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2",
                  activeTab === "activity" ? "text-[#1c1c1c] border-[#1c1c1c] bg-[#eceae4]/20" : "text-[#5f5f5d]/40 border-transparent hover:bg-[#eceae4]/10"
                )}
              >
                Pulse Log
              </button>
              <button 
                onClick={() => setActiveTab("tracking")}
                className={cn(
                  "flex-1 px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2",
                  activeTab === "tracking" ? "text-[#1c1c1c] border-[#1c1c1c] bg-[#eceae4]/20" : "text-[#5f5f5d]/40 border-transparent hover:bg-[#eceae4]/10"
                )}
              >
                Registry
              </button>
            </div>
            
            <div className="p-8">
              <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-[#eceae4]"></div>
                
                <div className="space-y-10 relative">
                  {activeTab === "activity" && combinedPulse.length > 0 ? (
                    combinedPulse.map((step: any, i: number) => {
                       const isLatest = i === 0;
                       return (
                        <div key={i} className="flex gap-5 group">
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 border-[#f7f4ed] ring-2 z-10 mt-1 flex-shrink-0 transition-transform group-hover:scale-125",
                            isLatest ? "bg-[#1c1c1c] ring-[#1c1c1c]/20" : "bg-[#eceae4] ring-[#eceae4]/40"
                          )}></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-1.5">
                              <h4 className={cn("text-[11px] font-black uppercase tracking-tight leading-snug", isLatest ? "text-[#1c1c1c]" : "text-[#5f5f5d]/60")}>
                                {step.activity}
                              </h4>
                              <span className="text-[9px] text-[#5f5f5d]/40 font-black tabular-nums whitespace-nowrap pt-0.5">
                                {mounted ? new Date(step.date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short' }) : "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={cn(
                                    "text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-tighter",
                                    step.isHistory ? "text-amber-600 bg-amber-50 border-amber-100" : "text-blue-600 bg-blue-50 border-blue-100"
                                )}>
                                    {step.status || step.hub_code || "HUB SCAN"}
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-[#5f5f5d]/40 uppercase tracking-widest flex items-center gap-1.5">
                              <MapPin className="w-2.5 h-2.5" /> {step.location || "Central Hub"} · {mounted ? new Date(step.date).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' }) : "--:--"}
                            </p>
                            {isLatest && (
                                <div className="mt-4 bg-[#1c1c1c] rounded-xl p-4 shadow-xl">
                                   <p className="text-[10px] text-[#f7f4ed] font-bold italic leading-relaxed">
                                      &ldquo;{step.description || step.activity}&rdquo;
                                   </p>
                                </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : activeTab === "tracking" ? (
                    <div className="space-y-4">
                        <div className="p-4 bg-[#eceae4]/30 rounded-xl border border-[#eceae4]">
                            <div className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-[0.2em] mb-1.5">Master Tracking ID</div>
                            <div className="text-sm font-black text-[#1c1c1c] tabular-nums tracking-tight">{shipment.awb || order.awb_code || "NOT_GENERATED"}</div>
                        </div>
                        <div className="p-4 bg-[#eceae4]/30 rounded-xl border border-[#eceae4]">
                            <div className="text-[9px] text-[#5f5f5d]/40 font-black uppercase tracking-[0.2em] mb-1.5">Courier Authority</div>
                            <div className="text-sm font-black text-[#1c1c1c] uppercase tracking-tighter">{shipment.courier || order.courier_name || "Pending Validation"}</div>
                        </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 opacity-10 grayscale">
                        <Box className="w-12 h-12 mb-4" />
                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-center leading-relaxed">System<br/>Idle</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#eceae4]/40 p-5 border-t border-[#eceae4] flex items-center gap-4">
               <div className="w-10 h-10 rounded-2xl bg-[#1c1c1c] flex items-center justify-center text-[#f7f4ed] flex-shrink-0 shadow-lg shadow-[#1c1c1c]/10">
                  <Truck className="w-5 h-5" />
               </div>
               <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#5f5f5d]/60 mb-0.5">Execution Status</p>
                  <p className="text-xs font-black text-[#1c1c1c] tracking-tight">{order.status || "WAITING_PICKUP"}</p>
               </div>
               <div className="ml-auto w-8 h-8 rounded-full border border-[#eceae4] flex items-center justify-center text-[#5f5f5d]/40 hover:bg-[#1c1c1c] hover:text-white transition-all cursor-pointer">
                  <ChevronRight className="w-4 h-4" />
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

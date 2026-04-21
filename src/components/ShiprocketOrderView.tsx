"use client";

import { useEffect, useState } from "react";
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
  CheckCircle2
} from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

interface ShiprocketOrderViewProps {
  orderId: string;
}

export default function ShiprocketOrderView({ orderId }: ShiprocketOrderViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"activity" | "tracking">("activity");

  const fetchData = async () => {
    if (!orderId || orderId === "undefined" || orderId === "null") {
      setError("No valid Order ID was found for this task.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/orders/shiprocket/${orderId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-[#2D1E6F] border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="text-sm font-bold text-[#2D1E6F] animate-pulse">Fetching Shiprocket Data...</div>
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
          onClick={fetchData}
          className="mt-6 px-6 py-2 bg-[#2D1E6F] text-white rounded-lg text-sm font-bold hover:bg-[#2D1E6F]/90 transition-all"
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
  const trackingHistory = trackingData.shipment_track_activities || [];
  
  // Guard: If no AWB and no Activity, cap UI status at "PENDING"
  const hasShippingActive = order.awb_code || trackingHistory.length > 0;
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
    <div className="bg-[#f4f7f6] min-h-screen text-[#1d1d1f]">
      {/* Header Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-gray-100 p-2 rounded-lg">
            <Package className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              #{order.channel_order_id || order.id}
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider",
                status === "DELIVERED" ? "bg-blue-100 text-blue-700" :
                status === "IN TRANSIT" || status === "SHIPPED" ? "bg-blue-100 text-blue-700" :
                "bg-orange-100 text-orange-700"
              )}>
                {data.is_local ? "AWAITING FULFILLMENT" : status}
              </span>
            </h1>
            <p className="text-[11px] text-gray-400 font-medium">
              {data.is_local ? "Syncing with Shiprocket..." : `Shiprocket Order ID: ${order.id}`}
            </p>
          </div>
        </div>
        {!data.is_local && (
          <div className="flex items-center gap-3">
            {(shipment.awb || order.awb_code) && (
              <a 
                href={`https://cureforever.shiprocket.co/tracking/${shipment.awb || order.awb_code}`}
                target="_blank"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 active:scale-95"
              >
                Track Live <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all">
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
              className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
              title="Print Invoice"
            >
              <Printer className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        )}
      </div>

      {/* Premium Fulfillment Stepper */}
      <div className="bg-white border-b border-gray-100 px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between relative">
            {/* Background Line */}
            <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -translate-y-1/2 z-0" />
            
            {steps.map((step, idx, arr) => {
              const isActive = step.status.includes(uiStatus);
              const isPast = arr.findIndex(s => s.status.includes(uiStatus)) > idx;
              const isCurrent = step.status.includes(uiStatus);
              
              return (
                <div key={step.label} className="relative z-10 flex flex-col items-center group">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-xl border-4 border-white",
                    isPast ? "bg-blue-600 text-white" : 
                    isCurrent ? "bg-[#2D1E6F] text-white animate-pulse-slow ring-8 ring-[#2D1E6F]/20" : 
                    "bg-gray-100 text-gray-400"
                  )}>
                    <step.icon className="w-5 h-5" />
                  </div>
                  <div className="absolute -bottom-6 whitespace-nowrap">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest transition-colors",
                      isCurrent ? "text-[#2D1E6F]" : "text-gray-400"
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

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1400px] mx-auto">
        {/* Left Column: Details */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Order Details Card */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <History className="w-4 h-4 text-purple-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-500">Order Details</h2>
              <div className={cn(
                "ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                order.risk_factor === "HIGH" ? "bg-rose-50 text-rose-600" : 
                order.risk_factor === "MEDIUM" ? "bg-amber-50 text-amber-600" : 
                "bg-blue-50 text-blue-600"
              )}>
                RTO Risk: <span className="flex items-center gap-0.5">{order.risk_factor || "LOW"} <AlertCircle className="w-2.5 h-2.5" /></span>
              </div>
            </div>
            <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-y-6">
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Order Date</label>
                <div className="text-xs font-bold">{formatDate(order.created_at)}</div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Channel</label>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-[#95bf47] rounded-full flex items-center justify-center text-white text-[10px] font-bold">S</div>
                  <span className="text-xs font-bold">Shopify</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Pickup Address</label>
                <div className="text-xs font-bold underline decoration-dotted underline-offset-4 cursor-help" title={order.pickup_address?.address}>
                  {order.pickup_address?.pickup_code || "Office"}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Payment</label>
                <div className="text-xs font-bold flex items-center gap-1 uppercase">
                  ₹{order.total} <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-black",
                    order.payment_method?.toLowerCase() === "prepaid" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                  )}>{order.payment_method?.toLowerCase() === "prepaid" ? "PAID" : "COD"}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Shipping Details Card */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <Truck className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-500">Shipping Details</h2>
            </div>
            <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-y-6">
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Courier</label>
                <div className="text-xs font-bold">{shipment.courier || order.courier_name || "—"}</div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">AWB No.</label>
                <div className="text-xs font-bold text-purple-600 flex items-center gap-1 cursor-pointer">
                  {shipment.awb || order.awb_code || "—"}
                  {shipment.awb && <ExternalLink className="w-3 h-3" />}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Mode</label>
                <div className="text-xs font-bold">{order.courier_mode || (order.is_surface ? "Surface" : "Air")}</div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Pickup Id</label>
                <div className="text-xs font-bold">{order.shipment_pickup_id || "—"}</div>
              </div>
            </div>
          </section>

          {/* Package Details Card */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <Box className="w-4 h-4 text-orange-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-500">Package Details</h2>
            </div>
            <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-y-6">
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Dead Weight (In Kg)</label>
                <div className="text-xs font-bold">{order.weight || shipment.weight || "—"}</div>
                          <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Dimensions (in cm)</label>
                <div className="text-xs font-bold">
                  {order.shiprocket_length ? `${order.shiprocket_length} x ${order.shiprocket_width} x ${order.shiprocket_height}` : (order.dimensions || "—")}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Volumetric Weight (In Kg)</label>
                <div className="text-xs font-bold">{order.shiprocket_volumetric_weight || "0.000"}</div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Applied Weight (In Kg)</label>
                <div className="text-xs font-bold">
                  {Math.max(Number(order.weight || 0), Number(order.shiprocket_volumetric_weight || 0)).toFixed(2)}
                </div>
              </div>
       </div>
            </div>
          </section>

          {/* Customer Details Card */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <User className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-500">Customer Details</h2>
            </div>
            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-4">
                <div>
                  <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Name</label>
                  <div className="text-xs font-bold">{order.customer_name || order.billing_customer_name}</div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Contact No.</label>
                  <div className="text-xs font-bold flex items-center gap-2">
                    {order.customer_phone || order.billing_phone}
                    <div className="w-4 h-4 bg-gray-100 rounded flex items-center justify-center cursor-pointer">
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Email</label>
                  <div className="text-xs font-bold text-gray-500 italic truncate" title={order.customer_email || order.billing_email}>
                    {order.customer_email || order.billing_email || "noreply@shiprocket.com"}
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2 relative">
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Address</label>
                <div className="text-xs font-bold leading-relaxed pr-20">
                  {order.billing_address}, {order.billing_address_2 && order.billing_address_2 + ","} <br />
                  {order.billing_city}, {order.billing_state} <br />
                  {order.billing_pincode}, {order.billing_country}
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
                          "w-12 h-12 rounded-full flex items-center justify-center border-4 border-white shadow-sm mb-1 mx-auto overflow-hidden",
                          isValid ? "bg-blue-600" : isAmbiguous ? "bg-yellow-400" : "bg-rose-500"
                        )}>
                          <div className="w-full h-full flex items-center justify-center text-white text-[10px] font-black italic">
                            {score > 0 ? `${score.toFixed(0)}%` : "—"}
                          </div>
                        </div>
                        <div className={cn(
                          "text-[9px] font-black uppercase tracking-tight",
                          isValid ? "text-blue-700" : isAmbiguous ? "text-yellow-600" : "text-rose-600"
                        )}>
                          {category === "valid" ? "Valid Address" : category === "ambiguous" ? "Ambiguous Address" : "Invalid Address"}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </section>

          {/* Product Details Table */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <Package className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-500">Product Details</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 text-[10px] text-gray-400 uppercase font-black border-b border-gray-100">
                    <td className="px-6 py-3">Name</td>
                    <td className="px-4 py-3">Category</td>
                    <td className="px-4 py-3">HSN</td>
                    <td className="px-4 py-3">SKU</td>
                    <td className="px-4 py-3 text-center">Qty</td>
                    <td className="px-4 py-3 text-right">Unit price</td>
                    <td className="px-4 py-3 text-right">Discount</td>
                    <td className="px-4 py-3 text-right">Tax</td>
                    <td className="px-4 py-3 text-right">Total</td>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {(order.order_items || order.products || []).map((item: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold max-w-[200px] truncate" title={item.name || item.product_name}>{item.name || item.product_name}</td>
                      <td className="px-4 py-4 text-gray-400 font-medium">Default Category</td>
                      <td className="px-4 py-4 text-gray-400 tabular-nums">{item.hsn || item.hsn_code || "—"}</td>
                      <td className="px-4 py-4 text-gray-400">{item.sku || "—"}</td>
                      <td className="px-4 py-4 text-center font-bold tabular-nums">{item.units || item.quantity}</td>
                      <td className="px-4 py-4 text-right font-bold tabular-nums">₹{item.selling_price || item.price}</td>
                      <td className="px-4 py-4 text-right tabular-nums">₹{item.discount || "0"}</td>
                      <td className="px-4 py-4 text-right tabular-nums">₹{item.tax || "0"}</td>
                      <td className="px-4 py-4 text-right font-black text-[#2D1E6F] tabular-nums">₹{item.total || (item.selling_price * (item.units||1))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-50/30 p-6 flex flex-col items-end gap-1.5 border-t border-gray-100 uppercase">
              <div className="flex items-center gap-20 text-[10px] font-bold text-gray-400">
                <span>Product Total ({ (order.order_items || order.products || []).length } Item)</span>
                <span className="text-gray-700 w-16 text-right tabular-nums">₹{order.sub_total || order.total}</span>
              </div>
              <div className="flex items-center gap-20 text-xs font-black text-gray-800 pt-1">
                <span>Order Total</span>
                <span className="text-[#2D1E6F] w-16 text-right tabular-nums">₹{order.total}</span>
              </div>
            </div>
          </section>

          {/* App Charges Placeholder */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
             <div className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-all">
                <div className="flex items-center gap-3">
                   <div className="bg-blue-50 p-2 rounded-lg">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                   </div>
                   <h2 className="text-sm font-black uppercase tracking-wider text-gray-500">Apps Charges</h2>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
             </div>
          </section>

        </div>

        {/* Right Column: Timeline */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-0 shadow-sm sticky top-24">
            <div className="flex border-b border-gray-100">
              <button 
                onClick={() => setActiveTab("activity")}
                className={cn(
                  "flex-1 px-4 py-3 text-[10px] font-black uppercase tracking-wider transition-all border-b-2",
                  activeTab === "activity" ? "text-purple-600 border-purple-600" : "text-gray-400 hover:text-gray-600 border-transparent"
                )}
              >
                Activity Log
              </button>
              <button 
                onClick={() => setActiveTab("tracking")}
                className={cn(
                  "flex-1 px-4 py-3 text-[10px] font-black uppercase tracking-wider transition-all border-b-2",
                  activeTab === "tracking" ? "text-purple-600 border-purple-600" : "text-gray-400 hover:text-gray-600 border-transparent"
                )}
              >
                Tracking Info
              </button>
            </div>
            
            <div className="p-6">
              <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-[1.5px] bg-gray-100"></div>
                
                <div className="space-y-8 relative">
                  {activeTab === "activity" && trackingHistory.length > 0 ? (
                    trackingHistory.map((step: any, i: number) => {
                       const isLatest = i === 0;
                       return (
                        <div key={i} className="flex gap-4 group">
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 border-white ring-2 z-10 mt-1 flex-shrink-0",
                            isLatest ? "bg-purple-600 ring-purple-100" : "bg-gray-200 ring-gray-50"
                          )}></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className={cn("text-xs font-black uppercase tracking-tight leading-snug", isLatest ? "text-gray-800" : "text-gray-500")}>
                                {step.activity}
                              </h4>
                              <span className="text-[9px] text-gray-400 font-bold tabular-nums whitespace-nowrap pt-0.5">
                                {new Date(step.date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                            <p className="text-[10px] font-medium text-purple-400 uppercase tracking-tight truncate mb-1">
                                {step.status || step.hub_code || "Shipment Scan"}
                            </p>
                            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-tight truncate">
                              {step.location || "Process"} · {new Date(step.date).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {isLatest && (
                                <div className="mt-3 bg-purple-50 rounded-lg p-2 border border-purple-100">
                                   <p className="text-[9px] text-purple-700 font-bold italic line-clamp-2">
                                      “{step.activity}”
                                   </p>
                                </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : activeTab === "tracking" ? (
                    <div className="space-y-4">
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="text-[9px] text-gray-400 font-black uppercase mb-1">Tracking ID</div>
                            <div className="text-xs font-bold text-gray-700">{shipment.awb || order.awb_code || "Not Assigned"}</div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="text-[9px] text-gray-400 font-black uppercase mb-1">Courier Partner</div>
                            <div className="text-xs font-bold text-gray-700">{shipment.courier || order.courier_name || "Pending"}</div>
                        </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 opacity-30 grayscale">
                        <Box className="w-10 h-10 mb-2" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-center">No Activity<br/>Found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-gray-50/50 p-4 border-t border-gray-100 flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                  <Truck className="w-4 h-4" />
               </div>
               <div>
                  <p className="text-[10px] font-black uppercase tracking-tight text-gray-500">Latest Status</p>
                  <p className="text-[11px] font-black text-gray-800">{order.status || "WAITING FOR PICKUP"}</p>
               </div>
               <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

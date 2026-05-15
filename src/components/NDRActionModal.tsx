"use client";
import { useState, useEffect, useCallback } from "react";
import { Modal } from "./ui";
import { Zap, Truck, MapPin, MessageSquare, Image as ImageIcon, Loader2, Clock, AlertCircle, Package } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface NDRActionModalProps {
  open: boolean;
  onClose: () => void;
  shipmentId: string;
  orderNumber?: string;
  awb?: string;
  shiprocketOrderId?: string;
  onSuccess?: () => void;
}

export default function NDRActionModal({ open, onClose, shipmentId: initialShipmentId, orderNumber, awb, shiprocketOrderId, onSuccess }: NDRActionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [resolvedShipmentId, setResolvedShipmentId] = useState(initialShipmentId);
  const [resolvedShiprocketOrderId, setResolvedShiprocketOrderId] = useState(shiprocketOrderId);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [trackingHistory, setTrackingHistory] = useState<any[]>([]);
  const [action, setAction] = useState("");
  const [comments, setComments] = useState("");
  const [showAddressFields, setShowAddressFields] = useState(false);
  const [addressData, setAddressData] = useState({
    address: "",
    address_2: "",
    city: "",
    state: "",
    pincode: "",
    phone: ""
  });

  // Fetch tracking history if AWB or Shipment ID is available
  const fetchTracking = useCallback(async () => {
    const termToUse = shiprocketOrderId || initialShipmentId || awb;
    if (!termToUse || termToUse === "undefined" || termToUse === "null") return;
    
    try {
      setHistoryLoading(true);
      
      // Fetch data from our bridge API
      const res = await fetch(`/api/orders/shiprocket/${termToUse}`);
      if (res.ok) {
        const json = await res.json();
        
        if (json.order) {
          // Auto-resolve the real Shipment ID and Order ID from the verified response
          const realShipmentId = json.shipment_id || json.order.shipment_id || (json.order.shipments?.[0]?.id) || json.order.id;
          const realOrderId = json.shiprocket_order_id || json.order.id;

          if (realShipmentId && !String(realShipmentId).startsWith("LOCAL-") && !String(realShipmentId).startsWith("undefined")) {
            setResolvedShipmentId(String(realShipmentId));
          }
          if (realOrderId && !String(realOrderId).startsWith("LOCAL-") && !String(realOrderId).startsWith("undefined")) {
            setResolvedShiprocketOrderId(String(realOrderId));
          }
        }

        // Check if we got tracking data back
        const activities = json.tracking?.tracking_data?.shipment_track_activities || 
                           json.tracking?.shipment_track_activities || 
                           json.tracking?.data?.shipment_track_activities ||
                           [];
        
        if (activities.length > 0) {
          setTrackingHistory(activities);
        } else if (json.tracking?.tracking_data?.error) {
          setTrackingHistory([{
            activity: "Tracking Error",
            date: new Date().toISOString(),
            status: "Error",
            location: json.tracking.tracking_data.error
          }]);
        } else if (json.error || json.details) {
          setTrackingHistory([{
            activity: "System Alert",
            date: new Date().toISOString(),
            status: "Exception",
            location: json.details || json.error
          }]);
        }
      } else {
        // If primary fails, try direct AWB fallback if available
        if (awb && awb !== termToUse) {
           const awbRes = await fetch(`/api/orders/shiprocket/${awb}`);
           if (awbRes.ok) {
              const awbJson = await awbRes.json();
              const activities = awbJson.tracking?.tracking_data?.shipment_track_activities || [];
              if (activities.length > 0) setTrackingHistory(activities);
           }
        }
      }
    } catch (err) {
      console.error("Failed to fetch tracking history", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [shiprocketOrderId, initialShipmentId, awb]);

  useEffect(() => {
    if (open) {
      fetchTracking();
    }
  }, [open, fetchTracking]);

  const actions = [
    { id: "re_attempt", label: "Re-attempt Delivery", icon: Truck, description: "Standard next-day delivery attempt" },
    { id: "deferred", label: "Deferred Re-attempt", icon: Clock, description: "Schedule for a specific date (Add to comments)" },
    { id: "address_update", label: "Address Update", icon: MapPin, description: "Correct address and re-attempt" },
    { id: "escalate", label: "Fake Attempt Escalation", icon: AlertCircle, description: "Report rider for false delivery attempt" },
    { id: "return_to_origin", label: "RTO (Return to Origin)", icon: Zap, description: "Cancel delivery and return to warehouse" },
    { id: "provide_details", label: "Provide Extra Info", icon: MessageSquare, description: "Submit landmarks or alternate contact" },
  ];

  const handleSubmit = async () => {
    if (!action) return toast.error("Please select an action");
    if (!resolvedShipmentId) return toast.error("Could not resolve Shipment ID. Please use the 'Open Seller Panel' button.");
    
    setLoading(true);
    try {
      const res = await fetch("/api/shiprocket/ndr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: resolvedShipmentId,
          action: action === "address_update" ? "re_attempt" : action, // Shiprocket uses re_attempt even for address updates
          comments: comments,
          address_data: action === "address_update" ? addressData : undefined
        })
      });

      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        onSuccess?.();
        onClose();
      } else {
        throw new Error(json.error || "Failed to process NDR action");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal 
      open={open} 
      onClose={onClose} 
      title={
        <div className="flex items-center justify-between w-full pr-8">
          <span className="font-black uppercase tracking-widest text-[10px] sm:text-[13px]">Shiprocket Intelligence — #{orderNumber || '???'}</span>
        </div>
      }
      maxWidth="max-w-4xl"
    >
      <div className="py-4 space-y-8 bg-[#f7f4ed]">
        {/* Rapid Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a 
            href={resolvedShiprocketOrderId && !String(resolvedShiprocketOrderId).startsWith("LOCAL") && String(resolvedShiprocketOrderId).length > 6
              ? `https://app.shiprocket.in/seller/orders/show/${resolvedShiprocketOrderId}`
              : `https://app.shiprocket.in/seller/orders?search=${orderNumber}`
            }
            target="_blank"
            className="flex flex-col items-center justify-center p-5 bg-[#f7f4ed] border border-[#eceae4] rounded-2xl hover:bg-[#eceae4] transition-all group shadow-sm active:scale-95"
          >
            <ImageIcon className="w-5 h-5 mb-2 text-[#1c1c1c]/40 group-hover:text-[#1c1c1c]" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-center text-[#5f5f5d]">Open Seller Panel</span>
          </a>
          
          <a 
            href={`https://app.shiprocket.in/seller/ndr?search=${orderNumber}`}
            target="_blank"
            className="flex flex-col items-center justify-center p-5 bg-[#f7f4ed] border border-[#eceae4] rounded-2xl hover:bg-[#eceae4] transition-all group shadow-sm active:scale-95"
          >
            <AlertCircle className="w-5 h-5 mb-2 text-[#1c1c1c]/40 group-hover:text-[#1c1c1c]" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-center text-[#5f5f5d]">NDR Dashboard</span>
          </a>
        </div>

        {/* Live Pulse Tracking - Dark High-Contrast Premium Section */}
        <div className="bg-[#1c1c1c] text-[#f7f4ed] p-4 sm:p-8 rounded-[24px] sm:rounded-[32px] border border-[#1c1c1c] shadow-2xl overflow-hidden relative group min-h-[200px] flex flex-col">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 shrink-0 gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#f7f4ed]/10 rounded-2xl flex items-center justify-center">
                <Truck className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#f7f4ed]">
                  Live Payload Sync
                </p>
                <p className="text-[9px] font-bold text-[#f7f4ed]/40 uppercase tracking-widest mt-0.5">
                  Shiprocket API Telemetry
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {historyLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
              <button 
                onClick={fetchTracking}
                className="px-4 py-2 bg-[#f7f4ed]/5 hover:bg-[#f7f4ed]/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-400 border border-[#f7f4ed]/10 transition-all disabled:opacity-50"
                disabled={historyLoading}
              >
                Force Sync
              </button>
            </div>
          </div>
            
          <div className="max-h-[280px] overflow-y-auto space-y-8 pr-4 custom-scrollbar">
            {trackingHistory.length > 0 ? (
              trackingHistory.map((step, i) => {
                const isLatest = i === 0;
                return (
                  <div key={i} className="flex gap-3 sm:gap-6 relative">
                    <div className="w-[2px] bg-[#f7f4ed]/10 absolute left-[7px] top-4 bottom-[-32px] last:hidden" />
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 border-[#1c1c1c] ring-2 z-10 mt-1 shrink-0 transition-all",
                      isLatest ? "bg-blue-500 ring-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-125" : "bg-[#f7f4ed]/20 ring-[#f7f4ed]/5"
                    )} />
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-6">
                        <p className={cn("text-[11px] font-black uppercase tracking-tight leading-snug", isLatest ? "text-[#f7f4ed]" : "text-[#f7f4ed]/40")}>
                          {step.activity}
                        </p>
                        <span className="text-[9px] text-[#f7f4ed]/40 font-black tabular-nums bg-[#f7f4ed]/5 px-2.5 py-1 rounded-lg">
                          {step.date && mounted ? new Date(step.date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter",
                          isLatest ? "bg-blue-500/20 text-blue-400" : "bg-[#f7f4ed]/5 text-[#f7f4ed]/20"
                        )}>
                          {step.status || "TRANSIT"}
                        </span>
                        <p className="text-[10px] text-[#f7f4ed]/40 font-bold uppercase tracking-widest flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" /> {step.location || "Central Hub"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : !historyLoading && (
              <div className="flex flex-col items-center justify-center py-12 opacity-20 grayscale">
                <Package className="w-12 h-12 mb-4" />
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-center leading-relaxed">No Activity<br/>Synchronized</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100/50">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Protocol Required</p>
          </div>
          <p className="text-xs font-bold text-amber-900/60 leading-relaxed">
            Shipment marked as <span className="text-amber-900">NDR (Non-Delivery Report)</span>. Executive override required to authorize re-attempt or returns.
          </p>
        </div>

        <div className="space-y-4">
          <label className="text-[10px] font-black text-[#1c1c1c]/40 uppercase tracking-[0.2em] px-1">Executive Override Action</label>
          <div className="grid grid-cols-1 gap-3">
            {actions.map((act) => (
              <button
                key={act.id}
                onClick={() => {
                  setAction(act.id);
                  setShowAddressFields(act.id === "address_update");
                }}
                className={cn(
                  "flex items-start gap-4 p-4 rounded-2xl border transition-all text-left group",
                  action === act.id 
                    ? "bg-[#1c1c1c] border-[#1c1c1c] text-[#f7f4ed] shadow-xl" 
                    : "bg-[#f7f4ed] border-[#eceae4] text-[#1c1c1c] hover:bg-[#eceae4] hover:shadow-sm"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                  action === act.id ? "bg-[#f7f4ed]/10" : "bg-[#eceae4] group-hover:bg-[#f7f4ed]"
                )}>
                  <act.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-tight">{act.label}</p>
                  <p className={cn(
                    "text-[10px] font-bold leading-tight mt-1 transition-colors",
                    action === act.id ? "text-[#f7f4ed]/40" : "text-[#5f5f5d]/60"
                  )}>{act.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {showAddressFields && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500 bg-[#eceae4]/30 p-6 rounded-[24px] border border-[#eceae4]">
            <h4 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-[0.2em] mb-2">Refined Destination Parameters</h4>
            <div className="space-y-3">
              <input 
                placeholder="Full Street Address" 
                className="w-full bg-[#f7f4ed] border border-[#eceae4] rounded-xl px-4 py-3.5 text-xs font-black focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/10 transition-all" 
                value={addressData.address}
                onChange={e => setAddressData({...addressData, address: e.target.value})}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input 
                  placeholder="City" 
                  className="bg-[#f7f4ed] border border-[#eceae4] rounded-xl px-4 py-3.5 text-xs font-black focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/10 transition-all" 
                  value={addressData.city}
                  onChange={e => setAddressData({...addressData, city: e.target.value})}
                />
                <input 
                  placeholder="State" 
                  className="bg-[#f7f4ed] border border-[#eceae4] rounded-xl px-4 py-3.5 text-xs font-black focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/10 transition-all" 
                  value={addressData.state}
                  onChange={e => setAddressData({...addressData, state: e.target.value})}
                />
                <input 
                  placeholder="Pincode" 
                  className="bg-[#f7f4ed] border border-[#eceae4] rounded-xl px-4 py-3.5 text-xs font-black focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/10 transition-all" 
                  value={addressData.pincode}
                  onChange={e => setAddressData({...addressData, pincode: e.target.value})}
                />
                <input 
                  placeholder="Secondary Phone" 
                  className="bg-[#f7f4ed] border border-[#eceae4] rounded-xl px-4 py-3.5 text-xs font-black focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/10 transition-all" 
                  value={addressData.phone}
                  onChange={e => setAddressData({...addressData, phone: e.target.value})}
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <label className="text-[10px] font-black text-[#1c1c1c]/40 uppercase tracking-[0.2em] px-1">Operational Brief / Comments</label>
          <textarea 
            className="w-full bg-[#f7f4ed] border border-[#eceae4] rounded-2xl px-4 py-4 text-xs font-black min-h-[100px] focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/10 transition-all placeholder:text-[#5f5f5d]/20" 
            placeholder="Specify landmarks, delivery time-windows, or specific customer requests..."
            value={comments}
            onChange={e => setComments(e.target.value)}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !action}
          className="w-full py-5 bg-[#1c1c1c] text-[#f7f4ed] rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-current" />}
          Execute Protocol
        </button>
      </div>
    </Modal>
  );
}

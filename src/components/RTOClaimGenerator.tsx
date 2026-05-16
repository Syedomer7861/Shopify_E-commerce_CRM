"use client";
import { useState } from "react";
import { FileText, Download, CheckCircle, AlertCircle } from "lucide-react";
import { Order, Customer } from "@/types";
import { cn } from "@/lib/utils";

interface RTOClaimGeneratorProps {
  order: Order;
  customer: Customer;
}

export default function RTOClaimGenerator({ order, customer }: RTOClaimGeneratorProps) {
  const [generated, setGenerated] = useState(false);

  const generateReport = () => {
    const report = `
SHIPROCKET RTO CLAIM REPORT
---------------------------
Order ID: ${order.shopify_order_id || order.order_number}
AWB Number: ${order.tracking_number || "N/A"}
Customer Name: ${customer.name}
Phone: ${customer.phone}
Total Value: ₹${order.total_price}

TIMELINE & EVIDENCE:
- Order Placed: ${new Date(order.ordered_at).toLocaleString()}
- Delivery Status: RTO (Returned to Origin)
- Agent Verification: Customer was reached, confirmed intent, but delivery failed.

REASON FOR CLAIM:
Shipment marked as RTO despite successful customer verification.
    `;
    
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RTO_Claim_${order.order_number}.txt`;
    link.click();
    setGenerated(true);
    setTimeout(() => setGenerated(false), 3000);
  };

  return (
    <div className="bg-white border border-rose-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-900">RTO detected</h4>
            <p className="text-[10px] text-gray-500">Recover lost shipping costs</p>
          </div>
        </div>
        <button 
          onClick={generateReport}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
            generated 
              ? "bg-emerald-500 text-white" 
              : "bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-200"
          )}
        >
          {generated ? (
            <><CheckCircle className="w-3 h-3" /> Report Downloaded</>
          ) : (
            <><Download className="w-3 h-3" /> Generate Claim Report</>
          )}
        </button>
      </div>
      <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 text-[10px] text-gray-600 leading-relaxed italic">
        &quot;Shipment marked as RTO despite successful customer verification. Requesting reimbursement for shipping charges.&quot;
      </div>
    </div>
  );
}

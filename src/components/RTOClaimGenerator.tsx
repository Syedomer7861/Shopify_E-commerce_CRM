"use client";
import { Download, FileText, CheckCircle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface RTOClaimGeneratorProps {
  order: any;
  customer: any;
}

export default function RTOClaimGenerator({ order, customer }: RTOClaimGeneratorProps) {
  const generateClaim = () => {
    const claimText = `
CUREFOREVER RTO INSURANCE CLAIM
--------------------------------
Order ID: ${order.shopify_order_id || order.order_number}
Order Date: ${formatDate(order.ordered_at)}
Customer Name: ${customer.name}
Phone: ${customer.phone}
Address: ${customer.address}, ${customer.city}, ${customer.state} ${customer.zip}

CLAIM DETAILS
-------------
Total Order Value: ${formatCurrency(order.total_price)}
Reason for RTO: Delivery Refused / Unreachable
RTO Date: ${formatDate(new Date().toISOString())}

This is a formal request for insurance reimbursement for the above-mentioned RTO order. 
The items were shipped in good condition but were not accepted by the customer.

Signed,
CureForever Fulfillment Team
    `.trim();

    const element = document.createElement("a");
    const file = new Blob([claimText], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `RTO_Claim_${order.order_number || order.shopify_order_id}.txt`;
    document.body.appendChild(element);
    element.click();
    toast.success("RTO Claim Document Generated!");
  };

  return (
    <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center shadow-sm">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-black text-rose-900 tracking-tight leading-none">RTO Insurance Hub</h3>
          <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest mt-1">Expedite recovery for this order</p>
        </div>
      </div>
      
      <p className="text-xs text-rose-700 font-medium leading-relaxed">
        This order has been flagged as **RTO**. You can automatically generate a pre-filled insurance claim document to submit for reimbursement.
      </p>

      <button 
        onClick={generateClaim}
        className="btn-primary w-full bg-rose-600 hover:bg-rose-700 border-rose-700 shadow-lg shadow-rose-200 py-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-black"
      >
        <Download className="w-4 h-4" /> Generate Insurance Claim
      </button>
      
      <div className="flex items-center gap-2 text-[9px] text-rose-400 font-bold uppercase tracking-widest justify-center pt-1">
        <CheckCircle className="w-3 h-3" /> Pre-filled with order data
      </div>
    </div>
  );
}

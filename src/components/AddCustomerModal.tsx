"use client";
import { useState } from "react";
import { UserPlus, Phone, Mail, FileText, Loader2, ShoppingBag, DollarSign, Calendar } from "lucide-react";
import { Modal } from "./ui";
import { createClient } from "@/lib/supabase";
import { logAuditEvent } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone-utils";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { isDemoMode } from "@/lib/demo";

interface AddCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddCustomerModal({ open, onClose, onSuccess }: AddCustomerModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
    productName: "",
    productPrice: "",
    orderDate: format(new Date(), "yyyy-MM-dd")
  });

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name || !formData.phone) {
      toast.error("Name and Phone are required");
      return;
    }

    const isDemo = isDemoMode();
    if (isDemo) {
      setLoading(true);
      setTimeout(() => {
        toast.success("Demo: Customer added successfully (local simulation)");
        setFormData({ 
          name: "", phone: "", email: "", notes: "", 
          productName: "", productPrice: "", 
          orderDate: format(new Date(), "yyyy-MM-dd") 
        });
        onSuccess();
        onClose();
        setLoading(false);
      }, 1000);
      return;
    }

    setLoading(true);
    try {
      // 1. Insert Customer
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .insert([{
          name: formData.name,
          phone: normalizePhone(formData.phone),
          email: formData.email || null,
          notes: formData.notes || null,
          segment: "one_time"
        }])
        .select()
        .single();

      if (customerError) {
        if (customerError.code === "23505") {
          toast.error("A customer with this phone number already exists");
        } else {
          toast.error(customerError.message);
        }
        setLoading(false);
        return;
      }

      // 2. If order details are provided, insert Order
      if (formData.productName && formData.productPrice) {
        const { error: orderError } = await supabase
          .from("orders")
          .insert([{
            customer_id: customerData.id,
            order_number: `MANUAL-${Math.floor(1000 + Math.random() * 9000)}`,
            total_price: parseFloat(formData.productPrice),
            ordered_at: new Date(formData.orderDate).toISOString(),
            delivery_status: "pending",
            source: "manual",
            line_items: [{ 
              name: formData.productName, // Adding 'name' for profile page compatibility
              title: formData.productName, 
              price: parseFloat(formData.productPrice), 
              qty: 1, // Adding 'qty' for profile page compatibility
              quantity: 1 
            }]
          }]);

        if (orderError) {
          toast.error(`Order failed: ${orderError.message}`);
        } else {
          await logAuditEvent({
            entityType: "customer",
            entityId: customerData.id,
            action: "create_with_order",
            summary: `Created customer ${formData.name} with an initial manual order`,
            metadata: { productName: formData.productName, productPrice: formData.productPrice },
          });
          toast.success("Customer & Order added successfully");
        }
      } else {
        await logAuditEvent({
          entityType: "customer",
          entityId: customerData.id,
          action: "create",
          summary: `Created customer ${formData.name}`,
        });
        toast.success("Customer added successfully");
      }

      setFormData({ 
        name: "", phone: "", email: "", notes: "", 
        productName: "", productPrice: "", 
        orderDate: format(new Date(), "yyyy-MM-dd") 
      });
      onSuccess();
      onClose();
    } catch (err) {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal 
      open={open} 
      onClose={onClose} 
      title="Add New Customer"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {loading ? "Adding..." : "Add Customer"}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto px-1 scroller-hide">
        {/* Customer Section */}
        <div className="space-y-4">
          <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Customer Details</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Name *</label>
              <div className="relative">
                <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" required placeholder="John Doe" className="input pl-9"
                  value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Phone *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="tel" required placeholder="+91 98765 43210" className="input pl-9"
                  value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">Email (Optional)</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="email" placeholder="john@example.com" className="input pl-9"
                value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Order Section */}
        <div className="space-y-4 border-t border-gray-100 pt-5">
           <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Initial Order Details (Optional)</div>
           <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Product Name</label>
              <div className="relative">
                <ShoppingBag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="e.g. Health Kit" className="input pl-9"
                  value={formData.productName} onChange={e => setFormData({ ...formData, productName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Price</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="number" placeholder="0.00" className="input pl-9"
                    value={formData.productPrice} onChange={e => setFormData({ ...formData, productPrice: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="date" className="input pl-9 text-xs"
                    value={formData.orderDate} onChange={e => setFormData({ ...formData, orderDate: e.target.value })} />
                </div>
              </div>
            </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-700">Notes (Optional)</label>
          <div className="relative">
            <FileText className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <textarea placeholder="Any additional details..." className="input pl-9 min-h-[60px] py-2"
              value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

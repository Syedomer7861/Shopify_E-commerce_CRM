export type CustomerSegment = "repeat" | "one_time" | "inactive" | "risky";

export type DeliveryStatus = "pending" | "in_transit" | "out_for_delivery" | "delivered" | "rto" | "failed";

export type FulfillmentStatus = "unfulfilled" | "partial" | "fulfilled";

export type TaskType = "review" | "reorder" | "final_followup" | "recovery";

export type TaskStatus = "pending" | "due" | "done" | "rescheduled" | "skipped" | "cancelled" | "overdue";

export type CallOutcome = "done" | "rescheduled" | "no_answer" | "skipped";

export type OrderSource = "excel" | "manual" | "shiprocket";

export interface Customer {
  id: string;
  shopify_customer_id?: string;
  name: string;
  email?: string;
  phone: string;
  alt_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  custom_meta?: Record<string, any>;
  segment: CustomerSegment;
  rto_flag: boolean;
  rto_count: number;
  total_orders: number;
  last_order_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface LineItem {
  name: string;
  qty: number;
  price: number;
  product_id?: string;
  title?: string; // Support for Shopify/Manual field name
  quantity?: number; // Support for Shopify/Manual field name
}

export interface Order {
  id: string;
  customer_id: string;
  shopify_order_id?: string;
  order_number?: string;
  line_items: LineItem[];
  total_price?: number;
  subtotal?: number;
  total_discounts?: number;
  shipping_charges?: number;
  fulfillment_status: FulfillmentStatus;
  tracking_number?: string;
  delivery_status: DeliveryStatus;
  ordered_at: string;
  delivered_at?: string;
  source: OrderSource;
  created_at: string;
  updated_at: string;
  customer?: Customer;
}

export interface AbandonedCart {
  id: string;
  customer_id?: string;
  phone: string;
  email?: string;
  cart_token: string;
  total_price: number;
  subtotal?: number;
  total_discounts?: number;
  abandoned_at: string;
  line_items: any[];
  custom_meta?: Record<string, any>;
  recovery_status: "pending" | "recovered" | "cancelled";
  created_at: string;
  customer?: Customer;
}

export interface Task {
  id: string;
  order_id?: string;
  abandoned_cart_id?: string;
  customer_id: string;
  task_type: TaskType;
  due_date: string;
  status: TaskStatus;
  completed_at?: string;
  rescheduled_to?: string;
  created_at: string;
  customer?: Customer;
  order?: Order;
  abandoned_cart?: AbandonedCart;
}

export interface CallLog {
  id: string;
  task_id: string;
  customer_id: string;
  outcome: CallOutcome;
  note?: string;
  called_at: string;
  agent_name?: string;
  customer?: Customer;
  task?: Task;
}

export interface Settings {
  id: string;
  review_offset_days: number;
  reorder_offset_days: number;
  final_offset_days: number;
  inactive_threshold_days: number;
  whatsapp_enabled: boolean;
  whatsapp_phone_id?: string;
  whatsapp_token?: string;
  whatsapp_bridge_url?: string;
  whatsapp_admin_phone?: string;
  updated_at: string;
}

export interface ProductOverride {
  id: string;
  shopify_product_id: string;
  product_name: string;
  review_offset_days?: number;
  reorder_offset_days?: number;
  final_offset_days?: number;
  created_at: string;
}

export interface UserPermissions {
  view_analytics: boolean;
  can_import: boolean;
  can_delete: boolean;
  manage_team: boolean;
}

export interface Profile {
  id: string;
  email: string;
  name?: string;
  role: "admin" | "agent" | "superadmin";
  permissions: UserPermissions;
  is_active: boolean;
  created_at: string;
}

export interface DashboardData {
  todayTasks: (Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart })[];
  overdueTasks: (Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart })[];
  upcomingTasks: (Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart })[];
  recentActivity: CallLog[];
  counts: {
    today: number;
    overdue: number;
    upcoming: number;
    doneThisWeek: number;
  };
  profile?: Profile;
}

export type CustomerSegment = "repeat" | "one_time" | "inactive" | "risky" | "whale" | "loyalist" | "bargain_hunter" | "risky_returner";

export type DeliveryStatus = "pending" | "in_transit" | "out_for_delivery" | "delivered" | "rto" | "failed";

export type FulfillmentStatus = "unfulfilled" | "partial" | "fulfilled";

export type TaskType = "review" | "reorder" | "final_followup" | "recovery" | "issue_resolution" | "transit_update" | "cod_verify" | "ndr" | "manager_audit" | "welcome_call" | "win_back" | "vip_followup" | "flagged";

export type TaskStatus = "pending" | "due" | "done" | "rescheduled" | "skipped" | "cancelled" | "overdue";

export type CallOutcome = "done" | "rescheduled" | "no_answer" | "skipped" | "whatsapp";
export type CallDisposition =
  | "interested"
  | "callback_requested"
  | "purchased"
  | "support_needed"
  | "not_interested"
  | "wrong_number"
  | "follow_up_later";

export type OrderSource = "excel" | "manual" | "shiprocket" | "shopify";

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
  last_wa_inbound_at?: string;
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
  payment_status?: string;
  payment_gateway?: string;
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
  assigned_to?: string;
  task_type: TaskType;
  due_date: string;
  priority_score?: number;
  status: TaskStatus;
  call_attempt_count: number;
  next_attempt_at?: string;
  completed_at?: string;
  rescheduled_to?: string;
  created_at: string;
  customer?: Customer;
  order?: Order;
  abandoned_cart?: AbandonedCart;
  
  // Manager Review Fields
  manager_processed_at?: string;
  manager_note?: string;
  manager_action?: "approved" | "rejected" | "shiprocket_updated";
}

export interface CallLog {
  id: string;
  task_id: string;
  customer_id: string;
  outcome: CallOutcome;
  disposition?: CallDisposition;
  follow_up_action?: string;
  note?: string;
  called_at: string;
  agent_name?: string;
  customer?: Customer;
  task?: Task;
}

export interface RawCallLog {
  id: string;
  agent_id: string;
  customer_phone: string;
  task_id?: string | null;
  status: "in_progress" | "completed";
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  recording_url?: string;
  created_at: string;
  agent?: Profile;
  task?: Task;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_email?: string;
  entity_type: string;
  entity_id?: string;
  action: string;
  summary: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface Settings {
  [key: string]: any;
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
  whatsapp_send_time?: string;
  whatsapp_review_template?: string;
  whatsapp_reorder_template?: string;
  whatsapp_recovery_template?: string;
  whatsapp_final_template?: string;
  whatsapp_app_id?: string;
  whatsapp_app_secret?: string;
  whatsapp_verify_token?: string;
  meta_review_name?: string;
  meta_reorder_name?: string;
  meta_recovery_name?: string;
  meta_final_name?: string;
  recovery_delay_hours?: number;
  wa_auto_welcome?: boolean;
  wa_auto_order_placed?: boolean;
  wa_auto_order_transit?: boolean;
  wa_auto_order_delivered?: boolean;
  wa_auto_cart_abandoned?: boolean;
  wa_auto_reorder?: boolean;
  wa_welcome_template?: string;
  wa_order_placed_template?: string;
  wa_order_transit_template?: string;
  wa_order_delivered_template?: string;
  wa_cart_abandoned_template?: string;
  wa_reorder_template?: string;
  shopify_store_domain?: string;
  shopify_api_key?: string;
  shopify_client_id?: string;
  shopify_api_secret?: string;
  shopify_refresh_token?: string;
  shopify_token_expires_at?: string | null;
  shopify_webhook_secret?: string;
  gmail_client_id?: string;
  gmail_client_secret?: string;
  gmail_project_id?: string;
  gmail_auth_uri?: string;
  gmail_token_uri?: string;
  gmail_auth_provider_x509_cert_url?: string;
  gmail_redirect_uris?: string[];
  gmail_refresh_token?: string;
  email_auto_welcome?: boolean;
  email_auto_order_placed?: boolean;
  email_auto_order_transit?: boolean;
  email_auto_order_delivered?: boolean;
  email_auto_cart_abandoned?: boolean;
  email_auto_reorder?: boolean;
  email_welcome_subject?: string;
  email_welcome_template?: string;
  email_order_placed_subject?: string;
  email_order_placed_template?: string;
  email_order_transit_subject?: string;
  email_order_transit_template?: string;
  email_order_delivered_subject?: string;
  email_order_delivered_template?: string;
  email_cart_abandoned_subject?: string;
  email_cart_abandoned_template?: string;
  email_reorder_subject?: string;
  email_reorder_template?: string;
  shiprocket_email?: string;
  shiprocket_password?: string;
  shiprocket_webhook_secret?: string;
  updated_at: string;
}

export interface ProductOverride {
  id: string;
  shopify_product_id: string;
  product_name: string;
  course_duration_days?: number;
  review_offset_days?: number;
  reorder_offset_days?: number;
  final_offset_days?: number;
  usage_notes?: string;
  is_priority?: boolean;
  upsell_product_name?: string;
  created_at: string;
}

export interface UserPermissions {
  view_analytics: boolean;
  can_import: boolean;
  can_delete: boolean;
  manage_team: boolean;
  manage_orders: boolean;
  manage_customers: boolean;
  send_whatsapp: boolean;
  audit_tasks: boolean;
  manage_automations: boolean;
}

export interface Profile {
  id: string;
  email: string;
  name?: string;
  role: "admin" | "agent" | "hr" | "manager";
  permissions: UserPermissions;
  is_active: boolean;
  status?: "online" | "break" | "meeting" | "lunch" | "away" | "offline";
  last_seen_at?: string;
  live_state?: {
    path: string;
    entityId?: string;
    action?: string;
    timestamp: string;
  } | null;
  assigned_segments?: CustomerSegment[] | null;
  assigned_task_types?: TaskType[] | null;
  is_demo?: boolean;
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

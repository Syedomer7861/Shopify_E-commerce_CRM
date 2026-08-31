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
  custom_meta?: Record<string, any>;
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
  wa_speed_preset?: string;
  wa_min_delay?: number;
  wa_max_delay?: number;
  wa_welcome_template?: string;
  wa_order_placed_template?: string;
  wa_order_transit_template?: string;
  wa_order_delivered_template?: string;
  wa_cart_abandoned_template?: string;
  wa_reorder_template?: string;
  wa_auto_out_for_delivery?: boolean;
  wa_out_for_delivery_template?: string;
  wa_auto_delivery_failed?: boolean;
  wa_delivery_failed_template?: string;
  wa_auto_stale_shipment?: boolean;
  wa_stale_shipment_template?: string;
  wa_auto_final_followup?: boolean;
  wa_final_followup_template?: string;
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
  // Optional so existing permission literals keep type-checking. Absent = false.
  manage_marketing?: boolean;
  manage_workspaces?: boolean;
  // Main-menu allowlist. Absent/null = every module visible (the default for
  // every role except a locked-down Workspace user). An array = show ONLY
  // these module keys in the sidebar's Main Menu, and redirect away from the
  // rest. Keys match the `nav` entries in Sidebar.tsx.
  nav_modules?: string[] | null;
}

export interface Profile {
  id: string;
  email: string;
  name?: string;
  role: "admin" | "agent" | "hr" | "manager" | "marketing";
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

/* ── Marketing workspace (ClickUp-style department module) ──────────
 * Self-contained: its own mkt_* tables, no coupling to the customer-callback
 * `tasks` engine above. See supabase/migrations/20260829c_marketing_workspace.sql
 */

export type MktPriority = "urgent" | "high" | "normal" | "low";
export type MktStatusType = "not_started" | "active" | "done";
export type MktLinkKind = "blocks" | "blocked_by" | "relates_to";
export type MktIntakeStatus = "new" | "accepted" | "rejected";
export type MktSpaceRole = "owner" | "member";

export interface MktSpace {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  position: number;
  archived: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // hydrated
  my_role?: MktSpaceRole;
  member_count?: number;
}

export interface MktSpaceMember {
  space_id: string;
  user_id: string;
  role: MktSpaceRole;
  added_by?: string | null;
  created_at: string;
  user?: Profile;
}

export interface MktStatus {
  id: string;
  name: string;
  color: string;
  type: MktStatusType;
}

export type MktFieldType = "text" | "number" | "money" | "select" | "date" | "checkbox" | "url" | "user";

export interface MktCustomField {
  id: string;
  name: string;
  type: MktFieldType;
  options?: string[]; // for type "select"
}

export interface MktList {
  id: string;
  space_id?: string | null;
  name: string;
  color?: string | null;
  icon?: string | null;
  position: number;
  archived: boolean;
  statuses: MktStatus[];
  custom_fields?: MktCustomField[];
  wip_limit?: number | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MktTask {
  id: string;
  list_id: string;
  parent_task_id?: string | null;
  title: string;
  description?: string | null;
  status: string; // one of the parent list's MktStatus ids
  priority: MktPriority;
  start_date?: string | null;
  due_date?: string | null;
  estimate_minutes?: number | null;
  assignees: string[];
  watchers: string[];
  tags: string[];
  custom_fields: Record<string, any>;
  position: number;
  source_ref?: Record<string, any> | null; // { customer_id?, order_id?, campaign_id?, product_id? }
  recurrence?: Record<string, any> | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  // hydrated relations
  subtasks?: MktTask[];
  comments?: MktComment[];
  links?: MktTaskLink[];
  list?: MktList;
}

export interface MktGoal {
  id: string;
  space_id: string;
  title: string;
  metric: "tasks_done";
  target: number;
  period_start: string; // YYYY-MM-DD
  period_end: string;
  owner_id?: string | null;
  created_by?: string | null;
  created_at: string;
  // computed at read time
  progress?: number;
}

export interface MktTimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  minutes: number;
  note?: string | null;
  spent_on: string; // YYYY-MM-DD
  created_at: string;
  user?: Pick<Profile, "id" | "name" | "email">;
}

export interface MktComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  mentions: string[];
  created_at: string;
  edited_at?: string | null;
  author?: Profile;
}

export interface MktTaskLink {
  id: string;
  task_id: string;
  target_task_id: string;
  kind: MktLinkKind;
  created_at: string;
  target?: Pick<MktTask, "id" | "title" | "status" | "list_id">;
}

export interface MktTemplate {
  id: string;
  name: string;
  kind: "task" | "list";
  payload: Record<string, any>;
  created_by?: string | null;
  created_at: string;
}

export interface MktAutomation {
  id: string;
  list_id?: string | null;
  name: string;
  enabled: boolean;
  trigger: Record<string, any>; // { event: 'status_changed', to: '<statusId>' }
  actions: Record<string, any>[]; // [{ type: 'assign', to }, { type: 'notify' }, ...]
  created_by?: string | null;
  created_at: string;
}

export interface MktIntakeRequest {
  id: string;
  requester_id: string;
  title: string;
  details?: string | null;
  desired_date?: string | null;
  ref?: Record<string, any> | null;
  status: MktIntakeStatus;
  created_task_id?: string | null;
  created_at: string;
  requester?: Profile;
}

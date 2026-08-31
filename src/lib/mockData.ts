export const MOCK_TEAM = [
  {
    id: "demo-agent-1",
    full_name: "John Demo",
    name: "John Demo",
    email: "john@demo.com",
    role: "admin",
    is_demo: true,
    is_active: true,
    created_at: new Date().toISOString(),
    permissions: {
      view_analytics: true,
      can_import: true,
      can_delete: true,
      manage_team: true,
      manage_orders: true,
      manage_customers: true,
      send_whatsapp: true,
      audit_tasks: true,
      manage_automations: true,
    }
  },
  {
    id: "demo-agent-2",
    full_name: "Sarah Agent",
    name: "Sarah Agent",
    email: "sarah@demo.com",
    role: "agent",
    is_demo: false,
    is_active: true,
    created_at: new Date().toISOString(),
    permissions: {
      view_analytics: false,
      can_import: false,
      can_delete: false,
      manage_team: false,
      manage_orders: true,
      manage_customers: true,
      send_whatsapp: true,
      audit_tasks: false,
      manage_automations: false,
    }
  }
];

export const MOCK_CUSTOMERS = [
  {
    id: "demo-cust-1",
    name: "Rahul Sharma",
    phone: "9876543210",
    email: "rahul.demo@example.com",
    segment: "repeat",
    total_orders: 5,
    last_order_date: "2024-05-10",
    city: "Mumbai",
    state: "Maharashtra"
  },
  {
    id: "demo-cust-2",
    name: "Priya Patel",
    phone: "9123456789",
    email: "priya.demo@example.com",
    segment: "one_time",
    total_orders: 1,
    last_order_date: "2024-05-12",
    city: "Ahmedabad",
    state: "Gujarat"
  },
  {
    id: "demo-cust-3",
    name: "Amit Kumar",
    phone: "9988776655",
    email: "amit.demo@example.com",
    segment: "risky",
    total_orders: 2,
    last_order_date: "2024-05-08",
    city: "Delhi",
    state: "Delhi"
  }
];

export const MOCK_ORDERS = [
  {
    id: "demo-order-1",
    order_number: "CF-1001",
    customer_id: "demo-cust-1",
    total_price: 1599,
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    delivery_status: "delivered",
    tracking_number: "SR123456789",
    ordered_at: "2024-05-10T10:00:00Z",
    customer: MOCK_CUSTOMERS[0],
    line_items: [{ name: "Krill Oil Gold", quantity: 1, price: 1599 }]
  },
  {
    id: "demo-order-2",
    order_number: "CF-1002",
    customer_id: "demo-cust-2",
    total_price: 899,
    financial_status: "paid",
    fulfillment_status: "unfulfilled",
    delivery_status: "pending",
    ordered_at: "2024-05-12T14:30:00Z",
    customer: MOCK_CUSTOMERS[1],
    line_items: [{ name: "Wellness Tea", quantity: 2, price: 449.5 }]
  }
];

export const MOCK_TASKS = [
  {
    id: "demo-task-1",
    task_type: "recovery",
    status: "pending",
    due_date: new Date().toISOString().split('T')[0],
    priority_score: 85,
    customer_id: "demo-cust-1",
    order_id: "demo-order-1",
    customer: MOCK_CUSTOMERS[0],
    order: MOCK_ORDERS[0]
  },
  {
    id: "demo-task-2",
    task_type: "review",
    status: "pending",
    due_date: new Date().toISOString().split('T')[0],
    priority_score: 70,
    customer_id: "demo-cust-2",
    order_id: "demo-order-2",
    customer: MOCK_CUSTOMERS[1],
    order: MOCK_ORDERS[1]
  }
];

export const MOCK_ABANDONED_CARTS = [
  { 
    id: "mock-ac-1", 
    customer_id: "demo-cust-1", 
    phone: "9876543210", 
    cart_token: "abc-123", 
    total_price: 1599, 
    line_items: [{ name: "Krill Oil Gold", qty: 1, price: 1599 }], 
    recovery_status: "pending", 
    abandoned_at: new Date().toISOString(), 
    customer: MOCK_CUSTOMERS[0] 
  },
  { 
    id: "mock-ac-2", 
    customer_id: "demo-cust-2", 
    phone: "9123456789", 
    cart_token: "xyz-789", 
    total_price: 899, 
    line_items: [{ name: "Wellness Tea", qty: 2, price: 449.5 }], 
    recovery_status: "recovered", 
    abandoned_at: new Date(Date.now() - 86400000).toISOString(), 
    customer: MOCK_CUSTOMERS[1] 
  },
];

export const MOCK_CAMPAIGNS = [
  { 
    id: "mock-camp-1", 
    name: "Summer Wellness Sale", 
    status: "running", 
    target_segment: "all", 
    delivered_count: 850, 
    total_recipients: 1000, 
    template: { name: "Sale Alert" },
    created_at: new Date().toISOString() 
  },
  { 
    id: "mock-camp-2", 
    name: "Reorder Drive", 
    status: "completed", 
    target_segment: "repeat", 
    delivered_count: 500, 
    total_recipients: 500, 
    template: { name: "Reorder Reminder" },
    created_at: new Date(Date.now() - 172800000).toISOString() 
  },
];

export const MOCK_TEMPLATES = [
  { id: "mock-temp-1", name: "Welcome Message", category: "recovery", body: "Hi {{name}}, welcome to CureForever!", status: "approved" },
  { id: "mock-temp-2", name: "Reorder Reminder", category: "reorder", body: "Hi {{name}}, your supply of {{product}} is running low. Order now for 10% off!", status: "approved" },
];

export const MOCK_WORKFLOWS = [
  { id: "mock-wf-1", name: "7-Day Follow-up", trigger_event: "order_delivered", is_active: true, actions: [{ type: "message" }] },
  { id: "mock-wf-2", name: "Abandoned Recovery", trigger_event: "cart_abandoned", is_active: true, actions: [{ type: "create_task" }] },
];

// ── Workspace (Spaces → Lists → Tasks) demo data ──────────────
const _wsStatuses = [
  { id: "backlog", name: "Backlog", color: "#8b8b8b", type: "not_started" },
  { id: "in_progress", name: "In Progress", color: "#3b82f6", type: "active" },
  { id: "review", name: "Review", color: "#f59e0b", type: "active" },
  { id: "done", name: "Done", color: "#10b981", type: "done" },
];
const _iso = (d = 0) => new Date(Date.now() + d).toISOString();
const _date = (days = 0) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export const MOCK_WORKSPACE = {
  spaces: [
    { id: "mock-space-mkt", name: "Marketing", color: "#3b82f6", icon: "megaphone", position: 1000, archived: false, my_role: "owner", member_count: 4, created_at: _iso(-9e8), updated_at: _iso() },
    { id: "mock-space-ops", name: "Amazon Ops", color: "#f59e0b", icon: "shopping-cart", position: 2000, archived: false, my_role: "member", member_count: 3, created_at: _iso(-8e8), updated_at: _iso() },
  ] as any[],
  lists: [
    { id: "mock-list-content", space_id: "mock-space-mkt", name: "Content Calendar", color: "#3b82f6", icon: null, position: 1000, archived: false, statuses: _wsStatuses, wip_limit: null, created_at: _iso(), updated_at: _iso() },
    { id: "mock-list-ads", space_id: "mock-space-mkt", name: "Paid Ads", color: "#f43f5e", icon: null, position: 2000, archived: false, statuses: _wsStatuses, wip_limit: null, created_at: _iso(), updated_at: _iso() },
    { id: "mock-list-listings", space_id: "mock-space-ops", name: "Listings", color: "#f59e0b", icon: null, position: 1000, archived: false, statuses: _wsStatuses, wip_limit: null, created_at: _iso(), updated_at: _iso() },
  ] as any[],
  tasks: [
    { id: "mock-wt-1", list_id: "mock-list-content", parent_task_id: null, title: "Diwali offer — Instagram carousel", description: "Audience: repeat buyers. 5 slides.", status: "in_progress", priority: "high", start_date: null, due_date: _date(2), assignees: ["demo-agent-2"], watchers: [], tags: ["social", "festival"], custom_fields: {}, position: 1000, source_ref: null, recurrence: null, created_by: "demo-agent-1", created_at: _iso(), updated_at: _iso(), completed_at: null },
    { id: "mock-wt-2", list_id: "mock-list-content", parent_task_id: null, title: "November newsletter draft", description: "", status: "backlog", priority: "normal", start_date: null, due_date: _date(5), assignees: [], watchers: [], tags: ["email"], custom_fields: {}, position: 2000, source_ref: null, recurrence: { freq: "monthly" }, created_by: "demo-agent-1", created_at: _iso(), updated_at: _iso(), completed_at: null },
    { id: "mock-wt-3", list_id: "mock-list-content", parent_task_id: null, title: "Blog: 'How to store supplements'", description: "", status: "review", priority: "normal", start_date: null, due_date: _date(-1), assignees: ["demo-agent-1"], watchers: [], tags: ["seo", "blog"], custom_fields: {}, position: 3000, source_ref: null, recurrence: null, created_by: "demo-agent-1", created_at: _iso(), updated_at: _iso(), completed_at: null },
    { id: "mock-wt-4", list_id: "mock-list-ads", parent_task_id: null, title: "Q4 Meta campaign — creatives", status: "in_progress", description: "", priority: "urgent", start_date: null, due_date: _date(1), assignees: ["demo-agent-1", "demo-agent-2"], watchers: [], tags: ["ads"], custom_fields: {}, position: 1000, source_ref: null, recurrence: null, created_by: "demo-agent-1", created_at: _iso(), updated_at: _iso(), completed_at: null },
    { id: "mock-wt-5", list_id: "mock-list-ads", parent_task_id: null, title: "Google Shopping feed audit", status: "done", description: "", priority: "normal", start_date: null, due_date: _date(-3), assignees: ["demo-agent-2"], watchers: [], tags: ["ads"], custom_fields: {}, position: 2000, source_ref: null, recurrence: null, created_by: "demo-agent-1", created_at: _iso(), updated_at: _iso(), completed_at: _iso(-2e8) },
    { id: "mock-wt-6", list_id: "mock-list-listings", parent_task_id: null, title: "New SKU: Omega-3 2000mg — listing", status: "backlog", description: "", priority: "high", start_date: null, due_date: _date(4), assignees: [], watchers: [], tags: ["amazon"], custom_fields: {}, position: 1000, source_ref: null, recurrence: null, created_by: "demo-agent-1", created_at: _iso(), updated_at: _iso(), completed_at: null },
    { id: "mock-wt-7", list_id: "mock-list-listings", parent_task_id: null, title: "Fix suppressed listing — Vitamin D3", status: "in_progress", description: "", priority: "urgent", start_date: null, due_date: _date(0), assignees: ["demo-agent-1"], watchers: [], tags: ["amazon", "urgent"], custom_fields: {}, position: 2000, source_ref: null, recurrence: null, created_by: "demo-agent-1", created_at: _iso(), updated_at: _iso(), completed_at: null },
  ] as any[],
};

export const MOCK_ANALYTICS = {
  sales: [
    { date: "2024-05-10", amount: 12000 },
    { date: "2024-05-11", amount: 15000 },
    { date: "2024-05-12", amount: 18000 },
    { date: "2024-05-13", amount: 14000 },
    { date: "2024-05-14", amount: 22000 },
  ],
  topAgents: [
    { name: "Rahul S.", deals: 45, conversion: "12.5", revenue: 25000 },
    { name: "Priya P.", deals: 38, conversion: "10.2", revenue: 18000 },
    { name: "Amit K.", deals: 32, conversion: "9.8", revenue: 15000 },
  ]
};

export const MOCK_ACTIVITY_LOGS = [
  { id: 'm1', source: 'shopify', topic: 'order_paid', created_at: new Date(Date.now() - 60000).toISOString(), payload: { data: { customer_name: 'Rahul Kumar', total_price: '₹2,450' } } },
  { id: 'm2', activity_type: 'call_logged', created_at: new Date(Date.now() - 300000).toISOString(), description: 'Rahul called Amit about Order #1234' },
  { id: 'm3', source: 'shiprocket', topic: 'order_shipped', created_at: new Date(Date.now() - 600000).toISOString(), payload: { data: { customer_name: 'Priya Singh' } } },
  { id: 'm4', activity_type: 'status_change', created_at: new Date(Date.now() - 1200000).toISOString(), description: 'Agent Amit changed status to Online' },
  { id: 'm5', source: 'shopify', topic: 'order_created', created_at: new Date(Date.now() - 1800000).toISOString(), payload: { data: { customer_name: 'Vikram Seth', total_price: '₹1,250' } } },
  { id: 'm6', activity_type: 'task_completed', created_at: new Date(Date.now() - 3600000).toISOString(), description: 'Agent Priya resolved a recovery task' }
];

export const MOCK_ADMIN_LOGS = [
  { id: 'al1', event_type: 'security_audit', description: 'Failed login attempt from unauthorized IP 192.168.1.45 blocked.', created_at: new Date(Date.now() - 15 * 60000).toISOString(), metadata: { ip: '192.168.1.45', region: 'Mumbai' } },
  { id: 'al2', event_type: 'permission_change', description: 'Admin updated permissions for Agent Priya (Added WhatsApp access).', created_at: new Date(Date.now() - 2 * 3600000).toISOString(), metadata: { updated_by: 'System Admin' } },
  { id: 'al3', event_type: 'data_export', description: 'Customer database exported by HR Manager.', created_at: new Date(Date.now() - 5 * 3600000).toISOString(), metadata: { rows: 5400 } },
  { id: 'al4', event_type: 'config_update', description: 'Global WhatsApp template sync triggered.', created_at: new Date(Date.now() - 24 * 3600000).toISOString(), metadata: { templates: 12 } },
  { id: 'al5', event_type: 'integration_alert', description: 'Shiprocket API latency detected (2500ms). System switched to failover node.', created_at: new Date(Date.now() - 48 * 3600000).toISOString(), metadata: { node: 'AWS-Region-1' } }
];

export const MOCK_ORDER_DETAIL = {
  order: {
    id: "123456789",
    channel_order_id: "CF-1001",
    status: "DELIVERED",
    created_at: "2024-05-10T10:00:00Z",
    total: "1599.00",
    payment_method: "Prepaid",
    customer_name: "Rahul Sharma",
    customer_phone: "9876543210",
    billing_address: "123, Marine Drive, Mumbai, Maharashtra - 400001",
    order_items: [
      { name: "Krill Oil Gold", quantity: 1, selling_price: "1599.00", total: "1599.00" }
    ],
    shipments: [{ id: "sh-1", awb: "SR123456789", courier: "Delhivery" }]
  },
  tracking: {
    tracking_data: {
      shipment_track_activities: [
        { date: "2024-05-14T10:00:00Z", activity: "Delivered to customer", location: "Mumbai Hub", status: "Delivered" },
        { date: "2024-05-13T14:00:00Z", activity: "Out for delivery", location: "Mumbai Local", status: "Out for Delivery" },
        { date: "2024-05-12T09:00:00Z", activity: "Shipped from origin", location: "Delhi Warehouse", status: "In Transit" }
      ]
    }
  }
};

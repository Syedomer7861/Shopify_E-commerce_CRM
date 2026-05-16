import { Customer, Order, Task, CallLog, Settings, ProductOverride, DashboardData } from "@/types";
import { addDays, subDays, format } from "date-fns";

const today = new Date();
const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export const CUSTOMERS: Customer[] = [
  { id: "c1", name: "Priya Arora", phone: "+91 98765 43210", email: "priya@email.com", segment: "repeat", rto_flag: false, rto_count: 0, total_orders: 4, last_order_date: fmt(subDays(today, 5)), notes: "Prefers morning calls. Very engaged.", created_at: "2024-03-01", updated_at: "2026-03-28" },
  { id: "c2", name: "Rahul Mehra", phone: "+91 87654 32109", email: "rahul@email.com", segment: "repeat", rto_flag: false, rto_count: 0, total_orders: 3, last_order_date: fmt(subDays(today, 5)), created_at: "2024-04-10", updated_at: "2026-03-28" },
  { id: "c3", name: "Sneha Patel", phone: "+91 76543 21098", segment: "one_time", rto_flag: false, rto_count: 0, total_orders: 1, last_order_date: fmt(subDays(today, 5)), created_at: "2026-03-01", updated_at: "2026-03-28" },
  { id: "c4", name: "Anil Kumar", phone: "+91 65432 10987", segment: "repeat", rto_flag: false, rto_count: 0, total_orders: 5, last_order_date: fmt(subDays(today, 8)), created_at: "2023-11-15", updated_at: "2026-03-25" },
  { id: "c5", name: "Deepa Joshi", phone: "+91 54321 09876", segment: "inactive", rto_flag: false, rto_count: 0, total_orders: 1, last_order_date: fmt(subDays(today, 58)), created_at: "2026-01-15", updated_at: "2026-02-03" },
  { id: "c6", name: "Vikram Singh", phone: "+91 43210 98765", segment: "one_time", rto_flag: false, rto_count: 0, total_orders: 1, last_order_date: fmt(subDays(today, 5)), created_at: "2026-03-10", updated_at: "2026-03-28" },
  { id: "c7", name: "Kavya Nair", phone: "+91 32109 87654", segment: "repeat", rto_flag: false, rto_count: 0, total_orders: 2, last_order_date: fmt(subDays(today, 7)), created_at: "2025-09-20", updated_at: "2026-03-26" },
  { id: "c8", name: "Mohan Das", phone: "+91 21098 76543", segment: "risky", rto_flag: true, rto_count: 1, total_orders: 2, last_order_date: fmt(subDays(today, 25)), created_at: "2025-12-01", updated_at: "2026-02-09" },
  { id: "c9", name: "Sunita Rao", phone: "+91 10987 65432", segment: "one_time", rto_flag: false, rto_count: 0, total_orders: 1, last_order_date: fmt(subDays(today, 8)), created_at: "2026-03-05", updated_at: "2026-03-25" },
  { id: "c10", name: "Rajesh Verma", phone: "+91 99887 76655", segment: "inactive", rto_flag: false, rto_count: 0, total_orders: 1, last_order_date: fmt(subDays(today, 64)), created_at: "2025-12-20", updated_at: "2026-01-28" },
  { id: "c11", name: "Ananya Sharma", phone: "+91 88776 65544", segment: "repeat", rto_flag: false, rto_count: 0, total_orders: 3, last_order_date: fmt(subDays(today, 6)), created_at: "2025-06-15", updated_at: "2026-03-27" },
  { id: "c12", name: "Pooja Kapoor", phone: "+91 77665 54433", segment: "risky", rto_flag: true, rto_count: 2, total_orders: 3, last_order_date: fmt(subDays(today, 3)), created_at: "2025-05-10", updated_at: "2026-03-30" },
  { id: "c13", name: "Leena Shah", phone: "+91 66554 43322", segment: "repeat", rto_flag: false, rto_count: 0, total_orders: 2, last_order_date: fmt(subDays(today, 14)), created_at: "2025-10-22", updated_at: "2026-03-19" },
  { id: "c14", name: "Arjun Nair", phone: "+91 55443 32211", segment: "one_time", rto_flag: false, rto_count: 0, total_orders: 1, last_order_date: fmt(subDays(today, 11)), created_at: "2026-03-12", updated_at: "2026-03-22" },
  { id: "c15", name: "Meena Pillai", phone: "+91 44332 21100", segment: "one_time", rto_flag: false, rto_count: 0, total_orders: 1, last_order_date: fmt(subDays(today, 27)), created_at: "2026-03-06", updated_at: "2026-03-06" },
];

export const ORDERS: Order[] = [
  { id: "o1", customer_id: "c6", shopify_order_id: "1045", order_number: "#1045", line_items: [{ name: "Omega-3 Fish Oil", qty: 1, price: 1499, product_id: "p5" }], total_price: 1499, fulfillment_status: "fulfilled", tracking_number: "SR10045", delivery_status: "delivered", ordered_at: fmt(subDays(today, 7)), delivered_at: fmt(subDays(today, 5)), source: "shiprocket", created_at: fmt(subDays(today, 7)), updated_at: fmt(subDays(today, 5)) },
  { id: "o2", customer_id: "c3", shopify_order_id: "1044", order_number: "#1044", line_items: [{ name: "Vitamin D3+K2", qty: 1, price: 1299, product_id: "p4" }], total_price: 1299, fulfillment_status: "fulfilled", tracking_number: "SR10044", delivery_status: "delivered", ordered_at: fmt(subDays(today, 7)), delivered_at: fmt(subDays(today, 5)), source: "shiprocket", created_at: fmt(subDays(today, 7)), updated_at: fmt(subDays(today, 5)) },
  { id: "o3", customer_id: "c12", shopify_order_id: "1043", order_number: "#1043", line_items: [{ name: "Whey Protein Isolate", qty: 1, price: 1850, product_id: "p2" }], total_price: 1850, fulfillment_status: "fulfilled", tracking_number: "SR10043", delivery_status: "in_transit", ordered_at: fmt(subDays(today, 3)), source: "shiprocket", created_at: fmt(subDays(today, 3)), updated_at: fmt(subDays(today, 2)) },
  { id: "o4", customer_id: "c1", shopify_order_id: "1042", order_number: "#1042", line_items: [{ name: "Ashwagandha 500mg", qty: 1, price: 1199, product_id: "p1" }], total_price: 1199, fulfillment_status: "fulfilled", tracking_number: "SR10042", delivery_status: "delivered", ordered_at: fmt(subDays(today, 7)), delivered_at: fmt(subDays(today, 5)), source: "shiprocket", created_at: fmt(subDays(today, 7)), updated_at: fmt(subDays(today, 5)) },
  { id: "o5", customer_id: "c7", shopify_order_id: "1041", order_number: "#1041", line_items: [{ name: "Magnesium Glycinate", qty: 1, price: 1350, product_id: "p6" }], total_price: 1350, fulfillment_status: "fulfilled", tracking_number: "SR10041", delivery_status: "in_transit", ordered_at: fmt(subDays(today, 2)), source: "shiprocket", created_at: fmt(subDays(today, 2)), updated_at: fmt(subDays(today, 1)) },
  { id: "o6", customer_id: "c11", shopify_order_id: "1040", order_number: "#1040", line_items: [{ name: "Turmeric Curcumin", qty: 1, price: 1450, product_id: "p7" }], total_price: 1450, fulfillment_status: "fulfilled", tracking_number: "SR10040", delivery_status: "delivered", ordered_at: fmt(subDays(today, 8)), delivered_at: fmt(subDays(today, 6)), source: "shiprocket", created_at: fmt(subDays(today, 8)), updated_at: fmt(subDays(today, 6)) },
  { id: "o7", customer_id: "c7", shopify_order_id: "1039", order_number: "#1039", line_items: [{ name: "Ashwagandha 500mg", qty: 1, price: 1199, product_id: "p1" }], total_price: 1199, fulfillment_status: "fulfilled", tracking_number: "SR10039", delivery_status: "delivered", ordered_at: fmt(subDays(today, 20)), delivered_at: fmt(subDays(today, 19)), source: "shiprocket", created_at: fmt(subDays(today, 20)), updated_at: fmt(subDays(today, 19)) },
  { id: "o8", customer_id: "c2", shopify_order_id: "1038", order_number: "#1038", line_items: [{ name: "Whey Protein Isolate", qty: 1, price: 1850, product_id: "p2" }], total_price: 1850, fulfillment_status: "fulfilled", tracking_number: "SR10038", delivery_status: "delivered", ordered_at: fmt(subDays(today, 21)), delivered_at: fmt(subDays(today, 20)), source: "shiprocket", created_at: fmt(subDays(today, 21)), updated_at: fmt(subDays(today, 20)) },
  { id: "o9", customer_id: "c12", shopify_order_id: "1037", order_number: "#1037", line_items: [{ name: "Omega-3 Fish Oil", qty: 1, price: 1499, product_id: "p5" }], total_price: 1499, fulfillment_status: "fulfilled", tracking_number: "SR10037", delivery_status: "rto", ordered_at: fmt(subDays(today, 23)), source: "shiprocket", created_at: fmt(subDays(today, 23)), updated_at: fmt(subDays(today, 19)) },
  { id: "o10", customer_id: "c1", shopify_order_id: "1036", order_number: "#1036", line_items: [{ name: "Ashwagandha 500mg", qty: 1, price: 1199, product_id: "p1" }], total_price: 1199, fulfillment_status: "fulfilled", tracking_number: "SR10036", delivery_status: "delivered", ordered_at: fmt(subDays(today, 22)), delivered_at: fmt(subDays(today, 22)), source: "shiprocket", created_at: fmt(subDays(today, 22)), updated_at: fmt(subDays(today, 22)) },
  { id: "o11", customer_id: "c4", shopify_order_id: "1031", order_number: "#1031", line_items: [{ name: "Magnesium Glycinate", qty: 2, price: 2700, product_id: "p6" }], total_price: 2700, fulfillment_status: "fulfilled", tracking_number: "SR10031", delivery_status: "delivered", ordered_at: fmt(subDays(today, 23)), delivered_at: fmt(subDays(today, 21)), source: "shiprocket", created_at: fmt(subDays(today, 23)), updated_at: fmt(subDays(today, 21)) },
  { id: "o12", customer_id: "c5", shopify_order_id: "1027", order_number: "#1027", line_items: [{ name: "Collagen Peptides", qty: 1, price: 2199, product_id: "p8" }], total_price: 2199, fulfillment_status: "fulfilled", tracking_number: "SR10027", delivery_status: "delivered", ordered_at: fmt(subDays(today, 33)), delivered_at: fmt(subDays(today, 30)), source: "shiprocket", created_at: fmt(subDays(today, 33)), updated_at: fmt(subDays(today, 30)) },
];

export const TASKS: Task[] = [
  { id: "t11", order_id: "o6", customer_id: "c11", assigned_to: "a1", task_type: "review", due_date: fmt(addDays(today, 1)), status: "pending", created_at: fmt(subDays(today, 6)), call_attempt_count: 0 },
  { id: "t12", order_id: "o4", customer_id: "c1", assigned_to: "a2", task_type: "reorder", due_date: fmt(addDays(today, 15)), status: "pending", created_at: fmt(subDays(today, 5)), call_attempt_count: 0 },
  { id: "t13", order_id: "o6", customer_id: "c11", assigned_to: "a3", task_type: "reorder", due_date: fmt(addDays(today, 2)), status: "pending", created_at: fmt(subDays(today, 6)), call_attempt_count: 0 },
  { id: "t14", order_id: "o10", customer_id: "c1", assigned_to: "a1", task_type: "review", due_date: fmt(subDays(today, 17)), status: "done", completed_at: fmt(subDays(today, 17)), created_at: fmt(subDays(today, 22)), call_attempt_count: 1 },
  { id: "t15", order_id: "o7", customer_id: "c7", assigned_to: "a1", task_type: "review", due_date: fmt(subDays(today, 14)), status: "done", completed_at: fmt(subDays(today, 14)), created_at: fmt(subDays(today, 19)), call_attempt_count: 1 },
];

export const CALL_LOGS: CallLog[] = [
  { id: "cl1", task_id: "t14", customer_id: "c1", outcome: "done", note: "Happy with Ashwagandha results. Will reorder next month.", called_at: fmt(subDays(today, 17)), agent_name: "Sales Agent" },
  { id: "cl2", task_id: "t15", customer_id: "c7", outcome: "done", note: "Very satisfied. Asked about combo packs.", called_at: fmt(subDays(today, 14)), agent_name: "Sales Agent" },
  { id: "cl3", task_id: "t3", customer_id: "c3", outcome: "no_answer", note: "No response, will retry tomorrow.", called_at: fmt(subDays(today, 2)), agent_name: "Sales Agent" },
];

export const SETTINGS: Settings = {
  id: "s1",
  review_offset_days: 5,
  reorder_offset_days: 20,
  final_offset_days: 30,
  inactive_threshold_days: 45,
  whatsapp_enabled: false,
  updated_at: fmt(today),
};

export const PRODUCT_OVERRIDES: ProductOverride[] = [
  { id: "po1", shopify_product_id: "p2", product_name: "Whey Protein Isolate", review_offset_days: 3, reorder_offset_days: 15, created_at: fmt(subDays(today, 30)) },
  { id: "po2", shopify_product_id: "p1", product_name: "Ashwagandha 500mg", reorder_offset_days: 18, created_at: fmt(subDays(today, 20)) },
];

export const MOCK_RAW_CALLS = [
  {
    id: "rc1",
    agent_id: "a1",
    customer_phone: "9876543210",
    status: "in_progress",
    start_time: new Date(Date.now() - 120000).toISOString(),
    agent: { name: "Agent Rahul", avatar_url: null },
    task: { task_type: "cod_verify" }
  },
  {
    id: "rc2",
    agent_id: "a2",
    customer_phone: "8765432109",
    status: "completed",
    start_time: new Date(Date.now() - 600000).toISOString(),
    end_time: new Date(Date.now() - 300000).toISOString(),
    duration_seconds: 300,
    recording_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    agent: { name: "Agent Priya", avatar_url: null },
    task: { task_type: "recovery" }
  },
  {
    id: "rc3",
    agent_id: "a3",
    customer_phone: "7654321098",
    status: "completed",
    start_time: new Date(Date.now() - 1200000).toISOString(),
    end_time: new Date(Date.now() - 1000000).toISOString(),
    duration_seconds: 200,
    recording_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    agent: { name: "Agent Amit", avatar_url: null },
    task: { task_type: "review" }
  }
];

// Enrich tasks with customer+order
export function getEnrichedTasks(tasks: Task[]) {
  return tasks.map(t => {
    const cust = CUSTOMERS.find(c => c.id === t.customer_id);
    const ord = ORDERS.find(o => o.id === t.order_id);
    
    // Add fake live state for Demo presentation
    const assigned_profile = t.assigned_to === 'a1' ? {
      name: "Agent Rahul",
      live_state: { action: 'on_call', entityId: t.id, timestamp: new Date().toISOString() }
    } : null;

    return {
      ...t,
      customer: cust!,
      order: ord!,
      assigned_profile
    };
  });
}

export function getDashboardData(): DashboardData {
  const enriched = getEnrichedTasks(TASKS);
  
  return {
    todayTasks: enriched.filter(t => t.status === "due" || t.id === 't11') as any, // Force t11 for demo visibility
    overdueTasks: enriched.filter(t => t.status === "overdue") as any,
    upcomingTasks: enriched.filter(t => t.status === "pending" && t.id !== 't11') as any,
    recentActivity: CALL_LOGS.map(cl => ({
      ...cl,
      customer: CUSTOMERS.find(c => c.id === cl.customer_id)!,
    })),
    counts: {
      today: 12,
      overdue: 4,
      upcoming: 45,
      doneThisWeek: 156,
    },
  };
}

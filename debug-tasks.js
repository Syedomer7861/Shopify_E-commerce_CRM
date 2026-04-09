const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });

async function checkTasks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log("--- TASK GENERATOR DIAGNOSTIC ---");
  
  // 1. Fetch delivered orders
  const { data: orders, error: oError } = await supabase
    .from("orders")
    .select("id, delivery_status, delivered_at, customer_id")
    .eq("delivery_status", "delivered")
    .not("delivered_at", "is", null);

  if (oError) {
    console.error("Error fetching orders:", oError);
    return;
  }

  console.log(`Found ${orders.length} delivered orders.`);

  // 2. Fetch all tasks to see what exists
  const { data: allTasks } = await supabase.from("tasks").select("id, order_id, task_type");
  const taskMap = new Map();
  allTasks?.forEach(t => {
      if (!taskMap.has(t.order_id)) taskMap.set(t.order_id, []);
      taskMap.get(t.order_id).push(t.task_type);
  });

  // 3. Process orders
  for (const order of orders) {
      const existing = taskMap.get(order.id) || [];
      if (existing.length > 0) {
          console.log(`Order ${order.id} | SKIP: Already has tasks: ${existing.join(", ")}`);
          continue;
      }

      // Check customer RTO
      const { data: customer } = await supabase
        .from("customers").select("name, rto_flag").eq("id", order.customer_id).single();
      
      if (customer?.rto_flag) {
          console.log(`Order ${order.id} | SKIP: Customer ${customer.name} is RTO flagged.`);
          continue;
      }

      // Check Date
      const dDate = new Date(order.delivered_at);
      if (isNaN(dDate.getTime())) {
          console.log(`Order ${order.id} | SKIP: Invalid delivered_at: ${order.delivered_at}`);
          continue;
      }

      console.log(`Order ${order.id} | READY: Should have tasks generated.`);
  }
}

checkTasks();

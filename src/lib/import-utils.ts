import { createClient } from "@/lib/supabase";

function cleanNumber(val: any): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  // Handle exponential notation and remove currency/commas
  let clean = String(val).trim().replace(/[^\d.-]/g, "");
  // Remove duplicate decimal points if any
  const parts = clean.split(".");
  if (parts.length > 2) clean = parts[0] + "." + parts.slice(1).join("");
  return parseFloat(clean) || 0;
}

/**
 * Robustly parses dates from Excel/CSV strings.
 * Handles DD-MM-YYYY, DD/MM/YYYY, and standard formats.
 */
function parseSmartDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  
  // 1. Handle Excel Serial Numbers (e.g. 44561)
  if (typeof val === "number" || (!isNaN(Number(val)) && String(val).length < 10)) {
    const d = new Date((Number(val) - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d;
  }

  const s = String(val).trim();
  if (!s) return new Date();

  // 2. Manual Parsing - PRIORITIZE DD-MM-YYYY (India)
  // Split by common separators: -, /, space, or :
  const parts = s.split(/[-/ :]/);
  
  if (parts.length >= 3) {
    let day = parseInt(parts[0]);
    let month = parseInt(parts[1]) - 1; // 0-indexed month
    let year = parseInt(parts[2]);

    // Handle 2-digit years
    if (year < 100) year += 2000;

    // Detect if year is in parts[0] (YYYY-MM-DD)
    if (day > 1000) {
      const tempYear = day;
      day = year;
      year = tempYear;
      // month remains the middle part
    }

    // Safety: If month is > 12, it's definitely the day (MM-DD-YYYY swap)
    if (month >= 12 && day <= 12) {
      const temp = day;
      day = month + 1;
      month = temp - 1;
    }

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      // Create local date at midday to prevent TZ shifts
      const d = new Date(year, month, day, 12, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 3. Last Resort: Standard Parsing
  const lastResort = new Date(s);
  return isNaN(lastResort.getTime()) ? new Date() : lastResort;
}

export interface ImportRow {
  "Customer Name": string;
  "Phone Number": string;
  "Order Date": string;
  "Product Name": string;
  "Email"?: string;
  "Order ID"?: string;
  "Delivery Date"?: string;
  "Order Value"?: string | number;
  "Notes"?: string;
  "Address"?: string;
  "City"?: string;
  "State"?: string;
  "Zip"?: string;
  "Country"?: string;
  "Alt Phone"?: string;
  "Source"?: string;
  "Status"?: string;
  "Custom Meta"?: Record<string, any>;
}

export interface AbandonedRow {
  "Customer Name": string;
  "Phone Number": string;
  "Email"?: string;
  "Cart Token"?: string;
  "Total Value"?: string | number;
  "Product List"?: string;
  "Abandoned Date"?: string;
  "Address"?: string;
  "City"?: string;
  "State"?: string;
  "Zip"?: string;
  "Alt Phone"?: string;
  "Source"?: string;
  "Checkout Stage"?: string;
  "SMS Sent Count"?: number | string;
  "Whatsapp Sent Count"?: number | string;
  "Status"?: string;
  "Custom Meta"?: Record<string, any>;
}

export async function processAbandonedImport(rows: AbandonedRow[]) {
  const supabase = createClient();
  const results = { imported: 0, skipped: 0, errors: [] as string[] };

  for (const row of rows) {
    try {
      const phone = row["Phone Number"]?.toString().trim().replace(/\s/g, "");
      const name = row["Customer Name"] || "Abandoned Customer";
      if (!phone) {
        results.skipped++;
        continue;
      }

      // Prepare Custom Meta with additional fields
      const customMeta = {
        ...(row["Custom Meta"] || {}),
        source: row["Source"] || undefined,
        checkout_stage: row["Checkout Stage"] || undefined,
        sms_sent: row["SMS Sent Count"] || undefined,
        whatsapp_sent: row["Whatsapp Sent Count"] || undefined
      };

      // 1. Upsert Customer so they show up in the CRM
      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .upsert({
          name,
          phone,
          email: row["Email"] || null,
          address: row["Address"] || null,
          city: row["City"] || null,
          state: row["State"] || null,
          zip: row["Zip"] || null,
          alt_phone: row["Alt Phone"] || null,
          custom_meta: customMeta,
          segment: "risky", // Default for abandoned carts
          total_orders: 0
        }, { onConflict: "phone" })
        .select("id, custom_meta")
        .single();
      
      if (custErr) throw custErr;

      // 2. Insert/Update Abandoned Cart and link to Customer
      const totalPrice = cleanNumber(row["Total Value"]);
      const { data: cartData, error } = await supabase
        .from("abandoned_carts")
        .upsert({
          customer_id: customer.id,
          phone: phone,
          email: row["Email"] || null,
          cart_token: row["Cart Token"] || `manual_${Date.now()}_${Math.random()}`,
          total_price: totalPrice,
          abandoned_at: parseSmartDate(row["Abandoned Date"]).toISOString(),
          line_items: [{ title: row["Product List"] || "Unknown Product", price: totalPrice, quantity: 1 }],
          recovery_status: "pending"
        }, { onConflict: "cart_token" })
        .select("id, abandoned_at, customer_id")
        .single();

      if (error) throw error;

      // 3. Create/Update Recovery Task
      const abandonedAt = new Date(cartData.abandoned_at);
      const dueDate = new Date(abandonedAt.getTime() + 24 * 60 * 60 * 1000); // +1 day

      await supabase
        .from("tasks")
        .upsert({
          customer_id: cartData.customer_id,
          abandoned_cart_id: cartData.id,
          task_type: "recovery",
          due_date: dueDate.toISOString(),
          status: "pending"
        }, { onConflict: "abandoned_cart_id, task_type" });

      // Merge custom meta if needed (already mostly handled by upsert)
      if (row["Custom Meta"]) {
          await supabase.from("customers").update({
              custom_meta: { ...(customer as any).custom_meta, ...row["Custom Meta"] }
          }).eq("id", customer.id);
      }

      results.imported++;
    } catch (err: any) {
      console.error("Abandoned Import error:", row, err);
      results.skipped++;
    }
  }
  return results;
}

export async function processImport(rows: ImportRow[]) {
  const supabase = createClient();
  const results = { imported: 0, skipped: 0, errors: [] as string[] };

  for (const row of rows) {
    try {
      const phone = row["Phone Number"]?.toString().trim().replace(/\s/g, "");
      if (!phone) {
        results.skipped++;
        continue;
      }

      // 1. Find or Upsert Customer
      let customerId: string;
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id, total_orders")
        .eq("phone", phone)
        .single();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        await supabase
          .from("customers")
          .update({
            name: row["Customer Name"],
            email: row["Email"] || null,
            notes: row["Notes"] || null,
            address: row["Address"] || undefined,
            city: row["City"] || undefined,
            state: row["State"] || undefined,
            zip: row["Zip"] || undefined,
            country: row["Country"] || undefined,
            alt_phone: row["Alt Phone"] || undefined,
            custom_meta: { 
              ...(existingCustomer as any).custom_meta, 
              ...(row["Custom Meta"] || {}),
              source: row["Source"] || undefined
            },
            total_orders: (existingCustomer.total_orders || 0) + 1,
            segment: (existingCustomer.total_orders || 0) + 1 >= 2 ? "repeat" : "one_time"
          })
          .eq("id", customerId);
          
        // Mark abandoned carts as recovered for this customer
        await supabase
          .from("abandoned_carts")
          .update({ recovery_status: "recovered" })
          .eq("phone", phone)
          .eq("recovery_status", "pending");
          
      } else {
        const { data: newCustomer, error: custError } = await supabase
          .from("customers")
          .insert({
            name: row["Customer Name"],
            phone: phone,
            email: row["Email"] || null,
            notes: row["Notes"] || null,
            address: row["Address"] || null,
            city: row["City"] || null,
            state: row["State"] || null,
            zip: row["Zip"] || null,
            country: row["Country"] || null,
            alt_phone: row["Alt Phone"] || null,
            custom_meta: row["Custom Meta"] || {},
            segment: "one_time",
            total_orders: 1
          })
          .select("id")
          .single();
        
        if (custError) throw custError;
        customerId = newCustomer.id;
      }

      // 2. Add Order
      const totalPrice = cleanNumber(row["Order Value"]);
      const orderDate = parseSmartDate(row["Order Date"]);
      
      // Force 12:00 PM for the database to prevent TZ shifts in UI
      const orderAt = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate(), 12, 0, 0).toISOString();

      let deliveryStatus = "pending";
      let deliveredAt = null;
      
      // Check for explicit "Status" column first (Shiprocket style)
      const statusRaw = String(row["Status"] || "").toLowerCase();
      if (statusRaw.includes("delivered") || statusRaw === "delivered") {
          deliveryStatus = "delivered";
      }

      if (row["Delivery Date"]) {
        const d = parseSmartDate(row["Delivery Date"]);
        if (d.getFullYear() > 2010) {
          deliveryStatus = "delivered";
          deliveredAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString();
        }
      }
      
      // If status is delivered but no delivery date, fallback to order date
      if (deliveryStatus === "delivered" && !deliveredAt) {
          deliveredAt = orderAt;
      }

      const { error: orderError } = await supabase
        .from("orders")
        .upsert({
          customer_id: customerId,
          shopify_order_id: row["Order ID"] || `manual_${Date.now()}_${Math.random()}`,
          order_number: row["Order ID"] || null,
          total_price: totalPrice,
          ordered_at: orderAt,
          delivery_status: deliveryStatus,
          delivered_at: deliveredAt,
          source: "excel",
          line_items: [{ title: row["Product Name"] || "Imported Order", price: totalPrice, quantity: 1 }]
        }, { onConflict: "shopify_order_id" });

      if (orderError) throw orderError;
      results.imported++;

    } catch (err: any) {
      console.error("Import error for row:", row, err);
      results.errors.push(`Row with phone ${row["Phone Number"]}: ${err.message}`);
      results.skipped++;
    }
  }

  return results;
}

// Pure WhatsApp template helpers, safe for client components.

export function personaliseTemplate(template: string, data: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = new RegExp(`{{${key}}}`, "g");
    result = result.replace(placeholder, value?.toString() || "");
  }
  return result;
}

/**
 * Resolves standard system variables from customer, order, and cart data.
 */
export function getTemplateVariables(customer: any, order?: any, cart?: any, task?: any): Record<string, string> {
  const vars: Record<string, string> = {
    name: customer?.name || "Customer",
    first_name: customer?.name?.split(" ")[0] || "there",
    phone: customer?.phone || "",
    email: customer?.email || "",
    city: customer?.city || order?.customer?.city || "",
    state: customer?.state || order?.customer?.state || "",
    
    order_no: order?.order_number || order?.shopify_order_id || "your order",
    total_amount: order?.total_price?.toString() || cart?.total_price?.toString() || "0",
    tracking_no: order?.tracking_number || "Not Available",
    tracking_link: order?.tracking_number 
      ? `https://cureforever.shiprocket.co/tracking/${order.tracking_number}`
      : "https://cureforever.in/account",
    
    fulfillment_status: order?.fulfillment_status || "Processing",
    delivery_status: order?.delivery_status || "Pending",
    ordered_at: order?.ordered_at ? new Date(order.ordered_at).toLocaleDateString() : "Recently",
    
    product: order?.line_items?.[0]?.name || order?.line_items?.[0]?.title || cart?.line_items?.[0]?.name || "your items",
    items_list: (order?.line_items || cart?.line_items || [])
      .map((i: any) => i.name || i.title || "Item")
      .join(", ") || "your items",
    
    abandon_link: cart?.custom_meta?.ABANDONLINK || customer?.custom_meta?.ABANDONLINK || "https://cureforever.in/cart",
    due_date: task?.due_date ? new Date(task.due_date).toLocaleDateString() : "",
  };
  
  return vars;
}

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { customerId, lastMessage, taskType } = await req.json();

  try {
    // 1. Fetch Customer Context
    const { data: customer } = await supabase
      .from("customers")
      .select("name, segment, rto_count, orders(total_price, delivery_status, line_items)")
      .eq("id", customerId)
      .maybeSingle();

    if (!customer) throw new Error("Customer not found");

    const firstName = customer.name.split(" ")[0];
    const lastOrder = customer.orders?.[0];
    const productName = lastOrder?.line_items?.[0]?.name || "your order";

    let suggestion = "";

    // 2. Simple Rule-Based AI Logic (Can be replaced with LLM call)
    const msg = String(lastMessage || "").toLowerCase();

    if (msg.includes("where") || msg.includes("track") || msg.includes("status")) {
      suggestion = `Hi ${firstName}! Your ${productName} is currently ${lastOrder?.delivery_status || 'being processed'}. You can track it here: https://cureforever.shiprocket.co/tracking . Is there anything else I can help with?`;
    } else if (msg.includes("price") || msg.includes("discount") || msg.includes("cost")) {
      suggestion = `Hi ${firstName}, the total for ${productName} is ₹${lastOrder?.total_price || '...'} . Since you're a valued customer, I can check if we have any active coupons for you!`;
    } else if (msg.includes("hi") || msg.includes("hello") || msg.includes("hey")) {
      suggestion = `Hi ${firstName}! Hope you're having a great day. I'm here to help you with your ${productName}. What's on your mind?`;
    } else if (taskType === 'cod_verify') {
      suggestion = `Hi ${firstName}, I'm calling/messaging to verify your COD order for ${productName}. Should we proceed with the dispatch today?`;
    } else {
      suggestion = `Hi ${firstName}, thank you for your message. I'm looking into your order for ${productName} right now. One moment please!`;
    }

    return NextResponse.json({ suggestion });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

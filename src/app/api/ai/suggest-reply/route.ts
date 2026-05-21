import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = getServiceSupabase(req);
  const { customerId, lastMessage, taskType } = await req.json();

  try {
    // 1. Fetch Customer Context
    const { data: customer } = await supabase
      .from("customers")
      .select("name, segment, total_orders, rto_count, notes, custom_meta, orders(order_number, total_price, delivery_status, line_items)")
      .eq("id", customerId)
      .maybeSingle();

    if (!customer) throw new Error("Customer not found");

    const firstName = customer.name.split(" ")[0];
    const lastOrder = (customer.orders as any[])?.sort((a: any, b: any) => new Date(b.ordered_at || b.created_at).getTime() - new Date(a.ordered_at || a.created_at).getTime())?.[0] || customer.orders?.[0];
    const productName = lastOrder?.line_items?.[0]?.name || "your order";
    const orderNumber = lastOrder?.order_number || "N/A";
    const totalPrice = lastOrder?.total_price || "N/A";
    const deliveryStatus = lastOrder?.delivery_status || "N/A";
    const rtoCount = customer.rto_count || 0;
    const totalOrders = customer.total_orders || 0;
    const segment = customer.segment || "one_time";
    const notes = customer.notes || "None";
    const abandonLink = (customer.custom_meta as any)?.ABANDONLINK || "https://cureforever.in/cart";

    let suggestion = "";
    let isMock = true;

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        // Compile Context for AI
        const context = `
Customer Profile:
- Name: ${customer.name}
- Segment: ${segment}
- Total Orders: ${totalOrders}
- Previous RTOs: ${rtoCount}
- Internal Agent Notes: ${notes}

Last Order Details:
- Order Number: ${orderNumber}
- Product(s): ${productName}
- Total Price: ₹${totalPrice}
- Delivery Status: ${deliveryStatus}
- Abandoned Cart Recovery Link (if applicable): ${abandonLink}

Conversation/Task Context:
- Current Task Type: ${taskType || "general support"}
- Customer Last Message: "${lastMessage || "None (Initiating conversation)"}"
`;

        const systemPrompt = `
You are an expert customer support agent for "CureForever", a premium wellness, health, and supplement brand.
Generate a highly personalized, warm, helpful, and professional response to the customer based on the provided context.

Guidelines:
1. Address the customer by their first name: "${firstName}".
2. Tone: Warm, caring, professional, premium, and concise.
3. Keep the response short, conversational, and under 80 words.
4. Output EXACTLY the message text that the agent should send. Do NOT include any intro ("Sure, here is the reply:"), quotes, labels, or explanation.
5. If the last message asks about shipping or tracking, refer to their last order status (${deliveryStatus}) and instruct them that they can track it at https://cureforever.shiprocket.co/tracking.
6. If the task is "cod_verify" or order verification, draft a friendly message to verify their order before shipping.
7. Use 1-2 positive emojis to increase engagement (e.g. 👋, 🌿, 💊, 🛒, ✅) naturally, matching the CureForever brand style.
`;

        // Direct fetch call to Gemini API (dependency-free)
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: `${systemPrompt}\n\nContext:\n${context}` }],
                },
              ],
              generationConfig: {
                maxOutputTokens: 600,
                temperature: 0.7,
              },
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          console.error("Gemini API Error Response:", errText);
          throw new Error(`Gemini API returned status ${response.status}`);
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (generatedText && generatedText.trim()) {
          suggestion = generatedText.trim().replace(/^["']|["']$/g, ''); // strip outer quotes if any
          isMock = false;
        }
      } catch (geminiError) {
        console.error("Error calling Gemini API, falling back to rule-based:", geminiError);
      }
    } else {
      console.warn("GEMINI_API_KEY is not defined. Falling back to local rule-based mock responses. Get a free API key at https://aistudio.google.com/");
    }

    // Fallback rule-based logic
    if (!suggestion) {
      const msg = String(lastMessage || "").toLowerCase();
      if (msg.includes("where") || msg.includes("track") || msg.includes("status")) {
        suggestion = `Hi ${firstName}! Your ${productName} is currently ${deliveryStatus || 'being processed'}. You can track it here: https://cureforever.shiprocket.co/tracking . Is there anything else I can help with? 🌿`;
      } else if (msg.includes("price") || msg.includes("discount") || msg.includes("cost")) {
        suggestion = `Hi ${firstName}, the total for ${productName} is ₹${totalPrice}. Since you're a valued customer, I can check if we have any active coupons for you! 💊`;
      } else if (msg.includes("hi") || msg.includes("hello") || msg.includes("hey")) {
        suggestion = `Hi ${firstName}! Hope you're having a great day. I'm here to help you with your ${productName}. What's on your mind? 👋`;
      } else if (taskType === 'cod_verify' || taskType === 'recovery') {
        suggestion = `Hi ${firstName} 👋, we noticed you left some amazing wellness products in your cart! 🛒 Can we help you complete your purchase? Use code RECOVER5 for a special 5% off today! 🌿`;
      } else {
        suggestion = `Hi ${firstName}, thank you for your message. I'm looking into your order for ${productName} right now. One moment please! 🙏`;
      }
    }

    return NextResponse.json({ suggestion, isMock });
  } catch (e: any) {
    console.error("suggest-reply endpoint error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

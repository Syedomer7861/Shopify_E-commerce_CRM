import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getAuthenticatedSession } from "@/lib/auth-utils";
import { sendWhatsApp, cleanPhone, personaliseTemplate } from "@/lib/whatsapp";
import { z } from "zod";

const WhatsAppSendSchema = z.object({
  phone: z.string(),
  message: z.string(),
  customerData: z.any().optional(),
  imagePath: z.string().optional()
});

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "outbound-wa", 60, 60000);
  if (limited) return limited;

  try {
    const { errorResponse } = await getAuthenticatedSession();
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const validated = WhatsAppSendSchema.parse(body);
    const { phone, message, customerData, imagePath } = validated;

    const cleanedPhone = cleanPhone(phone);
    const finalMessage = customerData ? personaliseTemplate(message, customerData) : message;

    const result = await sendWhatsApp(cleanedPhone, finalMessage, imagePath);

    if (result.ok) {
      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Validation failed", details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

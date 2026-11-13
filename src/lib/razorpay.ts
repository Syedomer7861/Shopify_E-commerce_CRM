import "server-only";

// Minimal Razorpay REST client (no SDK). Payments stay switched off until
// all three secrets are set in the environment.

const API = "https://api.razorpay.com/v1";

export function razorpayEnabled() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);
}

export async function razorpay<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Log Razorpay's reason server-side; callers show a generic message.
    console.error(`Razorpay ${path} failed (${res.status}):`, data?.error?.description || res.statusText);
    throw new Error("Payment provider request failed");
  }
  return data as T;
}

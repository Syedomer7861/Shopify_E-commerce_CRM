
import { NextRequest, NextResponse } from "next/server";
import { hasInternalSecret } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  if (!hasInternalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ hello: "world" });
}

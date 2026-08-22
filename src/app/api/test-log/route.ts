
import { NextRequest, NextResponse } from "next/server";
import { hasInternalSecret } from "@/lib/auth-utils";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  if (!hasInternalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logPath = path.join(process.cwd(), "api_hit.log");
  fs.appendFileSync(logPath, `Hit /api/test-log at ${new Date().toISOString()}\n`);
  return NextResponse.json({ ok: true });
}

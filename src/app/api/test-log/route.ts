
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const logPath = path.join(process.cwd(), "api_hit.log");
  fs.appendFileSync(logPath, `Hit /api/test-log at ${new Date().toISOString()}\n`);
  return NextResponse.json({ ok: true });
}

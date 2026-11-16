import { NextRequest } from "next/server";
import { proxyBridge } from "@/lib/wa-bridge-proxy";
export const dynamic = "force-dynamic";

export const GET = (req: NextRequest) => proxyBridge(req, "/status");

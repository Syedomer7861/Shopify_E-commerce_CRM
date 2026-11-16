import { NextRequest } from "next/server";
import { proxyBridge } from "@/lib/wa-bridge-proxy";
export const dynamic = "force-dynamic";

// Unlinks this workspace's phone from its bridge.
export const POST = (req: NextRequest) => proxyBridge(req, "/logout", "POST");

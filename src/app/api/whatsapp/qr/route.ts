import { NextRequest } from "next/server";
import { proxyBridge } from "@/lib/wa-bridge-proxy";
export const dynamic = "force-dynamic";

// On the hosted bridge this also starts the org's session, which makes the QR.
export const GET = (req: NextRequest) => proxyBridge(req, "/qr-data");

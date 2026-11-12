import { ImageResponse } from "next/og";
import { getPost } from "@/content/blog";

// A real 1200x630 cover image per post, used for social cards and the
// BlogPosting schema image. A plain route (not the opengraph-image file
// convention) so the URL is stable: /blog/<slug>/og. Edge runtime: the Node renderer fails to load its
// font on Windows builds ("Invalid URL"), and edge renders on first request.
export const runtime = "edge";
const size = { width: 1200, height: 630 };

export function GET(_req: Request, { params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0f0f0e 0%, #10241c 100%)", color: "#fcfbf8" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>CodeCrest</div>
          <div style={{ display: "flex", fontSize: 22, color: "#0f0f0e", background: "#34d399", padding: "8px 22px", borderRadius: 999, fontWeight: 700 }}>{post?.category ?? "Blog"}</div>
        </div>
        <div style={{ display: "flex", fontSize: 66, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>{post?.title ?? "CodeCrest Blog"}</div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: "rgba(252,251,248,0.6)" }}>
          <div style={{ display: "flex", width: 56, height: 4, background: "#34d399", marginRight: 20 }} />
          Playbooks for the work after checkout
        </div>
      </div>
    ),
    size,
  );
}

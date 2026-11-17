"use client";
/* eslint-disable @next/next/no-img-element -- data-URL logos on a print canvas */
import { forwardRef } from "react";
import { PAGE, type DocEl, type DocTemplate } from "@/lib/hr-docs";

/** One block, drawn the same in the editor, preview and print. */
export function ElView({ el }: { el: DocEl }) {
  const font = { fontSize: el.fontSize ?? 13, fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? "italic" : "normal", color: el.color ?? "#1c1c1c", textAlign: el.align ?? "left" } as const;
  if (el.type === "text") return <div style={{ ...font, width: "100%", height: "100%", whiteSpace: "pre-wrap", overflow: "hidden", lineHeight: 1.45, background: el.bg }}>{el.text}</div>;
  if (el.type === "image") return el.src ? <img src={el.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <div style={{ width: "100%", height: "100%", border: "1px dashed #d4d5cd" }} />;
  if (el.type === "line") return <div style={{ width: "100%", height: "100%", background: el.bg ?? "#1c1c1c" }} />;
  if (el.type === "box") return <div style={{ width: "100%", height: "100%", background: el.bg, border: el.borderWidth ? `${el.borderWidth}px solid ${el.border ?? "#1c1c1c"}` : undefined, borderRadius: el.radius }} />;
  const rows = el.rows ?? [];
  return (
    <table style={{ ...font, width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} style={{ border: `1px solid ${el.border ?? "#d4d5cd"}`, padding: "5px 8px", fontWeight: i === 0 ? 700 : font.fontWeight, background: i === 0 ? "#f6f7f2" : undefined, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A full page at real size (the caller scales it with CSS transform if needed). */
export const DocPage = forwardRef<HTMLDivElement, { tpl: Pick<DocTemplate, "page_size" | "elements"> }>(function DocPage({ tpl }, ref) {
  const p = PAGE[tpl.page_size];
  return (
    <div ref={ref} className="doc-page" style={{ position: "relative", width: p.w, height: p.h, background: "#fff", overflow: "hidden", fontFamily: "Inter, Arial, sans-serif" }}>
      {tpl.elements.map(el => (
        <div key={el.id} style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h }}><ElView el={el} /></div>
      ))}
    </div>
  );
});

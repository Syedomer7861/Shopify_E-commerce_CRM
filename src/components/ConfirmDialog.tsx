"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Themed replacements for window.confirm / window.prompt. The browser's own
 * boxes look out of place on phones and show the site address in the iOS app.
 * Same contract: confirmDialog resolves true/false, promptDialog the text or
 * null on cancel. <DialogHost /> must be mounted once (app layout).
 */
type Req =
  | { kind: "confirm"; message: string; resolve: (v: boolean) => void }
  | { kind: "prompt"; message: string; initial: string; resolve: (v: string | null) => void };

let show: ((r: Req) => void) | null = null;

export function confirmDialog(message: string): Promise<boolean> {
  // Host not mounted (should not happen inside the app): fall back to the browser box.
  if (!show) return Promise.resolve(window.confirm(message));
  return new Promise(resolve => show!({ kind: "confirm", message, resolve }));
}

export function promptDialog(message: string, initial = ""): Promise<string | null> {
  if (!show) return Promise.resolve(window.prompt(message, initial));
  return new Promise(resolve => show!({ kind: "prompt", message, initial, resolve }));
}

const DANGER = /\b(delete|remove|revoke|suspend|disconnect|discard|unlink|clear|offboard|permanently|turn off|end)\b/i;

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const current = useRef<Req | null>(null);

  useEffect(() => {
    show = r => {
      // A second request while one is open: cancel the first rather than leave it hanging.
      const prev = current.current;
      if (prev?.kind === "confirm") prev.resolve(false);
      else if (prev) prev.resolve(null);
      current.current = r;
      if (r.kind === "prompt") setText(r.initial);
      setReq(r);
    };
    return () => { show = null; };
  }, []);

  useEffect(() => { if (req?.kind === "prompt") inputRef.current?.focus(); }, [req]);

  const close = (ok: boolean) => {
    if (!req) return;
    if (req.kind === "confirm") req.resolve(ok);
    else req.resolve(ok ? text : null);
    current.current = null;
    setReq(null);
  };

  const danger = !!req && req.kind === "confirm" && DANGER.test(req.message);
  return (
    <Modal
      open={!!req}
      onClose={() => close(false)}
      title={req?.kind === "prompt" ? "Add a note" : danger ? "Are you sure?" : "Please confirm"}
      maxWidth="max-w-md"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={() => close(false)}>Cancel</button>
          <button
            type="button"
            autoFocus={req?.kind === "confirm"}
            className={cn("btn-primary", danger && "!bg-[#e0604f] hover:!bg-[#c94f40]")}
            onClick={() => close(true)}
          >
            {req?.kind === "prompt" ? "Continue" : danger ? "Yes, continue" : "Confirm"}
          </button>
        </>
      }
    >
      <p className="text-sm text-[#3a3a36] whitespace-pre-line leading-relaxed">{req?.message}</p>
      {req?.kind === "prompt" && (
        <textarea
          ref={inputRef}
          className="input mt-4 min-h-[88px]"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) close(true); }}
        />
      )}
    </Modal>
  );
}

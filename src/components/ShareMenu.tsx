"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Link2, Loader2, Mail, MessageCircle, Share2, Unlink } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Share button: WhatsApp, email, copy link, and the phone's own share sheet.
 * `prepare` runs when the menu opens and returns the link to share (for
 * example, creating a public token), so every option below is a plain
 * synchronous click and the browser never blocks the WhatsApp/mail window.
 */
export function ShareMenu({
  prepare, message, subject, email, phone, onRevoke, disabled, label = "Share",
}: {
  prepare: () => Promise<string | null>;
  /** Text sent with the link; the link is appended. */
  message: string;
  subject?: string;
  email?: string | null;
  /** Digits with country code (e.g. 919876543210) opens that chat directly. */
  phone?: string | null;
  onRevoke?: () => Promise<void>;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function toggle() {
    if (open) return setOpen(false);
    setBusy(true);
    try {
      const link = await prepare();
      if (!link) return;
      setUrl(link);
      setOpen(true);
    } finally { setBusy(false); }
  }

  const text = url ? `${message}\n${url}` : message;
  const waPhone = (phone || "").replace(/\D/g, "");
  const wa = `https://wa.me/${waPhone.length >= 10 ? waPhone : ""}?text=${encodeURIComponent(text)}`;
  const mail = `mailto:${encodeURIComponent(email || "")}?subject=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(text)}`;
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    catch { toast.error("Could not copy. Select the link and copy it."); }
    setOpen(false);
  }

  const item = "w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left text-[#1c1c1c] hover:bg-[#f6f7f2]";
  return (
    <div ref={box} className="relative inline-block">
      <button type="button" onClick={toggle} disabled={disabled || busy} aria-expanded={open} aria-haspopup="menu"
        className="btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-40">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} {label}
      </button>
      {open && url && (
        <div role="menu" className="absolute z-50 mt-1 right-0 sm:left-0 sm:right-auto w-60 rounded-xl border border-[#ebece6] bg-white shadow-lg py-1">
          <a role="menuitem" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={item}>
            <MessageCircle className="w-4 h-4 text-[#6b6b67]" /> WhatsApp
          </a>
          <a role="menuitem" href={mail} onClick={() => setOpen(false)} className={item}>
            <Mail className="w-4 h-4 text-[#6b6b67]" /> Email{email ? <span className="ml-auto truncate max-w-[110px] text-[10px] text-[#9a9a94]">{email}</span> : null}
          </a>
          <button role="menuitem" type="button" onClick={copy} className={item}><Copy className="w-4 h-4 text-[#6b6b67]" /> Copy link</button>
          {canNative && (
            <button role="menuitem" type="button" className={item}
              onClick={() => { navigator.share({ title: subject, text: message, url }).catch(() => {}); setOpen(false); }}>
              <Share2 className="w-4 h-4 text-[#6b6b67]" /> More apps…
            </button>
          )}
          <div className="px-3 py-2 border-t border-[#ebece6] mt-1">
            <div className="flex items-center gap-1.5 text-[10px] text-[#9a9a94]"><Link2 className="w-3 h-3 shrink-0" /><span className="truncate">{url}</span></div>
            {onRevoke && (
              <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-rose-600"
                onClick={async () => { await onRevoke(); setOpen(false); setUrl(null); }}>
                <Unlink className="w-3 h-3" /> Turn off this link
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

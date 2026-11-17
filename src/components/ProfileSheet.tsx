"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";
import { Modal } from "./ui";

// Photos live in the private `avatars` bucket (20261116a); show them via
// short-lived signed URLs, cached per path for the page's lifetime.
const urlCache = new Map<string, Promise<string | null>>();
export function useAvatarUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let live = true;
    if (!urlCache.has(path)) {
      urlCache.set(path, createClient().storage.from("avatars").createSignedUrl(path, 60 * 60 * 6)
        .then(({ data }) => data?.signedUrl ?? null, () => null));
    }
    urlCache.get(path)!.then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [path]);
  return url;
}

export function initialsOf(p?: Pick<Profile, "name" | "email"> | null) {
  return (p?.name || p?.email || "??").substring(0, 2).toUpperCase();
}

/** Round photo, or initials when there is none. */
export function UserAvatar({ profile, className }: { profile: Profile | null; className?: string }) {
  const url = useAvatarUrl((profile as any)?.avatar_path);
  return (
    <span className={cn("rounded-full bg-[#1c1c1c] flex items-center justify-center text-[#fcfbf8] font-bold overflow-hidden flex-shrink-0", className)}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : initialsOf(profile)}
    </span>
  );
}

// Shrink to a 256px square JPEG before upload: small file, fast to load.
async function toSquareJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/jpeg", 0.85));
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Not added";

/**
 * The signed-in person's own profile. Only the photo can be changed here;
 * every other detail is read-only (the database enforces this too: only
 * admins and HR can edit them).
 */
export function ProfileSheet({ open, onClose, profile, onPhotoChange }: {
  open: boolean; onClose: () => void; profile: Profile | null; onPhotoChange: (path: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const p = profile as any;

  async function upload(file: File) {
    if (!profile) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image."); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("That image is too large (15 MB max)."); return; }
    setBusy(true);
    try {
      const blob = await toSquareJpeg(file);
      const path = `${profile.org_id}/${profile.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", profile.id);
      if (dbErr) {
        await supabase.storage.from("avatars").remove([path]);
        throw dbErr;
      }
      if (p.avatar_path) await supabase.storage.from("avatars").remove([p.avatar_path]);
      onPhotoChange(path);
      toast.success("Profile photo updated");
    } catch (e: any) {
      console.error("avatar upload failed:", e);
      toast.error(e?.message || "Could not update the photo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const rows: [string, string][] = [
    ["Full name", p?.name || "Not added"],
    ["Email", p?.email || "Not added"],
    ["Phone", p?.phone || "Not added"],
    ["Date of birth", fmtDate(p?.date_of_birth)],
    ["Role", (s => s.charAt(0).toUpperCase() + s.slice(1))(String(p?.designation || p?.role || "Not added"))],
    ["Department", p?.department || "Not added"],
    ["Joined", fmtDate(p?.joining_date)],
  ];

  return (
    <Modal open={open} onClose={onClose} title="My Profile">
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3">
          <button onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Change profile photo" className="relative group">
            <UserAvatar profile={profile} className="w-24 h-24 text-2xl" />
            <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white border border-[#ebece6] shadow flex items-center justify-center">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 text-[#1c1c1c]" />}
            </span>
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="text-xs font-bold text-[#1c1c1c] underline underline-offset-2">
            {busy ? "Uploading..." : "Change photo"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>

        <dl className="divide-y divide-[#ebece6] rounded-xl border border-[#ebece6] bg-white">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[#5f5f5d]/70 flex-shrink-0">{k}</dt>
              <dd className="text-sm font-semibold text-[#1c1c1c] text-right min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="flex items-start gap-2 text-[11px] text-[#5f5f5d]">
          <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          Your details are managed by HR. To correct anything, ask HR or your admin.
        </p>
      </div>
    </Modal>
  );
}

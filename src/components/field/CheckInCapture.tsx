"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, MapPin } from "lucide-react";
import { Modal } from "@/components/ui";

export type CheckInProof = { photo: Blob; lat: number; lng: number; accuracyM: number; takenAt: Date };

const MAX_EDGE = 1280;

function freshPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This device has no location service."));
    // maximumAge 0: never accept a position the device remembered from earlier.
    navigator.geolocation.getCurrentPosition(resolve, e => reject(new Error(
      e.code === e.PERMISSION_DENIED ? "Location permission was denied. Allow location for this site and try again."
        : "Couldn't get your location. Step outside or turn on GPS and try again."
    )), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  });
}

/**
 * Check-in proof: one tap freezes the live camera frame and reads a fresh GPS
 * position together, then stamps time and coordinates onto the picture.
 * There is deliberately no file picker - a photo from the gallery can't be
 * used. ponytail: a rooted phone with a mock-location app can still lie about
 * GPS; catching that needs a native app, not a web page.
 */
export function CheckInCapture({ open, visiting, onClose, onCapture }: {
  open: boolean; visiting: string; onClose: () => void; onCapture: (proof: CheckInProof) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false); setError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) return stream.getTracks().forEach(t => t.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.name === "NotAllowedError"
          ? "Camera permission was denied. Allow the camera for this site and try again."
          : "Couldn't open the camera on this device. Check-in needs a live photo.");
      }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()); };
  }, [open]);

  async function capture() {
    const video = videoRef.current;
    if (!video || !ready || busy) return;
    setBusy(true); setError(null);
    try {
      // Freeze the frame first, so the picture is from the moment of the tap.
      const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx || !canvas.width) throw new Error("Camera isn't ready yet. Try again.");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const takenAt = new Date();

      const pos = await freshPosition();
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;

      const lines = [takenAt.toLocaleString(), `${lat.toFixed(6)}, ${lng.toFixed(6)}  (±${Math.round(accuracy)} m)`];
      const size = Math.max(14, Math.round(canvas.width / 38));
      ctx.font = `600 ${size}px sans-serif`;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, canvas.height - size * 3.2, canvas.width, size * 3.2);
      ctx.fillStyle = "#fff";
      lines.forEach((t, i) => ctx.fillText(t, size * 0.7, canvas.height - size * 1.9 + i * size * 1.3));

      const photo = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.8));
      if (!photo) throw new Error("Couldn't save the photo. Try again.");
      await onCapture({ photo, lat, lng, accuracyM: accuracy, takenAt });
    } catch (e: any) {
      setError(e?.message || "Check-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Check in"
      footer={
        <button onClick={capture} disabled={!ready || busy} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Getting location…</> : <><Camera className="w-4 h-4" /> Take photo &amp; check in</>}
        </button>
      }>
      <div className="space-y-3">
        <p className="text-xs text-gray-600">
          Checking in at <span className="font-bold text-[#1c1c1c]">{visiting}</span>. Your photo and your current location are recorded together and shared with your manager.
        </p>
        <div className="relative rounded-xl overflow-hidden bg-[#1c1c1c] aspect-[4/3]">
          <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
          {!ready && !error && <div className="absolute inset-0 flex items-center justify-center text-white/70"><Loader2 className="w-5 h-5 animate-spin" /></div>}
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-gray-500"><MapPin className="w-3.5 h-3.5 shrink-0" /> Location is read at the moment you take the photo.</p>
        {error && <p role="alert" className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    </Modal>
  );
}

"use client";
import { Toaster, ToastBar } from "react-hot-toast";
import { friendlyError } from "@/lib/friendly-error";

/** App toaster: every error toast gets plain-English text instead of raw database errors. */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: "#1c1c1c",
          color: "#fcfbf8",
          fontSize: "13px",
          borderRadius: "14px",
          padding: "10px 14px",
          boxShadow: "rgba(0,0,0,0.1) 0px 4px 12px",
        },
        duration: 3000,
        error: { duration: 5000 },
      }}
    >
      {(t) => (
        <ToastBar toast={t.type === "error" && typeof t.message === "string" ? { ...t, message: friendlyError(t.message) } : t} />
      )}
    </Toaster>
  );
}

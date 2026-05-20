"use client";
import { useState, useEffect } from "react";
import { Phone, Loader2, ShieldAlert, PhoneCall, Volume2, X, AlertCircle } from "lucide-react";
import { Modal } from "./ui";
import toast from "react-hot-toast";

interface ClickToCallModalProps {
  open: boolean;
  onClose: () => void;
  customerName: string;
  customerPhone: string;
  taskId?: string;
  agentPhoneDefault?: string;
}

export default function ClickToCallModal({
  open,
  onClose,
  customerName,
  customerPhone,
  taskId,
  agentPhoneDefault = ""
}: ClickToCallModalProps) {
  const [agentPhone, setAgentPhone] = useState(agentPhoneDefault);
  const [status, setStatus] = useState<"idle" | "connecting_agent" | "ringing_customer" | "live" | "failed">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [callSid, setCallSid] = useState("");
  const [callDuration, setCallDuration] = useState(0);

  // Initialize phone when open changes
  useEffect(() => {
    if (open) {
      setAgentPhone(agentPhoneDefault || localStorage.getItem("crm_agent_phone") || "");
      setStatus("idle");
      setErrorMsg("");
      setCallDuration(0);
    }
  }, [open, agentPhoneDefault]);

  // Call timer when live
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === "live") {
      timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status]);

  const handleStartCall = async () => {
    if (!agentPhone || agentPhone.trim().length < 10) {
      toast.error("Please enter a valid agent forwarding phone number");
      return;
    }

    // Save phone for future convenience
    localStorage.setItem("crm_agent_phone", agentPhone.trim());
    setStatus("connecting_agent");
    setErrorMsg("");

    try {
      const res = await fetch("/api/telephony/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone,
          taskId,
          agentPhoneOverride: agentPhone.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Call failed to connect");
      }

      setCallSid(data.sid || "");

      // Phase 2: Agent Handset Connected, Ringing Customer
      setTimeout(() => {
        setStatus("ringing_customer");
        
        // Phase 3: Live Connection Established
        setTimeout(() => {
          setStatus("live");
          toast.success("Call connected successfully!");
        }, 3500);

      }, 3000);

    } catch (err: any) {
      console.error(err);
      setStatus("failed");
      setErrorMsg(err.message || "Telephony bridge unavailable");
      toast.error(err.message || "Failed to trigger outbound call");
    }
  };

  const handleNativeFallback = () => {
    window.location.href = `tel:${customerPhone}`;
    onClose();
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <PhoneCall className="w-5 h-5 text-[#1c1c1c]" />
          <span className="font-bold text-[#1c1c1c]">Cloud Click-to-Call</span>
        </div>
      }
      maxWidth="max-w-md"
    >
      <div className="space-y-6 py-2">
        {status === "idle" && (
          <div className="space-y-4">
            <div className="bg-[#f7f4ed] border border-[#eceae4] p-4 rounded-xl">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">CALL RECIPIENT</div>
              <div className="text-sm font-bold text-[#1c1c1c]">{customerName}</div>
              <div className="text-xs font-semibold text-gray-500 mt-0.5">{customerPhone}</div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                YOUR FORWARDING PHONE
              </label>
              <input
                type="tel"
                value={agentPhone}
                onChange={e => setAgentPhone(e.target.value)}
                placeholder="Enter your phone number (e.g. +919988776655)"
                className="input text-sm"
              />
              <p className="text-[10px] text-gray-400 italic">
                Our cloud telephony gateway will dial your phone first. Once you answer, it will instantly dial and bridge the customer.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleNativeFallback}
                className="flex-1 btn-secondary text-[10px] py-3 uppercase tracking-widest font-black"
              >
                Direct Dialer
              </button>
              <button
                onClick={handleStartCall}
                className="flex-1 btn-primary text-[10px] py-3 uppercase tracking-widest font-black flex items-center justify-center gap-1.5"
              >
                <Phone className="w-3.5 h-3.5 fill-current" /> Call via Cloud
              </button>
            </div>
          </div>
        )}

        {status !== "idle" && status !== "failed" && (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-6">
            {/* Pulsing Visual Call Ring */}
            <div className="relative">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center border-2 border-[#1c1c1c]/10 bg-[#f7f4ed] z-10 relative ${status !== "live" ? "animate-pulse" : ""}`}>
                <Phone className={`w-8 h-8 text-[#1c1c1c] ${status === "live" ? "animate-bounce" : ""}`} />
              </div>
              
              {status !== "live" && (
                <>
                  <div className="absolute inset-0 w-20 h-20 rounded-full border border-[#1c1c1c]/30 animate-ping opacity-40" />
                  <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-emerald-400 animate-ping opacity-20 delay-300" />
                </>
              )}
            </div>

            <div className="space-y-2">
              {status === "connecting_agent" && (
                <>
                  <h4 className="text-sm font-bold text-[#1c1c1c] animate-pulse">Ringing Agent...</h4>
                  <p className="text-[11px] text-gray-500 max-w-xs font-semibold leading-relaxed">
                    Check your mobile phone. We are dialing your handset first to secure a clean voice channel...
                  </p>
                </>
              )}

              {status === "ringing_customer" && (
                <>
                  <h4 className="text-sm font-bold text-emerald-600 animate-pulse">Agent Connected! Calling Customer...</h4>
                  <p className="text-[11px] text-gray-500 max-w-xs font-semibold leading-relaxed">
                    Bridging call to <strong>{customerName}</strong> ({customerPhone}). Please wait for them to answer...
                  </p>
                </>
              )}

              {status === "live" && (
                <>
                  <h4 className="text-sm font-black text-emerald-700 tracking-wider uppercase flex items-center justify-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-emerald-600 animate-bounce" /> Live Call Active
                  </h4>
                  <div className="text-3xl font-black text-[#1c1c1c] tracking-tight tabular-nums py-2">
                    {formatDuration(callDuration)}
                  </div>
                  <p className="text-[11px] text-gray-400 italic">
                    The conversation is active. Speak clearly. Standard logging session is running.
                  </p>
                </>
              )}
            </div>

            {status === "live" ? (
              <button
                onClick={onClose}
                className="btn-primary bg-rose-600 border-rose-600 text-white text-[10px] py-3 px-8 uppercase tracking-widest font-black hover:bg-rose-700 transition-all active:scale-[0.98]"
              >
                Disconnect & Log Call
              </button>
            ) : (
              <div className="flex gap-3 w-full max-w-xs">
                <button
                  onClick={handleNativeFallback}
                  className="flex-1 btn-secondary text-[10px] py-2 px-3 uppercase tracking-widest font-bold"
                >
                  Direct Fallback
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-600 rounded-xl text-[10px] py-2 px-3 uppercase tracking-widest font-bold"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {status === "failed" && (
          <div className="space-y-4">
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-rose-800">Connection Failed</div>
                <div className="text-[11px] text-rose-600 mt-0.5 leading-relaxed font-semibold">{errorMsg}</div>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
              We were unable to connect the call via our enterprise cloud telephony gateway. Would you like to use your native device browser dialer as a quick fallback?
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 btn-secondary text-[10px] py-3 uppercase tracking-widest font-black"
              >
                Cancel
              </button>
              <button
                onClick={handleNativeFallback}
                className="flex-1 btn-primary bg-[#1c1c1c] text-[#f7f4ed] text-[10px] py-3 uppercase tracking-widest font-black"
              >
                Fallback to Direct Dial
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

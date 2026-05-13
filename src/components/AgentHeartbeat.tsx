"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase";

/**
 * AgentHeartbeat - Invisible component that sends a "pulse" every 60 seconds
 * to update the agent's online presence in the database.
 */
export function AgentHeartbeat() {
  const supabase = createClient();

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    async function sendHeartbeat() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        await fetch("/api/agent/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: user.id }),
        });
      } catch {
        // Silently fail — heartbeat is non-critical
      }
    }

    // Initial pulse on mount
    sendHeartbeat();

    // Repeat every 60 seconds
    intervalId = setInterval(sendHeartbeat, 60_000);

    return () => clearInterval(intervalId);
  }, []);

  return null; // Renders nothing — purely a side-effect component
}

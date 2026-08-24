-- src/lib/workflow-engine.ts's processSystemAutomation() already has real
-- switch cases for these four triggers (out_for_delivery,
-- delivery_attempt_failed, stale_shipment, final_followup) and they're
-- genuinely fired from real code (shiprocket-sync, transit-inform,
-- transit-escalator, tasks/[id]/attempt) - but the settings columns they
-- read never existed, so `flag = settings.wa_auto_out_for_delivery` was
-- always undefined and these four automations could never be turned on.
-- No UI ever offered them either. Adding both here.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS wa_auto_out_for_delivery BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS wa_out_for_delivery_template TEXT DEFAULT 'Hi {{name}} 👋, your order #{{order_no}} is out for delivery today! 🚴 Please keep your phone handy.',
  ADD COLUMN IF NOT EXISTS wa_auto_delivery_failed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS wa_delivery_failed_template TEXT DEFAULT 'Hi {{name}}, our courier attempted to deliver order #{{order_no}} but could not reach you. 📦 We will re-attempt soon - please reply to confirm your availability.',
  ADD COLUMN IF NOT EXISTS wa_auto_stale_shipment BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS wa_stale_shipment_template TEXT DEFAULT 'Hi {{name}}, your order #{{order_no}} has not moved in a while. 🚚 We are following up with our courier partner and will update you shortly.',
  ADD COLUMN IF NOT EXISTS wa_auto_final_followup BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS wa_final_followup_template TEXT DEFAULT 'Hi {{name}}, just checking in one last time about {{product}}. 🌿 Let us know if there is anything we can help with!';

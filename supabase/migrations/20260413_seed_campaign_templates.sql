-- ============================================================
-- CureForever CRM — Seed Default Campaign Templates
-- Run this in your Supabase SQL Editor
-- ============================================================

INSERT INTO campaign_templates (name, body, category, variables, is_active)
VALUES 
(
  'Abandoned Checkout Strategy', 
  'Hi {{name}} 👋, we noticed you left some amazing wellness products in your cart! 🛒 Can we help you complete your purchase? Use code RECOVER5 for a special 5% off today! 🌿', 
  'recovery', 
  '["name"]'::jsonb, 
  true
),
(
  'Post-Purchase Feedback', 
  'Hi {{name}} 👋, thank you for your recent order! How was your experience with CureForever? We''d love to hear your honest feedback so we can continue improving. 🌿', 
  'feedback', 
  '["name"]'::jsonb, 
  true
),
(
  '30-Day Refill Reminder', 
  'Hi {{name}}! It''s been about a month since your last CureForever order. Is it time for a refill to keep your wellness routine going? 💊 Use code REFILL10 for 10% off your next batch!', 
  'reorder', 
  '["name"]'::jsonb, 
  true
),
(
  'VIP Exclusive Festive Offer', 
  'Hi {{name}}! 🎉 As one of our most valued customers, we''re giving you early access to our massive Festive Sale! Get 20% off all supplements this week using code FESTIVE20. Stay healthy! 🌿', 
  'marketing', 
  '["name"]'::jsonb, 
  true
)
ON CONFLICT (name) DO NOTHING;

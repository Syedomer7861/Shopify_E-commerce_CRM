---
title: Automated Review Collection
status: completed
priority: medium
area: automation
created_at: 2026-04-30
tags: [review, whatsapp, automation]
---

# Automated Review Collection

## Description
Trigger a WhatsApp review request exactly 3 days after a "Delivered" status is synced from Shiprocket.

## Requirements
- Scheduled job or delay logic to wait 3 days after delivery.
- Check if any issues were reported during those 3 days before sending the request.
- Template support for review links.

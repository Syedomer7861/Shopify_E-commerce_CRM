---
title: Inventory Alert Integration
status: completed
priority: high
area: operations
created_at: 2026-04-30
tags: [inventory, shopify, recovery]
---

# Inventory Alert Integration

## Description
Cross-reference Shopify stock levels with Abandoned Carts. If an item is low on stock, prioritize recovery tasks for that cart.

## Requirements
- Sync stock levels from Shopify periodically or on-demand.
- Match abandoned cart items to stock counts.
- Increase Task Priority Score if stock < threshold (e.g., 5 items).

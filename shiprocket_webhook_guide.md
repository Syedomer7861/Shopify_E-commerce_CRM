# Shiprocket Webhook Configuration Guide

To see **Direct Orders** and **Delivered Status** in your CRM, you must enable the following webhooks in your Shiprocket account.

## Step 1: Open Shiprocket Settings
1.  Log in to your [Shiprocket Dashboard](https://app.shiprocket.in).
2.  Go to **Settings** (bottom left) -> **API** -> **Webhooks**.

## Step 2: Add New Webhooks
Click "Add New Webhook" for each of the following:

### 1. Tracking Updates (For "Delivered" status)
- **Event:** `Tracking Update`
- **URL:** `https://cureforeverpc.tail1b3337.ts.net/api/webhooks/shiprocket`
- **Header (x-shiprocket-secret):** `cureforever_shiprocket_sync_2026`

### 2. Direct Orders (For non-abandoned orders)
- **Event:** `Order Created`
- **URL:** `https://cureforeverpc.tail1b3337.ts.net/api/webhooks/shiprocket`
- **Header (x-shiprocket-secret):** `cureforever_shiprocket_sync_2026`

### 3. Shipment Created (For tracking numbers)
- **Event:** `Shipment Created`
- **URL:** `https://cureforeverpc.tail1b3337.ts.net/api/webhooks/shiprocket`
- **Header (x-shiprocket-secret):** `cureforever_shiprocket_sync_2026`

## Step 3: Test Webhooks
- Click the **Test** button for each.
- If successful, you will see a "Live Sync Feed" entry in your CRM within seconds.

---

> [!TIP]
> **Why is my URL so long?** 
> Since you are running the CRM on your local computer, we are using **Tailscale Funnel** to let Shiprocket "talk" to your machine. This URL is permanent as long as your Tailscale machine is active! In a production environment, this would be a constant `cureforever.in` style link.

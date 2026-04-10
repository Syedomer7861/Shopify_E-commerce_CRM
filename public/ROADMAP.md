# CureForever CRM — Complete User Roadmap

> Your personal guide to mastering the CureForever CRM. This document covers every feature, page, and workflow so you can get the most out of your system from Day 1.

---

## 🏠 What Is This CRM?

CureForever CRM is a **health & wellness e-commerce CRM** purpose-built to:
- Track every customer from their first order to repeat purchases
- Automate follow-up calls and WhatsApp reminders
- Recover abandoned carts and lost revenue
- Monitor delivery status via Shiprocket integration
- Give your team clarity on daily tasks and performance

**Data Flow:** Shiprocket Webhooks → CRM Database (Supabase) → Dashboard & Tasks

---

## 📍 Page-by-Page Guide

### 1. Dashboard (`/dashboard`)
**Purpose:** Your command center — everything happening today at a glance.

| Section | What It Shows |
|---------|---------------|
| **KPI Cards** | Calls due today, overdue tasks, upcoming (next 3 days), completed this week |
| **Today's Calls** | Every task that needs action TODAY — click to call, complete, reschedule, or skip |
| **Overdue / Missed** | Red-flagged tasks that are past due — handle these first! |
| **Upcoming** | Tasks coming up in the next 3 days |
| **Recent Activity** | Last 5 call logs — shows what your team has been doing |
| **Live Sync Feed** | Shows real-time webhook events from Shiprocket (orders, tracking updates) |
| **Sync Logs** | Click to force a manual data sync from Shiprocket webhooks |

**Pro Tip:** The dashboard auto-refreshes every 10 seconds. You also get real-time Supabase push updates for tasks, orders, and call logs.

---

### 2. Tasks (`/tasks`)
**Purpose:** A filterable, paginated view of all tasks in the system.

- **Filters:** All, Pending, Overdue, Done, Skipped
- **Task Types:** Review, Reorder, Final Follow-up, Recovery (Abandoned Cart)
- **Actions:** Complete (log outcome), Reschedule (pick new date), Skip
- **Bulk Sync:** Use the "Sync Tasks" button to regenerate missing tasks from delivered orders

**How Tasks Are Created:**
1. When an order is delivered (via Shiprocket webhook), the system automatically generates 3 tasks: Review → Reorder → Final Follow-up
2. When an abandoned cart is detected, a Recovery task is created
3. Timing is configured in **Settings → General** (e.g., Review after 5 days, Reorder after 20 days)

---

### 3. Customers (`/customers`)
**Purpose:** Complete customer database with segmentation.

**Segments:**
| Segment | Meaning |
|---------|---------|
| **Repeat** | 2+ orders — your best customers |
| **One-time** | Only 1 order — needs nurturing |
| **Inactive** | No order in 45+ days — re-engagement needed |
| **RTO Flagged** | Has had a Return-to-Origin — handle with care |

**Features:**
- **Search** by name, phone, or email
- **Filter** by segment or RTO status
- **Bulk Delete** — select multiple customers and delete
- **Add Customer** — manually add a customer
- Click any customer to view their **Profile Page**

---

### 4. Customer Profile (`/customers/[id]`)
**Purpose:** Full 360° view of a single customer.

**Tabs:**
| Tab | Contents |
|-----|----------|
| **Orders** | Every order with status, items, and value |
| **Calls** | Call log history with outcomes and agent notes |
| **Tasks** | All scheduled follow-ups and their status |
| **Notes** | Free-text notes about the customer |

**Actions:** Call, Email, WhatsApp, Clear RTO flag, Update notes

---

### 5. Orders (`/orders`)
**Purpose:** All orders synced from Shiprocket.

- **Filters:** All, Delivered, In Transit, RTO, Pending
- **Data shown:** Order number, customer, value, status, ordered date, delivered date
- Click any order row for details

**Status Mapping from Shiprocket:**
| Shiprocket Status | CRM Status |
|-------------------|------------|
| Status 7, 10 | Delivered |
| Status 6, 12 | In Transit |
| Status 9 | RTO |
| Status 13 | Out for Delivery |
| Status 8 | Failed/Cancelled |

---

### 6. Abandoned Carts (`/abandoned-carts`)
**Purpose:** Track and recover incomplete checkouts.

- **Filters:** Pending, Recovered, All
- **Stats:** Total pending count, potential revenue at risk, recovered revenue
- **Follow Up:** One-click WhatsApp button pre-fills a recovery message with the customer's name and their abandoned items
- **Auto-Resolution:** When a customer in this list places a new order, the system automatically marks their cart as "Recovered" and closes any pending recovery tasks

---

### 7. Analytics (`/reports`)
**Purpose:** Monthly performance data and exports.

**Tabs:**
| Tab | Data |
|-----|------|
| **Overview** | Total calls, revenue, reorder rate, RTO rate, delivery breakdown |
| **Tasks** | Task outcomes (completed, no answer, rescheduled), agent performance |
| **Segments** | Customer segment distribution, top-selling products |
| **Recovery** | Abandoned cart recovery rate and revenue saved |
| **RTO** | RTO events and flagged orders |

**Exports:**
- **Download Monthly Report** — Summary + call logs + orders for the current month
- **Export Master Data** — Complete database dump: All customers, orders, carts, call logs, agent performance

---

### 8. Import (`/import`)
**Purpose:** Bulk import data from Excel/CSV files.

**Supported Imports:**
- Customer data (name, phone, email, address)
- Order data (order number, customer phone, items, status)
- Abandoned cart data

**Steps:**
1. Click "Choose File" and select your `.xlsx` or `.csv`
2. Map columns to CRM fields
3. Click "Import" — duplicates are handled by phone number matching

---

### 9. Team (`/team`)
**Purpose:** Manage CRM user accounts.

- View all registered users
- See their role and last login
- Invite new team members via email

---

### 10. Settings (`/settings`)

#### General Tab
| Setting | What It Controls |
|---------|------------------|
| Review call offset | Days after delivery to request a review (default: 5) |
| Reorder call offset | Days after delivery to prompt reorder (default: 20) |
| Final follow-up offset | Last touchpoint before inactive (default: 30) |
| Inactive threshold | Days without order to auto-mark inactive (default: 45) |

#### WhatsApp Tab
**Free Forever — No Paid Services Required!**

| Feature | Description |
|---------|-------------|
| **QR Scanner** | Scan the QR code directly from this page to connect WhatsApp |
| **Admin Phone** | Your phone number for receiving daily summary reports |
| **Send Time** | Preferred time to send automated messages |
| **Testing Tools** | Send Daily Summary, Run Reorder/Recovery Reminders, Refresh Task Queue |
| **Message Templates** | Customize review, reorder, recovery, and final follow-up messages |
| **Automation Pipeline** | See messages sent today and messages queued for delivery |

**Setup Steps:**
1. Run `node wa_server.js` on your PC
2. Go to Settings → WhatsApp
3. Enable WhatsApp toggle
4. Scan the QR code that appears
5. Once connected, automation is LIVE

#### Product Overrides Tab
Override the global timing for specific products. For example, if Whey Protein needs a quicker reorder reminder, set it here.

#### Shiprocket Tab
Configure your Shiprocket account credentials for direct API sync:
- **Email & Password:** Your Shiprocket login
- **Sync Now:** Pull latest 50 orders from Shiprocket API

#### Danger Zone Tab
⚠️ Destructive operations — use with extreme caution:
- Purge all customers
- Purge all orders
- Purge all tasks
- Purge all abandoned carts

---

## 🔄 How Data Flows

```
Shiprocket
    ├── Webhook: New Order → CRM creates customer + order
    ├── Webhook: Tracking Update → CRM updates delivery status
    └── Webhook: Abandoned Cart → CRM creates cart + recovery task

Delivered Order Detected
    ├── Task Generator creates: Review → Reorder → Final Follow-up
    └── WhatsApp scheduler sends automated reminders at configured times

Customer Places Order After Abandonment
    ├── Abandoned cart → status: "Recovered"
    ├── Recovery task → status: "Done"
    └── Call log → "Automatically resolved"
```

---

## 💡 Tips for Maximum ROI

1. **Start every morning on the Dashboard** — handle overdue tasks first
2. **Use the WhatsApp "Send Daily Summary"** to get your daily briefing on your phone
3. **Set realistic follow-up timings** — don't spam customers too early
4. **Review the Analytics page weekly** — track your recovery rate and agent performance
5. **Export Master Data monthly** — keep offline backups of your customer database
6. **Clear RTO flags** after speaking with the customer — give them a fresh start
7. **Use Product Overrides** for consumable products that need faster reorder reminders

---

## 🛠 Technical Requirements

| Component | Requirement |
|-----------|-------------|
| **CRM Web App** | Hosted on Vercel (auto-deploys from GitHub) |
| **Database** | Supabase (PostgreSQL) — cloud-hosted, always on |
| **WhatsApp Bridge** | `wa_server.js` — run on your PC or a VPS |
| **Shiprocket** | Webhooks configured to point to your CRM URL |

**Local Development:**
```bash
npm install          # Install dependencies
npm run dev          # Start CRM at localhost:3000
node wa_server.js    # Start WhatsApp bridge at localhost:3001
```

---

*Built with ❤️ for CureForever*

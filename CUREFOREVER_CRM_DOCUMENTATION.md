# CureForever CRM Documentation

This document serves as the central reference for the CureForever High-Fidelity Sync CRM architecture and design.

## 1. System Architecture
A complete structural and data flow graph is available here:
[CRM_GRAPH.md](file:///C:/Users/new/.gemini/antigravity/brain/ece89a25-0c56-446f-ad3e-9ffd64e77b5c/crm_graph.md)

## 2. UI/UX Wireframe
The dashboard design mockup can be viewed here:
![CRM Dashboard](file:///C:/Users/new/.gemini/antigravity/brain/ece89a25-0c56-446f-ad3e-9ffd64e77b5c/crm_dashboard_wireframe_1777550733996.png)

## 3. Core Synchronization Modules

# CureForever CRM - Technical Documentation

## Overview

**CureForever CRM** is a specialized e-commerce operations CRM built for Shopify + Shiprocket ecosystems, targeting wellness/supplement DTC (Direct-to-Consumer) brands in India. Its primary purpose is post-purchase customer engagement automation — including abandoned cart recovery, order follow-ups, delivery tracking, and team productivity management.

---

## What Kind of CRM Is This?

CureForever is NOT a generic CRM. It is a **task-centric, e-commerce-focused operations CRM** designed specifically for:

- **Industry**: Health/Wellness supplement brands selling online in India
- **Platform**: Shopify (store) + Shiprocket (logistics) + WhatsApp (communication)
- **Business Model**: Post-purchase follow-up automation for customer retention and order recovery

### Core Business Problem It Solves

After a customer places an order, most brands lose touch until delivery. CureForever bridges this gap by:

1. **Recovering abandoned carts** before the order is even placed
2. **Following up after delivery** to collect reviews and trigger reorders
3. **Tracking deliveries** proactively and handling RTO (Return to Origin) issues
4. **Managing a team of agents** who handle these follow-ups with clear task assignment

---

## Technology Stack

### Frontend
| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Icons | Lucide React |
| Auth UI | Supabase Auth (PKCE flow) |

### Backend & Infrastructure
| Layer | Technology |
|-------|------------|
| API | Next.js API Routes (serverless) |
| Real-time | Socket.IO (separate `chat_server.js`) |
| WhatsApp Bridge | whatsapp-web.js + Meta Cloud API |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + Row Level Security |
| Deployment | Vercel (with cron jobs) |

### External Integrations
| Service | Purpose |
|---------|---------|
| Shopify Admin REST API 2024-01 | Orders, customers, webhooks |
| Shiprocket API | Delivery tracking, webhooks |
| Meta WhatsApp Cloud API v18 | Templated WhatsApp messages |
| Google Sheets | Audit logging, transparency |

---

## Directory Structure

```
crm/
├── src/
│   ├── app/
│   │   ├── (app)/              # Authenticated routes (with Sidebar)
│   │   │   ├── dashboard/       # Main dashboard
│   │   │   ├── tasks/          # Task management
│   │   │   ├── customers/      # Customer list + profiles
│   │   │   ├── orders/         # Order grid with tracking
│   │   │   ├── reports/        # Analytics
│   │   │   ├── team/           # Agent management
│   │   │   ├── hr/             # HR suite (attendance, payroll, etc.)
│   │   │   ├── campaigns/      # WhatsApp campaigns
│   │   │   ├── workflows/       # Workflow builder
│   │   │   ├── templates/      # Message templates
│   │   │   ├── import/         # Excel bulk import
│   │   │   ├── calendar/       # Calendar view
│   │   │   ├── abandoned-carts/ # Cart recovery
│   │   │   ├── my-hub/         # Personal agent hub
│   │   │   ├── manager/        # Manager dashboard
│   │   │   ├── floor/          # Floor operations
│   │   │   ├── admin-logs/     # Audit logs
│   │   │   ├── chat/           # Team chat
│   │   │   └── settings/       # System settings
│   │   ├── api/                # API routes
│   │   │   ├── webhooks/       # shopify/, shiprocket/
│   │   │   ├── cron/           # Scheduled jobs
│   │   │   ├── dashboard/
│   │   │   ├── tasks/
│   │   │   ├── customers/
│   │   │   ├── orders/
│   │   │   ├── sync/           # Full data sync
│   │   │   ├── whatsapp/
│   │   │   ├── hr/
│   │   │   ├── leaves/
│   │   │   └── campaigns/
│   │   └── login/              # Auth page
│   ├── components/
│   │   ├── ui.tsx              # Shared UI (badges, cards, modals)
│   │   ├── Sidebar.tsx         # Navigation
│   │   ├── TaskCard.tsx        # Task with actions
│   │   ├── AddCustomerModal.tsx
│   │   ├── AdminNotifier.tsx
│   │   ├── AgentStats.tsx
│   │   ├── AgentHeartbeat.tsx
│   │   ├── Leaderboard.tsx
│   │   ├── ManagerTaskReview.tsx
│   │   ├── NDRActionModal.tsx
│   │   ├── ShiprocketOrderView.tsx
│   │   ├── chat/               # Chat components
│   │   ├── hub/                # Personal hub widgets
│   │   └── hr/                 # HR components
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client initialization
│   │   ├── task-engine.ts      # Priority calculation + assignment
│   │   ├── workflow-engine.ts  # Automation engine
│   │   ├── whatsapp.ts         # WA messaging logic
│   │   ├── mock-data.ts        # Development data
│   │   ├── utils.ts            # Helpers + config maps
│   │   ├── permissions.ts      # RBAC logic
│   │   ├── audit.ts            # Logging
│   │   ├── notifications.ts    # Admin alerts
│   │   ├── google-sheets.ts    # Sync to sheets
│   │   ├── sync-logic.ts       # Data sync
│   │   └── unmask-utils.ts    # Phone resolution
│   ├── types/
│   │   └── index.ts            # TypeScript interfaces
│   ├── hooks/
│   │   └── useCurrentProfile.ts
│   └── context/
│       └── ChatContext.tsx
├── supabase/
│   └── schema.sql              # Full PostgreSQL schema
├── chat_server.js              # Socket.IO chat server
├── wa_server.js                # WhatsApp bridge server
├── package.json
├── tailwind.config.ts
└── next.config.js
```

---

## Database Schema (Core Tables)

### `customers` — E-commerce Customers
Stores Shopify customer data enriched with CRM metadata.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `shopify_customer_id` | VARCHAR(50) | Shopify reference |
| `name`, `phone`, `email` | TEXT | Contact info |
| `alt_phone` | TEXT | Alternative contact |
| `segment` | ENUM | `repeat`, `one_time`, `inactive`, `risky` |
| `rto_flag`, `rto_count` | BOOL/INT | RTO history |
| `total_orders` | INT | Order count |
| `last_order_date` | TIMESTAMP | For segment calculation |
| `whatsapp_reminders_enabled` | BOOL | Opt-in status |

### `orders` — Synced from Shopify
Enriched with Shiprocket tracking data.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `customer_id` | UUID | FK to customers |
| `shopify_order_id` | VARCHAR(50) | Shopify reference |
| `order_number` | TEXT | Display number |
| `line_items` | JSONB | Product details |
| `total_price` | NUMERIC | Order value |
| `fulfillment_status` | ENUM | `unfulfilled`, `partial`, `fulfilled` |
| `delivery_status` | ENUM | `pending`, `in_transit`, `out_for_delivery`, `delivered`, `rto`, `failed` |
| `tracking_number` | TEXT | Shiprocket tracking |
| `ordered_at`, `delivered_at` | TIMESTAMP | Dates |

### `tasks` — Follow-up Work Items
Core CRM work unit. Every customer interaction flows through tasks.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `order_id`, `customer_id` | UUID | FK references |
| `abandoned_cart_id` | UUID | FK (for recovery tasks) |
| `assigned_to` | UUID | FK to profiles |
| `task_type` | ENUM | See Task Types below |
| `due_date` | TIMESTAMP | When to act |
| `priority_score` | INT | Computed priority |
| `status` | ENUM | `pending`, `due`, `done`, `rescheduled`, `skipped`, `cancelled`, `overdue` |
| `call_attempt_count` | INT | Attempt tracking |
| `next_attempt_at` | TIMESTAMP | Callback scheduling |
| `completed_at`, `rescheduled_to` | TIMESTAMP | Outcome tracking |

### `abandoned_carts` — Checkout Abandonment
Tracks Shopify checkouts that didn't convert to orders.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `customer_id` | UUID | FK to customers |
| `cart_token` | VARCHAR | Shopify cart token (unique) |
| `total_price` | NUMERIC | Cart value |
| `line_items` | JSONB | Products in cart |
| `recovery_status` | ENUM | `pending`, `recovered`, `cancelled` |
| `abandoned_at` | TIMESTAMP | When abandoned |

### `call_logs` — Interaction Audit Trail
Every agent interaction is logged here.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `task_id`, `customer_id` | UUID | FK references |
| `outcome` | ENUM | `done`, `rescheduled`, `no_answer`, `skipped`, `whatsapp` |
| `disposition` | ENUM | `interested`, `callback_requested`, `purchased`, `support_needed`, `not_interested`, `wrong_number`, `follow_up_later` |
| `note` | TEXT | Agent notes |
| `called_at` | TIMESTAMP | When called |

### `profiles` — User Accounts with RBAC

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | FK to auth.users |
| `email`, `name` | TEXT | Identity |
| `role` | ENUM | `admin`, `agent`, `hr`, `manager` |
| `permissions` | JSONB | Granular RBAC |
| `status` | ENUM | `online`, `break`, `meeting`, `lunch`, `away`, `offline` |
| `assigned_segments` | TEXT[] | Specialization |
| `assigned_task_types` | TEXT[] | Specialization |

### `settings` — Global Configuration (Single Row)
Key-value configuration store (upserted, not inserted).

| Setting | Default | Purpose |
|---------|---------|---------|
| `review_offset_days` | 5 | Days after delivery to request review |
| `reorder_offset_days` | 20 | Days after delivery for reorder reminder |
| `final_offset_days` | 30 | Days after delivery for final follow-up |
| `inactive_threshold_days` | 45 | Days to mark customer inactive |
| `recovery_delay_hours` | 24 | Hours before sending cart recovery WA |
| WhatsApp tokens/IDs | — | Meta Cloud API credentials |
| Shopify credentials | — | Store domain, API key |
| Shiprocket credentials | — | Email, password |

---

## Task Types

| Task Type | Priority Weight | Description |
|-----------|----------------|-------------|
| `issue_resolution` | 120 | RTO, delivery issues |
| `recovery` | 80 | Abandoned cart recovery |
| `cod_verify` | 75 | Cash on delivery verification |
| `ndr` | 70 | Non-deliverable report handling |
| `transit_update` | 60 | In-transit status updates |
| `review` | 50 | Request product review |
| `reorder` | 40 | Remind to reorder |
| `final_followup` | 30 | Final follow-up after delivery |
| `manager_audit` | 25 | Manager review task |

---

## Customer Segments

| Segment | Logic |
|---------|-------|
| `repeat` | 2+ total orders |
| `one_time` | 1 order, recent |
| `inactive` | No order in 45+ days |
| `risky` | Has RTO flag set |

---

## Authentication & Authorization

### Authentication
- **Provider**: Supabase Auth
- **Method**: Email/password with PKCE flow
- **Session**: JWT with auto-refresh
- **Login URL**: `/login`

### Roles & Permissions

| Role | Description |
|------|-------------|
| `admin` | Full system access |
| `agent` | Task management, customer views |
| `hr` | HR module access only |
| `manager` | Team oversight, analytics |

### Permissions Object (per profile)
```typescript
interface UserPermissions {
  view_analytics: boolean;
  can_import: boolean;
  can_delete: boolean;
  manage_team: boolean;
  manage_orders: boolean;
  manage_customers: boolean;
  send_whatsapp: boolean;
  audit_tasks: boolean;
  manage_automations: boolean;
}
```

---

## API Routes Overview

### Dashboard & Stats
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/dashboard` | GET | Today's tasks, overdue, upcoming, counts |
| `/api/dashboard/agent` | GET | Agent-specific stats |

### Tasks CRUD
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tasks` | GET | List with filters (status, type, customer, date) |
| `/api/tasks` | POST | Create manual task |
| `/api/tasks/[id]/[action]` | POST | complete/reschedule/skip |
| `/api/tasks/[id]/attempt` | POST | Log call attempt |
| `/api/tasks/repair-dates` | POST | Fix task due dates |

### Webhooks
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhooks/shopify` | POST | orders/create, orders/updated, checkouts/create/update |
| `/api/webhooks/shiprocket` | POST | Delivery status updates, tracking |
| `/api/webhooks/whatsapp` | POST | Inbound WhatsApp messages |

### Cron Jobs
| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/task-generator` | Daily midnight | Creates review/reorder/final_followup tasks |
| `/api/cron/overdue-marker` | Daily 00:05 | Mark past-due tasks as overdue |
| `/api/cron/segment-updater` | Daily 02:00 | Recompute customer segments |
| `/api/cron/recovery-reminder` | On-demand | Abandoned cart recovery |
| `/api/cron/workflow-executor` | On-demand | Execute workflow steps |

### Sync
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sync/shopify` | POST | Full Shopify sync |
| `/api/sync/shiprocket` | POST | Shiprocket sync |
| `/api/sync/all` | POST | Complete sync |
| `/api/sync/unmask` | POST | Unmask all masked phones |

---

## Key Business Flows

### 1. Abandoned Cart Recovery Flow
```
1. Customer starts checkout on Shopify but doesn't complete
2. Shopify sends checkout webhook → /api/webhooks/shopify
3. System creates/updates abandoned_carts record
4. Creates recovery task (due: now + recovery_delay_hours)
5. Agent contacts customer via WhatsApp with cart recovery message
6. If customer completes order → cart marked recovered, task done
```

### 2. Order Delivery Follow-up Flow
```
1. Shiprocket sends delivery webhook → /api/cron/task-generator
2. task-generator finds delivered orders without follow-up tasks
3. Creates 3 tasks per order:
   - review (due: delivered_at + review_offset_days)
   - reorder (due: delivered_at + reorder_offset_days)
   - final_followup (due: delivered_at + final_offset_days)
4. Tasks auto-assigned to agents based on specialization + workload
5. Agents complete tasks and log outcomes
```

### 3. RTO Handling Flow
```
1. Shiprocket reports RTO/failed delivery
2. System updates order.delivery_status = "rto"
3. Cancels all pending follow-up tasks for that order
4. Creates issue_resolution task (due: today)
5. If 2+ RTOs for customer → marks as "risky" segment
6. WhatsApp notification sent to admin
```

### 4. Task Priority Calculation
```typescript
score = baseWeight[taskType]        // issue_resolution: 120, recovery: 80
       + priceWeight                 // 5000+: +40, 3000+: +25, 1500+: +15
       + loyaltyBonus                // 5+ orders: +30, 2+ orders: +15
       + rtoPenalty                 // -15 if risky (except issue_resolution)
       + segmentBonus               // risky: +20, repeat: +10
       + urgencyBonus               // overdueDays * 6 (max 45)
       + priorityOverride           // +50 if high-priority product
```

### 5. Agent Assignment Algorithm
```typescript
1. Get all active agents (status != offline)
2. Filter by specialization (assigned_segments, assigned_task_types)
3. Categorize by presence:
   - Online: last_seen within 5 minutes
   - Recent: last_seen within 1 hour
   - Fallback: any active agent
4. Get current pending task count per agent
5. Return agent with minimum workload
```

### 6. Customer Segmentation Logic
```typescript
if (rto_flag) return "risky"
if (total_orders >= 2) return "repeat"
if (last_order_date < now - 45 days) return "inactive"
return "one_time"
```

---

## WhatsApp Integration

### How It Works
```
1. Event occurs (order_placed, order_delivered, cart_abandoned)
2. WorkflowEngine checks settings flags (wa_auto_*)
3. If enabled:
   - Personalizes template with customer/order data
   - Sends via Meta Cloud API (primary) or local wa_server.js (fallback)
   - Logs to whatsapp_messages table
```

### Template Types
- `whatsapp_review_template` — Review request
- `whatsapp_reorder_template` — Reorder reminder
- `whatsapp_recovery_template` — Cart recovery
- `whatsapp_final_template` — Final follow-up
- `whatsapp_transit_template` — In-transit update

---

## Workflow Engine

The workflow engine (`src/lib/workflow-engine.ts`) automates multi-step sequences:

### Triggers
- `order_placed`, `order_delivered`, `order_rto`
- `cart_abandoned`, `order_in_transit`
- `manual`, `scheduled`

### Step Types
- `message` — Send WhatsApp message
- `task` — Create follow-up task
- `delay` — Wait before next step

### Features
- Idempotency per order/customer (prevents duplicate executions)
- Inventory-aware (skips if out of stock — via Shopify product data)
- Step-by-step execution via `/api/cron/workflow-executor`

---

## HR Module

The HR module handles internal team operations:

### Attendance
- Real-time monthly grid tracking
- Check-in/check-out via AgentHeartbeat
- Status: online, break, meeting, lunch, away, offline

### Payroll (Indian Tax Compliance)
- PF (Provident Fund) calculation
- PT (Professional Tax) deduction
- TDS calculation
- Salary disbursement tracking via `payroll_runs`

### Leave Management
- Leave request submission via Sidebar
- Approval workflow (manager approves/rejects)
- Leave balance tracking

### Employee Lifecycle
- Offer letter generation
- Relieving letter generation
- Document management

---

## UI Design System

| Property | Value |
|----------|-------|
| Background | `#f7f4ed` (warm cream) |
| Primary Text | `#1c1c1c` (charcoal) |
| Light Border | `#eceae4` |
| Interactive Border | `rgba(28,28,28,0.4)` |
| Standard Radius | `6px` |
| Card Radius | `12px` |
| Pill Radius | `9999px` |
| Focus Shadow | `rgba(0,0,0,0.1) 0px 4px 12px` |

---

## Frontend Pages Summary

| Page | Route | Purpose |
|------|-------|---------|
| Login | `/login` | Supabase Auth |
| Dashboard | `/dashboard` | Today's tasks, stats, overdue |
| Tasks | `/tasks` | Full task list with filters |
| Customers | `/customers`, `/customers/[id]` | Customer list + profiles |
| Orders | `/orders` | Order grid + tracking |
| Reports | `/reports` | Analytics |
| Team | `/team`, `/team/[id]` | Agent management |
| HR | `/hr` | HR suite (tabbed) |
| Campaigns | `/campaigns` | WhatsApp broadcasts |
| Workflows | `/workflows` | Visual automation builder |
| Templates | `/templates` | Message templates |
| Import | `/import` | Excel bulk import |
| Calendar | `/calendar` | Task calendar view |
| Abandoned Carts | `/abandoned-carts` | Cart recovery |
| My Hub | `/my-hub` | Personal agent dashboard |
| Manager | `/manager` | Manager dashboard |
| Floor | `/floor` | Floor operations |
| Admin Logs | `/admin-logs` | Audit trail |
| Chat | `/chat` | Team messaging |
| Settings | `/settings` | System configuration |

---

## Cron Jobs Configuration (Vercel)

```json
{
  "crons": [
    { "path": "/api/cron/task-generator", "schedule": "0 0 * * *" },
    { "path": "/api/cron/overdue-marker", "schedule": "5 0 * * *" },
    { "path": "/api/cron/segment-updater", "schedule": "0 2 * * *" }
  ]
}
```

---

## Database Indexes

```sql
idx_tasks_customer_status_due  ON tasks(customer_id, status, due_date)
idx_tasks_order_type           ON tasks(order_id, task_type)
idx_tasks_due_date_status     ON tasks(due_date, status)
idx_orders_customer_delivery   ON orders(customer_id, delivery_status)
idx_orders_shopify_id         ON orders(shopify_order_id)
idx_customers_phone           ON customers(phone)
idx_customers_segment         ON customers(segment)
idx_call_logs_task            ON call_logs(task_id)
```

---

## Self-Healing Mechanisms

The system has several idempotency and self-healing checks:

1. **Delivery status changes to "delivered"** → Cancel premature review tasks
2. **Delivery status changes from "delivered"** → Cancel already-created review tasks
3. **Webhook processing** → Idempotency checks prevent duplicate processing
4. **Phone unmasking** → Sentinel resolves masked Shiprocket phones from order history
5. **Order/task heal** → Sync endpoint can repair orphaned records

---

## Google Sheets Integration

Webhook events and order data are synced to Google Sheets for non-technical stakeholder visibility:

- `Audit_Logs` — All system events
- `Orders` — Order sync log
- `Abandoned_Carts` — Cart abandonment data

---

## How It All Fits Together

```
SHOPIFY                          SUPERBASE                         VERCEL
┌─────────────┐                  ┌──────────────────┐               ┌─────────────────┐
│ Customer    │ webhook         │ customers table  │              │ Next.js App     │
│ places      │───────────────► │ orders table     │              │                 │
│ order       │                  │ tasks table      │              │ API Routes      │
└─────────────┘                  │ abandoned_carts  │              │                 │
      │                          │ call_logs        │              │ Cron Jobs       │
      │ webhook                 │ profiles         │              │                 │
      ▼                          └──────────────────┘              └────────┬────────┘
┌─────────────┐                                                 │           │
│ Cart        │                  ┌──────────────────┐            │    META WHATSAPP
│ abandoned   │───────────────► │ Workflow Engine   │────────────┼──────────► CLOUD API
└─────────────┘                  │ task-engine.ts   │            │
                                  └──────────────────┘            │
                                                                   ▼
                                  ┌──────────────────┐      ┌─────────────────┐
                                  │ wa_server.js     │◄─────│ whatsapp-web.js │
                                  │ (fallback WA)    │      │ (local bridge)  │
                                  └──────────────────┘      └─────────────────┘

SHIPROCKET                                                        AGENTS
┌─────────────┐                  ┌──────────────────┐            ┌─────────────────┐
│ Delivery    │ webhook         │ Order updated    │            │ Task Cards      │
│ status      │───────────────► │ delivery_status   │───────────►│ Complete/Skip   │
│ update      │                  └──────────────────┘            │ WhatsApp        │
└─────────────┘                                                   └─────────────────┘
```

---

## Summary

| Metric | Value |
|--------|-------|
| Total API Routes | ~60+ |
| Database Tables | 15+ |
| Frontend Pages | 25+ |
| Task Types | 9 |
| Customer Segments | 4 |
| Delivery Statuses | 6 |
| User Roles | 4 |
| WhatsApp Integrations | 2 (Meta Cloud API + local fallback) |
| External Integrations | 4 (Shopify, Shiprocket, Meta WA, Google Sheets) |

CureForever CRM is essentially a **task automation platform for post-purchase e-commerce operations**, combining Shopify order data, Shiprocket logistics tracking, and WhatsApp communication into a unified workflow for wellness brands to maximize customer retention and recover abandoned revenue.
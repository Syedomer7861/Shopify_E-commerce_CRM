# CureForever CRM: Shopify & Shiprocket Operations Hub

[![Next.js 14](https://img.shields.io/badge/Framework-Next.js%2014-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Database-Supabase-emerald?style=flat-square&logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-blue?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/Status-Production%20Hardened-rose?style=flat-square)](https://github.com/)

**Live Production:** [https://cureforever-crm.vercel.app/](https://cureforever-crm.vercel.app/)

> **The Ultimate Operations Engine** for CureForever. High-fidelity task automation, "Poor Man's" cloud telephony, and real-time customer engagement.

---

## Technical Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js 14 (App Router) + Tailwind CSS (Glassmorphism UI) |
| **Backend** | Supabase (PostgreSQL + Auth + Realtime) |
| **Sync Engine** | Node.js (Background Shopify & Shiprocket sync) |
| **Messaging** | Socket.IO (Real-time Chat) + whatsapp-web.js Bridge |
| **Telephony** | MacroDroid + Android Native Bridge (Zero Cost) |
| **Deployment** | Vercel (Production) + Local Dedicated Daemons |

---

## Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/Syedomer7861/Shopify_E-commerce_CRM.git
cd crm
npm install
```

### 2. Configure Environment
Create a `.env.local` file in the root directory:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SHOPIFY_WEBHOOK_SECRET=your_secret
SHIPROCKET_WEBHOOK_SECRET=your_secret
```

### 3. Launch Services
This CRM requires three concurrent processes for full functionality:

```bash
# Terminal 1: Main Next.js App
npm run dev

# Terminal 2: Real-time Chat & Sync Server
npm run chat

# Terminal 3: WhatsApp & Telephony Bridge
npm run wa
```

---

## Project Architecture

```text
src/
|-- app/
|   |-- (app)/                  # Authenticated "God Mode" routes
|   |   |-- dashboard/          # Real-time KPIs & Call Monitor
|   |   |-- tasks/              # Intelligent task queue with owner isolation
|   |   \-- customers/          # 360 degrees Customer Profiles & RTO Risk
|   |   \-- reports/            # Performance Leaderboards & Analytics
|   |-- api/
|   |   |-- webhooks/           # Hardened Shopify/Shiprocket handlers
|   |   \-- calls/              # Telephony & Recording ingestion
|-- components/
|   |-- CallMonitor.tsx         # Real-time manager oversight tool
|   |-- TaskCard.tsx            # Actionable follow-up cards
|   \-- Leaderboard.tsx         # Gamified agent performance
\-- lib/
    |-- risk-engine.ts          # Automated RTO & Fraud detection
    \-- workflow-engine.ts      # Multi-channel (WA/SMS) automation
```

---

## Production Hardening (New)

- **Poor Man's Cloud Telephony**: Zero-cost Android integration for real-time call tracking and recordings.
- **Manager Command Center**: Live visibility into agent activity (ON CALL status) and audit playback.
- **RLS & Security**: Granular Row Level Security ensures agents only access their own data.
- **Deduplication Sentinel**: Advanced webhook isolation prevents duplicate tasks or spam messages.
- **Automated Log Purge**: Self-healing database that auto-cleans stale activity logs every 60 days.

---

## Deployment

The CRM is optimized for **Vercel**. 

1. Push your changes to GitHub.
2. Link the repository to Vercel.
3. Configure Environment Variables in the Vercel Dashboard.
4. Ensure the `wa_server.js` and `chat_server.js` are running on your local bridge machine with proper port forwarding or Tailscale tunnel.

---

## Roadmap

- [x] **Phase 1**: Database Architecture & Sync Engine
- [x] **Phase 2**: Dashboard & Task Management UI
- [x] **Phase 3**: Excel Import & Advanced Segmentation
- [x] **Phase 4**: **Hardening & Telephony Suite** (Live Monitoring, RTO Risk Engine)
- [ ] **Phase 5**: AI-Powered Response Suggestions & True ROAS Tracking

---

Built with passion for **CureForever**.  
*Hardened for 2026 Production Standards.*
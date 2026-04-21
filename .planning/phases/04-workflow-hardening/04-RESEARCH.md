# Phase 04: Workflow Hardening & Advanced Automation - Research

This research phase investigates the technical implementation of stateful follow-ups, self-healing sync logic, and transit protection.

## 1. Workflow Engine Maturity
The current `WorkflowEngine` is a great foundation but needs hardening for Phase 4.

### 1.1. Campaign Isolation
- **Mechanism**: Use the `workflow_instances` table to track state.
- **Rule**: If a customer has an `active` instance of a "Follow-up" category workflow, no other follow-up workflows should trigger for that order.
- **Implementation**: In `WorkflowEngine.trigger`, query `workflow_instances` for `customer_id`, `order_id`, and `status='active'` before starting a new one.

### 1.2. Negative Feedback Suppression
- **Context**: We must not ask for a review if the customer is already angry (active issue).
- **Implementation**: The `order_delivered` trigger should scan the `tasks` table for `task_type='issue_resolution'` where `status` is not `done` or `cancelled`. If found, the review workflow step should be skipped or delayed.

## 2. Self-Healing Sync Engine
We need to handle the "Flapping Status" problem (Delivered -> Out for Delivery -> Delivered).

### 2.1. Cancellation Logic
- **Trigger**: Any Shiprocket webhook that is NOT `delivered` (7, 10).
- **Action**: Query for active `review`, `reorder`, or `final_followup` tasks for that order ID.
- **Consistency**: The `sync/all` endpoint must run this same logic to reconcile bulk state.

### 2.2. Tracking Parity
- **Observation**: Shopify fulfillment status `fulfilled` doesn't always mean `delivered`.
- **Refinement**: Shopify webhooks should only trigger the `order_in_transit` event. Only Shiprocket (or manual entry) should trigger `order_delivered`.

## 3. Transit Inform Logic (Proactive Support)
### 3.1. Stale Shipment Detection
- **Trigger**: A new cron job `src/app/api/cron/transit-inform/route.ts` (or similar).
- **Frequency**: Every 6-12 hours.
- **Logic**: Find orders where `delivery_status = 'in_transit'` AND `updated_at < now() - 48 hours`.
- **Action**: Create a `transit_update` task for agents and/or send a "Still in transit, we're monitoring" WhatsApp.

## 4. Database Schema Impact
- No major migrations needed. We will use `workflow_logs` and `metadata` fields in `tasks` and `orders` for state tracking.

## 5. Verification Architecture
- `src/tests/workflows.test.ts`: Unit tests for trigger logic.
- Browser test: Simulate Shiprocket webhook callbacks for a test order.

---

*Phase: 04-workflow-hardening*
*Research complete: 2026-04-17*

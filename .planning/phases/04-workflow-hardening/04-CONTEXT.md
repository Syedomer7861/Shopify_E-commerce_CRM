# Phase 04: Workflow Hardening & Advanced Automation - Context

**Gathered**: 2026-04-17
**Status**: Ready for planning

<domain>
## Phase Boundary
This phase focuses on maturing the event-driven architecture of the CRM. Key focus areas are the absolute reliability of the delivery synchronization (Shopify vs Shiprocket) and the expansion of the Workflow Engine to handle complex, multi-day customer engagement cycles.

</domain>

<decisions>
## Implementation Decisions

### 1. Delivery Logic Hardening
- **Decision**: Map all non-delivered statuses (In Transit, RTO, Out for Delivery) to a global "Self-Healing" logic.
- **Goal**: If an order was marked 'delivered' (triggering a review task) but then its status changes back to 'in_transit' or 'undelivered', the system MUST automatically cancel the premature review tasks. (Partially implemented in bug fix - needs validation).

### 2. Workflow Engine Expansion
- **Decision**: Implement a "Campaign Logic" where a customer can only be in one active workflow per order.
- **Decision**: Add `Transit Inform` as a system automation that triggers if an order stays in 'in_transit' for more than 48 hours without update.

### 3. Product-Specific Logic
- **Decision**: Honor `product_overrides` for review timing. If a product has a 10-day offset, the Review task MUST be generated at `delivered_at + 10 days`, not the default.

### 4. Negative Feedback Guard
- **Decision**: The `order_delivered` trigger MUST check for any active `issue_resolution` tasks for that customer. If an active issue exists, the Review WhatsApp and Task MUST be suppressed/skipped.

</decisions>

<canonical_refs>
## Canonical References

### Logic
- `src/lib/workflow-engine.ts` — Workflow execution hub.
- `src/app/api/webhooks/shopify/route.ts` — Order source events.
- `src/app/api/webhooks/shiprocket/route.ts` — Delivery status source.
- `src/app/api/sync/all/route.ts` — Global data reconciliation.

</canonical_refs>

<specifics>
## Specific Ideas
- Use the `TaskGenerator` cron to scan for orders that were marked 'delivered' incorrectly and clean up tasks automatically.
- Log all "Self-Healing" actions in `workflow_logs` for agent visibility.

</specifics>

<deferred>
## Deferred Ideas
- AI-based sentiment analysis for review text (Future Phase).
- Multi-channel escalation (SMS/Email) - kept simple in this phase.

</deferred>

---

*Phase: 04-workflow-hardening*
*Context gathered: 2026-04-17*

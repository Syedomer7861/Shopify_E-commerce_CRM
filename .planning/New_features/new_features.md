HR Dashboard — built for Pravalika_HR to track at a glance:

Live status of all 5 members (online/away/offline) with shift start times
Full attendance table with productive hours, break time, and task counts
Visual break bar for each member — Mukesh's 45m break is flagged in amber automatically

# HR Dashboard — Logic & Features Prompt

Build an HR Dashboard for a CRM called CureForever. I already have the design system, colors, and component library. Focus only on the logic, data, and features below.

---

## Data & Refresh

- Fetch team data from `/api/team/status` on page load and every 30 seconds automatically
- On API failure, keep showing the last successfully loaded data — never blank the UI
- Show a "last updated at HH:MM:SS" timestamp that updates on every successful fetch

---

## Metric Cards (top row — 4 cards)

Derive all values dynamically from the API response. Never hardcode.

1. **Total Team** — count of all members
2. **Online Now** — count where `status === "Online"`, subtitle lists their names
3. **Away / Idle** — count where `status === "Away"`, subtitle shows name + "Xm ago"
4. **Offline** — count where `status === "Offline"`, subtitle lists their names

---

## Attendance Table

One row per team member. Columns:

- **Member** — full name
- **Role** — Admin or Agent (badge)
- **Status** — Online / Away / Offline with how long ago they were last seen (for Away and Offline only)
- **Shift Start** — time their shift began today. Show "Not started" if they haven't logged in yet
- **Productive Time** — time spent actively working today (format: Xh Ym)
- **Break Time** — total break time taken today in minutes
- **Tasks** — task count for Agents only. Show "—" for Admins. Never show 0

### Break Time Auto-Highlight Rule

Apply automatically to the Break Time cell — no manual flagging needed:

- Under 30 min → no highlight
- 30 to 44 min → warning highlight (amber)
- 45 min or more → danger highlight (red)

---

## Tasks Per Agent — Bar Chart

- Show only Agents in this chart, skip Admins
- X-axis: agent names
- Y-axis: task count with comma formatting (e.g. 1,890)
- Tooltip: "X tasks"
- Data comes from the same API response — no separate fetch needed

---

## Break & Leave Summary

- One progress bar row per member showing their break time visually
- Bar fill percentage = `(breakMinutes / 90) * 100` — 90 minutes is the max reference
- Bar color follows the same 3-tier rule as the table cell (normal / amber / red)
- At the bottom, show two summary values:
  - **Total break today** — sum of all members' break time, formatted as Xh Ym
  - **Pending leave requests** — fetched from `/api/leaves/pending`, show count

---

## Sample Data Shape

```js
{
  members: [
    {
      name: "Uzma",
      role: "Agent",           // "Admin" | "Agent"
      status: "Away",          // "Online" | "Away" | "Offline"
      lastSeenMinutes: 5,      // null if Online
      shiftStart: "09:00",     // null if not started
      productiveMinutes: 330,
      breakMinutes: 20,
      taskCount: 1890          // null for Admins
    }
  ],
  pendingLeaves: 0
}
```

---

## Edge Cases to Handle

- Member not logged in today → show "Not started" in Shift Start and Productive Time, skip their bar in break summary
- `taskCount` is null or undefined → always render "—", never "0"
- API timeout or error → show a warning banner "Live data unavailable — showing last known state", keep the existing UI intact
- All members offline → Online Now card shows 0 with no subtitle names

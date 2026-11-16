import type { VisualKind } from "@/content";

// Product illustrations drawn in markup: no image files to ship or optimise.
// Each one mirrors a real screen in the app, with its real labels and states.
// They are decorative (aria-hidden); names, amounts and counts are sample
// content, not customer data or performance claims.

const Dot = ({ c }: { c: string }) => <span className={`w-1.5 h-1.5 rounded-full ${c}`} />;
const Pill = ({ children, c }: { children: React.ReactNode; c: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${c}`}>{children}</span>
);
const AMBER = "bg-amber-100 text-amber-800", SKY = "bg-sky-100 text-sky-800", ROSE = "bg-rose-100 text-rose-800";
const GREEN = "bg-emerald-100 text-emerald-800", VIOLET = "bg-violet-100 text-violet-800", MUTED = "bg-[#f7f4ed] text-[#5f5f5d]";

const Avatar = ({ n, c = "bg-[#1c1c1c]/10" }: { n: string; c?: string }) => (
  <span className={`flex-shrink-0 w-7 h-7 rounded-full ${c} text-[10px] font-bold flex items-center justify-center`}>{n.split(" ").map((w) => w[0]).join("")}</span>
);

/** Row list shared by most screens: [primary, secondary, meta, status, tone]. */
function Rows({ rows, tabs }: { rows: [string, string, string, string, string][]; tabs?: string[] }) {
  return (
    <div className="space-y-2">
      {tabs && (
        <div className="flex gap-2 mb-3">
          {tabs.map((t, i) => (
            <span key={t} className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${i === 0 ? "bg-[#1c1c1c] text-white" : MUTED}`}>{t}</span>
          ))}
        </div>
      )}
      {rows.map(([a, b, meta, status, c]) => (
        <div key={a + b} className="flex items-center gap-3 rounded-lg border border-[#eceae4] px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold truncate">{a}</span>
            <span className="block text-[10.5px] text-[#5f5f5d] truncate">{b}</span>
          </span>
          <span className="text-[10.5px] text-[#5f5f5d] hidden sm:block">{meta}</span>
          <Pill c={c}>{status}</Pill>
        </div>
      ))}
    </div>
  );
}

const Orders = () => (
  <Rows tabs={["All", "To verify", "Exceptions"]} rows={[
    ["#4821 · Ananya R.", "COD · Jaipur", "₹1,249", "Verify", AMBER],
    ["#4820 · Karan M.", "Prepaid · Pune", "₹2,180", "In transit", SKY],
    ["#4819 · Fatima S.", "COD · Lucknow", "₹899", "Delivery failed", ROSE],
    ["#4818 · Rohit P.", "Prepaid · Kochi", "₹3,450", "Delivered", GREEN],
    ["#4817 · Meera J.", "COD · Indore", "₹1,560", "Confirmed", GREEN],
  ]} />
);

const Carts = () => (
  <Rows tabs={["Recovery queue", "Recovered"]} rows={[
    ["Sana K.", "2 items · left 40 min ago", "₹2,340", "Reminder sent", SKY],
    ["Vikram T.", "1 item · left 3 h ago", "₹1,199", "Call due", AMBER],
    ["Neha G.", "3 items · yesterday", "₹4,870", "Recovered", GREEN],
    ["Arjun D.", "1 item · 2 days ago", "₹649", "No answer", MUTED],
  ]} />
);

function Shipments() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[["In transit", "128", SKY], ["NDR", "9", ROSE], ["RTO", "4", AMBER]].map(([k, v, c]) => (
          <div key={k} className="rounded-xl bg-[#f7f4ed] p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#5f5f5d]">{k}</div>
            <div className="text-[20px] font-bold mt-1">{v}</div>
            <span className={`block h-1 w-8 rounded-full mt-1.5 ${c}`} />
          </div>
        ))}
      </div>
      <Rows rows={[
        ["AWB 1490 2211 · #4819", "Customer unavailable", "Delhivery", "Follow-up task", ROSE],
        ["AWB 1490 2187 · #4806", "Address incomplete", "Xpressbees", "Re-attempt", AMBER],
        ["AWB 1490 2150 · #4799", "Out for delivery", "Blue Dart", "On track", GREEN],
      ]} />
    </div>
  );
}

function Chat() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-3 border-b border-[#eceae4]">
        <Avatar n="Ananya R" c="bg-emerald-100" />
        <div><div className="text-[12px] font-semibold">Ananya R.</div><div className="text-[10px] text-[#5f5f5d]">Order #4821 &middot; COD &middot; ₹1,249</div></div>
        <span className="ml-auto"><Pill c={GREEN}>WhatsApp</Pill></span>
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-[#f7f4ed] px-3.5 py-2.5 text-[12px] leading-relaxed">Hi Ananya, your order #4821 for ₹1,249 is placed. Please confirm delivery to Jaipur 302017.</div>
      <div className="max-w-[60%] ml-auto rounded-2xl rounded-tr-sm bg-emerald-700 text-white px-3.5 py-2.5 text-[12px]">Confirmed, after 5pm please</div>
      <div className="rounded-lg border border-dashed border-[#e4e2da] px-3 py-2 text-[11px] text-[#5f5f5d]">Task closed &middot; outcome <b className="text-[#1c1c1c]">Confirmed</b> &middot; note added for courier</div>
      <div className="flex items-center gap-2 pt-1">
        <span className="flex-1 rounded-full border border-[#eceae4] px-3 py-2 text-[11px] text-[#5f5f5d]">Template: order_confirmation</span>
        <span className="rounded-full bg-[#1c1c1c] text-white text-[11px] font-semibold px-3 py-2">Send</span>
      </div>
    </div>
  );
}

function Calls() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl bg-[#111113] text-white px-4 py-3">
        <span className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-[11px] font-bold">02:14</span>
        <div className="min-w-0"><div className="text-[12px] font-semibold">Calling Karan M. &middot; #4820</div><div className="text-[10.5px] text-white/60">via Exotel &middot; recording on</div></div>
        <span className="ml-auto rounded-full bg-rose-500 text-[10px] font-bold px-2.5 py-1">End</span>
      </div>
      <Rows rows={[
        ["Fatima S. · outbound", "Address confirmed", "3:42", "Answered", GREEN],
        ["Rohit P. · outbound", "Asked to call after 6pm", "0:48", "Callback", AMBER],
        ["Meera J. · inbound", "Order status", "1:15", "Answered", GREEN],
      ]} />
    </div>
  );
}

function Board() {
  const cols: [string, string, [string, string][]][] = [
    ["To do", "bg-slate-400", [["Festive offer banner", "Fri"], ["Supplier price list", "Mon"]]],
    ["In progress", "bg-amber-400", [["Instagram reel cut", "Today"], ["Product page copy", "Tue"]]],
    ["Review", "bg-violet-400", [["Catalogue shoot picks", "Today"]]],
    ["Done", "bg-emerald-500", [["Diwali email draft", "Done"]]],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {cols.map(([name, c, cards]) => (
        <div key={name} className="rounded-xl bg-[#f7f4ed] p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold mb-2"><Dot c={c} />{name}</div>
          <div className="space-y-2">
            {cards.map(([t, due]) => (
              <div key={t} className="rounded-lg bg-white border border-[#eceae4] p-2.5">
                <div className="text-[11px] font-semibold leading-snug">{t}</div>
                <div className="flex items-center justify-between pt-2">
                  <span className="w-4 h-4 rounded-full bg-[#ff7a45]/30" />
                  <span className="text-[9px] text-[#5f5f5d]">{due}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const Tasks = () => (
  <Rows tabs={["My queue", "Overdue", "Done today"]} rows={[
    ["COD verify · #4821", "Risk score 72 · first order", "Due 10:30", "High risk", ROSE],
    ["Cart recovery · Sana K.", "₹2,340 · 2 items", "Due 11:00", "Open", SKY],
    ["NDR follow-up · #4819", "Customer unavailable", "Overdue 1 h", "Escalated", AMBER],
    ["Review request · #4790", "Delivered 3 days ago", "Due today", "Open", SKY],
  ]} />
);

function Chart() {
  const bars = [38, 52, 44, 66, 58, 74, 62, 81, 70, 88, 79, 92];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {[["Revenue", "₹4.8L", "▲ 12%"], ["RTO rate", "8.4%", "▼ 2.1 pts"], ["Recovered", "₹62K", "▲ 18%"]].map(([k, v, d]) => (
          <div key={k} className="rounded-xl bg-[#f7f4ed] p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#5f5f5d]">{k}</div>
            <div className="text-[17px] font-bold mt-1">{v}</div>
            <div className="text-[10px] font-semibold text-emerald-700">{d}</div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1.5 h-28 rounded-xl border border-[#eceae4] p-3">
        {bars.map((h, i) => <span key={i} className={`flex-1 rounded-t ${i > 8 ? "bg-emerald-500" : "bg-[#1c1c1c]/15"}`} style={{ height: `${h}%` }} />)}
      </div>
      <div className="flex justify-between text-[9.5px] text-[#5f5f5d] mt-1.5 px-1"><span>Week 1</span><span>Export: Excel &middot; PDF</span><span>Week 12</span></div>
    </div>
  );
}

function Flow() {
  const steps: [string, string, string][] = [["When", "An expense over ₹10,000 is submitted", SKY], ["If", "Department is Marketing", AMBER], ["Then", "Notify the finance lead", GREEN], ["And", "Ask the manager to approve", VIOLET]];
  return (
    <div className="space-y-2">
      {steps.map(([k, v, c], i) => (
        <div key={k}>
          <div className="flex items-center gap-3 rounded-xl border border-[#eceae4] px-3.5 py-3">
            <Pill c={c}>{k}</Pill>
            <span className="text-[12.5px] font-medium">{v}</span>
          </div>
          {i < steps.length - 1 && <span className="block w-px h-3 bg-[#1c1c1c]/20 ml-7" />}
        </div>
      ))}
    </div>
  );
}

const Approvals = () => (
  <Rows tabs={["Waiting on me", "Decided"]} rows={[
    ["Travel expense · Rahul K.", "₹14,200 · Sales", "2 h ago", "Approve?", AMBER],
    ["Leave · Priya S.", "3 days · 18–20 Dec", "Today", "Approve?", AMBER],
    ["Vendor invoice · PrintHub", "₹38,500 · due 30 Nov", "Yesterday", "Approved", GREEN],
    ["Own expense · you", "Self-approval blocked", "—", "Sent up", MUTED],
  ]} />
);

function People() {
  const rows: [string, string, string, string][] = [
    ["Priya S.", "Agent", "On a call · 6 h 12 m", "bg-emerald-500"],
    ["Rahul K.", "Agent", "Working queue · 5 h 40 m", "bg-emerald-500"],
    ["Ayesha N.", "Team lead", "Reviewing · 6 h 55 m", "bg-amber-400"],
    ["Dev M.", "Agent", "On break · 15 m", "bg-slate-300"],
  ];
  return (
    <div className="space-y-2">
      {rows.map(([n, role, status, c]) => (
        <div key={n} className="flex items-center gap-3 rounded-lg border border-[#eceae4] px-3 py-2.5">
          <span className="relative"><Avatar n={n} /><span className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${c}`} /></span>
          <span className="flex-1 min-w-0"><span className="block text-[12px] font-semibold">{n}</span><span className="block text-[10px] text-[#5f5f5d]">{role}</span></span>
          <span className="text-[10.5px] text-[#5f5f5d] text-right">{status}</span>
        </div>
      ))}
    </div>
  );
}

function Hr() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[["Logged in", "09:02"], ["Productive", "6 h 10 m"], ["Break", "35 m"]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-[#f7f4ed] p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#5f5f5d]">{k}</div>
            <div className="text-[15px] font-bold mt-1">{v}</div>
          </div>
        ))}
      </div>
      <Rows rows={[
        ["Priya S. · Casual leave", "18–20 Dec · 3 days", "HR", "Pending", AMBER],
        ["Rahul K. · Payslip", "November · ₹32,000 net", "Payroll", "Paid", GREEN],
        ["Ayesha N. · Review", "Q3 performance", "Manager", "Due Fri", SKY],
      ]} />
    </div>
  );
}

function Matrix() {
  const mods = ["Orders", "Invoices", "Tickets", "Leads"];
  const acts = ["View", "Create", "Edit", "Approve"];
  const grid = [["Team", "Own", "Own", "—"], ["Org", "—", "—", "—"], ["Org", "Own", "Team", "Team"], ["Team", "Own", "Own", "—"]];
  const tone: Record<string, string> = { Org: GREEN, Team: SKY, Own: AMBER, "—": MUTED };
  return (
    <div className="text-[11px]">
      <div className="grid grid-cols-5 gap-1.5 mb-1.5 font-bold uppercase tracking-wider text-[9px] text-[#5f5f5d]">
        <span />{acts.map((a) => <span key={a} className="text-center">{a}</span>)}
      </div>
      {mods.map((m, r) => (
        <div key={m} className="grid grid-cols-5 gap-1.5 mb-1.5 items-center">
          <span className="font-semibold">{m}</span>
          {grid[r].map((v, c) => <span key={c} className={`rounded-md py-2 text-center font-semibold ${tone[v]}`}>{v}</span>)}
        </div>
      ))}
      <div className="mt-3 rounded-lg bg-[#f7f4ed] px-3 py-2 text-[#5f5f5d]">Role: <b className="text-[#1c1c1c]">Team lead</b> &middot; scope decides how far each action reaches</div>
    </div>
  );
}

function Pipeline() {
  const cols: [string, string, [string, string][]][] = [
    ["New", "bg-slate-400", [["Greenleaf Cafe", "₹45K"], ["Nova Clinics", "₹1.2L"]]],
    ["Qualified", "bg-sky-400", [["Urban Threads", "₹80K"]]],
    ["Quote sent", "bg-amber-400", [["BrightPath School", "₹2.4L"]]],
    ["Won", "bg-emerald-500", [["Spice Route Foods", "₹65K"]]],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {cols.map(([name, c, cards]) => (
        <div key={name} className="rounded-xl bg-[#f7f4ed] p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold mb-2"><Dot c={c} />{name}</div>
          <div className="space-y-2">
            {cards.map(([t, v]) => (
              <div key={t} className="rounded-lg bg-white border border-[#eceae4] p-2.5">
                <div className="text-[11px] font-semibold leading-snug">{t}</div>
                <div className="text-[10px] text-[#5f5f5d] mt-1">{v}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const Tickets = () => (
  <Rows tabs={["Open", "Breached", "Resolved"]} rows={[
    ["SD-204 · Laptop not booting", "Urgent · IT", "SLA 1 h left", "In progress", AMBER],
    ["SD-203 · Payroll query", "High · HR", "SLA breached", "Escalated", ROSE],
    ["SD-201 · New hire access", "Normal · Admin", "SLA 2 d", "Open", SKY],
    ["SD-198 · Printer jam", "Low · Facilities", "Met", "Resolved", GREEN],
  ]} />
);

const Finance = () => (
  <Rows tabs={["Invoices", "Expenses", "Vendors"]} rows={[
    ["INV-1042 · Nova Clinics", "GST 18% · due 30 Nov", "₹1,41,600", "Unpaid", AMBER],
    ["INV-1041 · Urban Threads", "From quote Q-311", "₹94,400", "Paid", GREEN],
    ["Expense · Rahul K.", "Travel · receipt attached", "₹14,200", "Approval", VIOLET],
    ["PrintHub · vendor bill", "Due in 5 days", "₹38,500", "Scheduled", SKY],
  ]} />
);

const Visits = () => (
  <Rows tabs={["Today", "This week"]} rows={[
    ["Greenleaf Cafe · Bandra", "Checked in 10:42 · photo + GPS", "Rahul K.", "Done", GREEN],
    ["Nova Clinics · Andheri", "Planned 12:30", "Rahul K.", "Next", SKY],
    ["BrightPath School · Thane", "Planned 15:00", "Dev M.", "Planned", MUTED],
    ["Spice Route · Vashi", "Outcome: order expected", "Dev M.", "Follow-up", AMBER],
  ]} />
);

function Connect() {
  const apps: [string, string, string][] = [
    ["Shopify", "Orders and carts sync", GREEN], ["Shiprocket", "Tracking and NDR", GREEN], ["WhatsApp", "Meta Cloud API", GREEN],
    ["Exotel / Twilio", "Calls and recordings", SKY], ["Gmail", "Workflow emails", SKY], ["Webhooks + API", "Your other tools", MUTED],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {apps.map(([n, d, c]) => (
        <div key={n} className="rounded-xl border border-[#eceae4] p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold">{n}</span><Pill c={c}>{c === MUTED ? "Optional" : "Connected"}</Pill></div>
          <div className="text-[10.5px] text-[#5f5f5d] mt-1">{d}</div>
        </div>
      ))}
    </div>
  );
}

function Import() {
  return (
    <div className="space-y-3 text-[11px]">
      <div className="rounded-xl border-2 border-dashed border-[#e4e2da] p-4 text-center">
        <div className="font-semibold text-[12px]">orders-october.xlsx</div>
        <div className="text-[#5f5f5d] mt-0.5">1,284 rows &middot; 9 columns</div>
      </div>
      {[["Order ID", "order_number"], ["Phone", "customer_phone"], ["Amount", "total_price"], ["Payment", "payment_mode"]].map(([a, b]) => (
        <div key={a} className="flex items-center gap-2 rounded-lg border border-[#eceae4] px-3 py-2">
          <span className="flex-1 font-semibold">{a}</span><span className="text-[#5f5f5d]">&rarr;</span><span className="flex-1 text-right font-mono text-[10.5px]">{b}</span>
        </div>
      ))}
      <div className="flex items-center gap-2"><Pill c={GREEN}>1,271 ready</Pill><Pill c={AMBER}>13 duplicates flagged</Pill></div>
    </div>
  );
}

const KINDS: Record<VisualKind, [() => JSX.Element, string]> = {
  orders: [Orders, "Orders"], board: [Board, "Workspace"], chat: [Chat, "WhatsApp"], chart: [Chart, "Analytics"],
  flow: [Flow, "Business rule"], people: [People, "Team floor"], matrix: [Matrix, "Access matrix"],
  carts: [Carts, "Cart recovery"], shipments: [Shipments, "Shipments"], calls: [Calls, "Calls"], tasks: [Tasks, "Task queue"],
  approvals: [Approvals, "Approvals"], hr: [Hr, "Human capital"], pipeline: [Pipeline, "Deals"], tickets: [Tickets, "Service desk"],
  finance: [Finance, "Finance"], visits: [Visits, "Field visits"], connect: [Connect, "Integrations"], import: [Import, "Import"],
};

/** Hero product mock: the agent cockpit in a device bezel, with sample rows. */
export function DashboardMock({ className = "" }: { className?: string }) {
  const nav = ["Dashboard", "Orders", "Verify queue", "Shipments", "WhatsApp", "Tasks", "Team"];
  const rows: [string, string, string, string, string][] = [
    ["#4821", "Ananya R. · Jaipur", "COD", "Verify", AMBER],
    ["#4820", "Karan M. · Pune", "Prepaid", "In transit", SKY],
    ["#4819", "Fatima S. · Lucknow", "COD", "Delivery failed", ROSE],
    ["#4818", "Rohit P. · Kochi", "Prepaid", "Delivered", GREEN],
  ];
  return (
    <div aria-hidden className={`relative text-[#111113] text-left ${className}`}>
      <div className="rounded-t-[1.75rem] sm:rounded-t-[2rem] border-[6px] sm:border-[8px] border-b-0 border-[#111113] bg-[#f6f5f1] shadow-[0_40px_120px_-20px_rgba(17,17,19,0.35)] overflow-hidden">
        <div className="grid grid-cols-[auto_1fr] min-h-[19rem] sm:min-h-[24rem]">
          <div className="hidden sm:flex flex-col w-44 bg-white border-r border-[#e4e2da] p-4">
            <div className="flex items-center gap-2 mb-5"><span className="w-6 h-6 rounded-full bg-[#111113]" /><span className="text-[11px] font-bold">CodeCrest</span></div>
            {nav.map((n, i) => (
              <div key={n} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11.5px] font-medium ${i === 1 ? "bg-[#fff1ea] text-[#d9541e]" : "text-[#5c5c5a]"}`}>
                <span className={`w-3 h-3 rounded-[4px] ${i === 1 ? "bg-[#ff7a45]" : "bg-[#111113]/15"}`} />{n}
                {i === 2 && <span className="ml-auto rounded-full bg-emerald-500 text-white text-[9px] font-bold px-1.5">7</span>}
              </div>
            ))}
          </div>
          <div className="p-3.5 sm:p-5 min-w-0">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex-1 max-w-[14rem] rounded-full bg-white border border-[#e4e2da] px-3 py-1.5 text-[10.5px] text-[#5c5c5a]/70">Search orders, customers&hellip;</span>
              <span className="ml-auto w-7 h-7 rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ffe36e]" />
            </div>
            <div className="text-[13px] sm:text-[15px] font-bold mb-3">Today&apos;s orders</div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
              {[["To verify", "7", "bg-amber-100", "bg-amber-400"], ["In transit", "128", "bg-sky-100", "bg-sky-400"], ["Follow-ups", "12", "bg-emerald-100", "bg-emerald-400"]].map(([l, v, soft, hard]) => (
                <div key={l} className="rounded-xl bg-white border border-[#e4e2da] p-2.5 sm:p-3">
                  <span className={`flex w-6 h-6 sm:w-7 sm:h-7 rounded-full items-center justify-center ${soft}`}><span className={`w-2 h-2 rounded-full ${hard}`} /></span>
                  <div className="text-[15px] sm:text-[18px] font-bold mt-1.5">{v}</div>
                  <div className="text-[9.5px] sm:text-[10.5px] text-[#5c5c5a] truncate">{l}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-white border border-[#e4e2da] divide-y divide-[#e4e2da]">
              {rows.map(([id, who, pay, status, c]) => (
                <div key={id} className="flex items-center gap-2.5 sm:gap-3 px-3 py-2.5">
                  <span className="text-[11px] sm:text-[12px] font-semibold w-11">{id}</span>
                  <span className="flex-1 min-w-0 text-[11px] text-[#5c5c5a] truncate">{who}</span>
                  <span className="text-[10px] text-[#5c5c5a] w-12 hidden md:block">{pay}</span>
                  <Pill c={c}>{status}</Pill>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Visual({ kind = "orders", className = "", bare, bezel }: { kind?: VisualKind; className?: string; bare?: boolean; bezel?: boolean }) {
  const [Body, label] = KINDS[kind];
  return (
    <div aria-hidden className={`relative text-[#1c1c1c] text-left ${className}`}>
      {!bare && <div className="absolute -inset-6 bg-gradient-to-tr from-[#ff7a45]/25 via-[#ffe36e]/25 to-[#5fe39a]/30 blur-3xl rounded-full pointer-events-none" />}
      <div className={`relative bg-white overflow-hidden ${bezel ? "rounded-[1.6rem] border-[6px] border-[#111113] shadow-[0_30px_80px_-20px_rgba(17,17,19,0.35)]" : "rounded-2xl border border-[#e4e2da] shadow-2xl shadow-black/15"}`}>
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#eceae4] bg-[#fcfbf8]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1c1c1c]/15" /><span className="w-2.5 h-2.5 rounded-full bg-[#1c1c1c]/15" /><span className="w-2.5 h-2.5 rounded-full bg-[#1c1c1c]/15" />
          <span className="ml-3 text-[11px] font-semibold text-[#5f5f5d]">CodeCrest &middot; {label}</span>
        </div>
        <div className="p-4 sm:p-5"><Body /></div>
      </div>
    </div>
  );
}

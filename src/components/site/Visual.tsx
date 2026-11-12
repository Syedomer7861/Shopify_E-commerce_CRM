import type { VisualKind } from "@/content";

// Stylised product illustrations drawn in markup: no image files to ship or
// optimise. They are decorative (aria-hidden); labels and figures in them are
// sample content, not customer data or performance claims.

const Dot = ({ c }: { c: string }) => <span className={`w-1.5 h-1.5 rounded-full ${c}`} />;
const Bar = ({ w, c = "bg-[#1c1c1c]/10" }: { w: string; c?: string }) => <span className={`block h-2 rounded-full ${c}`} style={{ width: w }} />;
const Pill = ({ children, c }: { children: React.ReactNode; c: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c}`}>{children}</span>
);

function Orders() {
  const rows: [string, string, string, string][] = [
    ["#4821", "COD", "Verify", "bg-amber-100 text-amber-800"],
    ["#4820", "Prepaid", "In transit", "bg-sky-100 text-sky-800"],
    ["#4819", "COD", "Delivery failed", "bg-rose-100 text-rose-800"],
    ["#4818", "Prepaid", "Delivered", "bg-emerald-100 text-emerald-800"],
    ["#4817", "COD", "Confirmed", "bg-emerald-100 text-emerald-800"],
  ];
  return (
    <div className="space-y-2">
      <div className="flex gap-2 mb-3">
        {["All", "To verify", "Exceptions"].map((t, i) => (
          <span key={t} className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${i === 0 ? "bg-[#1c1c1c] text-white" : "bg-[#f7f4ed] text-[#5f5f5d]"}`}>{t}</span>
        ))}
      </div>
      {rows.map(([id, pay, status, c]) => (
        <div key={id} className="flex items-center gap-3 rounded-lg border border-[#eceae4] px-3 py-2.5">
          <span className="text-[12px] font-semibold w-12">{id}</span>
          <span className="flex-1"><Bar w="70%" /></span>
          <span className="text-[10px] text-[#5f5f5d] w-12 hidden sm:block">{pay}</span>
          <Pill c={c}>{status}</Pill>
        </div>
      ))}
    </div>
  );
}

function Board() {
  const cols: [string, string, number][] = [["To do", "bg-slate-400", 3], ["In progress", "bg-amber-400", 2], ["Review", "bg-violet-400", 1], ["Done", "bg-emerald-500", 2]];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {cols.map(([name, c, n]) => (
        <div key={name} className="rounded-xl bg-[#f7f4ed] p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold mb-2"><Dot c={c} />{name}</div>
          <div className="space-y-2">
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} className="rounded-lg bg-white border border-[#eceae4] p-2.5 space-y-2">
                <Bar w={`${85 - i * 15}%`} c="bg-[#1c1c1c]/15" />
                <Bar w="45%" />
                <div className="flex items-center justify-between pt-1">
                  <span className="w-4 h-4 rounded-full bg-[#1c1c1c]/10" />
                  <span className="text-[9px] text-[#5f5f5d]">Due soon</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Chat() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-3 border-b border-[#eceae4]">
        <span className="w-8 h-8 rounded-full bg-emerald-100" />
        <div><div className="text-[12px] font-semibold">Customer</div><div className="text-[10px] text-[#5f5f5d]">Order #4821 &middot; COD</div></div>
        <span className="ml-auto"><Pill c="bg-emerald-100 text-emerald-800">Online</Pill></span>
      </div>
      <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-[#f7f4ed] px-3.5 py-2.5 text-[12px] leading-relaxed">Hi! Your order is confirmed. Reply YES to confirm delivery to the address on file.</div>
      <div className="max-w-[60%] ml-auto rounded-2xl rounded-tr-sm bg-emerald-500 text-white px-3.5 py-2.5 text-[12px]">YES, please deliver after 5pm</div>
      <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-[#f7f4ed] px-3.5 py-2.5 text-[12px] leading-relaxed">Done. We have added a delivery note for the courier.</div>
      <div className="flex items-center gap-2 pt-1">
        <span className="flex-1 rounded-full border border-[#eceae4] px-3 py-2 text-[11px] text-[#5f5f5d]">Choose a template&hellip;</span>
        <span className="rounded-full bg-[#1c1c1c] text-white text-[11px] font-semibold px-3 py-2">Send</span>
      </div>
    </div>
  );
}

function Chart() {
  const bars = [38, 52, 44, 66, 58, 74, 62, 81, 70, 88, 79, 92];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {["Recovered", "RTO rate", "Repeat"].map((k, i) => (
          <div key={k} className="rounded-xl bg-[#f7f4ed] p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#5f5f5d]">{k}</div>
            <div className="mt-2"><Bar w={`${70 - i * 12}%`} c="bg-[#1c1c1c]/25" /></div>
            <div className={`text-[10px] font-semibold mt-2 text-emerald-600`}>{i === 1 ? "▼ improving" : "▲ improving"}</div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1.5 h-32 rounded-xl border border-[#eceae4] p-3">
        {bars.map((h, i) => <span key={i} className={`flex-1 rounded-t ${i > 8 ? "bg-emerald-500" : "bg-[#1c1c1c]/15"}`} style={{ height: `${h}%` }} />)}
      </div>
    </div>
  );
}

function Flow() {
  const steps: [string, string, string][] = [["When", "An urgent ticket is created", "bg-sky-100 text-sky-800"], ["If", "Priority is urgent", "bg-amber-100 text-amber-800"], ["Then", "Notify the manager", "bg-emerald-100 text-emerald-800"], ["And", "Request approval", "bg-violet-100 text-violet-800"]];
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

function People() {
  const rows: [string, string, string][] = [["Agent", "On a call", "bg-emerald-500"], ["Agent", "Working queue", "bg-emerald-500"], ["Team lead", "Reviewing", "bg-amber-400"], ["Agent", "On break", "bg-slate-300"], ["Accountant", "Online", "bg-emerald-500"]];
  return (
    <div className="space-y-2">
      {rows.map(([role, status, c], i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-[#eceae4] px-3 py-2.5">
          <span className="relative w-7 h-7 rounded-full bg-[#1c1c1c]/10"><span className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${c}`} /></span>
          <span className="flex-1"><Bar w={`${60 - i * 6}%`} c="bg-[#1c1c1c]/15" /><span className="block text-[10px] text-[#5f5f5d] mt-1.5">{role}</span></span>
          <span className="text-[11px] text-[#5f5f5d]">{status}</span>
        </div>
      ))}
    </div>
  );
}

function Matrix() {
  const mods = ["Orders", "Invoices", "Tickets", "Leads"];
  const acts = ["View", "Create", "Edit", "Approve"];
  const grid = [["Team", "Own", "Own", "—"], ["Org", "—", "—", "—"], ["Org", "Own", "Team", "Team"], ["Team", "Own", "Own", "—"]];
  const tone: Record<string, string> = { Org: "bg-emerald-100 text-emerald-800", Team: "bg-sky-100 text-sky-800", Own: "bg-amber-100 text-amber-800", "—": "bg-[#f7f4ed] text-[#5f5f5d]" };
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

const KINDS: Record<VisualKind, [() => JSX.Element, string]> = {
  orders: [Orders, "Orders"], board: [Board, "Workspace"], chat: [Chat, "Conversation"], chart: [Chart, "Analytics"],
  flow: [Flow, "Business rule"], people: [People, "Team floor"], matrix: [Matrix, "Access matrix"],
};

/**
 * Hero product mock: the whole workspace in a device bezel. Labels and rows
 * are sample content; the tiles deliberately show bars, not figures.
 */
export function DashboardMock({ className = "" }: { className?: string }) {
  const nav = ["Dashboard", "Orders", "Verify queue", "Shipments", "WhatsApp", "Tasks", "Team"];
  const rows: [string, string, string, string][] = [
    ["#4821", "COD", "Verify", "bg-amber-100 text-amber-800"],
    ["#4820", "Prepaid", "In transit", "bg-sky-100 text-sky-800"],
    ["#4819", "COD", "Delivery failed", "bg-rose-100 text-rose-800"],
    ["#4818", "Prepaid", "Delivered", "bg-emerald-100 text-emerald-800"],
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
              {[["To verify", "bg-amber-100", "bg-amber-400"], ["In transit", "bg-sky-100", "bg-sky-400"], ["Follow-ups", "bg-emerald-100", "bg-emerald-400"]].map(([l, soft, hard], i) => (
                <div key={l} className="rounded-xl bg-white border border-[#e4e2da] p-2.5 sm:p-3">
                  <span className={`flex w-6 h-6 sm:w-7 sm:h-7 rounded-full items-center justify-center ${soft}`}><span className={`w-2 h-2 rounded-full ${hard}`} /></span>
                  <div className="mt-2"><Bar w={`${78 - i * 14}%`} c="bg-[#111113]/20" /></div>
                  <div className="text-[9.5px] sm:text-[10.5px] text-[#5c5c5a] mt-1.5 truncate">{l}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-white border border-[#e4e2da] divide-y divide-[#e4e2da]">
              {rows.map(([id, pay, status, c]) => (
                <div key={id} className="flex items-center gap-2.5 sm:gap-3 px-3 py-2.5">
                  <span className="text-[11px] sm:text-[12px] font-semibold w-11">{id}</span>
                  <span className="flex-1 min-w-0"><Bar w="72%" /></span>
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

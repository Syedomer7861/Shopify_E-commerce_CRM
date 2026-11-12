import type { Page } from "./types";

// Comparisons describe each product's general positioning, not its price list
// or full feature set, both of which change. Keep claims about other products
// broad, fair and checkable, and say when the other product is the better fit.

const fit = (them: string, themFit: string): Page["sections"][number] => ({
  h: `When ${them} is the better choice`,
  p: themFit,
});

export const comparisons: Page[] = [
  {
    slug: "zoho-crm",
    title: "CodeCrest vs Zoho CRM",
    metaTitle: "CodeCrest vs Zoho CRM: Which Fits an E-commerce Team?",
    description: "Compare CodeCrest and Zoho CRM for Shopify stores: order operations, COD verification, shipping follow-up, team management and setup effort.",
    answer: "Zoho CRM is a general-purpose sales CRM with a very wide feature set and a large app ecosystem. CodeCrest is an operations platform built around e-commerce orders: Shopify sync, COD verification, shipping follow-up and the team that does that work. Choose Zoho for pipeline-led B2B selling; choose CodeCrest when the work is post-purchase operations.",
    visual: "orders",
    points: [
      ["Order-first, not lead-first", "CodeCrest's core record is the order and its shipment. Sales CRMs are organised around leads and deals."],
      ["Work is generated for you", "Verification, recovery and delivery tasks are created from order data without building workflows first."],
      ["Team operations included", "Attendance, leave, approvals and performance sit beside the work."],
    ],
    table: {
      cols: ["", "CodeCrest", "Zoho CRM"],
      rows: [
        ["Primary focus", "E-commerce operations and internal business operations", "Sales pipeline and customer relationship management"],
        ["Shopify orders", "Built in", "Through an integration or extension"],
        ["COD verification and NDR queues", "Built in", "Configured with custom modules and workflows"],
        ["Attendance, leave, approvals", "Built in", "Available in separate Zoho products"],
        ["Customisation depth", "Roles, rules, custom fields in workspaces", "Extensive: modules, layouts, scripting"],
        ["Setup", "Provisioned with you by our team", "Self-serve, with partners for larger rollouts"],
      ],
    },
    sections: [
      { h: "When CodeCrest is the better choice", p: "Your team spends its day on orders: verifying, chasing deliveries, recovering carts and asking for reorders. You want that process working in days, with HR and approvals in the same place." },
      fit("Zoho CRM", "You run a sales-led business with long deal cycles, need deep customisation, or already use several Zoho products and want them connected."),
    ],
    faqs: [
      ["Can CodeCrest handle a B2B pipeline?", "It includes leads and deals for a small sales team. It does not aim to match a dedicated sales CRM on forecasting or quoting."],
      ["Can we use both?", "Yes. Some businesses keep a sales CRM for B2B and run store operations in CodeCrest."],
      ["How do we move data over?", "Export orders and customers to CSV and use the CodeCrest importer, then connect Shopify for ongoing sync."],
    ],
    related: ["features/shopify-order-management", "features/sales-pipeline", "compare/hubspot"],
  },
  {
    slug: "hubspot",
    title: "CodeCrest vs HubSpot",
    metaTitle: "CodeCrest vs HubSpot for E-commerce Operations",
    description: "Compare CodeCrest and HubSpot: marketing and sales automation versus order operations, COD and shipping workflows, and built-in team management.",
    answer: "HubSpot is a marketing, sales and service platform known for inbound marketing, email automation and a polished CRM. CodeCrest focuses on what happens after an order is placed and on running the team that handles it. HubSpot is stronger for lead generation and nurture; CodeCrest is stronger for order operations in COD-heavy markets.",
    visual: "chat",
    points: [
      ["Built for post-purchase", "Verification, delivery follow-up and reorders are first-class, not custom builds."],
      ["WhatsApp and calls at the centre", "The channels support teams in these markets actually use."],
      ["One platform for the team", "HR, approvals and internal tickets are included."],
    ],
    table: {
      cols: ["", "CodeCrest", "HubSpot"],
      rows: [
        ["Primary focus", "Order operations and business operations", "Inbound marketing, sales and service"],
        ["Marketing automation", "Segments and WhatsApp or email campaigns", "Extensive: email, landing pages, forms, ads"],
        ["Shipping and RTO workflows", "Built in with Shiprocket", "Not a core focus"],
        ["Attendance, leave, payroll inputs", "Built in", "Not included"],
        ["Website and content tools", "Not included", "Included"],
        ["Setup", "Provisioned with you by our team", "Self-serve, with onboarding services"],
      ],
    },
    sections: [
      { h: "When CodeCrest is the better choice", p: "Most of your revenue leakage is operational: unverified COD orders, failed deliveries and carts nobody followed up. You need agents working a queue, not marketers building funnels." },
      fit("HubSpot", "Growth depends on content, lead capture and email nurture, you want a website and marketing suite in one place, or your sales process is consultative."),
    ],
    faqs: [
      ["Does CodeCrest do email marketing?", "It sends templated emails and segment campaigns. It is not a full marketing automation suite."],
      ["Is CodeCrest a help desk?", "It has an internal service desk and customer follow-up tasks. It is not a public ticketing portal."],
      ["Which is simpler to roll out?", "CodeCrest is set up for you around a defined e-commerce process. HubSpot is broader and takes more configuration to fit that process."],
    ],
    related: ["features/whatsapp-automation", "features/task-engine", "compare/zoho-crm"],
  },
  {
    slug: "salesforce",
    title: "CodeCrest vs Salesforce",
    metaTitle: "CodeCrest vs Salesforce for Small & Mid-Sized Businesses",
    description: "Compare CodeCrest and Salesforce: an enterprise CRM platform versus a ready-to-use operations platform for e-commerce and growing teams.",
    answer: "Salesforce is an enterprise CRM platform that can be configured to model almost any business process, usually with administrators or implementation partners. CodeCrest is a ready-made operations platform for e-commerce and small to mid-sized teams. Salesforce wins on breadth and extensibility; CodeCrest wins on time to value for its specific use cases.",
    visual: "matrix",
    points: [
      ["Ready on day one", "Order, shipping and team workflows exist already. Nothing has to be designed first."],
      ["No admin team needed", "Roles, rules and modules are managed from the interface by your own admin."],
      ["Scoped to what you use", "Switch modules off so people see a small, relevant product."],
    ],
    table: {
      cols: ["", "CodeCrest", "Salesforce"],
      rows: [
        ["Primary focus", "E-commerce and business operations for growing teams", "Enterprise CRM platform across sales, service and marketing"],
        ["Implementation", "Provisioned for you", "Typically an implementation project"],
        ["Extensibility", "Roles, rules, custom fields", "Very high: custom objects, code, large app marketplace"],
        ["E-commerce operations (COD, NDR, RTO)", "Built in", "Built to requirement"],
        ["HR operations", "Built in", "Through other products or partners"],
        ["Best suited to", "Small and mid-sized teams", "Mid-market and enterprise"],
      ],
    },
    sections: [
      { h: "When CodeCrest is the better choice", p: "You want a working system this month, your processes match what CodeCrest already does, and you do not have a platform administrator." },
      fit("Salesforce", "You are a large organisation with complex, unique processes, need deep integration across many systems, and have the budget and people to implement and maintain a platform."),
    ],
    faqs: [
      ["Is CodeCrest an enterprise platform?", "It has enterprise-style controls such as scoped permissions, audit trail and tenant isolation, packaged for smaller teams."],
      ["Can CodeCrest be customised?", "Within its model: roles, permissions, rules, custom fields and module switches. It is not a build-anything platform."],
      ["Does it scale with the team?", "Yes. Branches, departments and reporting lines support growth from one team to many."],
    ],
    related: ["features/roles-permissions", "solutions/operations-teams", "compare/servicenow"],
  },
  {
    slug: "servicenow",
    title: "CodeCrest vs ServiceNow",
    metaTitle: "CodeCrest vs ServiceNow: A Lighter Alternative",
    description: "Compare CodeCrest and ServiceNow: enterprise workflow and IT service management versus a compact operations platform with approvals, service desk and rules.",
    answer: "ServiceNow is an enterprise workflow platform best known for IT service management, used by large organisations to run processes across departments. CodeCrest offers a compact version of the same ideas, with a service desk, approvals, business rules and scoped permissions, alongside CRM and HR, for teams that do not need or cannot staff an enterprise platform.",
    visual: "flow",
    points: [
      ["The essentials, without the project", "Tickets with SLAs, an approvals inbox and event-driven rules, ready to use."],
      ["One platform with your CRM", "Internal operations and customer operations share people, roles and reporting lines."],
      ["Sized for small teams", "An admin can run it. No dedicated platform team is required."],
    ],
    table: {
      cols: ["", "CodeCrest", "ServiceNow"],
      rows: [
        ["Primary focus", "Operations platform for small and mid-sized businesses", "Enterprise workflow and IT service management"],
        ["Service desk and SLAs", "Built in, priority-based", "Extensive ITSM capabilities"],
        ["Workflow automation", "Rules: event, conditions, notify or request approval", "Advanced workflow and automation tooling"],
        ["CRM and e-commerce operations", "Built in", "Not its focus"],
        ["Implementation", "Provisioned for you", "Typically a larger implementation"],
        ["Best suited to", "Teams from a handful to a few hundred", "Large enterprises"],
      ],
    },
    sections: [
      { h: "When CodeCrest is the better choice", p: "You want internal requests, approvals and escalations to run on a system instead of chat, and you want it in the same place as customers, orders and the team." },
      fit("ServiceNow", "You need full IT service management such as asset and configuration management, formal change processes, or automation across a large enterprise estate."),
    ],
    faqs: [
      ["Is CodeCrest an ITSM tool?", "It has an internal service desk with SLAs and approvals. It does not offer a configuration management database or formal change management."],
      ["Can non-technical admins manage it?", "Yes. Roles, rules and module switches are set in the interface."],
      ["What kind of rules can be automated?", "Rules react to an event with conditions and then notify people or open an approval request."],
    ],
    related: ["features/service-desk", "features/approvals-and-rules", "compare/salesforce"],
  },
  {
    slug: "clickup",
    title: "CodeCrest vs ClickUp",
    metaTitle: "CodeCrest vs ClickUp: Work Management Compared",
    description: "Compare CodeCrest workspaces with ClickUp: boards, Gantt, goals and time tracking, plus the CRM, order operations and HR that a project tool leaves out.",
    answer: "ClickUp is a dedicated work management tool with a very deep set of views, documents and customisation. CodeCrest includes workspaces with boards, Gantt, goals, time tracking and automations, and adds CRM, order operations, HR and approvals around them. ClickUp is deeper as a project tool; CodeCrest covers more of the business in one place.",
    visual: "board",
    points: [
      ["Work next to the data", "Marketing plans sit beside the customers and orders they are about."],
      ["Review built in", "Send a task for review and it enters the approvals inbox."],
      ["Fewer tools", "One login for projects, CRM, HR and internal requests."],
    ],
    table: {
      cols: ["", "CodeCrest", "ClickUp"],
      rows: [
        ["Primary focus", "Business operations with built-in workspaces", "Work and project management"],
        ["Boards, Gantt, goals, time tracking", "Included", "Included, with more view types"],
        ["Docs and whiteboards", "Not included", "Included"],
        ["CRM and order operations", "Built in", "Built from templates or integrations"],
        ["Attendance and leave", "Built in", "Not included"],
        ["Setup", "Provisioned for you", "Self-serve"],
      ],
    },
    sections: [
      { h: "When CodeCrest is the better choice", p: "Your team wants project boards and also runs customer operations, and you would rather not connect and pay for separate tools." },
      fit("ClickUp", "Project management is the main need, you rely on docs and whiteboards, or you want the largest range of views and templates."),
    ],
    faqs: [
      ["Do CodeCrest workspaces have automations?", "Yes, for status changes, assignments and reminders."],
      ["Can each team have private boards?", "Yes. Membership is set per space."],
      ["Is there a Gantt view?", "Yes, along with board, list and workload views."],
    ],
    related: ["features/workspaces", "solutions/marketing-teams", "solutions/agencies-and-service-businesses"],
  },
  {
    slug: "spreadsheets",
    title: "CodeCrest vs spreadsheets",
    metaTitle: "CRM vs Spreadsheets for Managing Shopify Orders",
    description: "When Google Sheets or Excel stop working for order follow-up: duplicate work, no ownership, no history. What a CRM changes and when to switch.",
    answer: "Spreadsheets work for order follow-up until more than a couple of people share them. Rows go stale, two agents call the same customer, and nobody can say what happened to an order last week. CodeCrest replaces the sheet with live order data, assigned tasks, a history for each customer and reports that build themselves.",
    visual: "orders",
    points: [
      ["Live instead of exported", "Orders and shipment status update themselves. Nobody pastes in yesterday's export."],
      ["Owned instead of shared", "Each task has one owner and one outcome."],
      ["Remembered instead of overwritten", "Every call, message and change stays on the record."],
    ],
    table: {
      cols: ["", "CodeCrest", "Spreadsheets"],
      rows: [
        ["Data freshness", "Synced from Shopify and Shiprocket", "As fresh as the last export"],
        ["Assignment", "By rule, with escalation", "Manual, by colour or column"],
        ["History", "Full timeline per customer", "Last value in the cell"],
        ["Access control", "Per role and scope", "Per file"],
        ["Reporting", "Built from work as it happens", "Built by hand"],
        ["Cost and effort to start", "Onboarding with our team", "None"],
      ],
    },
    sections: [
      { h: "Signs you have outgrown the sheet", p: "The same customer gets called twice. A sheet per agent, then a sheet to combine them. Someone's whole job is updating statuses. A manager cannot tell what is overdue without asking." },
      fit("a spreadsheet", "You have a few orders a day and one person handling them. A sheet is free, flexible and enough. Move when coordination, not data entry, becomes the problem."),
    ],
    faqs: [
      ["Can we import our existing sheet?", "Yes. The importer accepts CSV and Excel, maps your columns and flags duplicates."],
      ["Can we still export to Sheets?", "Yes. Data exports to Excel and CSV, and Google Sheets can be connected."],
      ["How long does the switch take?", "Connecting Shopify and importing history is quick. Most of the time goes into agreeing your verification and follow-up rules, which our team helps with."],
    ],
    related: ["integrations/csv-import", "features/shopify-order-management", "solutions/d2c-brands"],
  },
];

import type { Post } from "./types";

// Operations & Teams batch. Vendor-neutral advice first; the product appears
// only in the last section of each post. No statistics or benchmarks are quoted.

export const posts4: Post[] = [
  {
    slug: "ecommerce-sop-template",
    title: "Ecommerce SOP: a simple template for D2C operations teams",
    metaTitle: "Ecommerce SOP Template for D2C Teams",
    description: "An ecommerce SOP template for D2C teams: which procedures to write first, a one-page format, a worked COD example and how to keep SOPs in daily use.",
    keyword: "ecommerce SOP",
    category: "Operations & Teams",
    date: "2026-09-01",
    answer: "An ecommerce SOP is a short written procedure for one recurring job, such as COD verification, packing or refund handling. It states the trigger, the owner, the numbered steps, what done means and what to do with exceptions. Keep each one to a page, write it with the person who does the job, and review it when anything changes.",
    takeaways: [
      "An ecommerce SOP covers one recurring job and should fit on a single page.",
      "Write the first SOPs for the order-to-delivery jobs that go wrong most often.",
      "Every SOP needs a trigger, an owner, steps, a definition of done and an exception rule.",
      "Draft the procedure with the person who does the work and test it on someone new.",
      "Keep SOPs next to the work and review them when a tool, courier or policy changes.",
    ],
    visual: "flow",
    sections: [
      {
        h: "What is an ecommerce SOP?",
        p: [
          "An ecommerce SOP, or standard operating procedure, is a short written document that says how one recurring job is done in your business. It names the trigger that starts the job, the person who owns it, the steps in order, and what done looks like. A good one fits on a page and can be followed by someone in their first week.",
          "SOPs matter in D2C because the same few jobs repeat all day: confirming orders, packing, answering order status questions, handling failed deliveries, approving refunds. When each person does these in their own way, results depend on who is on shift. A written procedure makes the outcome depend on the process instead, and makes mistakes much easier to trace back to a step.",
        ],
      },
      {
        h: "Which ecommerce SOPs should you write first?",
        p: [
          "Do not try to document the whole business in one go. Start with the jobs that touch money or customers and that go wrong most often. For most Indian D2C brands that means the order-to-delivery chain, because every error there costs shipping fees, stock or a customer's trust. Back-office jobs such as vendor payments can follow once the daily floor work is stable.",
          "A simple way to choose: list the last ten things that went wrong and note which job each one belonged to. The jobs that appear more than once are your first SOPs. Write those, run them for a few weeks, then move down the list. This keeps the effort tied to real problems and gives the team early proof that the documents are worth reading.",
        ],
        list: [
          "COD order verification before dispatch",
          "Order packing and quality check",
          "Failed delivery (NDR) follow-up",
          "Returns, refunds and replacements",
          "Customer queries on WhatsApp and phone",
          "Daily stock and courier pickup check",
        ],
      },
      {
        h: "What should an ecommerce SOP template include?",
        p: [
          "Every SOP should answer the same questions in the same order, so staff always know where to look. Keep the template short enough that writing a new one takes a single sitting. The fields below cover what a new joiner needs and what a manager needs when something goes wrong. Leave out background, history and policy explanations. Those belong in training notes.",
          "The two fields teams skip most often are the trigger and the exception rule. Without a trigger, nobody knows when the job starts or who should notice. Without an exception rule, staff either guess or stop and wait whenever a case does not fit. Write down who to ask and how long to wait before escalating, even if the answer is simply the shift lead.",
        ],
        table: {
          cols: ["Field", "What to write", "Example"],
          rows: [
            ["Purpose", "One sentence on why the job exists", "Confirm COD orders so unwanted parcels are not shipped"],
            ["Trigger", "The event that starts the job", "A new COD order appears in the queue"],
            ["Owner", "The role responsible, not a person's name", "Verification agent on shift"],
            ["Steps", "Numbered actions, one action per line", "Message, call, confirm address, record outcome"],
            ["Done means", "The result that closes the job", "Order marked confirmed, changed or cancelled"],
            ["Exceptions", "What to do when the case does not fit", "Unreachable after the final attempt: shift lead decides"],
          ],
        },
      },
      {
        h: "How do you write an SOP your team will actually follow?",
        p: [
          "Write it with the person who does the job, not for them. Sit beside them, watch the job done a few times, and write down what they actually do. Then ask what goes wrong and add those cases as exceptions. An SOP written from a manager's memory usually describes how the job was meant to work, which is rarely how it works today.",
          "Use plain words and one action per step. Start each step with a verb. If a step needs a decision, state the rule: if the address has no landmark, ask for one. Then test the draft by handing it to someone who has never done the job. Every question they ask is a gap in the document, so fix the text before you train anyone on it.",
        ],
        list: [
          "Watch the job being done before writing anything",
          "Write one action per step, starting with a verb",
          "State the rule for every decision point",
          "Add the common exceptions and who handles them",
          "Test it on someone new to the job",
          "Put an owner and a review date at the top",
        ],
      },
      {
        h: "What does an ecommerce SOP look like for COD order verification?",
        p: [
          "Here is a worked example. Purpose: confirm cash-on-delivery orders before dispatch so parcels the customer no longer wants are not shipped. Trigger: a new COD order arrives. Owner: the verification agent on shift. Done means: the order carries one recorded outcome, and only confirmed orders move on to packing. Exceptions: the shift lead decides on anything the steps do not cover.",
          "The steps: send the confirmation message with the order summary. If there is no reply within the window your team has agreed, call the customer. Confirm that they placed the order, the items, the amount payable and the full address with a landmark. Record the outcome as confirmed, changed, cancelled or unreachable. Retry unreachable customers at a different time of day, then follow your cancellation rule.",
        ],
      },
      {
        h: "How do you keep SOPs up to date and in use?",
        p: [
          "An SOP that sits in a shared folder is forgotten quickly. Put it where the work happens: linked from the task, pinned in the team channel, or printed at the packing table. The closer the document is to the job, the more likely it is read at the moment it is needed. New joiners should be trained from the SOP itself, not from a colleague's version of it.",
          "Give each SOP an owner and a review date. Review it whenever the tool, courier or policy behind it changes, and whenever the same mistake happens twice. Keep a short change note at the bottom so staff can see what is new. When a procedure changes, say so in the daily huddle. Do not rely on people noticing that a document was edited.",
        ],
      },
      {
        h: "How does CodeCrest help teams run their SOPs?",
        p: [
          "A written SOP tells people what to do. A system makes sure the job is started, owned and closed. CodeCrest is an operations platform for D2C teams on Shopify that turns recurring jobs into tasks. A new COD order creates a verification task, a failed delivery creates a follow-up task, and each task is closed with a recorded outcome instead of a tick.",
          "Overdue tasks escalate to a manager, so the exception rule in your SOP is applied without anyone watching a sheet. Teams that need their own procedures can run them on workspace boards with custom fields and automations. There is no self-serve signup. The CodeCrest team onboards each organisation and connects its store, courier and messaging tools together with you.",
        ],
      },
    ],
    faqs: [
      ["What does SOP stand for in ecommerce?", "SOP stands for standard operating procedure. In ecommerce it is a written, step-by-step description of how a recurring job such as order verification, packing or refund handling is done, who owns it and what result closes it."],
      ["How long should an ecommerce SOP be?", "One page is a good target. If a procedure runs longer, it usually covers more than one job and should be split. Long documents get skimmed, and the step that is skipped is often the one that mattered."],
      ["Who should write the SOPs in a small D2C team?", "The person who does the job should draft it with the team lead or founder. The doer knows the real steps and the lead knows the policy. One named owner should approve each SOP and keep it current."],
      ["Do we need special software to manage SOPs?", "Not to begin with. A shared document per SOP works for a small team. Tools help later, when you want each job to be created, assigned, tracked and escalated automatically so the procedure does not depend on memory."],
      ["How often should SOPs be reviewed?", "Review an SOP when something behind it changes, such as a courier, a tool or a policy, and when the same error repeats. A regular check on a schedule you choose catches the procedures that drift quietly."],
    ],
    related: ["features/task-engine", "features/workspaces", "solutions/operations-teams", "blog/d2c-team-structure"],
  },
  {
    slug: "ecommerce-customer-support-kpis",
    title: "Ecommerce customer support KPIs: what to track and how to use them",
    metaTitle: "Ecommerce Customer Support KPIs to Track",
    description: "The ecommerce customer support KPIs that matter for a D2C brand, with plain formulas, how to measure them fairly and how to review them each week.",
    keyword: "ecommerce customer support KPIs",
    category: "Operations & Teams",
    date: "2026-09-09",
    answer: "The ecommerce customer support KPIs worth tracking are first response time, resolution time, first contact resolution, backlog and its age, contact rate per order, reopen rate and customer satisfaction. Together they show how fast you reply, whether issues are truly solved, how much work is waiting and how often an order creates a support contact at all.",
    takeaways: [
      "Track a small set of support KPIs that cover speed, quality and load.",
      "Write down when each clock starts and stops, and keep the definition fixed.",
      "Tag every conversation with a contact reason to find problems outside the support team.",
      "Set targets from your own baseline and your customer promise, not from published benchmarks.",
      "Use individual numbers for coaching, and end every review with an owner and a date.",
    ],
    visual: "chart",
    sections: [
      {
        h: "What are ecommerce customer support KPIs?",
        p: [
          "Customer support KPIs are a small set of numbers that tell you how well your team handles customer queries. In ecommerce, most queries are tied to an order: where is it, why is it late, how do I return it, when is my refund coming. Good KPIs measure speed, quality and volume for those conversations across WhatsApp, phone, email and social media.",
          "The aim is not a dashboard full of charts. It is a handful of numbers that a team lead checks every week and acts on. If a KPI never changes a decision, such as who works which queue or which message template gets rewritten, it is not worth collecting. Start with fewer measures, define them carefully, and trust them.",
        ],
      },
      {
        h: "Which customer support KPIs matter most for a D2C brand?",
        p: [
          "Six measures cover most of what a D2C support team needs. Two are about speed, two about quality and two about load. The table below gives a plain formula for each. Use the same definitions every week, because a number is only useful when it can be compared fairly with the number from last week.",
          "Customer satisfaction is the seventh measure many teams add. A one-question rating after an issue closes is enough. Treat it as a signal and not a score to chase, since only some customers answer and unhappy ones answer more readily. Read the comments alongside the rating. They often explain a slow resolution time better than the timing data can.",
        ],
        table: {
          cols: ["KPI", "What it tells you", "How to calculate it"],
          rows: [
            ["First response time", "How long a customer waits for a first human reply", "Time of first reply minus time the query arrived"],
            ["Resolution time", "How long the whole issue takes to close", "Time closed minus time the query arrived"],
            ["First contact resolution", "Whether issues are solved without back and forth", "Issues closed in one interaction divided by issues closed"],
            ["Backlog and age", "How much work is waiting and how old it is", "Count of open issues, grouped by days open"],
            ["Contact rate", "How often an order creates a support contact", "Support contacts divided by orders in the same period"],
            ["Reopen rate", "Whether closed issues stay closed", "Issues reopened divided by issues closed"],
          ],
        },
      },
      {
        h: "How do you measure response time and resolution time properly?",
        p: [
          "Decide when the clock starts and stops, and write it down. First response time should count the first reply from a person, not an automated acknowledgement. Decide whether you measure in clock hours or working hours. A query that arrives at night and is answered at opening time looks slow in clock hours and fast in working hours. Either is fine if you stay consistent.",
          "Look at the median as well as the average. A few very old issues can drag an average far from what a typical customer experiences. Also split the numbers by channel. Customers on a phone call expect an answer now, while email carries more patience. One blended figure hides the channel that is actually struggling.",
        ],
      },
      {
        h: "Why should you track contact reasons and not only speed?",
        p: [
          "Speed tells you how the team performs. Contact reasons tell you why customers needed to ask in the first place. Tag every conversation with one reason from a short fixed list. After a few weeks you will see which reasons dominate, and most of them will point to something outside the support team: a courier, a product page, a slow refund.",
          "This is where support data pays for itself. If order status questions lead the list, proactive shipping updates will remove more work than hiring another agent. If sizing questions lead, the fix is on the product page. Review the top reasons with operations and marketing, not only inside the support team, and agree who owns each fix.",
        ],
        list: [
          "Order status and tracking",
          "Delivery failed or delayed",
          "Return, exchange or replacement request",
          "Refund status",
          "Product question before buying",
          "Payment or checkout problem",
          "Wrong or damaged item",
        ],
      },
      {
        h: "How do you set support targets without industry benchmarks?",
        p: [
          "Published benchmarks are of limited use, because they mix categories, price points and channels that may look nothing like your store. Your own trend is a better guide. Measure for a few weeks without changing anything, and treat that as your baseline. Then set a target that is a modest step better than the baseline and review it every month.",
          "Tie targets to a promise you can state to customers. If your site says replies come within one working day, the target for first response time is clear. Avoid targets that reward the wrong habit. Pushing only for quick closure encourages agents to close issues that are not solved, which then shows up later as reopens and repeat contacts.",
        ],
      },
      {
        h: "How should a team lead review support KPIs each week?",
        p: [
          "Hold a short weekly review with the same agenda each time. Look at the numbers, pick the one that moved most, and find the cause before discussing fixes. Bring a few real conversations as examples. Numbers show that something changed, and the conversations show what actually happened to the customer on the other end.",
          "Keep individual numbers for coaching, not ranking. An agent with slow resolution times may be handling the hardest cases. Compare like with like, listen to a few calls or read a few chats, and agree one thing to improve. End every review with an owner and a date for each action, and open the next review by checking them.",
        ],
        list: [
          "Check backlog size and the oldest open issue",
          "Compare response and resolution times with last week",
          "Read the top three contact reasons",
          "Review reopened issues and what was missed",
          "Agree one fix, one owner and one date",
        ],
      },
      {
        h: "How does CodeCrest help with support KPIs?",
        p: [
          "CodeCrest is an operations platform for Indian D2C teams on Shopify. Support agents work from a prioritised task queue, and each task opens with the customer's orders, shipment status and past calls and messages. Agents close tasks with an outcome, so per-agent output and outcomes are reported from the work itself and nobody compiles a separate sheet.",
          "Calls placed through a connected Exotel or Twilio account are logged on the customer timeline, and overdue tasks escalate to a manager. Shipping updates sent on WhatsApp answer many order status questions before they reach an agent. CodeCrest is set up with you by its own team, so there is no self-serve signup to configure alone.",
        ],
      },
    ],
    faqs: [
      ["What is a good first response time for ecommerce support?", "There is no universal figure. It depends on your channels, your working hours and what you promise customers. Measure your current baseline, set a target slightly better than it, and make sure the promise on your website matches what the team can deliver."],
      ["What is the difference between response time and resolution time?", "Response time measures how long the customer waits for the first human reply. Resolution time measures how long it takes until the issue is fully closed. A team can be quick to reply and still slow to resolve, so track both."],
      ["How many KPIs should a small support team track?", "A handful is enough. Pick one or two measures each for speed, quality and load. Adding more numbers than the team lead can review in a short weekly meeting usually means none of them get acted on."],
      ["Should support agents be ranked by their KPIs?", "Use individual numbers for coaching, not public ranking. Agents handle different mixes of work, and a raw comparison punishes the person given the hardest cases. Compare similar work and review real conversations alongside the numbers."],
      ["What is contact rate in ecommerce?", "Contact rate is the number of support contacts divided by the number of orders in the same period. It shows how often an order leads to a question or complaint. A falling contact rate usually means the order journey itself has become clearer."],
    ],
    related: ["features/analytics-reports", "solutions/customer-support-teams", "features/task-engine", "blog/support-ticket-priority-levels"],
  },
  {
    slug: "support-ticket-priority-levels",
    title: "Support ticket priority levels: how to define and use them",
    metaTitle: "Support Ticket Priority Levels Explained",
    description: "How to define support ticket priority levels for an ecommerce team: an impact and urgency method, an example matrix, common mistakes and escalation.",
    keyword: "support ticket priority levels",
    category: "Operations & Teams",
    date: "2026-09-17",
    answer: "Support ticket priority levels are a small set of labels, usually urgent, high, normal and low, that decide which issue is handled first. Set them by combining impact, meaning how much money or harm is at stake, with urgency, meaning how soon it gets worse. Give every level a written rule and a response target so agents do not decide by instinct.",
    takeaways: [
      "Priority levels decide the order of work, so they need written rules and not gut feel.",
      "Four levels are enough for most ecommerce teams.",
      "Set priority from impact and urgency, not from how upset the customer sounds.",
      "Each level needs a response target and an escalation step when the target is missed.",
      "Review how tickets were prioritised each month and adjust the rules.",
    ],
    visual: "matrix",
    sections: [
      {
        h: "What are support ticket priority levels?",
        p: [
          "Priority levels are labels that tell a support team which issue to work on first. Without them, the queue is worked in the order issues arrive, or in the order customers shout. Both are unfair to the customer whose problem is quietly getting worse, such as a parcel that the courier will send back tomorrow unless someone acts today.",
          "A priority is different from a category. The category says what the issue is about: a refund, a delivery, a product question. The priority says how soon it must be handled. A refund question can be low priority on one day and urgent on another, depending on how long the customer has already waited and how much money is involved.",
        ],
      },
      {
        h: "How many priority levels do you need?",
        p: [
          "Four levels suit most ecommerce teams: urgent, high, normal and low. With only two levels, too much lands in the top one and the label stops meaning anything. With six or seven, agents spend time debating the difference between neighbouring levels. Four gives a clear top, a clear bottom and two working levels in between.",
          "Whatever number you choose, each level must have a rule a new agent can apply without asking. The rule should describe the situation, not the feeling. Writing that a ticket is urgent when the customer is angry invites inconsistency. Writing that a ticket is urgent when money has been taken and no order exists gives everyone the same answer.",
        ],
      },
      {
        h: "How do you decide the priority of a ticket?",
        p: [
          "Use two questions: impact and urgency. Impact is what is at stake, in money, in customer harm or in the number of people affected. Urgency is how quickly the situation gets worse if nobody acts. A high-value order stuck at a courier hub has high impact and high urgency. A request for an invoice copy has low impact and low urgency.",
          "Combine the two to get the level. High impact with high urgency is urgent. High on one and moderate on the other is high. Most everyday questions are normal. Requests with no deadline and no money at risk are low. Agents should be able to reach the level by answering a few fixed questions, listed below, and not by reading the tone of the message.",
        ],
        list: [
          "Has the customer paid for something they have not received?",
          "Is there a deadline after which the issue cannot be fixed, such as a final delivery attempt?",
          "How much is the order worth compared with your usual order?",
          "Is more than one customer affected by the same problem?",
          "Has the customer already contacted you about this before?",
        ],
      },
      {
        h: "What does a priority matrix look like for an ecommerce store?",
        p: [
          "The table below is a starting point, not a standard. The response targets are examples only, written to show how each level should feel different from the next. Set your own from your team size, working hours and what you promise customers. The important part is that every level has a target, and that the target for urgent is short enough to matter.",
          "Notice that the urgent row is about time running out or money going missing. Complaints that are loud but not time-bound sit in high or normal. That keeps the urgent level small, which is the only way a team can treat it as truly urgent. If the urgent queue grows beyond what one person can clear in a shift, your rules are too loose.",
        ],
        table: {
          cols: ["Level", "Typical ecommerce cases", "Response target (example only)"],
          rows: [
            ["Urgent", "Payment taken but no order created, parcel about to be returned by the courier, same problem hitting many customers", "Within the hour during working hours"],
            ["High", "Wrong or damaged item received, refund overdue against your own policy, repeat contact on the same issue", "Same working day"],
            ["Normal", "Order status question, return or exchange request, address change before dispatch", "Within one working day"],
            ["Low", "Invoice copy, product feedback, general question with no order at risk", "Within a few working days"],
          ],
        },
      },
      {
        h: "What mistakes do teams make with priority levels?",
        p: [
          "The most common mistake is letting priority follow volume or tone. The customer who messages five times moves up, and the quiet customer with a bigger problem waits. The second is priority that never changes. A normal ticket that has waited far past its target should not still be normal. Age must raise priority, or old tickets simply sink.",
          "A third mistake is letting anyone mark anything urgent with no check. Over time the urgent queue fills with ordinary issues and stops working. Review a sample of urgent tickets every month. If many did not match the written rule, retrain the team or tighten the wording. The list below is a quick self-check for your current setup.",
        ],
        list: [
          "Urgent is used for angry customers and not for time-bound problems",
          "Old tickets keep their original priority however long they wait",
          "Levels have names but no written rules",
          "No response target is attached to each level",
          "Nobody reviews whether tickets were prioritised correctly",
        ],
      },
      {
        h: "How do priority levels connect to SLAs and escalation?",
        p: [
          "A priority level is a promise only when a deadline is attached. That deadline is the service level, or SLA, for the level. When a ticket is created, its priority sets its due time. When the due time passes, the ticket is breached. A breach should be visible to a team lead straight away, and not discovered in a monthly report.",
          "Escalation is what happens next. Decide in advance who is told when an urgent ticket is created, who is told when any ticket breaches, and who can reassign it. Keep the chain short: agent, team lead, operations head. The goal is not blame. It is to make sure a second person looks at the problem while it can still be fixed.",
        ],
      },
      {
        h: "How does CodeCrest handle priority and escalation?",
        p: [
          "CodeCrest, an operations platform for Indian D2C teams on Shopify, applies these ideas in two places. For customer work, agents get task queues ordered by order value, risk and age, so the first task they see is the one that matters most. Overdue tasks are flagged and escalated to a manager on a schedule you set.",
          "For requests inside the company, CodeCrest has an internal service desk where each ticket gets an SLA from its priority and is flagged when it breaches. A business rule can alert a manager the moment an urgent ticket is raised. Customer conversations stay on the order and customer records. Organisations are onboarded by the CodeCrest team, with no self-serve signup.",
        ],
      },
    ],
    faqs: [
      ["What is the difference between priority and severity?", "Severity describes how bad the problem is in itself. Priority describes how soon the team should act on it. A severe problem with no deadline can have a lower priority than a small one that becomes unfixable by tomorrow."],
      ["Who should set the priority of a ticket?", "The agent who first reads the ticket should set it using written rules. A team lead should be able to change it, and should review a sample regularly. Customers should not choose their own priority, because most will choose the highest."],
      ["Should VIP or repeat customers get higher priority?", "It is reasonable to let customer value raise priority by one level, as long as the rule is written down. Do not let it override time-bound problems. A new customer whose parcel is about to be returned still comes first."],
      ["How often should priority rules be reviewed?", "Review them whenever your policies, couriers or team size change, and on a regular schedule such as monthly. Pull a sample of tickets from each level and check whether the label matched the written rule."],
      ["Can priority be set automatically?", "Partly. Rules can raise priority from facts such as order value, payment status, ticket age or repeat contact. A person should still be able to override the result, because some urgent situations only become clear from reading the message."],
    ],
    related: ["features/service-desk", "features/task-engine", "features/approvals-and-rules", "blog/ecommerce-customer-support-kpis"],
  },
  {
    slug: "crm-vs-helpdesk-for-shopify",
    title: "CRM vs helpdesk: which does a Shopify store need?",
    metaTitle: "CRM vs Helpdesk for Shopify Stores",
    description: "CRM vs helpdesk for Shopify stores: what each one does, a side-by-side comparison, the signs you need one or the other, and how to decide which first.",
    keyword: "CRM vs helpdesk",
    category: "Operations & Teams",
    date: "2026-09-25",
    answer: "A CRM keeps the full record of each customer and drives outbound work such as order verification, follow-ups and repeat sales. A helpdesk manages inbound conversations as tickets until they are resolved. In the CRM vs helpdesk choice, look at where your team spends its day: proactive calling and follow-up points to a CRM, a crowded inbox points to a helpdesk.",
    takeaways: [
      "A CRM is organised around the customer and the next action your team owes them.",
      "A helpdesk is organised around the conversation and whether it has been resolved.",
      "COD-heavy stores with calling teams usually feel the need for a CRM first.",
      "Stores with high inbound message volume and few outbound tasks usually need a helpdesk first.",
      "Whichever you choose, it must show order and shipment data next to the conversation.",
    ],
    visual: "chat",
    sections: [
      {
        h: "What is the difference between a CRM and a helpdesk?",
        p: [
          "A CRM, or customer relationship management system, is built around the customer record. It holds who the customer is, what they ordered, every call and message, and what your team should do next. Its natural unit of work is a task or follow-up that your team starts: verify this order, call about this abandoned cart, remind this customer to reorder.",
          "A helpdesk is built around the conversation. A customer writes in, a ticket is opened, an agent replies, and the ticket is closed when the issue is solved. Its natural unit of work is the ticket, and its main job is to make sure no inbound message is missed or answered twice. The customer record exists, but mainly as context for the ticket.",
        ],
      },
      {
        h: "CRM vs helpdesk: how do they compare side by side?",
        p: [
          "The two overlap, which is why the choice confuses people. Both store customer details, both log conversations and both produce reports. The difference is the direction of work and what the tool treats as finished. A CRM asks whether the customer has been moved forward. A helpdesk asks whether the question has been answered.",
          "The table below describes the typical shape of each category in general terms. Individual products vary, and many blur the line, so check any tool you are considering against the work your own team does each day. Use the table to decide which column describes your problem, not to judge a specific product.",
        ],
        table: {
          cols: ["Area", "CRM", "Helpdesk"],
          rows: [
            ["Organised around", "The customer and their history", "The conversation or ticket"],
            ["Direction of work", "Mostly outbound and proactive", "Mostly inbound and reactive"],
            ["Unit of work", "Task, follow-up or deal", "Ticket"],
            ["Done means", "Outcome recorded, next step set", "Issue resolved, ticket closed"],
            ["Typical measures", "Verification, recovery and repeat purchase outcomes", "Response time, resolution time, backlog"],
            ["Main users", "Calling, verification and sales teams", "Support agents handling an inbox"],
          ],
        },
      },
      {
        h: "When does a Shopify store need a CRM?",
        p: [
          "You need a CRM when most of your team's day is work that you start. In Indian D2C that is common. Cash-on-delivery orders need confirming before dispatch, failed deliveries need a call before the courier gives up, and abandoned checkouts need follow-up. None of these begin with a customer message, so a ticket inbox never sees them.",
          "The second sign is that the same customer is handled by several people who cannot see each other's work. One agent verified the order, another answered a WhatsApp question, a third called about delivery. A CRM puts all of that on one timeline, so whoever picks up next knows what has already been said and promised.",
        ],
        list: [
          "A large share of orders are cash on delivery and need verification",
          "Agents make outbound calls from exported order lists",
          "Follow-ups are tracked in spreadsheets or personal notes",
          "Nobody can say which agent recovered which order",
          "Repeat purchase reminders depend on someone remembering",
        ],
      },
      {
        h: "When does a Shopify store need a helpdesk?",
        p: [
          "You need a helpdesk when the pressure comes from inbound volume. Messages arrive on email, chat, social media and WhatsApp, and the team's problem is keeping up: knowing which are unanswered, who is handling each one and how long customers have waited. Shared mailboxes and phone inboxes break down here because ownership is unclear.",
          "A helpdesk also fits when your orders are mostly prepaid and need little manual handling before delivery. In that case the team has few outbound tasks, and the support work is almost entirely answering questions. The measures that matter are response time, resolution time and backlog, which is exactly what ticketing tools are designed to report.",
        ],
        list: [
          "Messages are missed or answered twice by different people",
          "Customers wait because nobody knows who owns the reply",
          "Support arrives on many channels with no single view",
          "You cannot measure how long replies take",
          "Most orders ship without any manual confirmation step",
        ],
      },
      {
        h: "Can one tool do both jobs?",
        p: [
          "Often, yes, up to a point. Many CRMs attach conversations to customer records, and many helpdesks show order data beside the ticket. For a small team, one tool that does the main job well and the second job adequately is better than two tools that do not share data. Two systems mean two logins and two versions of the customer's history.",
          "The limit shows when the second job grows. A CRM used as a busy multi-channel inbox may lack ticket routing. A helpdesk used for outbound verification may have no way to create work from an order event. If you outgrow one tool, add the second deliberately and make sure the customer's phone number or email links records across both.",
        ],
      },
      {
        h: "How should you decide which to buy first?",
        p: [
          "Spend one ordinary day counting. Write down every piece of work the team does and mark it as started by a customer or started by you. If most of the work is started by you, begin with a CRM. If most is started by customers, begin with a helpdesk. This simple tally is more reliable than a feature comparison.",
          "Then check the basics that apply to either choice. It must connect to your Shopify store so orders appear without export. It must show shipment status next to the conversation, since most questions are about delivery. It must work with the channels your customers use, which in India usually means WhatsApp and phone. And it must report by agent.",
        ],
      },
      {
        h: "Where does CodeCrest fit?",
        p: [
          "CodeCrest sits on the CRM side. It is an operations platform for Indian D2C teams on Shopify, built around outbound work: COD verification queues, abandoned cart recovery, and NDR and RTO follow-up through Shiprocket. Orders sync from Shopify, and each customer has one timeline of orders, calls, WhatsApp messages, notes and tasks.",
          "It is not a shared-inbox helpdesk. Conversations are attached to customers and tasks so that ownership stays clear, and its service desk module is for internal requests from staff, not customer tickets. Teams with heavy inbound volume across many channels should weigh that honestly. CodeCrest onboards each organisation itself, so there is no self-serve signup.",
        ],
      },
    ],
    faqs: [
      ["Is Shopify itself a CRM?", "Shopify stores customers and their orders, which covers the record-keeping part. It is a storefront first. Teams that verify orders, make follow-up calls and track outcomes per agent usually add a tool built for that daily work."],
      ["Can a small store manage with WhatsApp and a spreadsheet?", "Yes, for a while. It stops working when more than one or two people handle customers, because nobody can see what the others said or promised. That loss of shared history is usually the moment to move to a proper tool."],
      ["Do I need both a CRM and a helpdesk?", "Not at the start. Choose the one that matches most of your daily work. Add the second only when that side of the work has clearly outgrown what the first tool can do, and link the two by phone number or email."],
      ["Which is better for reducing RTO, a CRM or a helpdesk?", "Reducing returns depends on proactive work: verifying COD orders and acting on failed deliveries quickly. That is outbound, task-driven work, which is the kind a CRM built for order operations is designed around."],
      ["What should I ask a vendor before choosing?", "Ask how orders reach the tool, whether shipment status appears beside the conversation, which messaging and calling channels are supported, how work is assigned, and what reports you get per agent. Ask to see your own daily workflow demonstrated."],
    ],
    related: ["resources/crm-for-shopify-guide", "features/shopify-order-management", "solutions/customer-support-teams", "features/service-desk"],
  },
  {
    slug: "d2c-team-structure",
    title: "D2C team structure: who you need and how to organise them",
    metaTitle: "D2C Team Structure: Roles and Org Design",
    description: "A practical D2C team structure for Indian brands: the core functions, who owns COD and delivery follow-up, reporting lines and which roles to hire first.",
    keyword: "D2C team structure",
    category: "Operations & Teams",
    date: "2026-10-03",
    answer: "A D2C team structure groups people by the stage of the customer journey they own: growth and marketing, order operations and fulfilment, customer support, and finance and admin, with the founder or an operations head connecting them. Give every function a named owner, even if one person covers several, and split roles only when the workload clearly demands it.",
    takeaways: [
      "Organise a D2C team around the customer journey, from first ad to delivered order.",
      "Every function needs one named owner, even when one person holds several functions.",
      "Order verification, failed delivery follow-up and returns need a clear home, or they fall between teams.",
      "Add team leads when a founder can no longer review each person's work directly.",
      "Write down hand-offs between teams, because most errors happen there.",
    ],
    visual: "people",
    sections: [
      {
        h: "What is a D2C team structure?",
        p: [
          "A D2C team structure is the way a direct-to-consumer brand divides its work among people: which functions exist, who owns each one and who reports to whom. Because a D2C brand sells straight to the customer, it carries jobs that a wholesale business hands to distributors and retailers, such as marketing, order handling, delivery follow-up and customer service.",
          "The structure does not have to be large. In an early brand, three or four people may cover everything. What matters is that each function has one clear owner. When a parcel comes back or a refund is late, the team should know at once whose job it is to fix it and whose job it is to stop it happening again.",
        ],
      },
      {
        h: "What functions does every D2C brand need?",
        p: [
          "Most brands need the same five functions, whatever they sell. Growth brings customers in. Order operations turns a checkout into a confirmed, packed and shipped order. Customer support handles questions and problems. Finance and admin looks after money, vendors and people. Product and merchandising decides what to sell and keeps it in stock.",
          "The table shows what each function owns and the hand-off where work passes to the next team. Hand-offs deserve as much attention as the functions themselves. A campaign that support was not told about, or a stock-out that marketing learns of after spending on ads, is a hand-off failure and not a failure of either team.",
        ],
        table: {
          cols: ["Function", "What it owns", "Key hand-off"],
          rows: [
            ["Growth and marketing", "Ads, content, website, offers", "Tells support and operations about campaigns before they launch"],
            ["Order operations", "Verification, packing, dispatch, courier follow-up", "Passes delivery problems and delays to support"],
            ["Customer support", "Queries, complaints, returns requests", "Reports repeat problems back to operations and product"],
            ["Finance and admin", "Payments, refunds, vendors, payroll inputs", "Confirms refunds and COD remittance to operations"],
            ["Product and merchandising", "Range, stock levels, suppliers", "Warns marketing about low stock and new launches"],
          ],
        },
      },
      {
        h: "How should the structure change as the brand grows?",
        p: [
          "In the first stage the founder does or directly oversees everything, often with a small mixed team where each person handles several jobs. This works while the founder can see every order and every complaint. The risk is that nothing is written down, so the business runs on one person's memory and stops when they are away.",
          "In the next stage, functions get dedicated people and then team leads. Add a lead when a group is too large for the founder to review each person's work, or when it runs on shifts. Later, an operations head takes over the daily running of orders and support so the founder can focus on growth and product. At each step, move work only after it has been documented.",
        ],
      },
      {
        h: "Who should own COD verification, NDR follow-up and returns?",
        p: [
          "These three jobs cause the most confusion in Indian D2C teams, because they sit between operations and support. Verification involves talking to customers, which looks like support. It also decides what gets shipped, which is operations. If nobody is clearly responsible, orders ship unverified on busy days and failed deliveries are noticed only when the parcel returns.",
          "A workable rule is to place them by purpose. Jobs that protect the order before and during delivery, meaning COD verification and NDR follow-up, belong to order operations, even when the people doing them are calling agents. Jobs that begin with a customer request after delivery, such as returns and exchanges, belong to support. Refund payment belongs to finance, with support keeping the customer informed.",
        ],
      },
      {
        h: "How do you set reporting lines and avoid gaps between teams?",
        p: [
          "Each person should report to exactly one manager. Shared or unclear reporting means nobody reviews the work and nobody approves leave or expenses with confidence. Draw the chart, even for a small team, and show it to everyone. People should be able to see who their manager is and who covers when that manager is absent.",
          "Then close the gaps between teams with a few fixed habits. Most cross-team failures are information failures, so the cure is routine communication and not more hierarchy. The practices below cost little time and prevent the common ones. Start with the daily huddle if you adopt only one, because it surfaces problems while they are still small.",
        ],
        list: [
          "A short daily huddle across operations and support",
          "A shared calendar of campaigns, launches and sale days",
          "One named owner for every recurring report",
          "A written rule for who decides on exceptions such as high-value refunds",
          "A weekly review of returns and complaints with every function present",
        ],
      },
      {
        h: "What D2C roles should you hire first?",
        p: [
          "Hire for the work that is hurting most, not for the chart you would like to have. For many brands the first hires are in order operations and support, because that work grows directly with order volume and cannot wait. Marketing can often be handled by the founder with a freelancer or agency until the daily floor work is stable.",
          "When you add a role, write its outcomes before its tasks. An operations executive is not there to make calls. They are there so that confirmed orders ship on time and failed deliveries are acted on the same day. Clear outcomes make it easier to judge performance and easier for the person to make sensible decisions without asking.",
        ],
        list: [
          "Order operations executive for verification, dispatch and courier follow-up",
          "Customer support agent for WhatsApp, phone and email queries",
          "Team lead once the floor runs on shifts or grows beyond direct oversight",
          "Accounts and admin support for payments, refunds and vendors",
          "Performance marketer or content owner when the founder can no longer cover it",
        ],
      },
      {
        h: "How does CodeCrest support a D2C team structure?",
        p: [
          "CodeCrest is an operations platform for Indian D2C teams on Shopify and the business behind them. An admin sets up branches, departments, designations and reporting lines once, and builds roles whose permissions are scoped to own records, team, department, branch or the whole organisation. A team lead sees their own team's work and a department head sees their department.",
          "The same structure decides who approves an expense claim and whose attendance a manager can view. Verification, recovery and delivery follow-up run as task queues with owners, and a live floor view shows who is online. CodeCrest has no self-serve signup. Its team provisions each organisation and sets up the structure with you.",
        ],
      },
    ],
    faqs: [
      ["How many people does a D2C brand need to start?", "There is no fixed number. A very small team can cover every function if each one has a named owner. Add people when a function's workload is regularly more than its owner can handle, which usually happens first in order handling and support."],
      ["Should customer support report to operations or marketing?", "In most D2C brands support sits closer to operations, because most queries are about orders and delivery. Whichever you choose, make sure support has a regular channel to both, since it hears about product and campaign problems first."],
      ["Should a D2C brand outsource support or fulfilment?", "Outsourcing can work for packing and dispatch or for overflow calling. Keep ownership inside the business: someone on your team should own the result, review the partner's work and hold the customer relationship."],
      ["When should a founder hire an operations head?", "When daily order and support issues take up most of the founder's week, and the processes are documented well enough to hand over. Hiring before the work is written down often means the new person has nothing clear to run."],
      ["What is the difference between a role and a designation?", "A designation is a job title, such as senior executive. A role describes what the person is allowed to see and do in your systems. Two people with the same title can need different access, so define the two separately."],
    ],
    related: ["features/team-hr", "features/roles-permissions", "solutions/d2c-brands", "blog/ecommerce-sop-template"],
  },
  {
    slug: "approval-workflow-for-small-business",
    title: "Approval workflow for a small business: a simple way to set it up",
    metaTitle: "Approval Workflow for Small Business: A Guide",
    description: "How to set up an approval workflow in a small business: what needs approval, a step-by-step design, an example approval matrix and the controls to add.",
    keyword: "approval workflow",
    category: "Operations & Teams",
    date: "2026-10-11",
    answer: "An approval workflow is the defined path a request follows before money is spent or a decision takes effect. Someone raises the request, a named approver checks it against a rule, and the decision is recorded. For a small business, use one approver per request type, a clear limit above which approval is needed, and a deadline for answering.",
    takeaways: [
      "An approval workflow needs a requester, a rule, a named approver and a record of the decision.",
      "Only require approval where a mistake would cost money, break a policy or be hard to undo.",
      "One approver per request type is enough for most small businesses.",
      "Nobody should approve their own request, whatever their seniority.",
      "Give every approval a deadline and an escalation step so requests do not sit unseen.",
    ],
    visual: "flow",
    sections: [
      {
        h: "What is an approval workflow?",
        p: [
          "An approval workflow is an agreed route for decisions that need a second person. A team member raises a request, such as an expense claim or a discount for a customer. The request goes to a specific approver, who checks it against a rule and says yes or no. The decision, the approver and the time are recorded so the business can look back later.",
          "Small businesses often run approvals on messages and conversations. That works until someone asks who agreed to a payment and nobody can find the message. A workflow replaces the hunt with a fixed path. It does not need to be heavy. It only needs to be the same every time, and to leave a trace that someone other than the requester can read.",
        ],
      },
      {
        h: "Which decisions in a small business need approval?",
        p: [
          "Not every decision needs a second signature. Approval is worth the delay only where a mistake would cost real money, break a policy or be hard to reverse. If you require approval for everything, managers stop reading requests and approve by habit, which is worse than having no approval at all. Choose a short list and apply it strictly.",
          "A useful test is to ask what happens if the decision is wrong. If it can be corrected tomorrow at little cost, trust the person doing the job. If it means money leaving the business, a promise to a customer or a change to someone's pay or access, route it for approval. The list below covers the usual candidates.",
        ],
        list: [
          "Expense claims and reimbursements",
          "Purchases and vendor payments above a set amount",
          "Refunds, discounts and goodwill credits beyond the agent's limit",
          "Leave requests",
          "Access to sensitive data or systems",
          "Finished work that must be reviewed before it is published or sent",
        ],
      },
      {
        h: "How do you design an approval workflow step by step?",
        p: [
          "Design one workflow at a time, starting with the request that causes the most confusion today. Describe it in a single sentence: who raises what, who approves it, under what rule and by when. If you cannot write that sentence, the process is not yet clear enough to automate, and a tool will only make the confusion faster.",
          "Keep the first version to one approval step. Add a second approver only for the few cases with high amounts or high risk. Each extra step adds waiting time and weakens responsibility, because each approver assumes the other has checked. Follow the steps below, test the workflow on real requests for a few weeks, then adjust the limits.",
        ],
        list: [
          "List the request types that need approval",
          "Set the rule or limit for each one",
          "Name the approver by role, with a backup for absences",
          "Decide what information the request must contain",
          "Set a deadline for the decision and who is told if it passes",
          "Decide where the decision is recorded and who can read it",
        ],
      },
      {
        h: "What does a simple approval matrix look like?",
        p: [
          "An approval matrix is a one-page table that shows who approves what. It is the most useful approval document a small business can have, because it answers the question staff ask most: who do I send this to? Pin it where everyone can see it and update it when people or limits change.",
          "The example below is illustrative. The request types are common, but the limits are placeholders for you to replace with amounts that suit your own business. Notice that approvers are roles, not names, and that every row has a rule. A row that says approval is needed without saying when will be read differently by every person.",
        ],
        table: {
          cols: ["Request", "Raised by", "Approver", "Rule (example only)"],
          rows: [
            ["Expense claim", "Any team member", "Reporting manager", "Every claim, with a receipt attached"],
            ["Vendor payment", "Operations or admin", "Founder or finance head", "Above the limit you set for routine purchases"],
            ["Customer refund", "Support agent", "Support team lead", "Above the agent's own refund limit"],
            ["Leave request", "Any team member", "Reporting manager", "Every request, before the leave starts"],
            ["Published content", "Content creator", "Marketing lead", "Everything that goes out under the brand's name"],
          ],
        },
      },
      {
        h: "How do you stop approvals from slowing the business down?",
        p: [
          "Slow approvals are usually a design problem and not a people problem. The approver is missing information and has to ask, or does not know the request exists, or is away with no backup. Fix the first by making requests complete: amount, reason and supporting document in one place. Fix the second with a single place where pending approvals are listed.",
          "Then set limits generously enough that routine work flows without approval. If a support agent must ask permission for every small refund, customers wait and the lead is buried. Let people decide alone up to a sensible limit and review a sample afterwards. Finally, give each approval a deadline, with automatic escalation to the next person when it passes.",
        ],
      },
      {
        h: "What controls should every approval workflow have?",
        p: [
          "Three controls matter more than the rest. First, nobody approves their own request. This applies to senior people as well, and it should be blocked by the system and not left to good manners. Second, every decision is recorded with who made it and when. Third, the approver sees the same evidence the requester had, such as the receipt.",
          "Two more controls are worth adding as you grow. Decisions should be final once made, so that an approval cannot be quietly edited later. A change should be a new request. And approvals that nobody answers should escalate on a schedule. A request that is neither approved nor rejected is a hidden no, and the person waiting deserves a real answer.",
        ],
      },
      {
        h: "How does CodeCrest handle approval workflows?",
        p: [
          "CodeCrest is an operations platform for Indian D2C teams and the business behind them. It has one approvals inbox for expense claims, tasks sent for review and requests raised by a business rule. An expense claim goes to the claimant's manager, taken from the reporting lines set up for your organisation. Managers approve or reject with the context attached.",
          "Rules are written in plain terms: when this happens and these conditions match, notify this person or ask for approval. Self-approval is refused by the system, decisions are final, and approvals nobody answers are escalated on a schedule. There is no self-serve signup. The CodeCrest team onboards each organisation and helps set up its first rules.",
        ],
      },
    ],
    faqs: [
      ["What is the difference between an approval workflow and an approval matrix?", "The matrix is the table that says who approves which request and under what rule. The workflow is the path each request follows in practice: raise, review, decide, record. You need the matrix first, then a workflow that applies it."],
      ["How many approval levels should a small business have?", "One level is enough for most requests. Add a second only for high amounts or high risk. Each added level increases waiting time and makes each approver more likely to assume that someone else has checked the details."],
      ["Can approvals be handled over WhatsApp or email?", "They can, and many small businesses begin that way. The weakness is the record. Messages are hard to search and easy to lose, so it becomes difficult to show later who approved what and on which date."],
      ["What should happen when the approver is on leave?", "Name a backup approver for each role in advance and say when the backup takes over. Without one, requests simply wait. An escalation rule that moves unanswered requests after a set time covers unplanned absences too."],
      ["Who approves the founder's own expenses?", "Ideally another senior person, such as a co-founder or the finance lead. The amount matters less than the habit. If the rule against self-approval has exceptions at the top, the rest of the team will treat it as optional."],
    ],
    related: ["features/approvals-and-rules", "features/finance-operations", "solutions/operations-teams", "blog/refund-approval-process"],
  },
  {
    slug: "refund-approval-process",
    title: "Refund approval process for ecommerce: steps, limits and controls",
    metaTitle: "Refund Approval Process for Ecommerce Stores",
    description: "A clear refund approval process for ecommerce: the steps a refund should pass, who approves at which limit, how COD refunds differ and how to stop abuse.",
    keyword: "refund approval process",
    category: "Operations & Teams",
    date: "2026-10-19",
    answer: "A refund approval process is the set of checks a refund request passes before money goes back to the customer. Confirm the order and the reason, check the request against your written policy, verify the return or the evidence, have someone other than the requesting agent approve it above a set amount, then issue the refund and tell the customer.",
    takeaways: [
      "A refund should pass through fixed steps: request, policy check, evidence, approval, payment and confirmation.",
      "Let agents approve small, clear-cut refunds and route larger or unusual ones to a lead.",
      "The person who raises a refund should not be the only person who approves it above a set limit.",
      "COD refunds need a safe way to collect and verify the customer's payment details.",
      "Record a reason for every refund so that repeat causes can be fixed at the source.",
    ],
    visual: "orders",
    sections: [
      {
        h: "What is a refund approval process?",
        p: [
          "A refund approval process is the agreed route a refund request follows inside your business. It sets what must be checked, who can say yes, up to what amount, and how the decision is recorded. The aim is to return money quickly when the customer is entitled to it, and to stop money leaving when the request does not meet your policy.",
          "Both halves matter. A process that is too loose leaks money through duplicate refunds, refunds for items never returned and favours granted without thought. A process that is too strict makes honest customers wait for money that is theirs, which costs more in complaints and lost repeat orders than it saves. Good design is quick for clear cases and careful for unclear ones.",
        ],
      },
      {
        h: "What steps should a refund go through?",
        p: [
          "Every refund should pass the same sequence, whether it takes five minutes or five days. The sequence starts with a written policy. Without one, each agent decides on feeling, and customers with the same problem get different answers. The policy should state the return window, the conditions and which cases get a refund, a replacement or store credit.",
          "The steps below are the backbone. For a small, clear case the same agent may complete most of them in one conversation. For a larger case, the approval step moves to a second person. Either way the order of steps stays fixed, and each one leaves a note on the order so that anyone who opens it later can see what happened.",
        ],
        list: [
          "Log the request against the order, with the reason in the customer's words",
          "Check the request against the written refund policy",
          "Collect evidence: photos, the return shipment or proof of non-delivery",
          "Check that the order has not already been refunded or replaced",
          "Approve or reject, by the right person for the amount",
          "Issue the refund through the original payment method where possible",
          "Tell the customer the amount and when to expect it",
        ],
      },
      {
        h: "Who should approve refunds, and at what limits?",
        p: [
          "Split refunds into tiers by amount and by how clear the case is. Frontline agents should be able to approve low-value, clear-cut refunds alone. That keeps customers from waiting and keeps leads from drowning in small requests. Larger amounts, and anything outside the policy, should go to a team lead or to finance for a second look.",
          "The table is an example of a tiered structure. The tiers are illustrative, and you should set actual amounts from your own order values and margins. The principle to keep is separation: above the first tier, the person who raises the refund is not the one who approves it. This protects the business and the agent from honest mistakes.",
        ],
        table: {
          cols: ["Refund type", "Evidence needed", "Who approves (example only)"],
          rows: [
            ["Low value, within policy", "Order check and the stated reason", "Support agent"],
            ["Returned item, within policy", "Return received and inspected", "Support agent or team lead"],
            ["High value", "Return received, photos, order history", "Team lead or operations head"],
            ["Outside policy or goodwill", "Written reason for the exception", "Operations head or founder"],
            ["Not delivered or lost in transit", "Courier status and investigation note", "Team lead, with operations informed"],
          ],
        },
      },
      {
        h: "How do refunds work for COD orders?",
        p: [
          "Prepaid refunds can usually go back to the original payment method. Cash-on-delivery orders are different, because the customer paid the courier in cash and there is nothing to reverse. You need the customer's bank or UPI details to send the money, or you agree on store credit. That adds a step where errors and fraud can enter.",
          "Collect payment details through one controlled route and not in scattered chat messages. Confirm that the name on the account matches the customer where you can, and have a second person check the details before money is sent, since a transfer to a wrong account is hard to recover. Before any COD refund, also confirm that the order was actually delivered and paid for.",
        ],
      },
      {
        h: "How do you prevent refund abuse and internal errors?",
        p: [
          "Most refund losses are ordinary mistakes: the same order refunded twice, a refund issued before the return arrived, a replacement and a refund both sent. A smaller share is deliberate, by customers who claim repeatedly or, rarely, by staff. The same simple controls reduce both, and none of them need to slow down a genuine customer.",
          "The controls work because they make each refund visible to a second pair of eyes at some point, either before payment or in review afterwards. Review a sample of approved refunds every week, including the small ones agents approved alone. Look for patterns by customer, by product, by agent and by reason, and act on what you find.",
        ],
        list: [
          "One refund record per order, checked before any payment",
          "A required reason code on every refund",
          "No self-approval above the agent's limit",
          "Refund only after the return is received, unless policy says otherwise",
          "A flag on customers with repeated refund claims",
          "A weekly review of a sample of refunds by someone outside support",
        ],
      },
      {
        h: "What should you tell the customer, and when?",
        p: [
          "Silence causes more refund complaints than refusal does. Tell the customer at three points: when the request is received, when it is approved or rejected, and when the money has been sent. Each message should state the amount, the method and a realistic time to expect it. If a return must reach you first, say so plainly at the start.",
          "When you reject a request, give the reason and the policy line it rests on, and offer what you can instead, such as an exchange. Keep the tone factual. A customer who understands why may still be unhappy, but is less likely to feel cheated. Record the conversation on the order so the next agent does not ask the customer to explain again.",
        ],
      },
      {
        h: "How does CodeCrest help with refund approvals?",
        p: [
          "CodeCrest is an operations platform for Indian D2C teams on Shopify. It does not issue refunds. The payment itself is still made through your store or payment provider. What it adds is the structure around the decision: one customer timeline with orders, calls, WhatsApp messages and notes, so whoever reviews a request sees the full history.",
          "Its rules engine can raise an approval request when an event matches your conditions, and the request lands in an approvals inbox with the context attached. Self-approval is blocked, decisions are final and unanswered approvals escalate. Changes to business records are written to an audit trail. Organisations are onboarded by the CodeCrest team, as there is no self-serve signup.",
        ],
      },
    ],
    faqs: [
      ["How long should a refund approval take?", "Aim for clear, low-value cases to be decided in the first conversation, and for others to be decided soon after the evidence arrives. Set your own target, publish it in your refund policy, and measure the time from request to decision."],
      ["Should we refund before the returned item arrives?", "For most cases, wait until the return is received and checked. Some brands refund early for low-value items or trusted repeat customers. If you allow it, write the rule down so that it is applied evenly and not case by case."],
      ["Is store credit better than a cash refund?", "Store credit keeps the money in the business and can suit exchanges or goodwill gestures. It should be offered as a choice where the customer is entitled to their money back. Forcing credit on an unwilling customer usually costs more in trust."],
      ["Who should have permission to issue refunds in the store?", "As few people as practical. Agents can recommend and approve within their limit, while the ability to actually send money can sit with a lead or finance. Separating the decision from the payment adds a natural second check."],
      ["What refund data should we track?", "Track the count and value of refunds, the reason for each, the time from request to payment, and breakdowns by product, customer and approving agent. Reasons matter most, because they show what to fix so fewer refunds are needed."],
    ],
    related: ["features/approvals-and-rules", "features/roles-permissions", "features/finance-operations", "blog/approval-workflow-for-small-business"],
  },
  {
    slug: "move-from-spreadsheets-to-crm",
    title: "How to move from spreadsheets to CRM without losing data or the team",
    metaTitle: "How to Move From Spreadsheets to CRM",
    description: "A step-by-step plan to move from spreadsheets to CRM: when to switch, how to clean and import data, how to run the cutover and how to retire the old sheet.",
    keyword: "move from spreadsheets to CRM",
    category: "Operations & Teams",
    date: "2026-10-27",
    answer: "To move from spreadsheets to CRM, first list the jobs your sheets do today, then clean and de-duplicate the data and decide which records are worth importing. Connect live sources such as your store so new data stops entering the sheet, import the history, run both side by side for a short period, then freeze the sheet on a fixed date.",
    takeaways: [
      "List what each spreadsheet is used for before you choose or configure a CRM.",
      "Clean phone numbers, remove duplicates and fix column formats before importing anything.",
      "Import only the history the team will actually use.",
      "Set a fixed cutover date and make the old sheet read-only on that day.",
      "Train people on their own daily tasks in the new system, not on every feature.",
    ],
    visual: "board",
    sections: [
      {
        h: "When is it time to move from spreadsheets to a CRM?",
        p: [
          "Spreadsheets are a sensible place to start. They are free, flexible and everyone knows how to use them. They stop working when several people need to act on the same rows at the same time. A sheet has no idea who owns a row, whether a follow-up is late or which of two copies is the current one.",
          "The switch is worth the effort when the sheet has become a job in itself. Someone exports orders every morning, pastes them in, colours the rows and chases people to update their columns. That time produces nothing for the customer. If several of the signs below sound familiar, the sheet has reached its limit.",
        ],
        list: [
          "Orders are exported and pasted into a sheet every day",
          "Two people have updated the same row with different information",
          "Follow-ups are missed because nobody was reminded",
          "There are several versions of the file and no agreement on which is right",
          "Reports take hours to compile and are disputed when finished",
          "Customer phone numbers can be copied by anyone with the link",
        ],
      },
      {
        h: "What should you do before you migrate?",
        p: [
          "Start by writing down what your sheets actually do. Most teams have more than they think: an order tracker, a COD confirmation sheet, a courier follow-up sheet, a returns log, a customer list. For each one, note who uses it, what they do in it each day and what decision it supports. This list becomes your requirements.",
          "Then decide what will not move. Old tabs, abandoned trackers and columns nobody fills in should be left behind. A migration is a good moment to drop work that no longer earns its place. Agree on one person to own the move. A migration run by a committee tends to stall at the first disagreement about a column.",
        ],
      },
      {
        h: "How do you clean spreadsheet data for import?",
        p: [
          "Imported data is only as good as the sheet it came from, and most sheets are messy. The same customer appears three times with slightly different spellings. Phone numbers have spaces, country codes and missing digits. Dates are typed in several formats. Clean this before import, because bad records are much harder to find once they are mixed with live data.",
          "Work on a copy, never the live file. Fix one column at a time and keep a note of the rules you applied, so the clean-up can be repeated if you need to import a second batch. Choose one field as the identity of a customer. In Indian ecommerce the phone number is usually the most reliable, since many customers do not use email.",
        ],
        list: [
          "Put every phone number in one format",
          "Merge duplicate customers, using the phone number as the key",
          "Use one date format in every date column",
          "Replace free-text statuses with a short fixed list",
          "Split combined fields such as name and city into separate columns",
          "Remove test rows, blank rows and totals rows",
        ],
      },
      {
        h: "What is a step-by-step plan to move from spreadsheets to CRM?",
        p: [
          "Treat the move as a short project with stages, not a single weekend of copying. Each stage should have a clear finish, so you know when it is safe to begin the next. The table sets out a sequence that suits a small team. The length of each stage depends on how much data you have and how clean it is.",
          "Two stages deserve special care. Connecting live sources first means new orders arrive in the CRM by themselves, so the sheet stops growing while you work. And a trial import of a small batch shows mapping mistakes cheaply. It is far easier to delete and repeat a small test than to untangle a full import that went wrong.",
        ],
        table: {
          cols: ["Stage", "What happens", "Done when"],
          rows: [
            ["Map", "List sheets, columns and who uses them", "Every column is marked keep, change or drop"],
            ["Clean", "Fix formats and remove duplicates on a copy", "A sample of rows passes a manual check"],
            ["Connect", "Link the store and other live sources", "New orders appear without manual entry"],
            ["Trial import", "Import a small batch and inspect it", "Fields land in the right places"],
            ["Full import", "Import the history you decided to keep", "Record counts match the cleaned sheet"],
            ["Cutover", "Team works only in the CRM from a fixed date", "The old sheet is read-only"],
          ],
        },
      },
      {
        h: "How do you get the team to stop using the old sheet?",
        p: [
          "People return to the sheet because it is familiar, not because it is better. The surest fix is to remove the choice. Announce a cutover date in advance, and on that day make the sheet read-only. Keep it available for reference so nobody fears that information has vanished, but make sure new work can only be recorded in one place.",
          "Train each person on their own day and not on the whole product. A verification agent needs to know how to open the queue, call, record an outcome and move on. That takes one short session. Sit with the team for the first few days, answer questions as they come up, and fix small annoyances quickly so they do not become reasons to go back.",
        ],
      },
      {
        h: "What mistakes should you avoid during migration?",
        p: [
          "The first mistake is rebuilding the spreadsheet inside the CRM. A sheet shows everything in one grid because it has no other way. A CRM works with queues, owners and statuses. If you insist on the same columns and colours, you carry over the old problems. Ask what each person needs to do next and build around that.",
          "The second is running both systems for too long. A short overlap is useful for checking that nothing was lost. A long one doubles the work and splits the data, and soon neither system is trusted. The third is importing everything. Years of old rows add clutter and little value. Bring what supports current work and archive the rest as a file.",
        ],
      },
      {
        h: "How does CodeCrest help with the move from spreadsheets?",
        p: [
          "CodeCrest is an operations platform for Indian D2C teams on Shopify. Orders, customers and abandoned checkouts sync from the store, and a backfill brings in historical orders and customers. For data that lives only in sheets, a guided importer loads orders and customers from CSV or Excel: you upload a file, map its columns, review a preview and import.",
          "During import, phone numbers are normalised and likely duplicates are flagged, so imported records line up with what later arrives from the store. After that, work runs as task queues with owners and recorded outcomes. You do not set this up alone. There is no self-serve signup, and the CodeCrest team onboards each organisation and connects its tools with you.",
        ],
      },
    ],
    faqs: [
      ["How long does it take to move from spreadsheets to a CRM?", "It depends on how many sheets you have and how clean they are. The import itself is usually quick. Most of the time goes into deciding what to keep, cleaning the data and helping the team change its daily habits."],
      ["Should we import all our old data?", "Usually not. Import customers and the order history that supports current work, such as repeat purchase reminders. Keep older records as an archived file. You can still look things up, and the new system stays clean and fast."],
      ["Can we keep using spreadsheets for some things?", "Yes. Sheets remain useful for one-off analysis, planning and anything only one person touches. The work to move is the shared, daily, row-by-row work where ownership and follow-up matter. Export from the CRM when you need a sheet."],
      ["What if the team resists the change?", "Involve the people who do the work when you map the process, train them on their own tasks, and make the old sheet read-only on the cutover date. Resistance fades quickly once the new way is clearly less effort."],
      ["Do we need a developer to migrate?", "Often not. Many tools offer a store connection and a file import that a non-technical person can run. A developer is only needed for unusual data sources or custom integrations. Ask the vendor what help is included in onboarding."],
    ],
    related: ["integrations/csv-import", "compare/spreadsheets", "resources/crm-for-shopify-guide", "features/shopify-order-management"],
  },
  {
    slug: "ecommerce-operations-kpis",
    title: "Ecommerce operations KPIs: the numbers that run a D2C back office",
    metaTitle: "Ecommerce Operations KPIs for D2C Brands",
    description: "The ecommerce operations KPIs a D2C brand should track from checkout to doorstep, with formulas, what each one points to and how often to review them.",
    keyword: "ecommerce operations KPIs",
    category: "Operations & Teams",
    date: "2026-11-03",
    answer: "The core ecommerce operations KPIs are order processing time, COD verification rate, on-time dispatch, delivery success rate, RTO rate, NDR resolution rate, order accuracy and refund turnaround. They follow an order from checkout to doorstep and show where time, stock or money is being lost between your store, your warehouse and the courier.",
    takeaways: [
      "Operations KPIs should follow the order from checkout to delivery and back.",
      "Always split delivery and RTO numbers by payment mode, state and courier.",
      "Track team workload measures such as backlog and overdue tasks alongside outcome measures.",
      "Review a few KPIs daily, most weekly and the cost-related ones monthly.",
      "Compare each KPI with your own trend, because other stores' numbers rarely apply to yours.",
    ],
    visual: "chart",
    sections: [
      {
        h: "What are ecommerce operations KPIs?",
        p: [
          "Ecommerce operations KPIs are the measures that show how well your business turns a paid or placed order into a delivered one. They cover the work that happens after checkout: confirming the order, packing it, handing it to a courier, following it to the customer and dealing with whatever comes back. Marketing KPIs tell you how orders arrive. Operations KPIs tell you what happens to them.",
          "For an Indian D2C brand these numbers decide margin. An order that is placed but not delivered still costs packaging, shipping in both directions and staff time. A founder who watches only sales and ad spend sees revenue that never reaches the bank. Operations KPIs close that gap by showing how much of what was sold was actually delivered and kept.",
        ],
      },
      {
        h: "Which operations KPIs should a D2C brand track?",
        p: [
          "Eight measures cover the journey for most brands. The table gives a plain formula for each and the kind of problem a poor result usually points to. Define each one once, in writing, and do not change the definition from month to month. A number that is calculated differently each time cannot show a trend.",
          "Be careful with the base of each rate. RTO rate should be measured against shipped orders and not all orders, or cancellations before dispatch will make it look better than it is. Delivery success should be judged only on shipments that have reached a final status, or recent orders still in transit will pull the number down unfairly.",
        ],
        table: {
          cols: ["KPI", "Formula", "A poor result points to"],
          rows: [
            ["Order processing time", "Time from order placed to handed to courier", "Slow verification, stock gaps or packing delays"],
            ["COD verification rate", "COD orders verified divided by COD orders received", "Too few agents, poor contact details or late calling"],
            ["On-time dispatch", "Orders dispatched within your promised time divided by orders dispatched", "Warehouse capacity or missed courier pickups"],
            ["Delivery success rate", "Orders delivered divided by orders with a final status", "Address quality, courier choice or weak NDR follow-up"],
            ["RTO rate", "Orders returned to origin divided by orders shipped", "Unverified COD, risky pincodes or slow NDR action"],
            ["NDR resolution rate", "Failed attempts later delivered divided by failed attempts", "Slow or missing customer contact after a failed attempt"],
          ],
        },
      },
      {
        h: "How do you track RTO and delivery KPIs usefully?",
        p: [
          "A single RTO figure for the whole store hides more than it shows. Cash-on-delivery and prepaid orders behave very differently, and a blended number moves whenever the payment mix changes, even if nothing else has. Report RTO separately for COD and prepaid as a minimum. Then cut it by state or pincode group and by courier.",
          "The segments tell you what to do. High returns in one region may call for restricting COD there or switching courier. High returns on unverified orders make the case for stricter verification. Also compare RTO for orders that were verified against those that were not. That one comparison shows whether your verification effort is paying for itself.",
        ],
      },
      {
        h: "Which KPIs show whether your team is keeping up?",
        p: [
          "Outcome measures such as RTO arrive late. By the time a parcel is returned, the chance to save it passed days ago. Workload measures are earlier signals. They show whether the team is handling today's orders today, which is what the outcomes depend on. If the queue is growing, next week's delivery numbers will suffer.",
          "Watch these every day, and act the same day. A verification backlog at closing time means orders will ship late or unverified tomorrow. Failed deliveries left untouched overnight are often lost. These measures are also the fairest way to judge staffing, because they show the distance between the work that arrived and the work that was done.",
        ],
        list: [
          "COD orders waiting for verification at the end of the day",
          "Share of COD orders verified within your target window",
          "Failed deliveries not yet contacted",
          "Shipments with no tracking movement for several days",
          "Overdue tasks, by team and by age",
          "Tasks closed per agent, with their outcomes",
        ],
      },
      {
        h: "How often should you review each KPI?",
        p: [
          "Match the review rhythm to how quickly you can act. Workload measures change by the hour and need a daily look. Rates such as delivery success and RTO need enough orders behind them to mean anything, so weekly is the practical minimum for most brands. Cost measures settle only after couriers have invoiced and returns have come back, which makes them monthly.",
          "Keep each review short and end it with decisions. A daily check is a few minutes at the start of the shift. The weekly review looks at trends and segments and picks one problem to fix. The monthly review is where the founder or operations head decides on bigger changes, such as courier allocation, COD rules or team size.",
        ],
        list: [
          "Daily: verification backlog, untouched failed deliveries, overdue tasks",
          "Daily: orders received against orders dispatched",
          "Weekly: delivery success, RTO and NDR resolution, split by payment mode",
          "Weekly: order processing time and on-time dispatch",
          "Monthly: refund turnaround, order accuracy and cost per shipped order",
        ],
      },
      {
        h: "What mistakes make operations KPIs misleading?",
        p: [
          "The most common is comparing your numbers with someone else's. Categories, order values, payment mix and regions differ so much that another brand's RTO rate says little about yours. Your own trend, measured the same way each week, is the honest comparison. A second mistake is looking at averages only. Averages hide the small group of orders that went badly wrong.",
          "A third is collecting numbers by hand. When figures are compiled from exports and courier panels, they arrive late, contain copying errors and are argued over. People then spend the review debating whether the number is right, not what to do about it. Wherever possible, let the KPI be calculated from the same records the team works on.",
        ],
      },
      {
        h: "How does CodeCrest report operations KPIs?",
        p: [
          "CodeCrest is an operations platform for Indian D2C teams on Shopify. Orders sync from the store and shipment status from Shiprocket, and the work between them runs as tasks: COD verification, failed delivery follow-up and stuck shipment escalation. Agents close each task with an outcome, so the reports are built from the work itself with no data entry step.",
          "Analytics cover revenue, recovery rate, RTO rate, delivery performance by state and each agent's output, with filters for date, team and payment mode and export to Excel or PDF. A scheduled daily digest goes to managers. CodeCrest has no self-serve signup. Its team onboards each organisation and connects the store and courier account with you.",
        ],
      },
    ],
    faqs: [
      ["What is the most important operations KPI for a COD-heavy store?", "RTO rate, split by payment mode, because returned COD orders cost shipping both ways and bring no revenue. Pair it with COD verification rate and NDR resolution rate, which are the two measures your team can influence directly each day."],
      ["What is the difference between operations KPIs and marketing KPIs?", "Marketing KPIs measure how customers and orders are acquired, such as traffic, conversion and ad cost. Operations KPIs measure what happens after the order is placed: verification, dispatch, delivery, returns and refunds. A healthy business needs both sets."],
      ["How is RTO rate calculated?", "Divide the number of orders returned to origin by the number of orders shipped in the same period. Use shipped orders as the base, not all orders placed, and calculate it separately for COD and prepaid so the two are not blended."],
      ["How many operations KPIs should a small brand track?", "Start with a few: orders received against dispatched, COD verification rate, delivery success and RTO. Add others when you have a question they would answer. A short list that is reviewed every week beats a long one that nobody opens."],
      ["Can operations KPIs be tracked in a spreadsheet?", "Yes, at low volume. The effort grows with every order, because the figures have to be pulled from the store and the courier panel and joined by hand. Once that takes hours each week, a system that calculates them from live records is worth it."],
    ],
    related: ["features/analytics-reports", "features/task-engine", "solutions/d2c-brands", "blog/ecommerce-customer-support-kpis"],
  },
  {
    slug: "outbound-calling-for-ecommerce",
    title: "Outbound calling for ecommerce: when to call, what to say, what to track",
    metaTitle: "Outbound Calling for Ecommerce: A Practical Guide",
    description: "A practical guide to outbound calling for ecommerce: the calls worth making, a simple call structure, retry rules, the setup you need and what to measure.",
    keyword: "outbound calling for ecommerce",
    category: "Operations & Teams",
    date: "2026-11-10",
    answer: "Outbound calling for ecommerce means your team phones customers at set moments in the order journey: to verify COD orders, recover abandoned carts, fix failed deliveries and follow up after delivery. It works when every call has a clear trigger, a short script, a recorded outcome and a limit on attempts, so customers are helped and not chased.",
    takeaways: [
      "Call customers at specific moments in the order journey, each with a clear purpose.",
      "Keep calls short and structured: who you are, why you are calling, one question, next step.",
      "Record one outcome from a fixed list after every call.",
      "Set a limit on attempts and vary the time of day between them.",
      "Judge calling by the orders it saves or confirms, not by the number of calls made.",
    ],
    visual: "chat",
    sections: [
      {
        h: "What is outbound calling for ecommerce?",
        p: [
          "Outbound calling is when your team phones the customer, as opposed to waiting for the customer to contact you. In ecommerce it is not cold selling. The customer has already placed an order or started a checkout, and the call is about that specific order: confirming it, solving a problem with it or helping the customer complete it.",
          "It is common in Indian D2C because of cash on delivery. A COD customer has not paid, so the order is only an intention until the parcel is accepted. A short call confirms the intention and the address before you pay a courier to carry the parcel. Calls also reach customers who do not read messages, which makes them a useful second step after WhatsApp.",
        ],
      },
      {
        h: "When should an ecommerce team call customers?",
        p: [
          "Call when there is something specific to resolve and a message has not resolved it. Four moments account for most useful calls: after a COD order is placed, after a checkout is abandoned, after a delivery attempt fails and after the product has been delivered. Each has its own trigger, its own goal and its own list of outcomes.",
          "The table summarises them. Message first where you can, and reserve calls for customers who have not replied or orders where the value or the risk justifies an agent's time. Calling everyone about everything wears out both the team and the customers. A call should feel to the customer like help with their order.",
        ],
        table: {
          cols: ["Call type", "Trigger", "Goal of the call", "Outcomes to record"],
          rows: [
            ["COD verification", "New COD order, no reply to the confirmation message", "Confirm order, amount and address", "Confirmed, changed, cancelled, unreachable"],
            ["Cart recovery", "Abandoned checkout still open after reminders", "Answer the question that stopped the purchase", "Ordered, will order later, not interested, unreachable"],
            ["Failed delivery", "Courier reports a failed attempt", "Confirm availability and correct the address", "Re-attempt requested, cancelled, unreachable"],
            ["Post-delivery", "Order delivered", "Check satisfaction, ask for a review, note reorder interest", "Happy, issue raised, no answer"],
          ],
        },
      },
      {
        h: "How do you structure an outbound call?",
        p: [
          "A good call is short and follows the same shape each time. The customer should know within the first few seconds who is calling and why. Use the store name they will recognise and mention the product, because many people do not remember an order number. Then ask the one thing you need and confirm what happens next.",
          "Give agents a script as a guide and not a text to read aloud. The opening and the key question should be consistent. The rest should sound like a person. Train agents to listen for the real concern, such as doubt about delivery time or a changed mind, and to note it. The steps below fit almost every call type.",
        ],
        list: [
          "Greet the customer by name and say which store you are calling from",
          "State the reason in one sentence, naming the product",
          "Ask the key question: confirm, help or resolve",
          "Repeat back any change, such as a corrected address or landmark",
          "Say what will happen next and when",
          "Thank the customer and record the outcome before the next call",
        ],
      },
      {
        h: "How many times should you try, and when?",
        p: [
          "Decide the retry rule in advance so that agents do not have to judge each case. Many teams settle on two or three attempts spread across a day or two. More than that rarely changes the result and starts to feel like harassment. After the final attempt, send a message saying what will happen to the order, then follow your cancellation or hold rule.",
          "Vary the time of day between attempts. A customer who does not answer in the morning may be at work and reachable in the evening. Keep calls within reasonable hours, and stop immediately if the customer asks not to be called. Record that request on the customer so nobody on the next shift calls again by mistake.",
        ],
      },
      {
        h: "What do you need to set up outbound calling?",
        p: [
          "At the smallest scale, an agent with a phone and a list can start. That breaks down quickly. Personal phones leave no record, customer numbers end up saved in private contacts, and nobody can tell which orders were called. A proper setup has four parts: a way to place calls, a queue that decides who to call next, scripts and a fixed list of outcomes.",
          "A cloud telephony account lets agents call from a computer or app using a business number, with each call logged and recorded. Tell customers what they need to know about recording, and follow the telecom and consent rules that apply to your business. Check these with your provider, since the requirements for business calling and commercial messages are specific.",
        ],
        list: [
          "A business calling line through a cloud telephony provider",
          "A queue ordered by order value, risk and age",
          "A short script for each call type",
          "A fixed list of outcomes for each call type",
          "A retry rule with a limit on attempts",
          "A do-not-call flag that every agent can see",
        ],
      },
      {
        h: "How do you measure whether calling is worth it?",
        p: [
          "Count results and not activity. The number of calls an agent makes says little by itself, and rewarding it encourages short, careless calls. What matters is what the calls achieved: orders confirmed, bad orders cancelled before shipping, carts recovered, failed deliveries saved. Those are the outcomes you recorded, which is why a fixed outcome list is essential.",
          "Then compare with the alternative. Look at the return rate of verified COD orders against unverified ones, and at failed deliveries that were called against those that were not. If called orders do clearly better, the calling pays for itself. If they do not, look at timing and script before adding people. A simple worked example with your own order value and shipping cost will show the break-even point.",
        ],
      },
      {
        h: "How does CodeCrest support outbound calling?",
        p: [
          "CodeCrest is an operations platform for Indian D2C teams on Shopify. Its task engine creates the calling work from live orders and shipments: COD verification, cart recovery and failed delivery follow-up, in queues ordered by order value, risk and age. It connects to your own Exotel or Twilio account, so agents click to call from the order or task they are working on.",
          "Each call is logged with its duration and outcome on the customer's timeline, and recordings are available to the roles you allow. Customer numbers can be masked from agents. Per-agent call volume and task outcomes appear in reports. Calls are billed by your telephony provider. There is no self-serve signup, and the CodeCrest team onboards each organisation.",
        ],
      },
    ],
    faqs: [
      ["Is outbound calling the same as telemarketing?", "No. Telemarketing usually means calling people who have not asked to hear from you. Ecommerce outbound calling is about an order or checkout the customer started. The call has a specific purpose tied to that order and should end once it is resolved."],
      ["Should we call or send a WhatsApp message first?", "Message first in most cases. Many customers confirm or reply without needing a call, which saves agent time. Call those who have not replied within your chosen window, and call straight away when the order value or risk is high."],
      ["Can outbound calls be automated?", "Parts of the process can. Creating the call task, ordering the queue, dialling and logging can all be handled by software. The conversation itself is where a person adds value, especially when the customer has a doubt or a question."],
      ["How many calls can one agent make in a day?", "It varies with call type, how many customers answer and how much follow-up each call needs. Measure your own team for a couple of weeks to find a realistic figure, and judge agents on outcomes more than on call counts."],
      ["Do customers find verification calls annoying?", "A short, clear call about their own order is usually accepted, especially when it confirms delivery details. Annoyance comes from repeated attempts, calls at odd hours and agents who cannot say why they are calling. Fixed rules prevent all three."],
    ],
    related: ["features/cloud-telephony", "integrations/cloud-telephony", "features/task-engine", "solutions/customer-support-teams"],
  },
];

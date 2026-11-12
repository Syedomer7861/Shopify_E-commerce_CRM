import type { Post } from "./types";

// Shipping & Delivery batch. Advice is stated as practice, not as measured
// results: no statistics, benchmarks or provider pricing. Any arithmetic is
// labelled as an example.

export const posts2: Post[] = [
  {
    slug: "what-is-ndr-in-shipping",
    title: "NDR meaning in shipping: what a non-delivery report is and what happens next",
    metaTitle: "NDR Meaning in Shipping: Non-Delivery Report Explained",
    description: "NDR meaning in shipping, explained simply: what a non-delivery report is, when couriers raise it, what happens to the parcel and how your team should act.",
    keyword: "NDR meaning in shipping",
    category: "Shipping & Delivery",
    date: "2026-09-01",
    answer: "NDR stands for non-delivery report. In shipping, it is the status a courier raises when a delivery attempt fails, together with a reason such as customer unavailable, wrong address or refusal. The parcel is still with the courier and can be attempted again. If nobody acts, it is usually sent back to the seller as RTO after the final attempt.",
    takeaways: [
      "An NDR is a failed delivery attempt, not a failed order.",
      "Every NDR carries a reason, and the reason decides what you should do.",
      "The time between an NDR and the next attempt is short, so same-day action matters.",
      "An NDR that nobody works usually becomes an RTO.",
    ],
    visual: "flow",
    sections: [
      {
        h: "What does NDR mean in shipping?",
        p: [
          "NDR is short for non-delivery report. A courier raises it when the delivery agent took the parcel out, tried to hand it over and could not. The shipment status changes from out for delivery to undelivered, and a reason is recorded against it. You will see it in your courier panel or shipping aggregator dashboard, usually in a separate NDR tab.",
          "The important part is what an NDR is not. It is not a cancelled order and it is not a return. The parcel is sitting at the courier's local hub, waiting for another attempt or for an instruction from you. That makes an NDR the last point at which the sale can still be saved without paying for a return journey.",
        ],
      },
      {
        h: "When does a courier raise an NDR?",
        p: [
          "An NDR is raised after a failed attempt, and the delivery agent picks the reason from a fixed list on a handheld device. The wording differs between couriers, but the reasons fall into a few familiar groups. Knowing the group tells you who needs to act: your team, the customer or the courier.",
          "Reasons are entered quickly, at the end of a long route, so they are not always accurate. Treat the reason as a strong hint and confirm it with the customer before you decide what to do.",
        ],
        list: [
          "Customer not available at the address",
          "Customer not reachable on the phone",
          "Address incomplete, wrong or hard to find",
          "Customer refused to accept the parcel",
          "Cash not ready for a COD order",
          "Customer asked for delivery on another day",
          "Area not serviceable or entry restricted",
        ],
      },
      {
        h: "What happens to a parcel after an NDR?",
        p: [
          "After an NDR the parcel goes back to the delivery hub. Most couriers will attempt delivery again, but the number of attempts and the waiting time depend on the courier and the service you booked. Check your aggregator's current policy so your team knows how long it has. During this window you can send an instruction: try again, use a corrected address, call an alternate number or return the parcel.",
          "If no instruction arrives and the remaining attempts also fail, the courier marks the shipment for return to origin. From that point the parcel travels back to your warehouse and you pay for the trip.",
        ],
        table: {
          cols: ["Stage", "What it means", "What you can do"],
          rows: [
            ["Out for delivery", "The agent has the parcel on today's route", "Send the customer a heads-up message"],
            ["NDR raised", "An attempt failed and a reason was logged", "Contact the customer and confirm details"],
            ["Reattempt requested", "The courier has your updated instruction", "Tell the customer when to expect the agent"],
            ["Delivered", "The reattempt worked", "Close the follow-up and record the outcome"],
            ["RTO initiated", "Attempts are over or the customer refused", "Track the return and plan restocking"],
          ],
        },
      },
      {
        h: "Why does NDR matter so much for COD stores?",
        p: [
          "With a prepaid order the customer has already paid, so a missed delivery is mostly a scheduling problem. With cash on delivery the customer has paid nothing yet. A missed attempt gives them an easy moment to change their mind, and a second missed attempt often ends the order. That is why COD-heavy stores see NDR and RTO move together.",
          "Each NDR that turns into a return costs you forward shipping, return shipping, packaging and handling time, and the stock is tied up while it travels. Saving even some of these orders is usually cheaper than finding new customers to replace them.",
        ],
      },
      {
        h: "What should your team do when an NDR arrives?",
        p: [
          "Treat NDR as a daily queue with one owner, not as something to look at when there is time. The work is simple, but it has to happen before the courier's next attempt. A message first, then a call, covers most customers.",
          "Record how each NDR ended. Over a few weeks the outcomes show you whether the real problem is addresses, unreachable customers or orders that should never have shipped.",
        ],
        list: [
          "Pull the day's NDRs with the courier's reason",
          "Sort by order value and attempts left",
          "Message the customer, then call if there is no reply",
          "Confirm they still want the order, the address and a good time",
          "Send the reattempt instruction through your shipping platform",
          "Record the outcome: reattempt, cancelled or unreachable",
        ],
      },
      {
        h: "How does CodeCrest help with NDR?",
        p: [
          "CodeCrest syncs shipment status from Shiprocket onto each Shopify order. When a delivery attempt fails, it creates a task for an agent with the customer's number and the courier's reason, so the follow-up starts the same day. Agents can message from the store's own WhatsApp number or call from the task, and the outcome is saved on the customer's timeline.",
          "Overdue tasks escalate to a manager, and RTO is reported by state and payment mode. Teams are onboarded by CodeCrest, so the queue is set up around your process.",
        ],
      },
    ],
    faqs: [
      ["Is NDR the same as RTO?", "No. An NDR is a failed delivery attempt where the parcel is still with the courier and can be delivered. RTO is the return journey to the seller, which starts after attempts run out or the customer refuses. One often leads to the other if nobody follows up."],
      ["Who raises an NDR, the seller or the courier?", "The courier raises it. The delivery agent marks the attempt as failed and picks a reason. The seller sees the NDR in the courier or aggregator panel and decides what instruction to send back, such as a reattempt or a return."],
      ["Can an NDR be raised on a prepaid order?", "Yes. Prepaid orders fail delivery too, usually because the customer was not available or the address was unclear. They are generally easier to save, because the customer has already paid and wants the parcel."],
      ["How long do I have to respond to an NDR?", "It depends on the courier and the service level. Some reattempt the next working day on their own, others wait for your instruction for a limited period. Check the current policy in your shipping platform and plan to act on the same day."],
      ["Does a fake NDR remark happen?", "Sometimes an agent logs a reason without a real attempt, for example marking the customer unavailable. If the customer says nobody came, raise it with the courier through your aggregator's escalation route and ask for a reattempt."],
    ],
    related: ["resources/ndr-management-guide", "features/shipping-rto-management", "blog/ndr-reasons-and-how-to-respond", "resources/glossary"],
  },
  {
    slug: "ndr-reasons-and-how-to-respond",
    title: "NDR reasons: the common ones and how to respond to each",
    metaTitle: "NDR Reasons and How to Respond to Each One",
    description: "The common NDR reasons couriers report, what each one really means, and the right response for your team so a failed delivery does not turn into an RTO.",
    keyword: "NDR reasons",
    category: "Shipping & Delivery",
    date: "2026-09-08",
    answer: "The common NDR reasons are customer not available, customer not reachable, incomplete or wrong address, customer refused, cash not ready, future delivery requested and area not serviceable. Each needs a different response: confirm a time, fix the address, find out why the customer refused or move the delivery date. Always confirm the reason with the customer before you instruct the courier.",
    takeaways: [
      "The NDR reason tells you who needs to act: your team, the customer or the courier.",
      "Courier reasons are entered in a hurry, so confirm them with the customer.",
      "Address and availability problems are usually fixable; a real refusal usually is not.",
      "Counting NDRs by reason shows you what to fix before dispatch.",
    ],
    visual: "chat",
    sections: [
      {
        h: "What are the most common NDR reasons?",
        p: [
          "Every courier has its own list of NDR remarks, and the wording varies. Underneath the wording, the reasons fall into a small number of groups. Map each courier's remarks to these groups once, and your team can use one playbook for every shipment instead of learning each courier's vocabulary.",
          "Keep an eye on vague remarks such as a generic undelivered status with no detail. They are worth a call to the customer, because the courier has told you nothing you can act on.",
        ],
        list: [
          "Customer not available at the address",
          "Customer not reachable or phone switched off",
          "Address incomplete, incorrect or landmark missing",
          "Customer refused delivery",
          "COD amount not ready",
          "Customer asked for delivery on a later date",
          "Out of delivery area or entry restricted",
        ],
      },
      {
        h: "How should you respond to each NDR reason?",
        p: [
          "The response depends on what is actually blocking the delivery. For availability and address problems, your job is to collect the missing information and get it to the courier before the next attempt. For refusals, your job is to find out why, because the answer decides whether a reattempt is worth requesting at all.",
          "Use the table below as a starting playbook. Adjust the wording of your messages to your brand, but keep the action for each reason fixed so that every agent handles it the same way.",
        ],
        table: {
          cols: ["NDR reason", "What it usually means", "How to respond"],
          rows: [
            ["Customer not available", "Nobody was home or at the shop", "Agree a day and time, then request a reattempt"],
            ["Not reachable", "The agent's call did not connect", "Message first, ask for an alternate number"],
            ["Address issue", "Missing house number, landmark or pincode mismatch", "Collect the full address and update the courier"],
            ["Customer refused", "Changed mind, price doubt or did not order", "Call to learn why, cancel if the refusal is firm"],
            ["Cash not ready", "COD amount was not at hand", "Confirm the amount and a day they will have it"],
            ["Future delivery", "Customer is away for some days", "Request a reattempt on the agreed date"],
          ],
        },
      },
      {
        h: "Can you trust the NDR reason the courier gives?",
        p: [
          "Mostly, but not completely. Delivery agents carry a heavy route and pick a remark from a dropdown. A parcel that was never attempted can be marked as customer not available. A customer who asked for evening delivery can be marked as refused. This is why the first step is always to ask the customer what happened.",
          "When the customer's version and the courier's remark do not match, note it on the order. If the same mismatch keeps appearing for one courier or one pincode, you have evidence to raise with the courier or your aggregator's account team.",
        ],
      },
      {
        h: "Which NDR reasons can you prevent before dispatch?",
        p: [
          "Many NDRs are caused by something that was already wrong when the order was packed. An address without a landmark was incomplete at checkout. A customer who refuses a COD parcel often lost interest days earlier. Fixing these at the source costs far less than fixing them at the doorstep.",
          "The steps below take a few minutes per order and remove whole categories of NDR remarks. They matter most for COD orders and for first-time buyers.",
        ],
        list: [
          "Verify COD orders by message or call before they ship",
          "Ask for a landmark and an alternate phone number",
          "Check the pincode is serviceable for your courier and payment mode",
          "Send a shipped message with the tracking link",
          "Send an out-for-delivery message with the COD amount",
        ],
      },
      {
        h: "How do you track NDR reasons over time?",
        p: [
          "Log two things for every NDR: the courier's reason and the final outcome. Then count them each week. A rising share of address issues points to your checkout form. A cluster of not available remarks in one area may point to delivery timing. Refusals concentrated in COD orders point to verification.",
          "Split the numbers by courier, state and payment mode. An overall count hides the pattern. A simple weekly review with one owner is enough to turn NDR from daily firefighting into a list of fixes.",
        ],
      },
      {
        h: "How does CodeCrest help with NDR reasons?",
        p: [
          "CodeCrest pulls shipment status from Shiprocket, including delivery failures and their reasons, onto each order. A failed attempt becomes a task in an agent's queue with the reason attached. The agent can send a WhatsApp template from the store's own number or call the customer from the task, then close it with an outcome.",
          "Those outcomes feed the reports, so you can see returns by state and payment mode without building a sheet. Late tasks escalate to a manager automatically.",
        ],
      },
    ],
    faqs: [
      ["What does 'customer refused' mean in an NDR?", "It means the agent says the customer declined to take the parcel. The real cause varies: they changed their mind, ordered elsewhere, did not expect a COD amount or never spoke to the agent at all. Call the customer before you accept it as final."],
      ["What should I do if the customer says no delivery was attempted?", "Record what the customer said, request a reattempt through your shipping platform and raise the mismatch with the courier or aggregator support. Keep a count of these cases by courier so you can show a pattern if it repeats."],
      ["Should I request a reattempt for every NDR?", "No. Request it when the customer has confirmed they want the order and you have fixed the cause. A reattempt on an order the customer no longer wants only delays the return and wastes an attempt."],
      ["Do NDR reasons differ between couriers?", "The wording and the number of remarks differ, but the underlying causes are the same. Map each courier's remarks to your own short list of reasons so your team and your reports use one consistent set."],
      ["Who should handle NDR follow-up in a small team?", "Give it to one named person or queue with a daily target. When NDR is shared between support and operations without an owner, each assumes the other has called the customer, and the parcel is returned."],
    ],
    related: ["resources/ndr-management-guide", "blog/what-is-ndr-in-shipping", "features/shipping-rto-management", "solutions/cod-heavy-stores"],
  },
  {
    slug: "shopify-order-tracking-page",
    title: "Shopify order tracking page: options, what to show and common mistakes",
    metaTitle: "Shopify Order Tracking Page: Options and Best Setup",
    description: "How a Shopify order tracking page works, the ways to set one up, what it should show customers and how to fix tracking that shows no updates or old status.",
    keyword: "Shopify order tracking page",
    category: "Shipping & Delivery",
    date: "2026-09-16",
    answer: "A Shopify order tracking page is where a customer checks the status of an order after buying. Shopify gives every order an order status page that shows tracking once a fulfilment has a tracking number. Stores can also add a tracking lookup page through an app, or link to the courier's or shipping aggregator's own tracking page.",
    takeaways: [
      "Every Shopify order already has an order status page that can show tracking.",
      "Tracking only appears when the fulfilment carries a tracking number and courier.",
      "Customers need to find the link without searching their inbox, so send it more than once.",
      "A clear tracking page cuts where-is-my-order queries and helps deliveries succeed.",
    ],
    visual: "orders",
    sections: [
      {
        h: "What is a Shopify order tracking page?",
        p: [
          "It is the page a customer opens to see where an order is. On Shopify the default version is the order status page. The customer lands on it after checkout and can return to it from the links in order notifications. When you fulfil the order with a tracking number, the page shows the shipment and a link to follow it.",
          "Many Indian stores want more than this: a page on their own menu where a customer types an order number or phone number and sees the status. That is a separate tracking lookup page, usually added through an app or provided by the shipping aggregator.",
        ],
      },
      {
        h: "What are the ways to give customers tracking on Shopify?",
        p: [
          "There are three common routes, and many stores use more than one. The right mix depends on how many couriers you use and how much control you want over the look of the page. Features and plans change, so check the current documentation for Shopify and for any app before you decide.",
          "Whichever route you pick, test it with a real order from a phone. Most of your customers will open the link from a WhatsApp or SMS message on a mobile screen.",
        ],
        table: {
          cols: ["Option", "How it works", "Good for", "Watch out for"],
          rows: [
            ["Shopify order status page", "Shows fulfilment and tracking on the order's own page", "Every store, as the baseline", "Needs a tracking number on the fulfilment"],
            ["Tracking lookup page via app", "Customer enters order or phone number on your site", "Stores that want tracking in the menu", "Another app to maintain and test"],
            ["Aggregator tracking page", "Your shipping platform hosts a tracking page for each AWB", "Stores using several couriers through one aggregator", "Branding and domain options vary by provider"],
            ["Courier's own tracking page", "Link goes straight to the courier website", "Simple setups with one courier", "Courier wording can confuse customers"],
          ],
        },
      },
      {
        h: "What should a good order tracking page show?",
        p: [
          "A customer opens the page with one question: when will it arrive? Answer that first, in plain words, before any scan history. Raw courier statuses are written for hub staff, not for buyers, so translate them into a few states a customer understands.",
          "The page is also a chance to prevent a failed delivery. Reminding a COD customer of the amount, and telling them the agent will call, makes it more likely that someone is ready at the door.",
        ],
        list: [
          "Current status in plain words, such as shipped or out for delivery",
          "Courier name and tracking number",
          "Items in the order and the delivery address",
          "Amount to pay on delivery for COD orders",
          "What to do if a delivery attempt was missed",
          "A clear way to contact support",
        ],
      },
      {
        h: "Where should the tracking link appear?",
        p: [
          "A tracking page that customers cannot find does not reduce support queries. Do not rely on one confirmation email. Put the link in every message that mentions the shipment, and give returning visitors a route from the store itself.",
          "For Indian shoppers, WhatsApp and SMS are opened far more reliably than email, so make sure the link is in those messages and that it opens cleanly on a phone.",
        ],
        list: [
          "Shipping confirmation email and SMS",
          "WhatsApp shipped and out-for-delivery messages",
          "A Track Order link in the store header or footer",
          "The customer account page, if you use accounts",
          "Saved replies your support agents send",
        ],
      },
      {
        h: "Why does a tracking page show no updates or an old status?",
        p: [
          "The most common cause is missing data. If an order is marked fulfilled in Shopify without a tracking number, the order status page has nothing to show. This happens when fulfilment is done by hand, or when the shipping platform is not set to push the AWB back to Shopify. Check that setting first.",
          "The second cause is timing. A label can be created well before the courier's first scan, so the page looks stuck for a while. Say so on the page or in the shipped message. If a shipment shows no movement for longer than is normal for that route, raise it with the courier instead of waiting for the customer to complain.",
        ],
      },
      {
        h: "How does CodeCrest help with order tracking?",
        p: [
          "CodeCrest is not a storefront tracking page. It is the operations side behind one. It syncs Shopify orders and Shiprocket shipment status into one workspace, maps courier statuses to a few clear states, and can send shipped and out-for-delivery updates on WhatsApp from the store's own number using your templates.",
          "Shipments that stop moving are flagged and escalated, and failed delivery attempts become tasks for agents. Your team sees the same status the customer is asking about, on the order itself.",
        ],
      },
    ],
    faqs: [
      ["Does Shopify have a built-in order tracking page?", "Shopify gives each order an order status page, which shows fulfilment and tracking details once a tracking number is added. A page where customers search by order number is not part of that default page and is usually added with an app."],
      ["Why is my tracking number not showing to the customer?", "Usually because the fulfilment in Shopify was created without a tracking number, or the shipping platform did not send it back. Open the order in Shopify admin and check whether the fulfilment has a tracking number and courier."],
      ["Can customers track an order with just a phone number?", "Not on the default order status page. Some tracking apps and aggregator tracking pages allow lookup by phone number or order number. Check what each one supports and think about privacy before showing order details from a phone number alone."],
      ["Should I send customers to the courier's website?", "It works, but courier pages use internal terms and carry no information about your order or your support. A page that shows plain status, the COD amount and a contact option generally serves customers better."],
      ["How often should tracking status refresh?", "As often as your shipping platform provides updates. Customers mainly care about three moments: shipped, out for delivery and delivered. Make sure those three are reliable and sent as messages, even if the detailed scan history lags."],
    ],
    related: ["features/shopify-order-management", "integrations/shopify", "features/whatsapp-automation", "blog/how-to-connect-shiprocket-to-shopify"],
  },
  {
    slug: "courier-weight-discrepancy",
    title: "Courier weight discrepancy: why it happens and how to dispute and prevent it",
    metaTitle: "Courier Weight Discrepancy: Causes, Disputes, Prevention",
    description: "What a courier weight discrepancy is, how chargeable and volumetric weight are worked out, how to dispute a wrong charge and how to stop it happening again.",
    keyword: "courier weight discrepancy",
    category: "Shipping & Delivery",
    date: "2026-09-24",
    answer: "A courier weight discrepancy is the gap between the weight you declared for a shipment and the weight the courier records at its hub. Couriers bill on the higher of actual and volumetric weight, so a larger box or a wrong product weight leads to an extra charge. You can dispute it with proof, within the window your courier or aggregator allows.",
    takeaways: [
      "Couriers charge on the higher of actual weight and volumetric weight.",
      "Most discrepancies start with wrong product weights or oversized boxes in your own catalogue.",
      "Disputes need evidence: photos of the packed parcel on a scale and with a tape.",
      "A standard set of boxes and a packing-station photo prevent most disputes.",
    ],
    visual: "chart",
    sections: [
      {
        h: "What is a courier weight discrepancy?",
        p: [
          "When you create a shipment, you declare a weight and box dimensions. The freight is first calculated on those numbers. Later the courier weighs and measures the parcel at its hub, often on an automated machine. If its figure is higher than yours, it bills the difference. That extra bill is the weight discrepancy, and it usually shows up days after the parcel has shipped.",
          "On one parcel the amount looks small. Across a month of orders it can quietly remove a noticeable part of your margin, because the extra charge applies to forward freight and, for returned orders, often to the return leg as well.",
        ],
      },
      {
        h: "How is chargeable weight calculated?",
        p: [
          "Couriers compare two numbers. Actual weight, also called dead weight, is what the packed parcel weighs on a scale. Volumetric weight is worked out from the box size: length times breadth times height, divided by a divisor set by the courier. The higher of the two is the chargeable weight, and it is then rounded up to the courier's next weight slab.",
          "Example only: a box of 30 cm by 20 cm by 10 cm has a volume of 6000 cubic cm. With a divisor of 5000, the volumetric weight is 1.2 kg. If the product weighs 0.5 kg, you are billed on 1.2 kg. Divisors and slabs differ between couriers and services, so read your own rate card.",
        ],
      },
      {
        h: "Why do weight discrepancies happen?",
        p: [
          "Sometimes the courier's machine or a manual entry is wrong, and those cases are worth disputing. More often the cause sits in the seller's own process. The weight saved against a product in Shopify was a guess, or the packer picked a bigger box than the one the shipment was booked with.",
          "Go through the list below with your packing team. Each item is a place where the declared figure and the real parcel drift apart.",
        ],
        list: [
          "Product weight in the catalogue excludes packaging",
          "Dimensions are missing, so a default box size is applied",
          "Packers use whatever box is at hand",
          "Soft parcels bulge and measure larger than declared",
          "Multi-item orders are booked with a single item's weight",
          "The courier's scan or manual entry is wrong",
        ],
      },
      {
        h: "How do you dispute a weight discrepancy?",
        p: [
          "Couriers and aggregators give a limited window to contest a discrepancy, and they expect proof. If you miss the window, the charge is normally treated as accepted. Check the current dispute process and deadline in your provider's panel and make one person responsible for looking at the discrepancy list on a fixed schedule.",
          "Good evidence is simple: clear photos taken at packing time that show the parcel, its label and the reading. Disputes without images are rarely successful, so the habit has to start at the packing table.",
        ],
        list: [
          "Open the discrepancy report in your courier or aggregator panel",
          "Compare the charged weight with your declared weight and box",
          "Collect photos of the parcel on a scale with the label visible",
          "Add photos of each dimension against a measuring tape",
          "Raise the dispute before the deadline with the images attached",
          "Record the result and the amount recovered or lost",
        ],
      },
      {
        h: "How do you prevent weight disputes in the first place?",
        p: [
          "Prevention is mostly housekeeping. Fix the data once, limit the choices a packer has to make and keep evidence by default. The controls below are cheap to run and remove the main sources of mismatch.",
          "Review the discrepancy report every week by product. If the same item is flagged again and again, the catalogue weight or its box is wrong, and correcting it stops every future charge on that product.",
        ],
        table: {
          cols: ["Control", "What to do", "What it prevents"],
          rows: [
            ["Catalogue weights", "Weigh each product packed, and save that weight", "Under-declared dead weight"],
            ["Standard boxes", "Keep a small set of box sizes with saved dimensions", "Default or guessed dimensions"],
            ["Box mapping", "Assign a box size to each product or combination", "Packers choosing oversized boxes"],
            ["Packing photo", "Photograph every parcel on the scale with its label", "Disputes lost for lack of proof"],
            ["Weekly review", "Check flagged shipments by product and courier", "The same error repeating for months"],
          ],
        },
      },
      {
        h: "How does CodeCrest help here?",
        p: [
          "CodeCrest does not audit courier invoices or file weight disputes. Where it helps is ownership. Workspaces and tasks let you give the weekly discrepancy review and the catalogue clean-up to named people with due dates, and overdue work escalates to a manager instead of being forgotten.",
          "Shopify orders and Shiprocket shipment status sit together on each order, so the person checking a flagged shipment can see what was ordered and what happened to it. The volumetric weight calculator on this site helps you check a box before you book it.",
        ],
      },
    ],
    faqs: [
      ["What is the difference between dead weight and volumetric weight?", "Dead weight is what the packed parcel weighs on a scale. Volumetric weight is calculated from the box dimensions using the courier's divisor. Couriers charge on whichever is higher, so a light product in a large box is billed on its size."],
      ["How long do I have to dispute a weight discrepancy?", "The window is set by your courier or aggregator and can change. It is usually short. Check the current terms in your panel, and review the discrepancy list often enough that nothing passes the deadline unnoticed."],
      ["What proof is accepted in a weight dispute?", "Typically clear images of the packed parcel on a weighing scale with the shipping label visible, plus images of the length, breadth and height against a tape. Check your provider's current requirements, because formats and the number of images needed vary."],
      ["Does weight discrepancy apply to RTO shipments too?", "It can. If the charged weight for a shipment is revised upwards, the return freight for a returned parcel is often calculated on the same revised weight. Confirm how your courier or aggregator bills return legs."],
      ["Can smaller packaging really reduce shipping cost?", "Yes, when volumetric weight is higher than actual weight. Reducing any one dimension lowers the volumetric figure and can move the parcel to a lower slab. Test your common products with the calculator before changing boxes."],
    ],
    related: ["tools/volumetric-weight-calculator", "integrations/shiprocket", "features/task-engine", "solutions/operations-teams"],
  },
  {
    slug: "shipping-aggregator-vs-direct-courier",
    title: "Shipping aggregator vs direct courier: which should a D2C brand use?",
    metaTitle: "Shipping Aggregator vs Direct Courier for D2C Brands",
    description: "Shipping aggregator vs direct courier, compared for Indian D2C brands: rates, pincode coverage, COD remittance, support and control, and when to use both.",
    keyword: "shipping aggregator vs direct courier",
    category: "Shipping & Delivery",
    date: "2026-10-02",
    answer: "A shipping aggregator gives you several couriers through one account, one panel and one integration. A direct courier contract is an agreement with a single courier company, with your own rates and account manager. Aggregators suit smaller or growing stores that need coverage and flexibility. Direct contracts suit steady, higher volumes on predictable lanes. Many brands use both.",
    takeaways: [
      "An aggregator trades some control for coverage, speed of setup and one integration.",
      "A direct contract trades flexibility for negotiated terms and a closer relationship.",
      "Compare the total cost per delivered order, including RTO and COD charges, not only forward freight.",
      "Using an aggregator alongside one direct courier is a common and sensible setup.",
    ],
    visual: "matrix",
    sections: [
      {
        h: "What is the difference between a shipping aggregator and a direct courier?",
        p: [
          "A shipping aggregator is a platform that has agreements with many courier companies. You sign up once, connect your store and choose a courier for each shipment, or let rules choose for you. Billing, tracking, NDR handling and COD remittance all run through the aggregator's panel.",
          "With a direct courier, you sign a contract with one courier company. You get a rate card based on your volume and lanes, pickups arranged with that courier, and support from its own team. You integrate with its system yourself or through a plugin. If you want a second courier, you repeat the whole exercise.",
        ],
        table: {
          cols: ["Factor", "Shipping aggregator", "Direct courier"],
          rows: [
            ["Setup", "One account and one integration", "A contract and integration per courier"],
            ["Coverage", "Combined pincodes of many couriers", "Only that courier's network"],
            ["Rates", "Standard plans, set by the platform", "Negotiated on your volume and lanes"],
            ["Support", "Through the aggregator's team", "Direct with the courier's account manager"],
            ["COD remittance", "On the aggregator's cycle", "On the cycle agreed in your contract"],
            ["Switching courier", "A setting or a rule", "A new contract"],
          ],
        },
      },
      {
        h: "When does a shipping aggregator make sense?",
        p: [
          "Aggregators remove the heavy lifting at the start. You do not need volume to get an account, and you can ship to most of the country from the first day. If one courier performs badly in a region, you move those pincodes to another without new paperwork.",
          "The trade-off is a layer between you and the courier. Escalations go through the aggregator's support, and you have less say over how a specific hub treats your parcels.",
        ],
        list: [
          "You are new or your volume changes a lot month to month",
          "You ship across India, including smaller towns",
          "You want to compare couriers on real delivery results",
          "You have a small team and need one panel for everything",
          "You want a ready integration with Shopify",
        ],
      },
      {
        h: "When does a direct courier contract make sense?",
        p: [
          "A direct contract starts to pay off when your volume is steady enough to negotiate and concentrated enough for one courier to serve well. You deal with the people who actually move your parcels, which helps with pickups, damage claims and stuck shipments.",
          "The cost is effort. Each courier means a contract, an integration, a separate invoice to reconcile and a separate panel for your team to check every day.",
        ],
        list: [
          "Your monthly volume is stable and predictable",
          "Most orders go to a few regions that one courier serves well",
          "You want agreed terms for COD remittance and claims",
          "You ship heavy or unusual parcels that need special handling",
          "You have someone to manage the relationship and reconcile bills",
        ],
      },
      {
        h: "Can you use an aggregator and a direct courier together?",
        p: [
          "Yes, and many brands end up there. A common pattern is a direct contract for the lanes that carry most of your orders, and an aggregator for everything else: remote pincodes, overflow in sale periods and a fallback when the main courier has a problem.",
          "The risk in a mixed setup is scattered information. Shipments live in two or three panels, and NDR follow-up gets missed in the one nobody opened today. Decide where your team will see every shipment in one list before you add a second channel.",
        ],
      },
      {
        h: "What should you compare before you choose?",
        p: [
          "Do not choose on the forward freight rate alone. The number that matters is the total cost of getting an order delivered and the money collected. A cheaper courier with more failed deliveries can easily cost more overall. Rates and terms change, so ask each provider for its current rate card and policies in writing.",
          "If you can, run a trial. Send a share of similar orders through each option for a few weeks and compare results by state and payment mode.",
        ],
        list: [
          "Forward, RTO and COD handling charges",
          "Weight slabs and the volumetric divisor",
          "Serviceable pincodes for prepaid and for COD",
          "COD remittance cycle and any early payout terms",
          "NDR process and how reattempts are requested",
          "Weight dispute and damage claim process",
          "How support escalations work",
        ],
      },
      {
        h: "How does CodeCrest fit with either choice?",
        p: [
          "CodeCrest connects to Shiprocket, so shipment status for any courier you use through Shiprocket appears on the matching Shopify order. Failed deliveries and stalled shipments become tasks for your team, and RTO is reported by state and payment mode. Shipment creation stays in your existing flow.",
          "CodeCrest does not choose couriers or compare rates. It gives your agents one queue for the follow-up work that decides whether a shipped order is actually delivered.",
        ],
      },
    ],
    faqs: [
      ["Is a shipping aggregator cheaper than a direct courier?", "Not always. Aggregators offer workable rates without a volume commitment, while a direct contract can be cheaper once your volume justifies negotiation. Compare the full cost per delivered order using current rate cards from each provider."],
      ["Who handles NDR when I use an aggregator?", "You still decide what happens to each failed delivery. The aggregator gives you a panel to see NDRs and send reattempt or return instructions, and passes them to the courier. Contacting the customer remains your team's job."],
      ["How does COD remittance differ between the two?", "With an aggregator, the courier pays the aggregator and the aggregator pays you on its own cycle. With a direct contract, the courier pays you on the terms you agreed. Check the current cycle and any deductions before relying on the cash flow."],
      ["Can I move from an aggregator to direct couriers later?", "Yes. Many brands start on an aggregator, learn which couriers perform well on their lanes, then sign direct contracts with one or two of them and keep the aggregator for the remaining pincodes."],
      ["Does the choice affect delivery speed?", "The parcel travels on the same courier network either way. Speed depends on the courier, the service level, your pickup timing and the destination. What can differ is how fast issues are resolved, because the escalation path is different."],
    ],
    related: ["integrations/shiprocket", "features/shipping-rto-management", "tools/rto-loss-calculator", "solutions/d2c-brands"],
  },
  {
    slug: "order-fulfilment-sla",
    title: "Order fulfilment SLA: what it is, how to set one and how to keep it",
    metaTitle: "Order Fulfilment SLA: How to Set and Track It",
    description: "What an order fulfilment SLA is, which stages it should cover from order to delivery, how to set realistic targets and what to do when an order breaches it.",
    keyword: "order fulfilment SLA",
    category: "Shipping & Delivery",
    date: "2026-10-10",
    answer: "An order fulfilment SLA is a time commitment for each stage between an order being placed and the customer receiving it: verification, packing, handover to the courier and delivery. Each stage has a start, an end, a target time and an owner. An order that passes its target is a breach, and a breach should trigger an action, not only a report.",
    takeaways: [
      "A fulfilment SLA is a set of stage targets, not one overall delivery promise.",
      "Each stage needs a clear start, a clear end and one owner.",
      "Set targets from what you already achieve, then tighten them.",
      "A breach is useful only if someone is told in time to act on it.",
    ],
    visual: "board",
    sections: [
      {
        h: "What is an order fulfilment SLA?",
        p: [
          "SLA stands for service level agreement. In fulfilment it is the time you commit to for each step of getting an order to the customer. Marketplaces impose these on sellers. A D2C brand on its own Shopify store has to set them for itself, because nobody else will.",
          "Without an SLA, late means whatever the person looking at the order feels is late. With one, every order is either inside its target or outside it, and the team can see which stage is slow. That is the difference between knowing that deliveries feel slow and knowing that packing is the bottleneck.",
        ],
      },
      {
        h: "Which stages should a fulfilment SLA cover?",
        p: [
          "Break the journey into stages that each have one owner. The split below works for most Indian D2C stores. COD stores need the verification stage. Prepaid-only stores can skip it. The courier stages are partly outside your control, but you should still measure them, because they show which courier or region is letting you down.",
          "Write down exactly which event starts and stops each clock. If two people can argue about whether an order is late, the definition is not tight enough.",
        ],
        table: {
          cols: ["Stage", "Clock starts", "Clock stops", "Owner"],
          rows: [
            ["COD verification", "Order placed", "Customer confirms or order is cancelled", "Support or calling team"],
            ["Pick and pack", "Order confirmed", "Parcel packed and labelled", "Warehouse"],
            ["Handover", "Parcel packed", "Courier's pickup scan", "Warehouse and courier"],
            ["Transit", "Pickup scan", "Out for delivery", "Courier"],
            ["Delivery", "First out-for-delivery scan", "Delivered or NDR raised", "Courier, then your NDR owner"],
          ],
        },
      },
      {
        h: "How do you set a realistic fulfilment SLA?",
        p: [
          "Start from your own recent orders, not from another brand's promise. Measure how long each stage takes today. Set the first target at a level you already meet on most days, then tighten it as you remove delays. A target the team misses every day is ignored within a week.",
          "State cut-off times and working days in the SLA. Example only: orders confirmed before the afternoon pickup ship the same day, later ones ship the next working day.",
        ],
        list: [
          "Measure current stage times for a few weeks of orders",
          "Set separate targets for COD and prepaid orders",
          "Define the daily cut-off around your courier pickup time",
          "Exclude Sundays and holidays if you do not work them",
          "Agree what counts as a valid pause, such as out-of-stock",
          "Review the targets every quarter",
        ],
      },
      {
        h: "What causes fulfilment SLA breaches?",
        p: [
          "Most breaches come from a handful of repeat causes. Some are inside your walls and can be fixed with process. Others belong to the courier and need a conversation backed by your own numbers.",
          "Tag every breached order with a cause. After a month, the tags tell you where to spend effort. Teams often find that one stage, or one product that is regularly out of stock, accounts for much of the delay.",
        ],
        list: [
          "COD orders waiting for a verification call",
          "Stock shown as available that is not on the shelf",
          "Orders placed after the pickup cut-off",
          "Missed or late courier pickups",
          "Shipments stuck at a hub with no scans",
          "Failed delivery attempts that nobody follows up",
        ],
      },
      {
        h: "How do you track the SLA and act on breaches?",
        p: [
          "Track two things for each stage: how many orders met the target, and which open orders are about to miss it. The first is for the weekly review. The second is for today. A list of orders that will breach in the next few hours is more useful than a chart of last month's average.",
          "Decide in advance what happens on a breach. An unverified COD order goes to a second caller. An unpacked order is raised with the warehouse lead. A stuck shipment is escalated to the courier, and the customer is told before they ask. Escalation should happen automatically, on a timer.",
        ],
      },
      {
        h: "How does CodeCrest help with fulfilment SLAs?",
        p: [
          "CodeCrest turns the stages into tasks. A Shopify COD order creates a verification task. A failed delivery or a shipment that has stopped moving in Shiprocket creates a follow-up task. Each task sits in an agent's queue ordered by value, risk and age, and overdue tasks are flagged and escalated to a manager on a schedule you set.",
          "Packing and courier handover stay in your warehouse and shipping tools. CodeCrest covers the follow-up stages around them and reports on outcomes per agent.",
        ],
      },
    ],
    faqs: [
      ["What is the difference between a fulfilment SLA and a delivery promise?", "A delivery promise is what you tell the customer, such as an expected delivery window. A fulfilment SLA is the internal set of stage targets that makes the promise achievable. Keep the internal targets tighter than the public promise."],
      ["Should COD and prepaid orders have the same SLA?", "Usually not. COD orders carry a verification step that prepaid orders do not need, so their time to dispatch is naturally longer. Separate targets keep the prepaid flow fast and make the verification stage visible."],
      ["How do I hold a courier to an SLA?", "Measure pickup, transit and delivery times per courier from your own shipment data, by state. Share the figures with the courier or aggregator account team. Your leverage is the ability to move volume to a courier that performs better on that lane."],
      ["What should I tell customers when an order breaches SLA?", "Tell them before they ask. Send a short, honest message with the reason and the new expected date. Customers who are informed early are more likely to wait for the parcel and accept it at the door."],
      ["Does an SLA need software?", "A small store can run it with a sheet and discipline. As volume grows, timers, queues and automatic escalation become hard to manage by hand, and a system that creates and tracks the work is more reliable."],
    ],
    related: ["features/task-engine", "features/approvals-and-rules", "solutions/operations-teams", "blog/ecommerce-order-lifecycle"],
  },
  {
    slug: "how-to-connect-shiprocket-to-shopify",
    title: "How to connect Shiprocket to Shopify: setup, settings and common sync problems",
    metaTitle: "How to Connect Shiprocket to Shopify: Setup Guide",
    description: "How to connect Shiprocket to Shopify step by step, which sync settings to check after connecting, and how to fix orders that do not appear or update.",
    keyword: "how to connect Shiprocket to Shopify",
    category: "Shipping & Delivery",
    date: "2026-10-18",
    answer: "To connect Shiprocket to Shopify, log in to Shiprocket, open the channel integration settings, choose Shopify and authorise the connection with your store. Then set which order statuses to pull, how COD and prepaid are identified, and whether tracking is pushed back to Shopify. Run a sync and test with one real order. Exact screens change, so follow Shiprocket's current help guide.",
    takeaways: [
      "The connection is made from Shiprocket's channel settings and authorised in your Shopify store.",
      "Most problems after setup come from sync settings, not from the connection itself.",
      "Check payment mode mapping carefully, because a COD order read as prepaid is expensive.",
      "Test with one real order from checkout to tracking before you rely on it.",
    ],
    visual: "orders",
    sections: [
      {
        h: "How do you connect Shiprocket to Shopify?",
        p: [
          "The link is set up from the Shiprocket side as a sales channel. You add Shopify as a channel, approve access in your Shopify store, and Shiprocket starts pulling orders. From then on, new Shopify orders appear in Shiprocket ready to be assigned a courier, and tracking details can flow back to Shopify.",
          "The steps here describe the general flow. Menu names, the authorisation method and available options change over time, and they can differ by plan. Keep Shiprocket's current help article open while you do it, and treat this page as a checklist of what to look for.",
        ],
      },
      {
        h: "What do you need before you start?",
        p: [
          "A few minutes of preparation saves a failed attempt. The person doing the setup needs enough access on both sides to approve the connection, and your Shopify data should be clean enough that the first orders pulled are usable.",
          "Do the setup at a quiet time, not in the middle of a sale. If something is mapped wrongly, you want to catch it on a handful of orders.",
        ],
        list: [
          "An active Shiprocket account with pickup address added",
          "Owner or staff access to Shopify with permission to install apps",
          "Your exact store address ending in myshopify.com",
          "Product weights and SKUs filled in Shopify",
          "A decision on which order statuses should be shipped",
          "One test order you can place and cancel",
        ],
      },
      {
        h: "What are the steps to connect the store?",
        p: [
          "The sequence is short. Read each screen before you approve it, especially the list of permissions Shopify shows you. Approve access only from a session you started yourself inside Shiprocket, not from a link someone sent you.",
          "Once the channel shows as connected, do not assume it is working. The first sync tells you whether orders are arriving with the right payment mode, address and weight.",
        ],
        list: [
          "Log in to Shiprocket and open the channels or integrations section",
          "Choose Shopify from the list of channels",
          "Enter your store address when asked",
          "Approve the access request in your Shopify admin",
          "Set the sync options shown, then save",
          "Trigger a manual sync and look at the orders pulled",
        ],
      },
      {
        h: "Which settings should you check after connecting?",
        p: [
          "This is where most of the value and most of the mistakes are. The names of the options vary, but the questions are the same on every shipping platform. Go through the table with your actual Shopify setup in front of you, including any COD app you use at checkout.",
          "Change one setting at a time and place a test order after each change. It is slower, but you will know which setting caused what.",
        ],
        table: {
          cols: ["Setting", "Why it matters", "What to check"],
          rows: [
            ["Order statuses to pull", "Decides which orders reach the shipping panel", "Unconfirmed or cancelled orders are not pulled by mistake"],
            ["Payment mode mapping", "Tells the courier whether to collect cash", "Your COD gateway name is mapped to COD"],
            ["Tracking push to Shopify", "Feeds the customer's order status page", "Fulfilment and AWB appear on the Shopify order"],
            ["Sync frequency", "Controls how fast new orders show up", "Orders arrive before your packing cut-off"],
            ["Weights and dimensions", "Sets the freight you are first charged", "Product weights are present and realistic"],
          ],
        },
      },
      {
        h: "Why are Shopify orders not showing in Shiprocket?",
        p: [
          "When orders are missing, the cause is nearly always a filter or a status, not a broken link. Work through the usual suspects in order before you contact support. If you do raise a ticket, include an example order number and the time it was placed.",
          "Also check whether the connection was removed on the Shopify side. If someone uninstalled the app or changed store permissions, the channel may still look present in Shiprocket while nothing is flowing.",
        ],
        list: [
          "The order's status is not one you chose to pull",
          "The order was placed before the sync start date",
          "The scheduled sync has not run yet",
          "The app was removed or access was revoked in Shopify",
          "The order has no shipping address or a missing phone number",
          "The order is a draft or is flagged and on hold",
        ],
      },
      {
        h: "How do you test the connection before going live?",
        p: [
          "Place one real order on your store using COD and one using a prepaid method. Watch each one appear in Shiprocket and confirm the payment mode, address, phone number, items and weight. Then create a shipment for one of them, or go as far as you can without booking a pickup.",
          "Open the same order in Shopify. If tracking push is on, the order should show as fulfilled with the courier and AWB, and the customer notification should carry the tracking link. Cancel the test shipment and order when you are done.",
        ],
      },
      {
        h: "Where does CodeCrest fit once the two are connected?",
        p: [
          "Connecting Shiprocket to Shopify handles booking and labels. CodeCrest handles the work around them. It connects to both: Shopify for orders, customers and abandoned checkouts, and Shiprocket for shipment status. Shipment creation stays in your existing flow.",
          "COD orders get a verification task before they ship. Failed deliveries and stalled shipments become follow-up tasks, with WhatsApp templates sent from the store's own number. Teams are onboarded by CodeCrest, including both connections.",
        ],
      },
    ],
    faqs: [
      ["Do I need a developer to connect Shiprocket to Shopify?", "No. The connection is made through settings screens and an approval step in Shopify admin. A store owner or operations manager can do it. A developer is only needed if you have custom checkout logic that affects how orders are tagged."],
      ["Will connecting Shiprocket change my Shopify orders?", "The integration reads your orders and, if you enable it, writes fulfilment and tracking details back to them. It does not change products or checkout. Review the permissions shown during approval so you know what access is being granted."],
      ["Why are COD orders coming through as prepaid?", "The payment gateway name used by your COD method is probably not mapped as COD in the sync settings. Check the payment mapping, correct it and test with a new order. Fix this before shipping, because the courier will not collect cash on a prepaid label."],
      ["Can I connect more than one Shopify store?", "Shipping platforms generally allow multiple channels on one account, each connected separately. Check Shiprocket's current documentation for how multiple stores are handled and whether any limit applies to your plan."],
      ["How do I disconnect the integration?", "Remove the channel inside Shiprocket and uninstall or revoke the app's access in Shopify admin. Do both, so that neither side is left with a half-active connection. Shipments already created continue on their way."],
    ],
    related: ["integrations/shiprocket", "integrations/shopify", "features/shopify-order-management", "blog/shopify-order-tracking-page"],
  },
  {
    slug: "rto-vs-rvp",
    title: "RTO vs RVP: the difference between return to origin and reverse pickup",
    metaTitle: "RTO vs RVP: Return to Origin vs Reverse Pickup",
    description: "RTO vs RVP explained: how return to origin differs from reverse pickup, what causes each, who pays, and how Indian D2C stores can reduce and track both.",
    keyword: "RTO vs RVP",
    category: "Shipping & Delivery",
    date: "2026-10-27",
    answer: "RTO, return to origin, is when a parcel is never delivered and the courier sends it back to the seller. RVP, reverse pickup, is when a delivered parcel is collected from the customer because they asked for a return or exchange. RTO happens before delivery and is mostly a COD and address problem. RVP happens after delivery and is mostly a product problem.",
    takeaways: [
      "RTO is an undelivered parcel coming back; RVP is a delivered parcel being collected.",
      "RTO is driven by intent, address and delivery follow-up.",
      "RVP is driven by product, size, quality and expectations set on the product page.",
      "Report the two separately, because they have different causes and different owners.",
    ],
    visual: "matrix",
    sections: [
      {
        h: "What is the difference between RTO and RVP?",
        p: [
          "Both end with a parcel back in your warehouse, which is why they get mixed up. The difference is whether the customer ever received it. In an RTO the delivery failed or was refused, and the courier returns the parcel on its own process. In an RVP the customer accepted the parcel, then raised a return, and you booked a pickup from their address.",
          "The distinction matters for money too. An RTO on a COD order means you never collected anything. An RVP usually means you collected payment and now owe a refund or an exchange.",
        ],
        table: {
          cols: ["Point", "RTO (return to origin)", "RVP (reverse pickup)"],
          rows: [
            ["When it happens", "Before delivery", "After delivery"],
            ["Who starts it", "The courier, after failed attempts or refusal", "The customer, through a return request"],
            ["Typical cause", "Unavailable, wrong address, refused COD", "Size, damage, quality or wrong item"],
            ["Money position", "COD not collected, freight already spent", "Payment received, refund or exchange due"],
            ["Condition of goods", "Usually unopened", "Opened, needs a quality check"],
            ["Main owner", "Verification and NDR team", "Support, product and quality team"],
          ],
        },
      },
      {
        h: "What causes RTO and what causes RVP?",
        p: [
          "RTO is mostly decided before and during delivery. The customer was not sure about the order, could not be found or was never told the parcel was coming. RVP is decided after the box is opened. The product did not match what the customer expected.",
          "Listing causes side by side makes the split clear. If you treat both as returns and hand them to one team, the fixes get muddled.",
        ],
        list: [
          "RTO: COD order placed on impulse and not confirmed",
          "RTO: incomplete address or wrong phone number",
          "RTO: failed attempts with no follow-up",
          "RTO: long delivery time, customer bought elsewhere",
          "RVP: wrong size or fit",
          "RVP: damaged, defective or wrong item sent",
          "RVP: product looks different from the photos",
        ],
      },
      {
        h: "How do the costs of RTO and RVP differ?",
        p: [
          "For an RTO you pay forward freight, return freight and often a COD handling charge, plus packaging and the time spent. You earn nothing. The goods normally come back sealed and can go back on the shelf after a check, though some arrive damaged from the double journey.",
          "For an RVP you pay forward freight and a reverse pickup charge, which is often priced differently from a forward shipment. You also refund the customer or ship a replacement. The item has been opened, so it needs inspection, and some of it cannot be resold as new. Check your courier's current rate card for both.",
        ],
      },
      {
        h: "How do you reduce RTO?",
        p: [
          "RTO responds to process. Confirm intent before dispatch, make sure the courier can find the customer and react quickly when an attempt fails. None of this requires changing the product.",
          "Start with COD orders, because that is where the customer has the least commitment. Review results by state and pincode, and tighten COD where returns stay high.",
        ],
        list: [
          "Verify every COD order before it ships",
          "Collect a landmark and an alternate number",
          "Offer prepaid during the verification conversation",
          "Send shipped and out-for-delivery messages",
          "Work every NDR on the same day",
          "Restrict COD on pincodes with repeated returns",
        ],
      },
      {
        h: "How do you reduce RVP?",
        p: [
          "RVP responds to honesty and quality. The more accurately the product page describes what arrives, the fewer customers send it back. Size charts with real measurements, photos in normal light and a clear note on what is included do more than any returns policy.",
          "Inside the warehouse, a quick check before packing catches wrong items and visible defects. Ask for a reason on every return request and read the reasons monthly by product. A single item with a sizing problem can account for a large share of your pickups.",
        ],
      },
      {
        h: "How does CodeCrest help with RTO and RVP?",
        p: [
          "CodeCrest is built mainly for the RTO side. It creates a verification task for each Shopify COD order, sends shipment updates on WhatsApp from the store's own number, and turns failed deliveries from Shiprocket into same-day follow-up tasks. Return-to-origin movements are tracked on the order, and RTO is reported by state and payment mode.",
          "For customer returns, the call and message history sits on the customer's timeline, so an agent handling a return request can see the full story of the order.",
        ],
      },
    ],
    faqs: [
      ["What does RVP stand for in courier terms?", "RVP stands for reverse pickup. It is a shipment booked to collect a parcel from the customer's address and bring it back to the seller, usually for a return or exchange after delivery. Some couriers and aggregators simply call it a reverse shipment."],
      ["Is RTO the same as a customer return?", "No. In an RTO the customer never received the parcel, so there is nothing to return. A customer return happens after delivery and is collected through a reverse pickup. Mixing the two in reports hides the real cause of each."],
      ["Which is worse for a COD store, RTO or RVP?", "RTO is usually the bigger problem for COD-heavy stores, because it happens more often and no money is collected. RVP matters more in categories where fit and feel are uncertain. Measure both for your own store before deciding where to focus."],
      ["Can an RTO parcel be sold again?", "Usually yes, since it comes back unopened. Inspect it first. Packaging can be crushed and products can be damaged on the return journey. Record the condition on arrival so that damage claims can be raised with the courier where the terms allow."],
      ["Does every courier offer reverse pickup?", "Not on every pincode. Reverse pickup coverage is generally narrower than forward delivery coverage, and some couriers offer quality checks at pickup while others do not. Check serviceability with your courier or aggregator before promising pickup to a customer."],
    ],
    related: ["resources/how-to-reduce-rto", "tools/rto-loss-calculator", "features/shipping-rto-management", "solutions/cod-heavy-stores"],
  },
  {
    slug: "ecommerce-order-lifecycle",
    title: "Ecommerce order lifecycle: every stage from checkout to delivered and beyond",
    metaTitle: "Ecommerce Order Lifecycle: Stages from Order to Delivery",
    description: "The ecommerce order lifecycle explained stage by stage for Indian D2C stores: verification, packing, shipping, delivery, NDR, returns and what follows.",
    keyword: "ecommerce order lifecycle",
    category: "Shipping & Delivery",
    date: "2026-11-04",
    answer: "The ecommerce order lifecycle is the sequence of stages an order passes through: placed, confirmed, packed, shipped, in transit, out for delivery and delivered. For Indian stores it also includes COD verification before dispatch and the exception paths: failed delivery, return to origin and customer return. After delivery come payment reconciliation, review requests and repeat purchase.",
    takeaways: [
      "An order's life does not end at dispatch, and for COD it has barely started.",
      "Each stage needs one owner and one clear status that the whole team uses.",
      "Most losses happen on the exception paths: unverified COD, NDR and RTO.",
      "The handoffs between tools and teams are where orders go missing.",
    ],
    visual: "flow",
    sections: [
      {
        h: "What is the ecommerce order lifecycle?",
        p: [
          "It is everything that happens to an order from the moment a customer clicks buy until the sale is truly complete. Many teams think of it as a straight line: order, pack, ship, deliver. In practice it has branches. A COD order may be cancelled at verification. A shipment may fail delivery and come back. A delivered product may be returned.",
          "Mapping the lifecycle is useful because it shows who is responsible at each point. When an order sits untouched, the cause is usually a stage that nobody clearly owns, or a handoff where one team assumed the other had acted.",
        ],
      },
      {
        h: "What are the stages of an order?",
        p: [
          "The table lists the main stages for a store on Shopify that ships through a courier or aggregator. Your labels may differ. What matters is that each stage has an owner and that everyone uses the same status names. If support says shipped when the warehouse means packed, customers get wrong answers.",
          "Note the failure column. Every stage has a typical way of going wrong, and each is cheaper to catch at that stage than later.",
        ],
        table: {
          cols: ["Stage", "What happens", "Owner", "Common failure"],
          rows: [
            ["Placed", "Order is created at checkout", "Storefront", "Duplicate or test orders"],
            ["Confirmed", "COD verified or payment captured", "Support or calling team", "Unreachable customer, order ages"],
            ["Packed", "Items picked, packed and labelled", "Warehouse", "Wrong item or out of stock"],
            ["Shipped", "Courier collects and scans the parcel", "Warehouse and courier", "Missed pickup"],
            ["Out for delivery", "Agent attempts delivery", "Courier", "Failed attempt, NDR raised"],
            ["Delivered", "Customer receives the parcel", "Courier", "Disputed or wrong delivery status"],
          ],
        },
      },
      {
        h: "What happens between order placed and dispatch?",
        p: [
          "This is the part you control completely, and it sets up everything after it. For a prepaid order the work is mostly stock and packing. For a COD order there is an extra question: does the customer still want it, and can the courier find them?",
          "The steps below are the usual pre-dispatch sequence. Skipping the early ones to ship faster often produces a parcel that travels across the country and comes back.",
        ],
        list: [
          "Check for duplicate orders from the same customer",
          "Confirm COD orders by message or call",
          "Correct the address and add a landmark",
          "Confirm stock and reserve it",
          "Pack, weigh and label with the right box size",
          "Hand over to the courier before the pickup cut-off",
        ],
      },
      {
        h: "What happens between dispatch and delivery?",
        p: [
          "Once the courier has the parcel, your role changes from doing to watching and communicating. Tell the customer it has shipped and share the tracking link. Tell them again on the day it is out for delivery, with the COD amount. Customers who expect the parcel are far more likely to be available.",
          "Watch for two exceptions. A shipment with no new scan for longer than usual needs to be raised with the courier. A failed delivery attempt needs a same-day call to the customer and a reattempt instruction. Both are time-bound, and both are easy to miss if nobody checks the panel daily.",
        ],
      },
      {
        h: "What happens after delivery?",
        p: [
          "Delivered is not the end. Money has to be matched, the customer may need help and the relationship has to continue. For COD orders the cash is with the courier until it is remitted, so someone should check that remittances match delivered orders.",
          "After-delivery work is also where repeat revenue comes from. A store that only looks at orders until dispatch leaves this part to chance.",
        ],
        list: [
          "Reconcile COD remittance against delivered orders",
          "Handle return and exchange requests",
          "Receive and inspect RTO and returned parcels",
          "Ask for a review once the customer has used the product",
          "Send a reorder reminder timed to the product",
        ],
      },
      {
        h: "Where do orders usually get stuck?",
        p: [
          "Orders rarely get stuck inside a stage. They get stuck between stages, where the work moves from one tool or team to another. A COD order waits for a call that support did not know about. A packed parcel waits for a pickup nobody chased. An NDR sits in the courier panel while the customer waits at home.",
          "The fix is the same each time: one shared list of orders, a visible status, an owner for each exception and a timer that escalates when nothing happens. Spreadsheets can do this for a small store, with daily discipline.",
        ],
      },
      {
        h: "How does CodeCrest support the order lifecycle?",
        p: [
          "CodeCrest brings Shopify orders and Shiprocket shipment status into one workspace and creates the work each stage needs: COD verification before dispatch, delivery-failure follow-up, stuck-shipment escalation, review requests and reorder reminders. WhatsApp messages go out from the store's own number on order and shipment events.",
          "Each task has an owner and an outcome, overdue ones escalate, and reports come from the same records. Packing and courier booking stay in your existing tools.",
        ],
      },
    ],
    faqs: [
      ["What is the first stage of the order lifecycle?", "Order placement at checkout. For a prepaid order, payment is captured at that moment. For a COD order, nothing has been paid, so the next stage, confirmation with the customer, is what turns it into an order worth shipping."],
      ["How is the lifecycle different for COD orders?", "COD adds a verification stage before dispatch, a higher chance of refusal at the door and a remittance stage after delivery, when the courier passes the collected cash to you. Each of these needs an owner that prepaid orders do not require."],
      ["What is the difference between fulfilled and delivered in Shopify?", "Fulfilled means the store has marked the items as shipped, normally with a tracking number. Delivered means the courier has handed the parcel to the customer. An order can be fulfilled for days and still fail delivery."],
      ["Who should own exceptions like NDR and stuck shipments?", "One named person or queue, with a daily routine. In many small teams this sits with support. What matters is that it is written down, so the warehouse and support do not each assume the other is handling it."],
      ["When is an order really complete?", "When the customer has the product, any return window you offer has passed and the money is in your account and reconciled. Until then the order can still turn into a return, a refund or a missing remittance."],
    ],
    related: ["features/shopify-order-management", "features/task-engine", "solutions/d2c-brands", "blog/order-fulfilment-sla"],
  },
  {
    slug: "first-attempt-delivery-rate",
    title: "First attempt delivery rate: what it is, how to calculate it and how to improve it",
    metaTitle: "First Attempt Delivery Rate: Formula and How to Improve",
    description: "What first attempt delivery rate means, how to calculate it, why it matters for COD stores and the practical steps that get more parcels delivered first time.",
    keyword: "first attempt delivery rate",
    category: "Shipping & Delivery",
    date: "2026-11-10",
    answer: "First attempt delivery rate is the share of shipments delivered on the courier's first attempt. Calculate it by dividing the number of shipments delivered on the first attempt by the total number of shipments that went out for delivery in the same period. A higher rate means fewer NDRs, lower RTO risk and faster COD collection.",
    takeaways: [
      "First attempt delivery rate measures how often the first doorstep visit succeeds.",
      "It is an early warning for RTO, because every failed first attempt is an NDR.",
      "Verified orders, complete addresses and an out-for-delivery message do most of the work.",
      "Always split the rate by courier, state and payment mode.",
    ],
    visual: "chart",
    sections: [
      {
        h: "What is first attempt delivery rate?",
        p: [
          "It answers a simple question: when the courier takes your parcels out for the first time, how many get delivered? The rest become NDRs. Some of those are saved on a later attempt, and some return to you. So this one figure tells you how much rescue work your team will have and how exposed you are to RTO.",
          "It matters more for COD stores. A prepaid customer who misses the agent still wants the parcel. A COD customer who misses the agent has a fresh chance to reconsider. Every extra day in the courier's hands also delays the cash reaching you.",
        ],
      },
      {
        h: "How do you calculate first attempt delivery rate?",
        p: [
          "Take a fixed period, such as a week. Count the shipments that had a first out-for-delivery attempt in that period. Count how many of those were delivered on that same attempt. Divide the second number by the first. Leave out shipments still in transit, because they have not been attempted yet.",
          "Example only: if 200 shipments went out for a first attempt in a week and 150 were delivered on that attempt, the rate is 150 divided by 200, which is 0.75, or 75 out of every 100. Use your own shipment export to get real figures. Your courier or aggregator report may define the metric slightly differently, so check the definition before comparing.",
        ],
      },
      {
        h: "What lowers first attempt delivery rate?",
        p: [
          "A first attempt fails for one of three broad reasons: the customer was not ready, the agent could not find or reach them, or the courier did not make a proper attempt. The first two are largely in your hands. The third needs evidence and a conversation with the courier.",
          "Look at your NDR reasons for the period. They are the direct explanation of every first attempt that failed.",
        ],
        list: [
          "COD orders shipped without confirmation",
          "Addresses with no landmark or a wrong pincode",
          "Phone numbers that are wrong or switched off",
          "No message telling the customer the parcel is arriving",
          "Long transit times, so the customer has lost interest",
          "Deliveries attempted when homes or shops are closed",
          "Attempts marked as failed without a real visit",
        ],
      },
      {
        h: "How do you improve first attempt delivery rate?",
        p: [
          "Work on the order before it ships, then on the customer's expectations while it travels. The table sets out the levers in the order an order meets them. None of them is complicated. The difficulty is doing each one for every order, every day.",
          "Change one thing at a time where you can, and watch the rate for the affected orders. That way you learn which lever matters for your customers.",
        ],
        table: {
          cols: ["Lever", "What to do", "When"],
          rows: [
            ["COD verification", "Confirm intent, amount and address with the customer", "Before dispatch"],
            ["Address quality", "Collect landmark and alternate number", "At checkout or verification"],
            ["Faster dispatch", "Ship confirmed orders by the next pickup", "Same or next working day"],
            ["Shipped message", "Send tracking link and expected delivery window", "At pickup scan"],
            ["Out-for-delivery message", "Tell the customer it arrives today, with the COD amount", "Morning of delivery"],
            ["Courier choice", "Move weak pincodes to a better performing courier", "At weekly review"],
          ],
        },
      },
      {
        h: "How should you segment first attempt delivery rate?",
        p: [
          "One overall figure hides the story. A good rate in metro prepaid orders can mask a poor one in COD orders to smaller towns. Break it down until the weak spots are obvious, then act on the worst few segments first.",
          "Keep the segments stable from week to week so you can see trends. Compare each segment with its own history, not with numbers quoted by other brands, whose mix of products and customers is different.",
        ],
        list: [
          "By payment mode: COD against prepaid",
          "By courier",
          "By state and by pincode cluster",
          "By verified against unverified COD orders",
          "By new against repeat customers",
          "By days taken from order to first attempt",
        ],
      },
      {
        h: "How does CodeCrest help improve first attempt delivery?",
        p: [
          "CodeCrest works on the levers before and during delivery. Each Shopify COD order gets a verification task in an agent's queue before it ships. Transit and out-for-delivery updates can be sent on WhatsApp from the store's own number using your templates, triggered by Shiprocket shipment status.",
          "When a first attempt does fail, a follow-up task is created the same day with the courier's reason. Analytics show RTO by state and payment mode, so you can see whether the changes are working.",
        ],
      },
    ],
    faqs: [
      ["What is a good first attempt delivery rate?", "There is no single figure that fits every store. It depends on your share of COD, the regions you ship to and your couriers. Track your own rate weekly and aim to improve it, segment by segment."],
      ["Is first attempt delivery rate the same as delivery success rate?", "No. Delivery success rate counts every shipment that was eventually delivered, on any attempt. First attempt delivery rate counts only those delivered on the first try. The gap between the two is the work your NDR process is doing."],
      ["Where do I find the data to calculate it?", "Your courier or aggregator shipment report usually includes the number of delivery attempts or the NDR history for each AWB. Export shipments for the period and count those delivered with no NDR raised."],
      ["Does prepaid improve first attempt delivery?", "Prepaid customers have already paid, so they have a stronger reason to be available and no cash to arrange. Offering prepaid at checkout or during COD verification is a common way to raise the rate, without removing COD altogether."],
      ["How often should I review this metric?", "Weekly is enough for most stores. Daily numbers swing too much to be useful, and monthly is too slow to catch a courier or pincode that has started failing. Review it alongside NDR reasons and RTO."],
    ],
    related: ["resources/how-to-reduce-rto", "features/analytics-reports", "integrations/whatsapp", "blog/ndr-reasons-and-how-to-respond"],
  },
];

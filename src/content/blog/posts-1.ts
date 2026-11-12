import type { Post } from "./types";

// COD & RTO cluster. Advice is stated as practice, not as measured results.
// Any arithmetic is illustrative and labelled as an example in the text.

export const posts1: Post[] = [
  {
    slug: "what-is-rto-in-ecommerce",
    title: "What is RTO in ecommerce? Meaning, causes and cost explained",
    metaTitle: "What Is RTO in Ecommerce? Meaning, Causes and Cost",
    description: "What is RTO in ecommerce? A plain guide to return to origin: what it means, how a parcel becomes RTO, what it costs a D2C store and how to bring it down.",
    keyword: "what is RTO in ecommerce",
    category: "COD & RTO",
    date: "2026-09-01",
    answer: "RTO in ecommerce means return to origin. It is a shipment that the courier could not deliver and sent back to the seller's warehouse. It happens when the customer refuses the parcel, cannot be reached, or gave an address the courier could not find. The seller pays shipping both ways and earns nothing from the order.",
    takeaways: [
      "RTO means return to origin: the parcel was never delivered and came back to the seller.",
      "RTO is not the same as a customer return, and the two need different fixes.",
      "COD orders return more often because the customer has paid nothing up front.",
      "One RTO costs shipping both ways plus packaging, ads and handling time.",
      "Confirming COD orders and acting on failed deliveries the same day are the two strongest levers.",
    ],
    visual: "flow",
    sections: [
      {
        h: "What does RTO mean in ecommerce?",
        p: [
          "RTO stands for return to origin. A courier picks up a parcel from your warehouse, tries to deliver it, fails, and carries it back to you. The customer never receives the product and you never receive the money. In courier panels you will see it as statuses such as RTO initiated, RTO in transit and RTO delivered, which means the parcel is back at your door.",
          "RTO is different from a normal return. In a return, the customer accepted the parcel and later sent it back. In RTO, delivery never happened at all. That difference matters because RTO is mostly an operations problem. It is decided by how well you confirm orders, capture addresses and react to failed delivery attempts, not by product quality alone.",
        ],
      },
      {
        h: "How does an order become RTO?",
        p: [
          "Every RTO passes through the same stages. The courier attempts delivery and fails. It raises a non-delivery report, usually called an NDR, with a reason. Most couriers then try again a limited number of times. If no attempt succeeds, or the customer refuses outright, the shipment is marked for return and travels back through the network to your pickup address.",
          "The window between the first failed attempt and the return decision is short, and how long it lasts depends on the courier, so check your provider's current terms. That window is your last chance to save the order. Once the parcel is marked RTO, it usually cannot be turned around.",
        ],
        list: [
          "Order is packed and handed to the courier",
          "Courier attempts delivery and fails",
          "An NDR is raised with a reason",
          "Courier re-attempts, if the reason allows it",
          "Shipment is marked RTO and moves back",
          "Parcel reaches your warehouse and needs checking",
        ],
      },
      {
        h: "RTO vs customer return: what is the difference?",
        p: [
          "Founders often mix the two because both end with stock coming back. They need different fixes, so keep them apart in your reports. If you add them together, a rise in refused COD parcels can hide behind a fall in size exchanges, and you will fix the wrong thing.",
          "A simple test: did the customer ever hold the product? If yes, it is a return and the questions are about product, sizing and expectations. If no, it is RTO and the questions are about order confirmation, address quality, courier performance and how fast your team reacts to a failed attempt.",
        ],
        table: {
          cols: ["Point", "RTO", "Customer return"],
          rows: [
            ["Was it delivered?", "No", "Yes, then sent back"],
            ["Who starts it?", "The courier, after failed attempts or refusal", "The customer, after receiving the order"],
            ["Usual causes", "Refusal, wrong address, customer unreachable", "Size, damage, product not as expected"],
            ["Where to fix it", "Verification, address capture, NDR follow-up", "Product pages, quality checks, packaging"],
            ["Money collected?", "None on COD. Prepaid needs a refund", "Yes, a refund is processed later"],
          ],
        },
      },
      {
        h: "Why is RTO higher on COD orders?",
        p: [
          "With cash on delivery, the customer has paid nothing when the parcel ships. Changing their mind costs them nothing. They may have ordered on impulse, found the product cheaper elsewhere, ordered the same thing from two stores, or simply not have cash at home when the courier arrives. Refusing at the door is the easiest way out.",
          "Prepaid customers have already committed money, so they tend to be available and to accept the parcel. That is why most Indian D2C brands track RTO separately for COD and prepaid. A single blended number hides the gap. It also explains why confirming COD orders before dispatch is the most common first step in any RTO plan.",
        ],
      },
      {
        h: "What does one RTO order cost a store?",
        p: [
          "The loss is larger than the forward shipping charge. You pay to send the parcel, and most couriers also charge for the return leg. You have paid for packaging, for the ad that brought the customer, and for the staff time to pack, receive and inspect. The stock was also unavailable to sell while it travelled both ways.",
          "Here is an example with made-up numbers. Say forward shipping is Rs 70, return shipping is Rs 60 and packaging is Rs 20. One RTO costs Rs 150 before you count ads or damage. If 100 of 1,000 monthly orders come back, that is Rs 15,000 a month for nothing. Put your own figures into an RTO loss calculator to see your real number.",
        ],
        list: [
          "Forward shipping charge",
          "Return shipping charge",
          "Packaging and inserts",
          "Marketing spend on that order",
          "Handling time at dispatch and at return",
          "Damaged or unsellable stock",
          "Working capital locked while the parcel is in transit",
        ],
      },
      {
        h: "How do you reduce RTO?",
        p: [
          "Work in two places. Before dispatch, stop orders that were never going to be accepted. During delivery, rescue orders that failed for a fixable reason. Most stores start with the first because it is cheaper: an order cancelled before it ships costs nothing in freight. An order returned after two attempts costs freight both ways.",
          "Then make it a routine with an owner. Someone confirms COD orders every day. Someone works the list of failed deliveries every day. Someone looks at RTO by state and payment mode every week and decides what to change. Without named owners these jobs get done only when the numbers look bad.",
        ],
        list: [
          "Confirm every COD order by WhatsApp or call before it ships",
          "Ask for a landmark and an alternate phone number",
          "Offer prepaid during confirmation",
          "Send shipped and out-for-delivery messages",
          "Contact the customer the same day a delivery fails",
          "Review RTO weekly by state, courier and payment mode",
        ],
      },
      {
        h: "How CodeCrest helps with RTO",
        p: [
          "CodeCrest is an operations platform for Indian D2C teams on Shopify. It syncs your Shopify orders and creates a verification task for each COD order before it ships. Shipment status comes in from Shiprocket, and a failed delivery attempt becomes a follow-up task for an agent while a re-attempt is still possible.",
          "Agents call or send WhatsApp messages from the task, and every contact is logged on the customer record. Reports show RTO by state and payment mode so you can see where returns come from. There is no self-serve signup. The CodeCrest team onboards each store and sets up the queues with you.",
        ],
      },
    ],
    faqs: [
      ["What is the full form of RTO in courier tracking?", "RTO stands for return to origin. In tracking it means the courier has stopped trying to deliver the parcel and is sending it back to the seller's pickup address. You may see stages such as RTO initiated, RTO in transit and RTO delivered."],
      ["Is RTO the same as RTS?", "They are used for the same thing. RTS means return to shipper or return to seller, and some couriers and marketplaces prefer that term. Both describe an undelivered parcel travelling back to the business that shipped it."],
      ["Who pays for RTO shipping?", "The seller does in almost every arrangement. Most couriers and aggregators charge for the forward journey and also for the return journey, though the return rate can differ. Check your current rate card, because charges vary by provider, weight and zone."],
      ["Can a prepaid order become RTO?", "Yes. A prepaid parcel still returns if the address is wrong or nobody is available to receive it. It happens less often than with COD, and you will also need to refund or reship, so prepaid orders with unclear addresses are worth a quick check."],
      ["Can an RTO shipment be stopped once it starts?", "Usually not. Once a courier marks a shipment as RTO, it normally continues back to origin. The time to act is earlier, between the first failed attempt and the return decision. Rules differ by courier, so confirm with your shipping provider."],
    ],
    related: ["resources/how-to-reduce-rto", "tools/rto-loss-calculator", "features/shipping-rto-management", "blog/reasons-for-rto"],
  },
  {
    slug: "reasons-for-rto",
    title: "Reasons for RTO in ecommerce: the real causes and the fix for each",
    metaTitle: "Reasons for RTO in Ecommerce and How to Fix Each",
    description: "The main reasons for RTO in ecommerce, grouped by customer, address, courier and store causes, with a practical fix for each and a way to find your own.",
    keyword: "reasons for RTO in ecommerce",
    category: "COD & RTO",
    date: "2026-09-08",
    answer: "The main reasons for RTO in ecommerce are customer refusal at the door, the customer being unavailable or unreachable, incomplete or wrong addresses, cash not being ready for a COD order, slow delivery, fake or duplicate orders, and courier attempts that were never properly made. Most trace back to unconfirmed COD orders and poor address capture.",
    takeaways: [
      "Most RTO reasons fall into four groups: customer, address, courier and store.",
      "Refusal at the door is usually a change of mind that a confirmation step would have caught.",
      "Courier reason codes are a first sort, not the full truth.",
      "Slow dispatch and unrestricted COD are store-side causes you control directly.",
      "Count your own returns by reason, region and payment mode before choosing a fix.",
    ],
    visual: "board",
    sections: [
      {
        h: "What are the main reasons for RTO?",
        p: [
          "Almost every returned parcel fits one of four groups: the customer changed their mind, the courier could not find or reach the customer, the courier did not do its job properly, or the store made the order hard to deliver. Sorting your returns into these groups is more useful than a long list, because each group has a different owner and a different fix.",
          "The reason codes in your courier panel are the starting point, not the full truth. A code such as customer unavailable can cover a customer who was at work, a wrong phone number, or a delivery agent who never called. Treat the codes as a first sort, then confirm the real cause by speaking to a sample of customers.",
        ],
        list: [
          "Customer refused the parcel",
          "Customer not available or not reachable",
          "Address incomplete, wrong or not found",
          "Cash not ready for a COD order",
          "Delivery took too long",
          "Fake, test or duplicate order",
          "Area not serviceable or attempt not genuinely made",
        ],
      },
      {
        h: "Why do customers refuse COD parcels at the door?",
        p: [
          "Refusal is usually a change of mind that happened days earlier. The customer ordered on impulse, found a lower price, got the product from a local shop, or ordered from two stores and took whichever arrived first. With COD there is no cost to saying no, so the decision shows up only when the courier is standing at the door.",
          "Some refusals have a practical cause. The person who ordered is not home and the family member will not pay. The customer expected to open the box before paying. The amount at the door differs from what they remember. A confirmation message that restates the product, the amount payable and the expected delivery day removes most of these surprises.",
        ],
      },
      {
        h: "How do bad addresses and phone numbers cause RTO?",
        p: [
          "Indian addresses are often written from memory, with no house number, no street name and a pincode that belongs to the next locality. Delivery agents depend on a phone call to find the place. If the address is thin and the phone goes unanswered, the attempt fails even though the customer wants the order.",
          "Fix this at checkout and again at confirmation. Make the pincode, city and state consistent. Ask for a landmark. Collect an alternate number. During the confirmation call, read the address back and ask how a delivery person would find the house. Two extra lines of address detail are cheaper than a parcel that travels across the country twice.",
        ],
      },
      {
        h: "Which RTO reasons come from the courier?",
        p: [
          "Not every failure is the customer's fault. A delivery agent with too many parcels may mark an attempt without visiting. A shipment may be routed to a hub that does not serve the pincode well. Parcels can sit in transit so long that the customer loses interest. These show up as the same reason codes as genuine failures.",
          "You find courier-side problems by comparison. Look at the same pincodes across different couriers, and ask customers on NDR calls whether anyone actually came or phoned. If customers keep saying nobody contacted them, raise it with your courier or aggregator with the shipment numbers as evidence. Escalation processes vary, so check your provider's current support terms.",
        ],
      },
      {
        h: "Which RTO reasons are caused by the store itself?",
        p: [
          "Stores add to their own RTO in quiet ways. Slow dispatch is the most common: an order packed several days late reaches a customer whose interest has cooled. Unclear product pages, surprise COD fees and missing delivery estimates all create a gap between what the customer expected and what arrives at the door.",
          "Marketing choices matter too. Campaigns that push urgency to cold audiences can bring many low-intent COD orders. Offering COD everywhere, at any order value, to any customer, invites orders that were never serious. None of this means stopping COD. It means deciding where COD needs a confirmation step, an advance, or a limit.",
        ],
        list: [
          "Dispatch that takes several days",
          "No order confirmation message",
          "No shipped or out-for-delivery update",
          "COD open to every pincode and order value",
          "No check for repeat refusers",
          "Product page that oversells",
        ],
      },
      {
        h: "How do you find your own top RTO reasons?",
        p: [
          "Pull the last few weeks of returned orders into a sheet. Add the courier reason, payment mode, state, pincode, order value, days from order to dispatch, and whether the order was confirmed. Then count. The pattern is usually clear within an hour: a few reasons and a few regions make up most of the loss.",
          "Use the table below to turn each reason into a signal you can check and a first fix to try. Change one thing at a time where you can, and compare the next few weeks against your own past numbers rather than someone else's benchmark. Your category and price point make your store its own baseline.",
        ],
        table: {
          cols: ["Reason", "Signal to check", "First fix"],
          rows: [
            ["Customer refused", "Order was never confirmed", "Confirm COD orders before dispatch"],
            ["Customer unavailable", "No delivery-day message was sent", "Send out-for-delivery updates, agree a time"],
            ["Address not found", "No landmark or alternate number", "Capture a landmark, read the address back"],
            ["Cash not ready", "High-value COD order", "Restate the amount, offer prepaid"],
            ["Delivery too slow", "Long gap from order to dispatch", "Ship faster, tell customers the estimate"],
            ["No genuine attempt", "Customers say nobody called", "Escalate to the courier with shipment numbers"],
          ],
        },
      },
      {
        h: "How CodeCrest helps you act on RTO reasons",
        p: [
          "CodeCrest gives each of these fixes a queue. Shopify orders sync in, and every COD order gets a verification task so intent and address are confirmed before dispatch. Agents work from a script, call through connected telephony or send a WhatsApp template from the store's own number, and close the task with an outcome.",
          "Shipment status arrives from Shiprocket. A failed delivery creates a follow-up task with the courier's reason attached, so the agent knows what to ask. Reports break RTO down by state and payment mode. CodeCrest is set up for each store by the CodeCrest team. There is no self-serve signup.",
        ],
      },
    ],
    faqs: [
      ["What is the most common reason for RTO in India?", "For COD-heavy stores it is usually the customer refusing or not being available, both of which often trace back to an order nobody confirmed. Your own mix may differ, so count your courier reason codes over a few weeks before deciding."],
      ["Does offering COD always increase RTO?", "COD orders are easier for a customer to walk away from, so they return more often than prepaid orders. That does not mean COD is bad. It brings buyers who will not pay online. The aim is to confirm and filter COD orders, not remove them."],
      ["Can slow shipping really cause returns?", "Yes. The longer a COD parcel takes, the more time the customer has to lose interest, buy elsewhere or forget the order. Fast dispatch and a clear delivery estimate keep the purchase fresh in the customer's mind."],
      ["How do I know if the courier faked a delivery attempt?", "Ask the customer during the NDR follow-up whether anyone visited or called. If several customers on the same route say no, collect the shipment numbers and raise it with your courier or aggregator. Comparing couriers on the same pincodes also helps."],
      ["Should I block customers who refused before?", "Blocking is a blunt tool. A better approach is to flag past refusers and require a confirmed call, an advance payment or prepaid for their next COD order. That protects you without turning away someone who had a genuine reason last time."],
    ],
    related: ["blog/what-is-rto-in-ecommerce", "resources/ndr-management-guide", "features/shipping-rto-management", "solutions/cod-heavy-stores"],
  },
  {
    slug: "how-to-calculate-rto-rate",
    title: "RTO rate formula: how to calculate RTO rate correctly",
    metaTitle: "RTO Rate Formula: How to Calculate RTO Rate",
    description: "The RTO rate formula explained with a worked example: which orders to count, how to handle parcels still in transit, and how to segment by COD and state.",
    keyword: "RTO rate formula",
    category: "COD & RTO",
    date: "2026-09-16",
    answer: "The RTO rate formula is: RTO rate = (number of shipments returned to origin / number of shipments dispatched) x 100, measured for the same group of orders. Count by dispatch date, not return date, and wait until most of those shipments have reached a final status. Calculate it separately for COD and prepaid orders.",
    takeaways: [
      "RTO rate equals shipments returned to origin divided by shipments dispatched, times 100.",
      "Group orders by dispatch date so both parts of the formula describe the same parcels.",
      "Wait for final statuses, or label the figure as provisional.",
      "Always report COD and prepaid separately.",
      "Compare against your own past numbers, not another store's.",
    ],
    visual: "chart",
    sections: [
      {
        h: "What is the RTO rate formula?",
        p: [
          "RTO rate is the share of dispatched shipments that came back undelivered. Written out: RTO rate = (shipments returned to origin / shipments dispatched) x 100. The result is a percentage. Both numbers must describe the same set of orders, for example every order dispatched in the first week of the month.",
          "Here is an example with made-up numbers. You dispatched 1,000 orders in a week. After all of them reached a final status, 880 were delivered and 120 came back. RTO rate = 120 / 1,000 x 100 = 12. So the RTO rate for that week's dispatches is 12 percent. The formula is simple. Choosing the right orders to count is the hard part.",
        ],
      },
      {
        h: "Which orders should you count in the formula?",
        p: [
          "The denominator is shipments that actually left your warehouse. Orders cancelled before dispatch were never at risk of RTO, so leave them out. If you include them, your rate looks better than it is. Count shipments, not order value, unless you are deliberately measuring rupees lost. Both views are useful, but do not mix them in one figure.",
          "The numerator is shipments marked as returned to origin, whatever the reason. Do not include customer returns, where the parcel was delivered and later sent back. Those belong in a separate return rate. Also decide how to treat lost and damaged shipments. Most teams track them on their own line so the RTO figure stays clean.",
        ],
        list: [
          "Include: every shipment handed to the courier in the period",
          "Include in RTO: shipments marked RTO for any reason",
          "Exclude: orders cancelled before dispatch",
          "Exclude: delivered orders that the customer later returned",
          "Track separately: lost or damaged in transit",
          "Hold back: shipments that have no final status yet",
        ],
      },
      {
        h: "How do you calculate RTO rate step by step?",
        p: [
          "Group orders by dispatch date. This is called a cohort. A parcel dispatched on the last day of the month may not come back until well into the next one. If you divide this month's returns by this month's dispatches, you compare two different sets of orders, and the rate swings whenever order volume rises or falls.",
          "Then wait. A cohort is ready when nearly all of its shipments are delivered or returned. How long that takes depends on your couriers and the regions you ship to, so look at your own data to pick a cut-off. Until then, report the figure as provisional and show how many shipments are still open.",
        ],
        list: [
          "Pick a dispatch period, such as one week",
          "List every shipment dispatched in that period",
          "Wait until almost all have a final status",
          "Count the shipments marked RTO",
          "Divide by total dispatched and multiply by 100",
          "Repeat for COD and prepaid separately",
        ],
      },
      {
        h: "What mistakes make the RTO rate wrong?",
        p: [
          "Most wrong RTO numbers come from a small set of habits. They are easy to fall into because courier panels and spreadsheets show data by event date, not by cohort. The table below lists the usual ones, what they do to your figure, and how to correct them. Check your current report against each row.",
          "The worst mistake is a blended number. Suppose, as an example, COD orders return far more often than prepaid orders in your store. If the prepaid share grows one month, the blended rate falls even though nothing got better for COD. You would celebrate a change in payment mix, not an improvement in operations.",
        ],
        table: {
          cols: ["Mistake", "What it does", "Fix"],
          rows: [
            ["Dividing by orders placed", "Makes the rate look lower", "Divide by shipments dispatched"],
            ["Using return date for the period", "Rate swings with order volume", "Group by dispatch date"],
            ["Counting too early", "Misses returns still in transit", "Wait for final status, mark as provisional"],
            ["Mixing in customer returns", "Inflates RTO and hides the cause", "Keep a separate return rate"],
            ["One blended number", "Hides the COD and prepaid gap", "Report each payment mode separately"],
          ],
        },
      },
      {
        h: "How should you segment RTO rate?",
        p: [
          "A single store-wide rate tells you whether there is a problem. Segments tell you where it is. Start with payment mode, because COD and prepaid behave so differently. Then cut by state or pincode, by courier, and by whether the order was confirmed before dispatch. That last cut shows whether your verification effort is paying off.",
          "Keep segments large enough to trust. A pincode with four shipments and two returns is not a pattern, it is a coincidence. Combine small pincodes into districts or states until each group has enough shipments to compare month on month. Where a segment looks bad, read the actual orders before changing a rule.",
        ],
        list: [
          "Payment mode: COD versus prepaid",
          "State, district or pincode",
          "Courier partner",
          "Verified versus unverified orders",
          "New versus repeat customers",
          "Order value band",
          "Product or category",
        ],
      },
      {
        h: "How often should you review RTO rate?",
        p: [
          "Weekly works for most D2C teams. Review the newest cohort that has closed, plus a provisional view of the one still open. A monthly review is too slow to catch a courier problem or a bad campaign, and a daily figure is too noisy to act on unless your volume is very large.",
          "Compare against your own history, not an industry figure. RTO depends on category, price point, COD share and where your customers live, so another store's number says little about yours. What matters is the direction of your own rate in each segment and whether a change you made last month moved it.",
        ],
      },
      {
        h: "How CodeCrest reports RTO rate",
        p: [
          "CodeCrest calculates RTO from the same order and shipment records your team works on. Orders sync from Shopify and shipment status from Shiprocket, so there is no manual sheet to maintain. The analytics view shows RTO rate with breakdowns by state and payment mode, and reports can be filtered by date and exported to Excel or PDF.",
          "Because COD verification is recorded as a task outcome, the verification rate sits alongside the RTO figures. If you want a quick estimate before any setup, the RTO loss calculator on this site turns your rate and shipping costs into a monthly rupee figure. Stores are onboarded by the CodeCrest team.",
        ],
      },
    ],
    faqs: [
      ["Should cancelled orders be included in RTO rate?", "No. Orders cancelled before dispatch never reached a courier, so they cannot return to origin. Including them makes the rate look lower than it is. Track pre-dispatch cancellations as their own figure, since they also tell you about order quality."],
      ["Is RTO rate calculated on orders or on revenue?", "The standard formula counts shipments. You can also calculate a value-based version using the rupee value of returned shipments over dispatched value, which is useful when high-value orders return more often. Label clearly which one a report shows."],
      ["What is a good RTO rate?", "There is no single figure that fits every store. It varies with category, price point, share of COD and delivery regions. Use your own trend as the benchmark and look at COD and prepaid separately, because the two behave very differently."],
      ["How is RTO rate different from return rate?", "RTO rate counts parcels that were never delivered and came back. Return rate counts parcels that were delivered and then sent back by the customer. They have different causes and different fixes, so they should be reported as two separate numbers."],
      ["Can I calculate RTO rate in a spreadsheet?", "Yes. Export shipments with dispatch date, final status, payment mode and state. Filter to one dispatch period, count the rows marked RTO, and divide by the total rows. A pivot table by payment mode and state gives you the segments."],
    ],
    related: ["tools/rto-loss-calculator", "features/analytics-reports", "blog/what-is-rto-in-ecommerce", "resources/how-to-reduce-rto"],
  },
  {
    slug: "cod-confirmation-call-script",
    title: "COD confirmation call script: what to say, line by line",
    metaTitle: "COD Confirmation Call Script for Ecommerce Teams",
    description: "A ready COD confirmation call script for ecommerce teams, with lines for the opening, address check, prepaid offer, common objections and call outcomes.",
    keyword: "COD confirmation call script",
    category: "COD & RTO",
    date: "2026-09-23",
    answer: "A COD confirmation call script has five parts: greet the customer by name and say which store is calling, restate the product and the amount payable, read the address back and ask for a landmark, give the expected delivery day, and close by confirming the order. Keep it under a minute and record one outcome for every call.",
    takeaways: [
      "A COD confirmation call script confirms four things: intent, items, amount and address.",
      "Keep the call under a minute and sound like a store that is helping.",
      "A cancellation on the call is a better result than a refusal at the door.",
      "Set a fixed retry rule for customers who do not answer.",
      "End every call with one outcome from a short fixed list.",
    ],
    visual: "people",
    sections: [
      {
        h: "What should a COD confirmation call script include?",
        p: [
          "A confirmation call has one job: find out whether this parcel will be accepted at this address. Everything in the script serves that. The agent confirms that the person placed the order, what they ordered, how much they will pay in cash, and exactly where the courier should go. Anything else makes the call longer and less likely to be completed.",
          "Keep the tone of a store calling to help, not a bank calling to verify. Customers who feel questioned become defensive. Customers who feel looked after tend to share a landmark, mention that they will be away on Friday, or admit they no longer want the order. All three answers save you a wasted shipment.",
        ],
        list: [
          "Who is calling and why",
          "Product and quantity",
          "Amount to be paid in cash",
          "Full address with a landmark",
          "Expected delivery day",
          "A clear yes or no from the customer",
        ],
      },
      {
        h: "What is a good COD confirmation call script?",
        p: [
          "Use the lines below as a base and translate them into the language your customers speak. Agents should sound natural, so let them adjust the wording while keeping the order of the steps. The bracketed parts are filled in from the order. Print it, or keep it on screen beside the order.",
          "Notice what the script leaves out. There is no long introduction, no upsell and no survey. The prepaid offer is one sentence and the agent moves on if the customer is not interested. If the customer has a question about the product, answer it. A question is a good sign: it means they still intend to receive the order.",
        ],
        list: [
          "Opening: 'Hello, am I speaking with [name]? This is [agent] from [store]. I am calling about the order you placed today.'",
          "Order: 'You ordered [product] and the amount to pay on delivery is Rs [amount]. Is that correct?'",
          "Address: 'I have the address as [address]. Is there a landmark nearby that will help the delivery person?'",
          "Phone: 'Is this the best number for the courier to call, or is there a second number?'",
          "Prepaid: 'If you would like to pay online now, I can send you a link. Otherwise cash on delivery is fine.'",
          "Delivery: 'You can expect it around [day]. Will someone be available to receive it?'",
          "Close: 'Thank you. Your order is confirmed and you will get a message when it ships.'",
        ],
      },
      {
        h: "How should agents handle common customer replies?",
        p: [
          "Most calls go to plan. The rest fall into a handful of replies, and agents should have a response ready for each so they do not improvise under pressure. The goal is never to argue a customer into keeping an order. A cancellation on the phone is a good result compared with a refusal at the door.",
          "Train agents to listen for soft signals too. A customer who says they will see when it comes, or who cannot remember ordering, is at high risk of refusing. Ask one direct question: do you want us to send it? If the answer is unclear, record it as not confirmed and follow your rule for those orders.",
        ],
        table: {
          cols: ["Customer says", "Agent response", "Outcome to record"],
          rows: [
            ["I did not place this order", "Apologise, confirm the number, cancel", "Cancelled"],
            ["I want to change the address", "Take the full new address and landmark", "Confirmed with changes"],
            ["I will be out of town", "Ask who can receive it or agree a later dispatch", "Confirmed with changes"],
            ["Can I open it before paying?", "Explain your policy plainly", "Confirmed or cancelled"],
            ["I found it cheaper elsewhere", "Do not argue, offer to cancel", "Cancelled"],
            ["Call me later", "Ask for a time and schedule the call", "Callback requested"],
          ],
        },
      },
      {
        h: "What should agents do when the customer does not answer?",
        p: [
          "Decide the rule before the calls start. A common pattern is a WhatsApp message first with the order summary and a request to reply, then a call to those who did not reply, then one or two more attempts at different times of day. After the final attempt the order is either held, shipped at your risk, or cancelled.",
          "Whatever you choose, apply it the same way every day. Tell the customer what will happen: a short message saying you tried to reach them and the order will be cancelled unless they reply is fair and often gets a response. Record every attempt so a manager can see that the rule was followed.",
        ],
      },
      {
        h: "When is the best time to make COD confirmation calls?",
        p: [
          "Call soon after the order is placed. The purchase is fresh, the customer remembers the product, and the parcel has not been packed yet, so a change or cancellation costs nothing. Orders placed late at night can be called the next morning. Waiting until after dispatch defeats the purpose. Speed matters more than a perfect script.",
          "For retries, change the time of day. Someone who did not pick up during office hours may answer in the evening. Respect normal calling hours and stop when a customer asks you to. Your own answer rates by hour are the best guide, so look at when your calls connect and schedule the team around that.",
        ],
      },
      {
        h: "Which call outcomes should you record?",
        p: [
          "Every call should end with exactly one outcome chosen from a short fixed list. Free-text notes are useful as detail, but they cannot be counted. With fixed outcomes you can see how many orders were confirmed, how many were cancelled before dispatch, and how many could not be reached, per day and per agent.",
          "These counts also show whether the calls are worth it. Compare the RTO of confirmed orders with the RTO of orders shipped without confirmation over the same period. If confirmed orders return far less often, the process is paying for itself. If not, review call recordings and the script. Listen for rushed address checks first.",
        ],
        list: [
          "Confirmed",
          "Confirmed with changes",
          "Converted to prepaid",
          "Cancelled by customer",
          "Callback requested",
          "Not reachable",
        ],
      },
      {
        h: "How CodeCrest supports COD confirmation calls",
        p: [
          "CodeCrest creates a verification task for each COD order that syncs from Shopify, so agents open a queue instead of a spreadsheet. With Exotel or Twilio connected, they call in one click from the task, and the call is logged on the customer's timeline with its duration and outcome. Recordings are available to roles allowed to hear them.",
          "The first confirmation message can go out on WhatsApp from the store's own linked number using a template. Agents close each task with an outcome, and overdue tasks escalate to a manager. Those outcomes feed the reports without anyone compiling a sheet. CodeCrest onboards each team directly. There is no self-serve signup.",
        ],
      },
    ],
    faqs: [
      ["How long should a COD confirmation call take?", "Under a minute for a straightforward order. The agent confirms the order, amount and address, mentions the delivery day and closes. Calls run longer only when the customer has a product question or needs to change the address."],
      ["Should the script be in English or a regional language?", "Use the language the customer is comfortable in. Many teams keep the script in English and Hindi and let agents switch to a regional language where they can. A customer who understands the call clearly is far more likely to give a real answer."],
      ["Can a WhatsApp message replace the confirmation call?", "For many orders, yes. A message with the order summary and a reply option confirms the easy ones. Calls are still worth making for customers who do not reply, for high-value orders and for customers who have refused a parcel before."],
      ["Should agents push customers to pay online?", "No. Mention the prepaid option once and move on. Pressure makes customers suspicious and can lose the order altogether. A small, clearly stated benefit for paying online works better than repeating the request."],
      ["What if the customer wants to cancel on the call?", "Cancel it politely and thank them. You have just avoided paying shipping both ways on a parcel that would have been refused. Record the reason if they give one, because repeated reasons point to a fix on your product page or checkout."],
    ],
    related: ["resources/cod-order-verification-guide", "features/cloud-telephony", "features/task-engine", "solutions/cod-heavy-stores"],
  },
  {
    slug: "convert-cod-to-prepaid",
    title: "How to convert COD to prepaid orders without losing sales",
    metaTitle: "How to Convert COD to Prepaid Orders",
    description: "How to convert COD to prepaid: where to make the offer, which incentives work, what to say on WhatsApp and calls, and how to measure the result honestly.",
    keyword: "how to convert COD to prepaid",
    category: "COD & RTO",
    date: "2026-10-01",
    answer: "To convert COD to prepaid, make paying online the easier and slightly better choice at three moments: at checkout, right after the order is placed, and during the confirmation call. Offer a small clear benefit, send a payment link the customer can use in one tap, and keep COD available for those who decline.",
    takeaways: [
      "Offer prepaid at checkout, right after the order and on the confirmation call.",
      "Use one small, clearly stated benefit for paying online.",
      "Keep COD available, because forcing prepaid loses customers who do not yet trust the brand.",
      "Make sure a converted order is updated everywhere before the label is printed.",
      "Judge the result on total orders and RTO together, not conversion alone.",
    ],
    visual: "chat",
    sections: [
      {
        h: "Why convert COD orders to prepaid?",
        p: [
          "A prepaid order is a committed order. The customer has already paid, so they are more likely to be available and to accept the parcel. You also receive the money through your payment gateway instead of waiting for the courier's COD remittance cycle. For a store with tight working capital, that timing difference matters as much as the lower return risk.",
          "The aim is not to remove COD. Many Indian shoppers do not trust a new brand enough to pay first, and some simply prefer cash. Forcing prepaid can cost you those orders. The aim is to move the customers who are willing, and to learn which ones are not, so you can confirm their orders more carefully.",
        ],
      },
      {
        h: "Where can you convert COD to prepaid?",
        p: [
          "There are three moments when a customer will consider switching. Each needs a different approach. At checkout the customer is choosing. After the order they are waiting. On the confirmation call they are talking to a person and can ask questions. Most stores use only the first and miss the other two.",
          "The period just after ordering is often the most productive. The customer has decided to buy and the parcel has not shipped. A message that says the order is received and offers a quick online payment option gives them an easy step. Once the order is dispatched, switching becomes messy, so close the offer when the parcel is packed.",
        ],
        table: {
          cols: ["Moment", "How to offer", "Watch out for"],
          rows: [
            ["Checkout", "Show the prepaid benefit beside the payment options", "Hidden COD fees that feel like a trick"],
            ["Order confirmation message", "Order summary plus a payment link", "Links that expire too soon or look unofficial"],
            ["Confirmation call", "One sentence, link sent while on the call", "Agents pushing after a no"],
            ["Reminder before dispatch", "Short final offer for high-value orders", "Sending after the parcel has shipped"],
          ],
        },
      },
      {
        h: "Which incentives make customers pay online?",
        p: [
          "The incentive must be easy to understand in one line. A small discount for paying online is the most common. A COD handling fee does the same job from the other direction, but state it openly at checkout so nobody feels cheated at the door. Faster dispatch for prepaid orders is a benefit that costs you little.",
          "Work out what you can afford before choosing. As an example, if an RTO costs you Rs 150 in shipping and packaging and a prepaid discount costs Rs 30, the discount pays for itself only if it prevents enough returns. Run your own numbers through a COD versus prepaid calculator, then test one incentive at a time.",
        ],
        list: [
          "A small discount for paying online",
          "A clearly stated COD handling fee",
          "Priority dispatch for prepaid orders",
          "A free small add-on with prepaid orders",
          "Store credit on the next order",
          "Easier returns or exchanges for prepaid orders",
        ],
      },
      {
        h: "What should the WhatsApp message and call say?",
        p: [
          "Write the message the way a person from the store would. Name the product, state the amount, and give one link. Do not send three messages in a row. If your WhatsApp setup requires approved templates or has rules on promotional content, follow them. These policies change, so check the current WhatsApp business messaging guidelines.",
          "On a call, the offer is one sentence inside the normal confirmation script. The agent sends the link while still on the line and stays to help if the payment fails. If the customer says no, the agent confirms the COD order warmly and moves on. A customer who feels pressured may cancel altogether.",
        ],
        list: [
          "Message opener: 'Hi [name], thanks for your order of [product] from [store].'",
          "Message offer: 'Pay Rs [amount] online now and get [benefit]. Here is your secure link: [link].'",
          "Message close: 'Prefer cash on delivery? No problem, reply YES to confirm your order.'",
          "Call line: 'If you would like to pay online, I can send a link now and you get [benefit].'",
          "If payment fails: 'No worries, we will keep it as cash on delivery. Your order is confirmed.'",
        ],
      },
      {
        h: "What mistakes hurt COD to prepaid conversion?",
        p: [
          "The biggest mistake is making COD feel like a punishment. Surprise fees, repeated calls and guilt-heavy messages damage trust in a brand the customer is still deciding about. The second is a broken payment experience. If the link opens slowly, asks for too many details or fails on UPI, the customer gives up and you have added friction for nothing.",
          "Operational gaps cause trouble too. If a customer pays online but the order still ships as COD, the courier will ask for cash and the customer will be angry. Make sure a converted order is updated in Shopify and with your shipping platform before the label is printed. Assign one person to check converted orders daily until the process is reliable.",
        ],
      },
      {
        h: "How do you measure whether it is working?",
        p: [
          "Track three numbers by week: the share of COD orders that were offered prepaid, the share that converted, and what happened to total orders. The third matters most. If conversions rise but total orders fall, your incentive or your COD fee is scaring customers away at checkout. Look at all three together, never one alone.",
          "Then compare outcomes. Look at the RTO rate of converted orders against orders that stayed COD, and subtract what the incentive cost you. Be honest about selection: customers who agree to pay were probably more serious to begin with, so not all of the difference is caused by the switch. Even so, the money arrives sooner.",
        ],
      },
      {
        h: "How CodeCrest helps convert COD to prepaid",
        p: [
          "CodeCrest puts the prepaid offer inside the confirmation step. COD orders from Shopify land in a verification queue, and agents can send a WhatsApp template from the store's own linked number or call through connected telephony from the same task. Your template can carry the payment link your store already uses.",
          "Each task closes with a recorded outcome, so the results of these conversations can be counted without a separate sheet, and every message and call sits on the customer's timeline. CodeCrest does not process payments. It organises the follow-up around them. Teams are onboarded by CodeCrest, with no self-serve signup.",
        ],
      },
    ],
    faqs: [
      ["Should I remove COD completely to cut RTO?", "Rarely. Many shoppers will not pay a new brand in advance, so removing COD usually cuts orders along with returns. Restricting COD by pincode, order value or customer history, and converting willing customers to prepaid, is a safer path."],
      ["How much discount should I give for prepaid orders?", "There is no universal amount. It depends on your margin and on what an RTO costs you. Start small, measure the effect on both conversion and total orders for a few weeks, and adjust. The benefit should be cheaper than the returns it prevents."],
      ["Is a COD fee better than a prepaid discount?", "They push in the same direction. A discount feels like a reward and a fee feels like a cost, so customers may react differently. Whichever you choose, show it clearly at checkout. A fee the customer discovers late causes refusals."],
      ["Can I convert a COD order to prepaid after it has shipped?", "It is possible with some couriers and payment tools but it is easy to get wrong, because the courier may still try to collect cash. Check what your shipping provider supports. For most stores it is simpler to close the offer at dispatch."],
      ["Do prepaid orders ever get returned to origin?", "Yes, when the address is wrong or nobody is home. It happens less often than with COD, but you also have to refund or reship. Keep sending delivery updates to prepaid customers and check any address that looks incomplete."],
    ],
    related: ["tools/cod-vs-prepaid-calculator", "features/whatsapp-automation", "resources/cod-order-verification-guide", "blog/partial-cod-advance-payment"],
  },
  {
    slug: "how-to-stop-fake-cod-orders",
    title: "How to stop fake COD orders before they ship",
    metaTitle: "How to Stop Fake COD Orders on Your Store",
    description: "How to stop fake COD orders: the warning signs to look for, checkout and verification controls that filter them, and what to do with repeat offenders.",
    keyword: "how to stop fake COD orders",
    category: "COD & RTO",
    date: "2026-10-08",
    answer: "To stop fake COD orders, filter them before dispatch. Verify the phone number, confirm every COD order by WhatsApp or call, flag signs such as gibberish addresses, duplicate orders and past refusals, and limit COD for high-risk orders by value, pincode or customer history. Cancel any order that cannot be confirmed after a set number of attempts.",
    takeaways: [
      "Fake COD orders can only be stopped between order placement and dispatch.",
      "Warning signs are reasons to look closer, not proof.",
      "Phone verification and COD limits at checkout remove the easiest fakes.",
      "Cancel orders that cannot be confirmed instead of shipping them in hope.",
      "Flag repeat refusers for a stricter path, and clear the flag when they pay.",
    ],
    visual: "orders",
    sections: [
      {
        h: "What is a fake COD order?",
        p: [
          "A fake COD order is one placed with no intention of accepting and paying for the parcel. Some are deliberate: a prank, a competitor, a bot, or someone using another person's address. Many are careless: a child playing with a phone, a customer testing the checkout, or a shopper who places the same order on several sites and keeps the first to arrive.",
          "The intent differs but the cost is the same. You pack the order, pay to ship it, pay to bring it back and tie up stock for the round trip. Because COD asks for nothing up front, the only protection is a check between the order being placed and the parcel leaving your warehouse.",
        ],
      },
      {
        h: "What are the warning signs of a fake COD order?",
        p: [
          "Fake orders rarely look perfect. They carry small signs that a trained eye, or a simple rule, can catch. No single sign proves anything. A real customer can have a short address or order late at night. Treat signs as reasons to look closer, and let several signs together move an order into a stricter check.",
          "Build the list from your own history. Open the orders that came back refused or unreachable over the last month and note what they had in common. Patterns specific to your store, such as a product that attracts prank orders or a campaign that brought many of them, are more useful than any generic checklist.",
        ],
        list: [
          "Name or address that is gibberish or a single word",
          "Phone number that is invalid, switched off or belongs to someone else",
          "Several orders from one number or address in a short time",
          "Pincode that does not match the city or state",
          "Unusually high order value for a first-time COD buyer",
          "Customer who has refused or been unreachable before",
          "Same cart placed twice within minutes",
        ],
      },
      {
        h: "Which checkout controls reduce fake COD orders?",
        p: [
          "The cheapest place to stop a fake order is the checkout. A one-time password sent to the phone number proves the number exists and is in the customer's hand. Clear address fields with a pincode check reduce junk entries. These steps add a little friction, so watch your checkout completion when you turn them on.",
          "You can also decide who sees COD at all. Many Shopify stores use apps or checkout rules to hide COD above a certain order value, for certain pincodes, or for certain products. What is possible depends on your Shopify plan and the apps you use, so check the current Shopify documentation before you design the rules.",
        ],
        list: [
          "Phone verification by one-time password",
          "Structured address fields with pincode validation",
          "A maximum order value for COD",
          "COD hidden for pincodes with repeated problems",
          "A small advance payment on risky orders",
          "A limit on open COD orders per phone number",
        ],
      },
      {
        h: "How do you verify a suspicious COD order?",
        p: [
          "Verification is the control that catches what checkout rules miss. Send a WhatsApp message with the order summary and ask for a reply. Call those who do not respond. On the call, ask the customer to confirm the product, the amount and the address. A person who placed a real order answers these easily. A fake order usually fails at the first question.",
          "Set a rule for silence. If nobody answers after your chosen number of attempts across different times of day, cancel the order and send a message saying so. Do not ship unconfirmed risky orders in the hope they work out. A cancelled real customer can reorder in a minute. A shipped fake order costs you freight both ways.",
        ],
      },
      {
        h: "Which control should you use for which risk?",
        p: [
          "Not every order deserves the same scrutiny. Heavy checks on every customer slow your team and annoy genuine buyers. Sort orders into low, medium and high risk using the warning signs, then match the control to the level. Repeat customers with a clean delivery history can skip most checks. Save agent time for the orders that need it.",
          "The table gives a starting point. Adjust it to your margins: a store selling low-priced items may tolerate more risk per order than one shipping expensive products, where a single lost parcel hurts. Review the rules every month or so against what actually came back. Rules that never catch anything can be relaxed.",
        ],
        table: {
          cols: ["Risk signal", "Control", "If it fails"],
          rows: [
            ["First-time COD buyer", "WhatsApp confirmation", "Call, then cancel if unreachable"],
            ["High order value", "Confirmation call", "Ask for an advance or prepaid"],
            ["Past refusal or RTO", "Call plus advance payment", "Cancel the COD order"],
            ["Duplicate order", "Confirm which order to keep", "Cancel the extra order"],
            ["Gibberish address", "Call to rebuild the address", "Cancel if there is no usable address"],
          ],
        },
      },
      {
        h: "What should you do with repeat offenders?",
        p: [
          "Keep a record of customers who refused parcels or placed orders they did not confirm, keyed by phone number. When that number orders again, route it to a stricter path: a mandatory call, an advance payment, or prepaid only. This is fairer than a permanent block, because people sometimes miss a delivery for good reasons.",
          "Be careful with the data. Use it only to decide how to handle orders on your own store, keep it accessible to the staff who need it, and remove a flag when a customer later accepts and pays for an order. A flag that never expires will slowly shut out customers who would now buy happily.",
        ],
      },
      {
        h: "How CodeCrest helps stop fake COD orders",
        p: [
          "CodeCrest syncs Shopify orders and creates a verification task for every COD order before it ships. Phone numbers are normalised and duplicate orders are detected on the way in, and each customer's orders, calls and messages sit on one record. Risk is scored so that orders such as high-value COD or customers with past refusals are verified first.",
          "Agents confirm by WhatsApp template from the store's own linked number or by a logged call, and close the task with an outcome. Unreachable customers drop out of the active queue instead of being forgotten. CodeCrest does not change your Shopify checkout. It manages what happens after the order. Stores are onboarded by the CodeCrest team.",
        ],
      },
    ],
    faqs: [
      ["Can I take legal action against fake COD orders?", "In practice it is rarely worth the effort for individual orders, and the right course depends on the facts and local law. Most stores focus on prevention. If you face organised or repeated abuse, speak to a lawyer about your options."],
      ["Does OTP verification reduce conversions?", "It adds a step, so some shoppers will drop off. Many stores accept that trade because the orders lost are often low-intent. Measure your own checkout completion before and after, and consider applying it only to COD orders."],
      ["How do I spot duplicate COD orders?", "Look for the same phone number, address or cart within a short time. Normalise phone numbers first so that formats with and without the country code match. Then contact the customer once to ask which order they want to keep."],
      ["Should I block certain pincodes for COD?", "Only when your own data shows repeated problems there and other fixes have not worked. Start with a softer step, such as mandatory confirmation or a small advance for that area. Blocking a pincode also turns away its genuine customers."],
      ["Are fake orders the main cause of RTO?", "Usually not. Most returned parcels come from real customers who changed their mind, were not available or gave a poor address. Fake orders are one part of the problem, and the same verification step handles both."],
    ],
    related: ["resources/cod-order-verification-guide", "features/shopify-order-management", "solutions/cod-heavy-stores", "blog/cod-confirmation-call-script"],
  },
  {
    slug: "address-verification-for-ecommerce-orders",
    title: "Address verification for ecommerce orders: a practical guide",
    metaTitle: "Address Verification for Ecommerce Orders in India",
    description: "How address verification for ecommerce orders works in India: what a deliverable address needs, checks at checkout, and how to confirm before dispatch.",
    keyword: "address verification for ecommerce orders",
    category: "COD & RTO",
    date: "2026-10-16",
    answer: "Address verification for ecommerce orders means checking, before dispatch, that a courier can actually find the customer. Confirm the pincode matches the city and state, the address has a house or building detail, a street or area, and a landmark, and the phone number is reachable. Fix gaps by WhatsApp or a short call.",
    takeaways: [
      "Address verification checks that a courier can find the customer, not who the customer is.",
      "In India a landmark and a reachable phone number matter as much as the written address.",
      "Structured checkout fields prevent many gaps before the order exists.",
      "Read the address back on the call instead of asking if it is correct.",
      "Update the order before the shipping label is created.",
    ],
    visual: "matrix",
    sections: [
      {
        h: "What is address verification in ecommerce?",
        p: [
          "Address verification is the step where you make sure the address on an order is complete enough for a delivery person to reach the door. It is not about proving identity. It is about removing the small gaps, a missing house number, a wrong pincode, a phone that will not connect, that turn a willing customer into a failed delivery.",
          "In India this matters more than in countries with strict street numbering. Many addresses are descriptions: near the temple, behind the petrol pump, second lane after the school. Delivery agents rely on a landmark and a phone call. If both are weak, the parcel comes back even though nobody did anything wrong on purpose.",
        ],
      },
      {
        h: "What makes an address deliverable in India?",
        p: [
          "A deliverable address answers the questions a delivery agent asks in order: which area, which street or lane, which building, which door, and who do I call if I am lost. If any of those is missing, the agent has to guess or phone. Addresses in villages and small towns may have no house number at all, so the landmark does the work.",
          "Use the table below as a checklist. An address does not have to be long. It has to be specific. A short address with a clear landmark and a working phone number is better than four lines that repeat the city name and leave out the lane. Train agents to judge by usefulness, not length.",
        ],
        table: {
          cols: ["Element", "Why it matters", "How to check"],
          rows: [
            ["Pincode", "Decides the courier hub and route", "Does it match the city and state entered?"],
            ["House or building", "Identifies the exact door", "Is there a number, name or floor?"],
            ["Street, lane or area", "Narrows the search", "Is a locality named, not just the city?"],
            ["Landmark", "Guides the agent on the ground", "Is there a known place nearby?"],
            ["Phone number", "The fallback when the agent is lost", "Does it have the right digits and connect?"],
            ["Alternate number", "Covers a missed call", "Is there a second person to call?"],
          ],
        },
      },
      {
        h: "How do you verify addresses at checkout?",
        p: [
          "The best time to get a good address is while the customer is typing it. Use separate fields instead of one large box, so nothing is skipped. Fill the city and state from the pincode where your checkout allows it. Add a landmark field and label it in plain words, with an example underneath.",
          "Keep the form short enough to finish on a phone. Every required field you add will cost a few completions, so make only the essentials mandatory. What you can customise depends on your Shopify plan and checkout apps. Check the current Shopify documentation before promising your team a particular field or validation.",
        ],
        list: [
          "Separate fields for house, street, area and landmark",
          "City and state filled from the pincode",
          "A check that the phone number has the right number of digits",
          "An optional alternate phone number",
          "A hint showing what a good landmark looks like",
          "A warning when the address is very short",
        ],
      },
      {
        h: "How do you verify an address after the order is placed?",
        p: [
          "Checkout checks catch format problems. They cannot tell whether an address makes sense. That needs a look after the order is placed. Flag orders with short addresses, missing landmarks or mismatched pincodes, and contact those customers before the parcel is packed. For COD orders, fold this into the confirmation step you already run.",
          "On a call, do not ask whether the address is correct. Customers say yes without thinking. Read it back and ask a real question: how would a delivery person find your house from the main road? The answer gives you the landmark. Then update the order before the shipping label is created, or the correction is wasted.",
        ],
        list: [
          "Flag orders with short or unusual addresses",
          "Send a WhatsApp message asking the customer to confirm or correct",
          "Call customers who do not reply",
          "Read the address back and ask for a landmark",
          "Update the order before the label is printed",
          "Note the change so the next agent can see it",
        ],
      },
      {
        h: "Which orders need address verification most?",
        p: [
          "Verifying every order by hand is expensive, so decide where to spend the effort. COD orders come first, because a failed delivery there loses the whole sale. Next are first-time customers, since you have no history of a successful delivery to that address. Repeat customers ordering to an address you have delivered to before need little checking.",
          "Add your own patterns. If your reports show that certain states or pincodes produce more address-related failures, verify those more strictly. High-value orders also deserve a second look regardless of payment mode. A prepaid parcel that comes back has to be refunded or reshipped, which costs time and goodwill as well as freight.",
        ],
      },
      {
        h: "What should you do when the courier reports an address issue?",
        p: [
          "Sometimes the problem appears only after dispatch. The courier raises a non-delivery report with a reason such as address incomplete or customer not contactable. Act the same day. Call the customer, get the missing detail or a better number, and pass it to the courier through your shipping platform so the next attempt uses it.",
          "How many attempts a courier makes and how corrections are submitted varies by provider, so check your shipping partner's current process. Then close the loop inside your own team. If the same kind of address gap keeps causing reports, change the checkout field or the confirmation script so it stops reaching the courier at all.",
        ],
      },
      {
        h: "How CodeCrest helps with address verification",
        p: [
          "CodeCrest places address checking inside the COD verification task that is created for each Shopify COD order. The agent sees the order, the customer's history and the address on one screen, calls through connected telephony or sends a WhatsApp template from the store's linked number, and records the outcome. Notes stay on the customer record.",
          "After dispatch, shipment status syncs from Shiprocket. A failed attempt becomes a follow-up task carrying the courier's reason, so an address problem reaches an agent the same day. CodeCrest does not validate addresses against a postal database. It gives your team the queue, the contact tools and the history to fix them. Onboarding is handled by CodeCrest.",
        ],
      },
    ],
    faqs: [
      ["Is pincode validation enough to verify an address?", "No. A valid pincode only shows the area exists and is serviceable. It says nothing about the house, the lane or whether the phone will connect. Use pincode checks as a first filter and confirm the rest with the customer."],
      ["Should prepaid orders go through address verification?", "Not all of them. Prepaid customers are committed, so most stores check only prepaid orders with clearly incomplete addresses or high value. A returned prepaid order still costs shipping and a refund or reshipment."],
      ["Can address verification be automated?", "Partly. Rules can flag short addresses, mismatched pincodes and invalid phone numbers, and a WhatsApp message can ask the customer to confirm. Judging whether a landmark makes sense, and coaxing out a better one, still works best with a person."],
      ["What is a good landmark?", "Something a delivery agent new to the area could find by asking anyone nearby: a school, temple, mosque, hospital, bank branch, well-known shop or bus stop. A neighbour's name or a description only locals understand is much less useful."],
      ["Can I change the address after the order has shipped?", "Sometimes. Many couriers accept corrections within the same area after a failed attempt, submitted through the shipping platform. Changes to a different city or pincode are often not possible. Check what your shipping provider currently allows."],
    ],
    related: ["resources/ndr-management-guide", "features/shipping-rto-management", "integrations/shiprocket", "blog/how-to-stop-fake-cod-orders"],
  },
  {
    slug: "partial-cod-advance-payment",
    title: "Partial COD: how advance payment on COD orders works",
    metaTitle: "Partial COD: Advance Payment on COD Orders Explained",
    description: "Partial COD explained: what it is, how the advance and balance are collected, when to use it, how much to ask for, and what to check with your courier.",
    keyword: "partial COD",
    category: "COD & RTO",
    date: "2026-10-24",
    answer: "Partial COD is a payment option where the customer pays a small part of the order value online as an advance and pays the balance in cash when the parcel is delivered. The advance shows real intent, which lowers refusals, while still letting customers who distrust full prepayment buy with cash on delivery.",
    takeaways: [
      "Partial COD means a small online advance plus the balance in cash on delivery.",
      "The advance filters out casual orders without demanding full prepayment.",
      "The collectable amount on the shipment must equal the total minus the advance.",
      "Use it on high-value or high-risk orders, not on every order.",
      "Publish a clear policy on what happens to the advance if the parcel is refused.",
    ],
    visual: "flow",
    sections: [
      {
        h: "What is partial COD?",
        p: [
          "Partial COD splits one order into two payments. The customer pays a token amount online when ordering, or shortly after, and pays the remaining amount in cash at the door. Some stores call it advance COD, token payment or part payment. The product, the delivery and the courier are the same as any COD order.",
          "It exists because full COD and full prepaid both have a weakness. Full COD costs the customer nothing to abandon. Full prepaid asks for complete trust in a brand they may have found an hour ago. A small advance sits between the two: enough commitment to filter out casual orders, not enough to scare away a cautious buyer.",
        ],
      },
      {
        h: "How does partial COD work step by step?",
        p: [
          "The flow is short, but each step has to be right, because an error in the amount shows up at the customer's door. The balance the courier collects must equal the order total minus the advance. If the shipping label still shows the full amount, the customer is asked to pay twice and will refuse the parcel.",
          "Collection of the advance can happen in two ways. Some stores use a checkout app that offers partial payment as an option. Others take a normal COD order and then send a payment link by WhatsApp or during the confirmation call. The second needs no checkout change, but it depends on your team updating the order afterwards.",
        ],
        list: [
          "Customer chooses partial COD or is offered it after ordering",
          "Customer pays the advance online",
          "Store confirms the payment was received",
          "Order is updated with the reduced COD amount",
          "Shipment is created with the balance as the collectable amount",
          "Courier collects the balance in cash on delivery",
        ],
      },
      {
        h: "Partial COD vs full COD vs prepaid: which should you offer?",
        p: [
          "You do not have to pick one for the whole store. Most brands that use partial COD offer all three and steer customers by order value or risk. Low-risk repeat buyers get plain COD. Risky or expensive orders are asked for an advance. Everyone sees a small benefit for paying fully online.",
          "The table compares the three from the store's side. Read it with your own margins in mind. The right mix for a brand selling low-priced daily items is different from one selling expensive products where a single refused parcel wipes out the profit of several successful orders. There is no universally correct mix.",
        ],
        table: {
          cols: ["Point", "Full COD", "Partial COD", "Prepaid"],
          rows: [
            ["Customer commitment", "None before delivery", "Some, through the advance", "Full"],
            ["Ease for a new customer", "Easiest", "Slightly harder", "Hardest"],
            ["Risk of refusal", "Highest", "Lower", "Lowest"],
            ["If the parcel returns", "You bear shipping both ways", "The advance may offset part of it, per your policy", "Refund or reship needed"],
            ["Operational effort", "Low", "Highest, two payments to track", "Low"],
          ],
        },
      },
      {
        h: "When should you ask for an advance on a COD order?",
        p: [
          "An advance is a filter, so use it where filtering pays. Asking every customer for one adds friction to orders that would have been delivered anyway. Asking none leaves your most expensive risks unprotected. Start with a narrow rule, watch what happens to both orders and returns, and widen it only if the numbers support that.",
          "Tell the customer why. A line such as: a small advance confirms your order and the rest is payable on delivery, is honest and easy to accept. Customers react badly when the advance looks like a hidden charge. Make it clear on the checkout page and in the confirmation message that the advance is part of the price, not an extra.",
        ],
        list: [
          "Order value above a level you set",
          "First-time customers on expensive products",
          "Customers who refused a parcel before",
          "Pincodes where your own returns are repeatedly high",
          "Customised or made-to-order items",
          "Sale periods that attract impulse orders",
        ],
      },
      {
        h: "How much advance should you collect?",
        p: [
          "The advance should at least cover what a return would cost you. Add your forward shipping, return shipping and packaging. As an example, if those come to Rs 150 for a typical parcel, an advance near that figure means a refused order no longer leaves you out of pocket for freight. Use your own costs, not this illustration.",
          "Beyond that floor, it is a judgement between protection and conversion. A higher advance filters harder but loses more genuine buyers. Many stores choose a flat amount because it is simple to explain, while others use a share of the order value for expensive items. Test one approach for a few weeks and compare total delivered orders, not just refusals.",
        ],
      },
      {
        h: "What can go wrong with partial COD?",
        p: [
          "The most damaging error is a mismatch in the amount to collect. Check with your courier or aggregator how a partly paid order should be booked, because support for it and the way the collectable amount is set differ between providers. Their current documentation is the reference. Test with a few real orders before you roll it out.",
          "Decide your refund policy before the first refusal. If a customer pays an advance and then refuses the parcel, do you keep it, refund it, or refund it minus shipping? Write the policy in plain words where the customer can see it before paying, and get advice if you are unsure what consumer rules require. Reconciliation also gets harder, since one order now has two payments.",
        ],
      },
      {
        h: "How CodeCrest fits with partial COD",
        p: [
          "CodeCrest does not collect payments or change your checkout. It helps with the conversations around partial COD. COD orders from Shopify get a verification task, and the queue is ordered by value, risk and age, so the orders where an advance matters most are handled first. Agents call or message from the task.",
          "A WhatsApp template sent from the store's own linked number can carry your payment link and the wording you have approved. Calls made through Exotel or Twilio are logged on the customer's timeline, so there is a record of what was agreed. Each team is onboarded by CodeCrest. There is no self-serve signup.",
        ],
      },
    ],
    faqs: [
      ["Is partial COD the same as a COD fee?", "No. A COD fee is an extra charge for choosing cash on delivery. A partial COD advance is part of the product price paid early, and the customer pays less at the door. Make the difference clear so customers do not mistake one for the other."],
      ["Do all couriers support partial COD?", "Support varies. Since the courier simply collects the amount on the shipment, many stores handle it by booking the reduced balance as the COD amount. Confirm with your courier or aggregator how they expect partly paid orders to be created."],
      ["Will partial COD reduce my orders?", "It can, because it adds a step. The orders you lose tend to be lower-intent ones, but not all of them. Apply it to a narrow group first and watch total delivered orders, which is the number that matters."],
      ["How do I collect the advance without a checkout app?", "Take the order as normal COD, then send the customer a payment link by WhatsApp or during the confirmation call. Once the payment arrives, update the order so the amount due on delivery is reduced before the shipment is created."],
      ["Should the advance be refunded if the customer cancels before dispatch?", "Most stores refund it in full when the order is cancelled before it ships, since no cost has been incurred. Whatever you decide, state it clearly at the point of payment and apply it consistently."],
    ],
    related: ["tools/cod-vs-prepaid-calculator", "blog/convert-cod-to-prepaid", "solutions/cod-heavy-stores", "features/whatsapp-automation"],
  },
  {
    slug: "cod-remittance-reconciliation",
    title: "COD remittance reconciliation: how to match every rupee",
    metaTitle: "COD Remittance Reconciliation: A Step-by-Step Guide",
    description: "COD remittance reconciliation explained: how COD money reaches you, how to match courier remittances to delivered orders, and how to chase the gaps.",
    keyword: "COD remittance reconciliation",
    category: "COD & RTO",
    date: "2026-11-02",
    answer: "COD remittance reconciliation is the process of matching the cash your courier collected on delivered COD orders against the money it actually paid into your bank account. For each remittance, list the shipments it covers, compare each amount with the order value, confirm deductions, and follow up on any delivered order that has not been paid.",
    takeaways: [
      "COD remittance is the courier paying you the cash it collected, in batches, after delivery.",
      "Reconciliation matches delivered COD orders, the remittance statement and the bank credit.",
      "Match by AWB number, because all three records share it.",
      "Raise gaps quickly, since couriers set time limits for disputes.",
      "Reconcile every cycle and review the overdue total monthly.",
    ],
    visual: "orders",
    sections: [
      {
        h: "What is COD remittance?",
        p: [
          "When a courier delivers a COD parcel, the delivery agent collects cash or a digital payment from the customer. That money belongs to you, but it reaches you later. The courier or shipping aggregator gathers collections over a period and pays them out in batches. Each batch is a remittance, and it usually comes with a statement listing the shipments included.",
          "The length of the remittance cycle, and whether charges are deducted from it or billed separately, depends on your provider and plan. Read your current agreement instead of assuming. The key point is that there is always a gap between delivery and payment, and during that gap your money sits with someone else.",
        ],
      },
      {
        h: "Why does COD remittance need reconciliation?",
        p: [
          "With a handful of orders a day you can check payments by eye. With hundreds, small errors hide easily. A parcel is marked delivered but left out of the remittance. An amount is lower than the order value. A returned parcel is treated as delivered or the reverse. None of these are necessarily dishonest. They are what happens when large volumes move through many hands.",
          "Unreconciled COD is a quiet leak. Each missing payment is small, so nobody chases it, and after a few months the total is significant. Couriers also set time limits for raising disputes, which vary by provider. If you find a gap after that window has closed, you may not be able to claim it.",
        ],
        list: [
          "Delivered orders missing from the remittance",
          "Amount paid lower than the amount collectable",
          "Payment for the same shipment appearing twice",
          "Deductions you did not expect",
          "Shipments marked delivered that customers say never arrived",
          "Remittance received late compared with the agreed cycle",
        ],
      },
      {
        h: "How do you reconcile COD remittance step by step?",
        p: [
          "Reconciliation compares three records: what you shipped, what the courier says it delivered and paid, and what reached your bank. Work from the shipment number, usually called the AWB, because it is the one identifier all three share. Order numbers can be reused or reformatted, but the AWB is unique to the parcel.",
          "Do the steps in the same order each time so anyone on the team can pick the task up. Keep the files: the remittance statement, your export of delivered COD orders and the bank entry. When you raise a dispute, the courier will ask for the AWB, the delivery date and the amount, and you want them in one place.",
        ],
        list: [
          "Export delivered COD orders with AWB, delivery date and amount",
          "Download the remittance statement for the cycle",
          "Match each line by AWB",
          "Compare the amount paid with the amount collectable",
          "Check the statement total against the bank credit",
          "List delivered orders with no payment",
          "Raise disputes and track them until closed",
        ],
      },
      {
        h: "What should a COD reconciliation sheet contain?",
        p: [
          "A reconciliation sheet is one row per COD shipment, kept from dispatch until the money is confirmed. It does not need to be complicated. It needs to be complete and to show a clear status on each row, so that filtering by status gives you the day's work: what to chase and what to close.",
          "The table lists the columns most teams need. Add your own where useful, such as the courier name if you ship with several. Resist the urge to track everything. A sheet with a few reliable columns that is updated every cycle is worth more than a detailed one that falls behind.",
        ],
        table: {
          cols: ["Column", "Source", "Used for"],
          rows: [
            ["AWB number", "Shipping platform", "Matching across all records"],
            ["Order number and COD amount", "Shopify or order system", "Expected collection"],
            ["Delivery date and status", "Courier tracking", "Deciding when payment is due"],
            ["Remittance reference and date", "Remittance statement", "Linking to a bank credit"],
            ["Amount remitted", "Remittance statement", "Finding short payments"],
            ["Reconciliation status", "Your team", "Paid, short, pending or disputed"],
          ],
        },
      },
      {
        h: "How do you handle short payments and disputes?",
        p: [
          "When an amount is short or missing, first rule out your own data. Was the order partly prepaid? Was the COD amount changed after dispatch? Was the parcel actually returned? If the gap is real, raise it through the courier's or aggregator's dispute channel with the AWB, delivery date, expected amount and received amount.",
          "Give each dispute an owner and a follow-up date. Open disputes with no owner are the same as no dispute. Keep a running total of the amount under dispute so the founder or finance lead can see it. If one courier produces gaps cycle after cycle, that pattern is worth raising at account level, not ticket by ticket.",
        ],
      },
      {
        h: "How often should you reconcile COD remittance?",
        p: [
          "Reconcile every remittance cycle. If your courier pays several times a week, set a fixed day or two for matching instead of letting statements pile up. The work grows faster than the volume when it is left, because older gaps are harder to explain and closer to the dispute deadline.",
          "Once a month, step back and look at the whole picture: total COD delivered, total remitted, total pending within the normal cycle, and total overdue. The overdue figure is the one to manage. Share it with whoever handles cash flow, since money that is delivered but not yet remitted is part of your working capital.",
        ],
      },
      {
        h: "How CodeCrest helps with COD reconciliation",
        p: [
          "CodeCrest is not accounting software and does not read remittance statements or bank entries. What it provides is a clean first record. Orders sync from Shopify with their payment mode, shipment status and AWB come in from Shiprocket, and returned shipments are tracked through to origin, so delivered COD orders are easy to list.",
          "You can filter orders by status, payment mode and date and export them to Excel, which gives you the expected side of the reconciliation without manual copying. Follow-ups on gaps can be tracked as tasks with an owner and a due date. The CodeCrest team onboards each store. There is no self-serve signup.",
        ],
      },
    ],
    faqs: [
      ["How long does COD remittance take?", "It depends on your courier or aggregator and the plan you are on. Cycles are set out in your agreement and can sometimes be shortened for a fee. Check your provider's current terms and build that delay into your cash flow planning."],
      ["What is an AWB number?", "AWB stands for air waybill. It is the unique tracking number a courier assigns to a shipment. Because it appears on the label, the tracking page and the remittance statement, it is the most reliable key for matching records."],
      ["Are shipping charges deducted from COD remittance?", "Some providers deduct freight and COD charges from the remittance, and others bill them separately or use a prepaid wallet. Your statement should show any deductions line by line. Confirm the method with your provider so your sheet matches it."],
      ["What if a customer paid the courier digitally instead of cash?", "It is still a COD collection from your side. The courier collected the amount on delivery and owes it to you in the remittance. Reconcile it exactly like a cash collection, using the AWB and the collectable amount."],
      ["Who should own COD reconciliation in a small team?", "One named person, usually whoever handles accounts or operations, with a backup. The task needs access to order exports, the shipping panel and bank statements. Splitting it informally across people is how gaps go unnoticed."],
    ],
    related: ["features/shopify-order-management", "integrations/shiprocket", "features/analytics-reports", "solutions/operations-teams"],
  },
  {
    slug: "high-rto-pincodes",
    title: "High RTO pincodes: how to find them and what to do next",
    metaTitle: "High RTO Pincodes: How to Find and Manage Them",
    description: "How to identify high RTO pincodes from your own shipment data, why some areas return more, and which controls to apply before you block COD anywhere.",
    keyword: "high RTO pincodes",
    category: "COD & RTO",
    date: "2026-11-10",
    answer: "High RTO pincodes are delivery areas where an unusually large share of your shipments come back undelivered. Find them by calculating RTO rate per pincode from your own shipment history, ignoring pincodes with too few orders to judge. Then apply graded controls: stricter COD confirmation, an advance payment, a different courier, or as a last resort no COD.",
    takeaways: [
      "A high RTO pincode is high relative to your own average, not against a fixed line.",
      "Ignore pincodes with too few shipments, or group them into districts.",
      "Find the cause in each area before choosing a rule.",
      "Escalate from confirmation calls to advance payment to courier change before blocking COD.",
      "Trust your own delivery history over ready-made lists.",
    ],
    visual: "chart",
    sections: [
      {
        h: "What are high RTO pincodes?",
        p: [
          "A high RTO pincode is a postal area where your parcels return to origin much more often than they do across the rest of your orders. The definition is relative. There is no fixed line above which a pincode becomes bad. It is high compared with your own average for the same payment mode and the same kind of product.",
          "The idea is useful because RTO is not spread evenly. A small number of areas often account for a large part of the loss, so a rule aimed at those areas can save money without touching most customers. It is also easy to misuse. Acting on thin data punishes whole localities for the behaviour of two or three orders.",
        ],
      },
      {
        h: "How do you find high RTO pincodes in your own data?",
        p: [
          "Start with a shipment export covering a few months. You need the pincode, payment mode, final status, courier and dispatch date. Count shipments and RTOs per pincode, separately for COD and prepaid, and divide. Sort by RTO rate, then look at the shipment count beside it before drawing any conclusion. The count matters as much as the rate.",
          "Small numbers are the trap. A pincode with three shipments and two returns shows a frightening rate and means almost nothing. Set a minimum number of shipments before a pincode can be judged. Group the rest by district or by the first digits of the pincode, which roughly follow postal regions, and study the group.",
        ],
        list: [
          "Export shipments with pincode, payment mode, status and courier",
          "Keep only shipments with a final status",
          "Count dispatched and RTO shipments per pincode",
          "Calculate RTO rate for COD and prepaid separately",
          "Set a minimum shipment count before judging",
          "Group low-volume pincodes into districts",
          "Compare each area with your overall COD average",
        ],
      },
      {
        h: "Why do some pincodes have higher RTO?",
        p: [
          "A high rate in an area can come from the customers, the address system, the courier or you. Some localities are hard to navigate and addresses there are loose. Some are served by a courier hub that is far away or stretched. In some, your ads reached an audience that orders casually. The pincode is the same but the fix is completely different.",
          "So read the orders before you write a rule. Look at the courier reason codes for that area and call a few customers whose parcels came back. If they say nobody came, it is a courier issue. If they say they changed their mind, it is intent. If the delivery agent could not find the house, it is the address.",
        ],
        list: [
          "Weak courier coverage or a distant hub",
          "Addresses without house numbers or clear streets",
          "Long delivery times to remote areas",
          "Low-intent orders from a particular campaign",
          "Customers often away during delivery hours",
          "Fraud or prank orders concentrated in one locality",
        ],
      },
      {
        h: "What should you do about a high RTO pincode?",
        p: [
          "Match the response to the cause and escalate gradually. The lightest step is to confirm every COD order from that area by phone, with extra care on the address. If that is not enough, ask for a small advance. If the courier is the problem, try a different one for that route. Removing COD is the last step, not the first.",
          "Change one thing, then measure for long enough to see the effect. Returns from a cohort take time to come back, so judge a new rule on orders dispatched after it started, once they have reached a final status. Keep a simple log of which rule applies to which area and why, so the next person understands it.",
        ],
        table: {
          cols: ["Likely cause", "First response", "If it continues"],
          rows: [
            ["Low intent, refusals", "Mandatory confirmation call", "Advance payment on COD"],
            ["Addresses hard to find", "Landmark and alternate number at confirmation", "Out-for-delivery message with a contact option"],
            ["Courier not attempting", "Raise with the courier, with shipment numbers", "Switch courier for that route"],
            ["Slow delivery", "Set honest delivery estimates", "Faster service or a closer dispatch point"],
            ["Concentrated fake orders", "Phone verification and order limits", "Prepaid only for that area"],
          ],
        },
      },
      {
        h: "Should you block COD for high RTO pincodes?",
        p: [
          "Blocking COD stops the returns and also stops the sales. In many areas COD is how most people buy, so a block can remove nearly all your orders from that pincode, including the ones that were being delivered and paid for. Before blocking, estimate what you would lose as well as what you would save.",
          "Here is an example with made-up numbers. A pincode sends you 100 COD orders a month and 40 come back. A block saves the cost of 40 returns and gives up the profit on 60 delivered orders. If confirmation calls could cut returns to 20 while keeping most sales, that is the better move. Do this sum with your own figures first.",
        ],
      },
      {
        h: "Can you use a ready-made list of high RTO pincodes?",
        p: [
          "Lists of bad pincodes circulate among sellers and some tools offer risk scores. Treat them as a hint. A pincode that was poor for a store selling one kind of product through one courier may be fine for yours. Courier coverage also changes over time, so an old list can be wrong in both directions.",
          "Serviceability is a separate question from RTO risk. Whether a courier delivers to a pincode at all, and whether it offers COD there, is something only the courier's current serviceability data can tell you. Check that through your shipping platform. Then let your own delivery history decide which serviceable pincodes need extra care.",
        ],
      },
      {
        h: "How CodeCrest helps manage high RTO areas",
        p: [
          "CodeCrest brings Shopify orders and Shiprocket shipment status together, so return data is ready without manual merging. Reports show RTO by state and payment mode, and orders can be filtered and exported to Excel for a pincode-level analysis like the one above. That gives you your own evidence instead of a borrowed list.",
          "For the response, every COD order already gets a verification task, with the queue ordered by value, risk and age. Agents confirm by call or WhatsApp from the store's linked number, and failed deliveries become same-day follow-up tasks. CodeCrest does not block COD in your checkout. That stays in Shopify. Stores are onboarded by the CodeCrest team.",
        ],
      },
    ],
    faqs: [
      ["How many orders does a pincode need before I can judge it?", "Enough that one or two returns do not swing the rate. There is no universal number. Pick a minimum that suits your volume, apply it consistently, and group pincodes below it into districts or states for analysis."],
      ["Should I look at RTO by pincode or by state?", "Both. State level shows broad patterns and has enough volume to trust. Pincode level shows where exactly the problem sits but needs more data. Start with states, then drill into pincodes inside the states that stand out."],
      ["Do high RTO pincodes stay the same over time?", "Not always. Courier coverage improves or worsens, your ad targeting changes and your product mix shifts. Recheck the analysis every month or two and remove restrictions from areas that have improved, so you do not keep turning away good customers."],
      ["Does prepaid RTO matter for pincode analysis?", "Yes, as a signal. If prepaid parcels also return from an area, the cause is more likely the courier or the addresses than customer intent. If only COD returns, intent is the more probable cause and confirmation is the right response."],
      ["Can a different courier fix a high RTO pincode?", "Sometimes. If customers report that no delivery attempt was made, or delivery takes far longer than elsewhere, another courier with a closer hub may do better. Test with a share of orders and compare the two on the same pincodes."],
    ],
    related: ["blog/how-to-calculate-rto-rate", "features/analytics-reports", "tools/rto-loss-calculator", "resources/how-to-reduce-rto"],
  },
];

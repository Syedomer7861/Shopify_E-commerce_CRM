import type { Post } from "./types";

// WhatsApp & Retention batch. Advice is stated as practice, not as measured
// results: no statistics, benchmarks or third-party pricing are quoted.

export const posts3: Post[] = [
  {
    slug: "whatsapp-abandoned-cart-message-templates",
    title: "WhatsApp abandoned cart message templates you can copy and adapt",
    metaTitle: "WhatsApp Abandoned Cart Message Templates",
    description: "Copy-ready WhatsApp abandoned cart message templates for first reminders and follow-ups, with timing, opt-in rules and advice on tone for D2C stores.",
    keyword: "WhatsApp abandoned cart message templates",
    category: "WhatsApp & Retention",
    date: "2026-09-01",
    answer: "A good WhatsApp abandoned cart message names the store and the product, links back to the cart and offers help, all in two or three short lines. Send one reminder soon after the customer leaves, one follow-up that answers a likely question, and stop when they order. Message only customers who opted in, and never invent urgency or scarcity.",
    takeaways: [
      "A cart reminder needs four parts: a greeting, the product, one cart link and an offer of help.",
      "The follow-up should answer a likely question instead of repeating the first message.",
      "Stop the sequence the moment the customer orders, replies or asks you to stop.",
      "Message only customers who have opted in, and check the current WhatsApp policy for the product you send from.",
    ],
    visual: "chat",
    sections: [
      {
        h: "What should a WhatsApp abandoned cart message say?",
        p: [
          "A cart reminder has one job: make it easy for the customer to pick up where they left off. Say who you are, name the product they chose, and give one link that opens their cart. Keep it to two or three short lines. A message that reads like it came from a person at the store gets read. A message that reads like an advertisement gets muted.",
          "Leave out anything you cannot stand behind. Do not say stock is running out unless it is. Do not say an offer ends tonight unless it does. Customers notice, and a false claim costs more trust than the order is worth. End with an open door instead, such as an offer to answer questions about delivery, sizing or payment.",
        ],
      },
      {
        h: "What are good first reminder templates?",
        p: [
          "The first reminder goes out soon after the customer leaves checkout. Assume nothing went wrong. Many people were interrupted, lost network, or wanted to think it over. A plain nudge with the cart link is enough. Replace the placeholders with your own variables and keep your store name in the first line so the customer knows who is writing.",
          "Pick one template and use it for a few weeks before judging it. Changing the wording every few days makes it impossible to tell what worked. The templates below are deliberately simple. Adapt the tone to your brand, but keep the structure: greeting, product, link, offer of help.",
        ],
        list: [
          "Hi {{name}}, this is {{store_name}}. You left {{product_name}} in your cart. You can complete your order here: {{cart_link}}. Reply here if you need any help.",
          "Hi {{name}}, your cart at {{store_name}} is saved. Pick up where you left off: {{cart_link}}. Any questions about delivery or payment, just reply.",
          "Hello {{name}}, we noticed you did not finish checking out {{product_name}}. Here is your cart: {{cart_link}}. If something went wrong at checkout, tell us and we will sort it out.",
          "Hi {{name}}, {{store_name}} here. Did the payment page give you trouble? Your cart is waiting at {{cart_link}}. If you would like a different payment option, reply and we will help.",
          "Hi {{name}}, thanks for visiting {{store_name}}. Your {{product_name}} is still in your cart: {{cart_link}}. Reply STOP if you would rather not get reminders.",
        ],
      },
      {
        h: "What should the follow-up message say?",
        p: [
          "If the first reminder gets no response, the customer probably has a question or a doubt. The follow-up should add something new, not repeat the first message. Answer the things people most often ask before buying: how long delivery takes, whether returns are possible, which payment methods you accept, and how to choose a size or variant.",
          "Only state what is true for your store. If you write that returns are possible, link to the actual policy. If you mention delivery time, use an estimate you can meet. One follow-up is usually enough. After that, leave the customer alone, or pass a high-value cart to a person who can call.",
        ],
        list: [
          "Hi {{name}}, a quick note on your {{store_name}} cart. Delivery to {{city}} usually takes {{delivery_days}} days, and you can pay online or on delivery. Your cart: {{cart_link}}",
          "Hi {{name}}, not sure about the size or variant of {{product_name}}? Reply with your question and we will help you choose. Your cart is here: {{cart_link}}",
          "Hello {{name}}, if you were wondering about returns, our policy is here: {{policy_link}}. Your cart at {{store_name}} is still saved: {{cart_link}}",
          "Hi {{name}}, this is {{agent_name}} from {{store_name}}. I can help with your order of {{product_name}} if anything was unclear. Would a quick call be useful?",
          "Hi {{name}}, this is our last reminder about your cart at {{store_name}}: {{cart_link}}. We will not message again about it. Thank you for stopping by.",
        ],
      },
      {
        h: "When should you send each cart reminder?",
        p: [
          "Timing matters more than clever wording. The first reminder works best while the customer still remembers the product, so send it soon after the checkout is abandoned. Space the follow-up well apart so it does not feel like pestering, and avoid late-night sends. The schedule below is a common starting point, not a rule. Adjust it to your product and your customers.",
          "Whatever schedule you choose, build in one hard rule: stop the sequence the moment the customer orders. Nothing looks more careless than a reminder about a cart that has already been bought. Also stop if the customer replies, because a reply deserves a human answer, not the next automated step.",
        ],
        table: {
          cols: ["Step", "When to send", "What it does"],
          rows: [
            ["First reminder", "Soon after abandonment, often within the first hour", "Brings back customers who were interrupted"],
            ["Follow-up", "The next day, in daytime hours", "Answers a likely question about delivery, returns or payment"],
            ["Agent call or personal message", "After the follow-up, for higher-value carts", "Resolves doubts a template cannot"],
            ["Close", "After your final step", "Marks the cart lost or unreachable and stops contact"],
          ],
        },
      },
      {
        h: "Who are you allowed to message about an abandoned cart?",
        p: [
          "Message only customers who have opted in to hear from you on WhatsApp. In practice that means a clear consent step at checkout or sign-up, in words the customer can understand, not a line buried in the terms. Keep a record of when and how consent was given. Honour every request to stop, and make stopping as easy as replying with one word.",
          "WhatsApp has its own rules for business messaging, and they change. The rules also differ between the WhatsApp Business app and the WhatsApp Business Platform, where templates may need approval before use. Check the current policy for the product you send from before you launch a sequence, and check local law on marketing consent too.",
        ],
      },
      {
        h: "How does CodeCrest help with abandoned cart messages?",
        p: [
          "CodeCrest syncs abandoned checkouts from Shopify and turns each one into a recovery task with the customer's cart and a ready message. Reminders go out from your store's own WhatsApp number, which you link by scanning a QR code, using templates your team writes. Variables such as the customer's name and cart are filled in for you.",
          "Carts that do not convert after the reminders are routed to an agent, in a queue sorted by cart value and age. When the customer orders, the task closes on its own, so nobody is chased for an order they already placed. Recovered orders are matched back to the cart, so you can see what actually came back.",
        ],
      },
    ],
    faqs: [
      ["How long should a WhatsApp cart reminder be?", "Two or three short lines. Name the store, name the product, give one link and offer help. If the customer has to expand the message to find the cart link, it is too long. Save longer explanations for when they reply with a question."],
      ["How many abandoned cart messages are too many?", "For most stores, a first reminder and one follow-up are enough, with a call for higher-value carts. More than that tends to annoy people who have already decided. Always stop when the customer orders, replies or asks you to stop."],
      ["Can I add a product photo to the reminder?", "You can, and a photo helps the customer recognise the item. Keep the text complete on its own, because images sometimes fail to load on slow connections. The cart link should always appear as plain text that can be tapped."],
      ["Do these templates work for cash on delivery stores?", "Yes. Mention that cash on delivery is available if you offer it, since payment trouble is a common reason for leaving checkout. A recovered COD order should still go through your normal verification step before it ships."],
      ["Do I need approval for these templates?", "It depends on how you send. On the WhatsApp Business Platform, messages a business starts generally use templates that are submitted for approval first. Check the current rules for the product and provider you use, and adjust the wording if a template is rejected."],
    ],
    related: ["features/abandoned-cart-recovery", "features/whatsapp-automation", "resources/abandoned-cart-recovery-guide", "tools/cart-recovery-calculator"],
  },
  {
    slug: "whatsapp-order-confirmation-message-templates",
    title: "WhatsApp order confirmation message: templates for prepaid and COD orders",
    metaTitle: "WhatsApp Order Confirmation Message Templates",
    description: "How to write a WhatsApp order confirmation message, with copy-ready templates for prepaid and COD orders and the follow-up updates customers expect.",
    keyword: "WhatsApp order confirmation message",
    category: "WhatsApp & Retention",
    date: "2026-09-08",
    answer: "A WhatsApp order confirmation message tells the customer, right after purchase, that the order was received. It should state the store name, order number, items, amount and payment mode, the delivery address or estimate, and how to get help. For cash on delivery orders, it should also ask the customer to confirm the order and address before dispatch.",
    takeaways: [
      "Send the confirmation as soon as the order is placed, while the customer is still looking at their phone.",
      "Include the order number, items, amount, payment mode and a way to reach you.",
      "For COD orders, use the confirmation to ask for a clear yes and a correct address before you ship.",
      "Follow the confirmation with shipped and out-for-delivery updates so customers are ready to receive the parcel.",
    ],
    visual: "orders",
    sections: [
      {
        h: "What is a WhatsApp order confirmation message?",
        p: [
          "It is the first message a customer gets after placing an order: a short note that says the order went through and what happens next. Customers look for it. Without it, some will wonder whether the payment worked, place the order twice, or write to support to ask. A prompt confirmation removes that doubt and sets the tone for everything after.",
          "On WhatsApp the message also opens a channel. The customer now has a chat with your store where they can correct an address, ask about delivery or report a problem. Send order updates only to customers who agreed to receive them on WhatsApp, usually through a clear line at checkout, and follow WhatsApp's current policies for business messaging.",
        ],
      },
      {
        h: "What should an order confirmation message include?",
        p: [
          "Keep it factual. Start with the store name and a thank you. Give the order number, since that is what the customer will quote if they contact you. List the items or, for a long order, the item count. State the amount and whether it is paid or payable on delivery. Add the delivery estimate if you can keep to it.",
          "Close with how to get help, which on WhatsApp can be as simple as inviting a reply. Leave promotions out. A confirmation that tries to sell something else reads as spam and weakens the next message you send. If the address matters to you, and for COD it always does, repeat it in the message so the customer can spot a mistake.",
        ],
      },
      {
        h: "What are good order confirmation templates for prepaid orders?",
        p: [
          "A prepaid customer has already paid, so the message only needs to reassure and inform. Confirm that payment was received, give the order number and say when to expect the next update. Replace the placeholders with your own variables. If you do not have a reliable delivery estimate, leave that line out instead of guessing.",
          "These templates are short on purpose. Resist adding more. If a customer wants details such as the invoice or the full item list, link to the order status page, which already holds them, and let the message stay readable at a glance.",
        ],
        list: [
          "Hi {{name}}, thank you for your order at {{store_name}}. Order {{order_id}} is confirmed and payment of {{amount}} is received. We will message you when it ships.",
          "Hi {{name}}, we have your order {{order_id}} for {{product_name}}. It is being packed and should reach you by {{delivery_date}}. Track it here: {{order_link}}",
          "Hello {{name}}, your {{store_name}} order {{order_id}} is confirmed. Delivery address: {{address}}. If anything is wrong, reply to this message and we will fix it before dispatch.",
          "Hi {{name}}, order {{order_id}} is confirmed. Items: {{item_summary}}. Total paid: {{amount}}. Questions? Reply here and our team will help.",
        ],
      },
      {
        h: "How do you confirm a COD order on WhatsApp?",
        p: [
          "A cash on delivery order is not secure until the customer confirms it. The confirmation message should therefore ask a question: is this order correct, and is this the right address? State the amount payable so there is no surprise at the door. Ask for a landmark if the address looks incomplete. Many customers will confirm with a one-word reply.",
          "Decide in advance what happens when nobody replies. A common approach is to follow up with a call, try again at a different time of day, and cancel after a set number of attempts. Tell the customer if you cancel. Do not ship unconfirmed COD orders in the hope that it works out, because each refusal costs you shipping both ways.",
        ],
        list: [
          "Hi {{name}}, thank you for ordering from {{store_name}}. Order {{order_id}}, {{amount}} payable on delivery. Please reply YES to confirm, or NO to cancel.",
          "Hi {{name}}, we are about to pack order {{order_id}}. Delivery address: {{address}}. Reply YES if this is correct, or send the corrected address.",
          "Hello {{name}}, to deliver order {{order_id}} smoothly, please share a nearby landmark and confirm that {{phone}} is the best number for the courier.",
          "Hi {{name}}, your COD order {{order_id}} is confirmed for {{amount}}. If you would prefer to pay online now, you can do so here: {{payment_link}}. Either way is fine.",
          "Hi {{name}}, we could not reach you to confirm order {{order_id}}. Please reply YES by {{cutoff_date}} so we can ship it. Without a confirmation the order will be cancelled.",
        ],
      },
      {
        h: "Which messages should follow the order confirmation?",
        p: [
          "The confirmation starts a short series. Each later message is tied to something that really happened to the order, so the customer hears from you only when there is news. These updates reduce the number of people asking where their order is, and they make sure someone is at home with the cash ready when the courier arrives.",
          "Keep the series short. Three or four updates across the life of an order is plenty. If a delivery attempt fails, contact the customer the same day, because the window before the courier returns the parcel is small. Stop all order messages once the order is delivered or cancelled.",
        ],
        table: {
          cols: ["Message", "Trigger", "What it tells the customer"],
          rows: [
            ["Order confirmation", "Order placed", "The order was received, with number and amount"],
            ["Shipped", "Courier picks up the parcel", "It is on the way, with a tracking link"],
            ["Out for delivery", "Courier marks out for delivery", "Be available today, keep cash ready for COD"],
            ["Delivery failed", "Courier reports a failed attempt", "Confirm address and a time for the next attempt"],
            ["Delivered", "Courier marks delivered", "Thanks, and where to get help if something is wrong"],
          ],
        },
      },
      {
        h: "How does CodeCrest send order confirmations?",
        p: [
          "CodeCrest syncs orders from Shopify as they are placed and sends WhatsApp messages when something happens to an order: placed, shipped, delivery failed, delivered. Messages go from your store's own number, linked by scanning a QR code, using templates your team controls. Name, order number and tracking link are filled in automatically.",
          "COD orders also get a verification task, so an agent follows up on anyone who has not confirmed. Every message and reply is logged on the customer's timeline, next to their orders and calls. Whoever picks up the conversation can see what was sent and what the customer said.",
        ],
      },
    ],
    faqs: [
      ["How soon should the order confirmation be sent?", "As soon as the order is placed. The customer is still on their phone and expects an acknowledgement. A confirmation that arrives hours later has already missed the moment when it prevents doubt, duplicate orders and support queries."],
      ["Should the confirmation go by WhatsApp, email or SMS?", "Use the channel the customer agreed to and actually reads. Many stores send email as the formal record and WhatsApp for speed and replies. Whatever you choose, keep the wording consistent so the customer does not get conflicting information."],
      ["Can I add a discount code to the confirmation message?", "It is better not to. A confirmation is a service message, and mixing in promotion makes it read like marketing. Depending on how you send, promotional content may also be treated differently under WhatsApp's rules, so check the current policy."],
      ["What if the customer replies to change the order?", "Treat the reply as a support request and answer it quickly, ideally before the order is packed. This is the main benefit of confirming on WhatsApp: mistakes in address, size or quantity get caught before dispatch instead of after delivery."],
      ["Do prepaid orders need a confirmation call?", "Usually not. A message is enough because the customer has already paid. The exception is a prepaid order with an address that is obviously incomplete, where a quick message or call saves a failed delivery."],
    ],
    related: ["features/whatsapp-automation", "features/shopify-order-management", "integrations/whatsapp", "blog/whatsapp-opt-in-for-ecommerce"],
  },
  {
    slug: "whatsapp-business-app-vs-api",
    title: "WhatsApp Business app vs API: which one does your store need?",
    metaTitle: "WhatsApp Business App vs API: How to Choose",
    description: "WhatsApp Business app vs API explained for D2C stores: what each one is, how they differ on automation, team use and cost, and how to choose between them.",
    keyword: "WhatsApp Business app vs API",
    category: "WhatsApp & Retention",
    date: "2026-09-16",
    answer: "The WhatsApp Business app is a phone app for small businesses that reply to customers by hand. The WhatsApp Business API, now part of the WhatsApp Business Platform, has no app of its own: software sends and receives messages for you, which allows automation, many agents and high volume, with template approval and usage charges. Choose by volume and how much you need to automate.",
    takeaways: [
      "The Business app is a tool for people typing replies, and the API is a connection for software.",
      "The app suits a founder or a small team handling conversations by hand.",
      "The API suits stores that need messages triggered by order events, several agents and higher volume.",
      "Rules, limits and pricing for both change, so confirm them with WhatsApp or your provider before deciding.",
    ],
    visual: "matrix",
    sections: [
      {
        h: "What is the WhatsApp Business app?",
        p: [
          "The WhatsApp Business app is a separate app from personal WhatsApp, made for small businesses. You install it on a phone, register a business number and chat with customers much as you would with friends. It adds business features such as a profile with your address and hours, a product catalogue, quick replies, labels for chats, and greeting and away messages.",
          "It is built around a person holding a phone. You can link additional devices so a colleague can reply from a computer, but the work is still manual: someone reads each message and types an answer. For a store with a manageable number of chats per day, that is often all that is needed.",
        ],
      },
      {
        h: "What is the WhatsApp Business API?",
        p: [
          "The WhatsApp Business API, part of what Meta calls the WhatsApp Business Platform, is a way for software to send and receive WhatsApp messages. There is no app to open. Instead, your order system, CRM or a provider's shared inbox connects to WhatsApp and handles the conversation. You access it directly through Meta or through a solution provider.",
          "Because software is in control, messages can be triggered by events such as a new order or a shipped parcel, and many agents can work the same number. In return there is more structure. Messages that the business starts generally have to use templates approved in advance, the business goes through verification steps, and usage is billed.",
        ],
      },
      {
        h: "What is the difference between the WhatsApp Business app and the API?",
        p: [
          "The simplest way to see the difference: the app is a product you use, and the API is a connection you build on or buy a tool for. Everything else follows from that. The app is quick to start and limited in automation. The API takes setup and ongoing cost, and in exchange it can run as part of your order flow.",
          "The table summarises the practical differences for a store. Details such as device limits, broadcast rules, template categories and charges are set by WhatsApp and are revised from time to time, so treat this as a general picture and confirm the specifics in WhatsApp's current documentation.",
        ],
        table: {
          cols: ["Aspect", "Business app", "Business API"],
          rows: [
            ["How you use it", "An app on a phone, plus linked devices", "No app of its own. Your software or a provider's inbox sends and receives"],
            ["Who it suits", "Founders and small teams replying by hand", "Teams that need automation, many agents or high volume"],
            ["Automated order messages", "Built-in greetings, away messages and quick replies", "Messages can be triggered by your own systems"],
            ["Messages you start", "Typed or broadcast by a person", "Generally sent as templates approved in advance"],
            ["Setup", "Install and register a number", "Verification, a provider or developer, and template approval"],
            ["Cost", "Check WhatsApp's current terms for the app", "Usage is usually billed. Confirm current pricing with Meta or your provider"],
          ],
        },
      },
      {
        h: "When is the WhatsApp Business app enough?",
        p: [
          "Stay on the app while it is not holding you back. Many young brands run support and even sales from it for a long time. The app keeps you close to customers, costs little effort to maintain, and avoids the work of template approvals and integrations. Moving early mostly adds overhead.",
          "The signs below suggest the app still fits. If most of them describe your store, spend your energy on the product and the checkout instead of on messaging infrastructure. Revisit the question when order volume or team size changes.",
        ],
        list: [
          "One or two people can answer every chat within a reasonable time.",
          "Most conversations are started by customers, not by you.",
          "You do not need messages to fire automatically from order or shipping events.",
          "You are comfortable with conversation history living on a phone and its linked devices.",
          "You do not need reports on response times or message volumes per agent.",
        ],
      },
      {
        h: "When should you move to the API?",
        p: [
          "Move when manual work becomes the bottleneck or when you need messaging to be part of a system. The API is the right tool when the same number has to serve a team, when confirmations and delivery updates must go out without anyone pressing send, or when you want every conversation stored against the customer's order history.",
          "Go in with clear expectations. You will need customer opt-in for the messages you start, your templates will be reviewed, and there will be a bill tied to usage. Ask any provider how they handle opt-outs, what happens to your number if you leave, and what their own fees are on top of WhatsApp's charges.",
        ],
        list: [
          "Several agents need to share one number with clear ownership of each chat.",
          "You want order confirmation, shipping and delivery messages sent automatically.",
          "You need conversations linked to customer and order records.",
          "Message volume is beyond what people can type by hand.",
          "You need an audit trail of who sent what, and when.",
        ],
      },
      {
        h: "How does CodeCrest connect to WhatsApp?",
        p: [
          "There is also a middle path that some operations tools take: linking your existing WhatsApp number by scanning a QR code, the same way you link a device. Your team keeps the number customers already know, and the tool sends templated messages from it. This is not the official API, so it suits sensible volumes to customers who expect to hear from you.",
          "CodeCrest works this way. An admin links the store's own number by QR code, writes templates with variables, and attaches them to order events such as placed, shipped or delivered. Agents can also send a template from a task in one click. Sending is queued and rate limited, and every message is logged on the customer's timeline.",
        ],
      },
    ],
    faqs: [
      ["Can I use the same number on the Business app and the API?", "This depends on WhatsApp's current rules, which have changed over time and can differ by provider. Do not assume either way. Ask your provider and check WhatsApp's documentation before you migrate a number that customers already use."],
      ["Is the WhatsApp Business API only for large companies?", "No. Small and mid-sized stores use it through solution providers. The question is not company size but need: if you require automation, a shared team inbox or higher volume, the API is designed for that. If you do not, the app is simpler."],
      ["Do I need a developer to use the API?", "Not necessarily. Many providers offer a ready inbox and campaign tools on top of the API, so setup is mostly configuration. A developer helps when you want messages triggered from your own systems or need a custom integration."],
      ["What are message templates on the API?", "They are pre-written messages, with placeholders for details such as name and order number, that a business submits for review before using them to start conversations. Categories and approval rules are defined by WhatsApp, so check the current guidelines."],
      ["Does the Business app support automation at all?", "In a limited way. It offers greeting messages, away messages and quick replies you trigger by hand. It is not designed to send a message automatically when an order ships or a delivery fails. That kind of event-driven messaging needs software connected to your order data."],
    ],
    related: ["integrations/whatsapp", "features/whatsapp-automation", "tools/whatsapp-link-generator", "blog/whatsapp-opt-in-for-ecommerce"],
  },
  {
    slug: "whatsapp-opt-in-for-ecommerce",
    title: "WhatsApp opt-in for e-commerce: how to collect consent properly",
    metaTitle: "WhatsApp Opt-In for E-commerce Stores",
    description: "What WhatsApp opt-in means for an e-commerce store, where to collect it, what the wording should say, and how to handle opt-outs without losing trust.",
    keyword: "WhatsApp opt-in",
    category: "WhatsApp & Retention",
    date: "2026-09-24",
    answer: "WhatsApp opt-in is a customer's clear agreement to receive messages from your business on WhatsApp. To collect it properly, ask in plain words at checkout or sign-up, name your business and the kind of messages you will send, let the customer choose freely, keep a record of the consent, and make it easy to opt out at any time.",
    takeaways: [
      "Opt-in means the customer knowingly agreed to hear from your business on WhatsApp.",
      "Ask at the point where the customer gives their number, in words they can understand.",
      "Treat consent for order updates and consent for marketing as two separate things.",
      "Record when and how consent was given, and act on every opt-out promptly.",
    ],
    visual: "people",
    sections: [
      {
        h: "What is WhatsApp opt-in?",
        p: [
          "Opt-in is permission. A customer opts in when they actively agree that your business may message them on WhatsApp. Having someone's phone number is not the same thing. A number collected for delivery tells the courier where to call. It does not tell you the customer wants offers on a personal messaging app.",
          "A valid opt-in is clear about three things: who will send the messages, on which channel, and what kind of messages to expect. It is given by an action, such as ticking a box or sending you a message first. WhatsApp sets its own requirements for businesses, and these are updated from time to time, so read the current policy.",
        ],
      },
      {
        h: "Why does WhatsApp opt-in matter for an e-commerce store?",
        p: [
          "WhatsApp is personal space. People keep family and friends there. A business that turns up uninvited is quickly blocked or reported, and enough of that can put your number at risk under WhatsApp's enforcement. Losing the number customers use to reach you is a serious problem for a store that runs support and order updates on it.",
          "There is also a plain commercial reason. Customers who asked to hear from you read and reply. Customers who did not will ignore you at best. A smaller list of people who opted in is worth more than a large list of numbers scraped from old orders. Local data protection and marketing law may add its own consent requirements, so take advice where needed.",
        ],
      },
      {
        h: "Where can a store collect WhatsApp opt-in?",
        p: [
          "Ask at moments when the customer is already giving you their details or reaching out to you. The request then feels natural instead of intrusive. You do not need every method below. One or two that fit your store, done clearly, are enough to build a list you can message with confidence.",
          "Whichever you use, keep a record: the number, the date, the place the consent was collected and the wording shown at the time. If a customer or a platform ever questions a message, that record is your answer. A spreadsheet is fine to begin with, as long as it is kept up to date.",
        ],
        list: [
          "A checkbox at checkout, next to the phone number field, left unticked by default.",
          "A sign-up form on the site for back-in-stock or launch alerts.",
          "A click-to-chat link or QR code on the site, packaging or invoice, where the customer messages you first.",
          "The order status or thank-you page, offering delivery updates on WhatsApp.",
          "A support conversation, where an agent asks before adding the customer to updates.",
          "An in-person sign-up at a pop-up or store counter, recorded at the time.",
        ],
      },
      {
        h: "What should the opt-in wording say?",
        p: [
          "Write it the way you would say it across a counter. Name your store, name WhatsApp, and say what you will send. Avoid vague phrases about communications from partners. Do not pre-tick the box and do not make the purchase conditional on agreeing to marketing. The customer should be able to say no and still check out.",
          "Mention how to stop. A short line telling customers they can reply STOP at any time makes people more willing to say yes, because they know the way out. The examples below can be adapted. Have someone outside the team read your final wording to check that it is understood on first reading.",
        ],
        list: [
          "Send me order and delivery updates from {{store_name}} on WhatsApp.",
          "Yes, {{store_name}} may message me on WhatsApp about offers and new launches. I can reply STOP at any time.",
          "Get a WhatsApp alert from {{store_name}} when {{product_name}} is back in stock.",
          "Message us on WhatsApp to get help with your order. By messaging, you agree that {{store_name}} can reply to you here.",
        ],
      },
      {
        h: "Is opt-in for order updates the same as opt-in for marketing?",
        p: [
          "No, and it is safer to keep them apart. A customer who wants to know when their parcel ships has not necessarily agreed to weekly offers. If you collect a single broad consent, some customers will feel misled when promotions arrive. Two separate choices, clearly labelled, respect the customer and give you cleaner lists.",
          "The table shows a practical way to split message types. How WhatsApp itself classifies messages, and what it requires for each class, is set out in its business policies and can change. Use the table as a working guide for your own consent design, and check the current policy for the product you send from.",
        ],
        table: {
          cols: ["Message type", "Example", "Consent to collect"],
          rows: [
            ["Order updates", "Confirmation, shipped, out for delivery", "Agreement to receive order updates on WhatsApp"],
            ["Service follow-up", "Failed delivery, address check, COD confirmation", "Covered by order updates, tied to that order"],
            ["Cart reminders", "A reminder about an unfinished checkout", "Agreement to reminders or marketing, given before you send"],
            ["Marketing", "Offers, launches, win-back and reorder campaigns", "A separate, explicit agreement to promotional messages"],
            ["Feedback", "Review request after delivery", "Best covered in your order update wording"],
          ],
        },
      },
      {
        h: "How should you handle WhatsApp opt-outs?",
        p: [
          "Make stopping as easy as starting. Accept a reply of STOP, or any clear request in the customer's own words, and act on it straight away. Confirm once that they have been removed, then send nothing further of that type. Do not ask why, and do not try to win them back in the same message.",
          "Keep an opt-out list and check every campaign against it before sending. The most common failure is a customer who opted out and is then re-added by a fresh import of order data. Decide whether an opt-out covers marketing only or all messages, and say so in your confirmation. If in doubt, stop everything except messages about an order in progress.",
        ],
      },
      {
        h: "How does CodeCrest fit into an opt-in process?",
        p: [
          "Collecting consent happens in your store, at checkout and on your forms, and stays your responsibility. CodeCrest is where the messaging is carried out. Messages go from your store's own WhatsApp number, linked by QR code, using your templates, and sending is queued and rate limited to keep volume sensible.",
          "Every message is logged on the customer's timeline with the rule or agent that sent it, so you can show what a customer received and when. Campaigns go to segments you define, which lets you limit them to customers who agreed to marketing. A customer marked unresponsive drops out of the active follow-up queue.",
        ],
      },
    ],
    faqs: [
      ["Does a customer messaging us first count as opt-in?", "A customer who messages you has invited a reply to that conversation. It does not automatically mean they agreed to future promotions. If you want to send offers later, ask during the chat and record the answer. Check WhatsApp's current policy on this point."],
      ["Can I message old customers who never opted in?", "It is safer not to send them marketing on WhatsApp. Use a channel they did agree to, such as email, to invite them to opt in, or ask the next time they order. Building the list slowly is better than risking blocks and reports."],
      ["Should the opt-in checkbox be pre-ticked?", "No. A pre-ticked box is not a real choice, and many customers will not notice it. Leave it unticked and let the wording do the work. People who tick it themselves are the ones who will read and respond to your messages."],
      ["How long does an opt-in last?", "There is no universal expiry, but consent goes stale. If a customer has not ordered or replied for a long time, treat the opt-in with care, message less often, and remove people who never engage. Follow any time limits in WhatsApp's policy or local law."],
      ["What records should we keep?", "Keep the phone number, the date and time of consent, where it was collected, the exact wording shown and the type of messages agreed to. Store opt-outs with a date too. These records help you answer complaints and keep imports from re-adding people."],
    ],
    related: ["integrations/whatsapp", "features/whatsapp-automation", "tools/whatsapp-link-generator", "blog/whatsapp-business-app-vs-api"],
  },
  {
    slug: "abandoned-checkout-vs-abandoned-cart",
    title: "Abandoned checkout vs abandoned cart: what is the difference?",
    metaTitle: "Abandoned Checkout vs Abandoned Cart Explained",
    description: "Abandoned checkout vs abandoned cart: what each term means, why only one gives you contact details, and how the difference changes your recovery plan.",
    keyword: "abandoned checkout vs abandoned cart",
    category: "WhatsApp & Retention",
    date: "2026-10-01",
    answer: "An abandoned cart is when a shopper adds products to the cart and leaves before starting checkout. An abandoned checkout is when the shopper starts checkout, usually entering a phone number or email, and leaves before paying. The difference matters because an abandoned checkout gives you contact details for follow-up, while most abandoned carts are anonymous.",
    takeaways: [
      "A cart is abandoned before checkout begins, and a checkout is abandoned after it begins.",
      "Abandoned checkouts usually carry a phone number or email, so they can be followed up directly.",
      "Anonymous abandoned carts are fixed on the store itself, not through messages.",
      "Measure the two separately, because they point to different problems.",
    ],
    visual: "flow",
    sections: [
      {
        h: "What is an abandoned cart?",
        p: [
          "An abandoned cart is a shopping cart with products in it that never reaches checkout. The shopper tapped add to cart, perhaps looked at the cart page, and then left. This is the widest and least committed group. Many of these visitors were comparing prices, saving items for later or simply browsing with no plan to buy today.",
          "In most cases you do not know who they are. Unless the visitor was logged in or had given their details earlier, the cart belongs to an anonymous browser session. You can see that it happened in your analytics, but there is nobody to message. That single fact decides what you can do about it.",
        ],
      },
      {
        h: "What is an abandoned checkout?",
        p: [
          "An abandoned checkout is one step further along. The shopper went from the cart into checkout and began filling it in, typically giving a phone number or email and often an address, and then left before the order was completed. They showed stronger intent, and they stopped at a specific point you can often identify.",
          "Shopify records these in the admin as abandoned checkouts, with the contact details and the cart contents attached. Exactly when a checkout is saved and counted as abandoned depends on Shopify's current behaviour, so check its documentation. The practical point is that these records are the ones a recovery process works from.",
        ],
      },
      {
        h: "What is the difference between an abandoned checkout and an abandoned cart?",
        p: [
          "The two terms are often used as if they meant the same thing, and in casual speech that is fine. Most articles about cart recovery are really about checkout recovery, since that is the only kind you can do by message. When you sit down to plan or to read a report, though, be exact about which one a number refers to.",
          "The table sets the two side by side. The key row is contact details. Everything about how you respond follows from whether you can reach the person or not.",
        ],
        table: {
          cols: ["Aspect", "Abandoned cart", "Abandoned checkout"],
          rows: [
            ["Where the shopper stopped", "After adding to cart, before checkout", "During checkout, before the order completed"],
            ["Contact details", "Usually none", "Usually a phone number or email"],
            ["Level of intent", "Lower, often browsing", "Higher, was in the act of buying"],
            ["Likely causes", "Price check, comparison, distraction", "Shipping cost, payment failure, a doubt at the last step"],
            ["How to respond", "Improve product page, cart and trust signals", "Reminders, then a call for valuable carts"],
          ],
        },
      },
      {
        h: "Why does the difference matter for recovery?",
        p: [
          "Because the two need different work from different people. Abandoned checkouts are an operations task: someone, or some automation, has to contact each customer and close the loop. Abandoned carts are a store design task: the product page, pricing display and cart need to give visitors enough confidence to take the next step.",
          "Mixing them leads to bad decisions. If you judge your recovery messages against all abandoned carts, the results will look weak, since most of those people could never be contacted. If you watch only checkouts, you can miss a product page problem that stops visitors much earlier. Track both, and label them clearly in your reports.",
        ],
      },
      {
        h: "How do you recover an abandoned checkout?",
        p: [
          "Treat each abandoned checkout as a small piece of unfinished business with a named customer. The process is short. What makes it work is doing it consistently for every checkout, promptly, and stopping the moment the customer buys. Contact only customers who opted in to hear from you on the channel you use.",
          "Give the process an owner. When recovery is nobody's job, it is done on quiet days and forgotten on busy ones, which is exactly when the most checkouts are abandoned.",
        ],
        list: [
          "Send a short reminder soon after abandonment, with the product name and a link back to the cart.",
          "Follow up once with something useful, such as delivery time, return policy or payment options.",
          "Route higher-value checkouts to an agent for a call or a personal message.",
          "Record an outcome for each one: recovered, lost with a reason, or unreachable.",
          "Stop all contact as soon as the customer places the order.",
        ],
      },
      {
        h: "What can you do about abandoned carts with no contact details?",
        p: [
          "You cannot message an anonymous visitor, so the work moves to the store. The aim is twofold: remove the doubts that stop people at the cart, and give visitors a good reason to identify themselves earlier. Small, honest improvements here tend to help every visitor, not only the ones who abandoned.",
          "Be careful with pop-ups that demand a phone number before the visitor has seen anything. They collect numbers, but not willing ones. Offer something the visitor wants, such as a back-in-stock alert or delivery updates, and ask for consent in clear words.",
        ],
        list: [
          "Show shipping cost and delivery estimate before checkout, ideally on the product page.",
          "State return and exchange terms near the add to cart button.",
          "Make the payment options, including cash on delivery if offered, visible early.",
          "Keep the cart saved so a returning visitor finds it as they left it.",
          "Ask for the phone number or email at the first step of checkout, so a later exit becomes a recoverable checkout.",
        ],
      },
      {
        h: "How does CodeCrest handle abandoned checkouts?",
        p: [
          "CodeCrest works on the recoverable side. It syncs abandoned checkouts from Shopify and turns each one into a recovery task with the customer's cart and phone number. A templated WhatsApp reminder goes out first from your store's own number. Checkouts that still do not convert are queued for an agent, sorted by cart value and age.",
          "When the customer orders, the task closes by itself and the order is matched back to the checkout. That gives you a recovery figure based on real orders, attributed to the reminder or the agent who closed it. Anonymous carts with no contact details are outside what any follow-up tool can reach.",
        ],
      },
    ],
    faqs: [
      ["Are abandoned cart and abandoned checkout the same thing in Shopify?", "Shopify's admin uses the term abandoned checkouts for sessions where a customer started checkout and did not finish. Carts that never reached checkout are not listed there in the same way. Check Shopify's current documentation for the exact definition it applies."],
      ["Which one should I focus on first?", "Start with abandoned checkouts. The customers are identifiable, their intent was high and a simple reminder process can be set up quickly. Once that runs reliably, look at where anonymous visitors drop off before checkout and improve those pages."],
      ["Why do my abandoned cart numbers look so high?", "Because adding to cart is a low-commitment action. Many shoppers use the cart as a wishlist or to see the final price. A high count is normal and does not mean all of that revenue was ever available to recover."],
      ["Can I send a WhatsApp reminder for an abandoned cart?", "Only if you know who the visitor is and they have opted in to hear from you. That is usually true for abandoned checkouts and for logged-in customers, and rarely true for anonymous carts."],
      ["How do I measure checkout recovery properly?", "Count a checkout as recovered only when an order from the same customer follows your contact, and count it once. Report it against abandoned checkouts you could contact, not against all carts. Use the cart recovery calculator to estimate what that is worth."],
    ],
    related: ["features/abandoned-cart-recovery", "integrations/shopify", "resources/abandoned-cart-recovery-guide", "tools/cart-recovery-calculator"],
  },
  {
    slug: "reasons-for-cart-abandonment",
    title: "Reasons for cart abandonment, and what to do about each one",
    metaTitle: "Reasons for Cart Abandonment in D2C Stores",
    description: "The common reasons for cart abandonment in Indian D2C stores, how to find out which ones apply to you, and what to fix on the store versus in follow-up.",
    keyword: "reasons for cart abandonment",
    category: "WhatsApp & Retention",
    date: "2026-10-09",
    answer: "The common reasons for cart abandonment are unexpected shipping or other charges at checkout, payment failures, a long or confusing checkout, doubts about delivery time or returns, lack of trust in an unfamiliar store, the preferred payment method being unavailable, and shoppers who were only browsing or comparing. Each has a different fix, so find out which ones apply to your store.",
    takeaways: [
      "Cart abandonment has several distinct causes, and each needs its own fix.",
      "Surprise charges and payment trouble are problems with the store, not with the customer.",
      "The fastest way to learn your own reasons is to ask customers who abandoned.",
      "Some abandonment is normal browsing and cannot be recovered.",
    ],
    visual: "chart",
    sections: [
      {
        h: "What are the main reasons for cart abandonment?",
        p: [
          "Shoppers leave for practical reasons far more often than mysterious ones. Something at or near checkout did not match what they expected, or a question went unanswered at the moment they needed the answer. The list below covers the causes that come up again and again in online stores of every size.",
          "Your store will not have all of them in equal measure. One or two usually dominate, and they differ by category and price point. A low-priced impulse product loses people to shipping charges. A higher-priced product loses them to doubt about quality and returns. Treat the list as a checklist to investigate, not as a diagnosis.",
        ],
        list: [
          "Extra costs that appear late, such as shipping, COD fees or taxes.",
          "Payment failure, a declined card or a UPI or OTP step that did not complete.",
          "A checkout that is long, asks for an account, or breaks on mobile.",
          "No clear answer on delivery time to the customer's pincode.",
          "Uncertainty about returns, exchanges or refunds.",
          "Low trust in a store the customer has not bought from before.",
          "The shopper was comparing, saving for later or waiting for payday.",
        ],
      },
      {
        h: "Which reasons are specific to Indian D2C stores?",
        p: [
          "A few causes are sharper in India. Cash on delivery is one. Many shoppers will not pay a new brand in advance, so a checkout without COD, or with COD switched off for their pincode, ends the purchase. A COD fee revealed at the last step has a similar effect. If you restrict COD, say so early and explain the alternative.",
          "Payments and serviceability are the others. Online payment depends on an OTP arriving or a UPI app responding, on a mobile connection that may be patchy. A failed attempt often looks to the customer like the store is broken. Pincode coverage matters too. Customers in smaller towns want to know before checkout whether you deliver to them and how long it takes.",
        ],
      },
      {
        h: "How do you find out why your own customers abandon?",
        p: [
          "General lists only take you so far. The reasons that matter are the ones your customers give. The good news is that finding out does not need special tools. It needs someone to look at the checkout the way a customer does, and someone to ask the people who left.",
          "Record what you learn in the same few categories every time. A pile of free-text notes cannot be counted. A short list of reasons, such as shipping cost, payment failed, wanted COD, delivery too slow, changed mind, lets you see within a few weeks which problem is costing you the most.",
        ],
        list: [
          "Place a test order on a basic phone on mobile data, for both prepaid and COD.",
          "Look at where in the checkout most sessions stop, using your store analytics.",
          "Call or message a sample of customers who abandoned and ask what stopped them.",
          "Read support chats and replies to cart reminders for repeated questions.",
          "Have agents record a reason every time a recovery attempt is closed as lost.",
        ],
      },
      {
        h: "Which reasons can you fix on the store, and which need follow-up?",
        p: [
          "Some causes should be removed at the source so they never reach a customer. Others are personal to one shopper and are best handled in a conversation. Sorting your reasons into these two groups tells you whether the next piece of work belongs to whoever runs the storefront or to the support team.",
          "The table gives a starting split. In practice most reasons need a bit of both: fix the page so fewer people hit the problem, and train agents to handle the ones who still do. Review the split whenever you change shipping rules, payment providers or product range.",
        ],
        table: {
          cols: ["Reason", "Fix on the store", "Fix in follow-up"],
          rows: [
            ["Unexpected charges", "Show shipping and COD fees before checkout", "Explain the total clearly if asked"],
            ["Payment failed", "Offer more than one payment method and a retry", "Send the cart link again, or offer another way to pay"],
            ["Delivery doubt", "Pincode check and estimate on the product page", "Give an honest estimate for their location"],
            ["Returns doubt", "Short, visible return terms near the buy button", "Share the policy link and answer specifics"],
            ["Low trust", "Real reviews, contact details, clear policies", "A personal message or call from a named agent"],
            ["Just browsing", "Keep the cart saved for their return", "One polite reminder, then leave them be"],
          ],
        },
      },
      {
        h: "Is every abandoned cart a lost sale?",
        p: [
          "No. A cart is not a promise. People add items to see the final price, to compare two options, or to remember a product for later. Counting every abandoned cart as revenue that slipped away gives an inflated and discouraging picture. Some of those shoppers come back on their own. Many were never going to buy this week.",
          "A more useful view is to separate what was recoverable from what was not. A customer who reached payment and failed was recoverable. A visitor who added an item and left in seconds probably was not. Put your effort into the first group and judge your results against it. Accept the second group as a normal part of selling online.",
        ],
      },
      {
        h: "How does CodeCrest help you act on abandonment reasons?",
        p: [
          "CodeCrest turns each abandoned Shopify checkout into a recovery task. A WhatsApp reminder goes out first from your store's own number, and carts that do not convert are passed to an agent to message or call. Those conversations are where the real reasons surface: a delivery question, payment trouble, a doubt about sizing.",
          "Agents close each task with an outcome, not just a tick, and those outcomes feed the reports. Over time you can see how many carts were recovered, by a reminder or by a person, and what happened to the rest. That gives the person running the storefront a grounded list of what to fix next.",
        ],
      },
    ],
    faqs: [
      ["What is the single biggest reason for cart abandonment?", "There is no one answer that holds for every store. Late surprise costs and payment problems are common, but the leading cause depends on your category, price and audience. Ask a sample of your own customers before deciding where to spend effort."],
      ["Does offering COD reduce cart abandonment?", "It can bring in shoppers who will not prepay an unfamiliar brand. It also brings the risk of refused deliveries. Many stores offer COD with a verification step, or limit it by pincode or order value, instead of choosing all or nothing."],
      ["Will a discount fix cart abandonment?", "Only where price was the real obstacle. A discount does nothing for a failed payment or a missing delivery estimate, and offering one routinely teaches customers to abandon on purpose. Fix the cause first and keep incentives as a later, limited step."],
      ["How do I reduce abandonment caused by payment failures?", "Offer more than one way to pay, make retrying easy, and keep the cart intact after a failure. A prompt message with the cart link helps the customer try again. Test your payment flow on a slow mobile connection regularly."],
      ["Should I call customers who abandon their cart?", "For higher-value carts, a short call is often worth it, provided the customer has agreed to be contacted. A person can answer the specific question that stopped the purchase. Keep the call helpful and brief, and do not pressure."],
    ],
    related: ["features/abandoned-cart-recovery", "resources/abandoned-cart-recovery-guide", "tools/cart-recovery-calculator", "blog/abandoned-checkout-vs-abandoned-cart"],
  },
  {
    slug: "reorder-reminders-for-repeat-purchases",
    title: "Reorder reminders: how to bring customers back before they run out",
    metaTitle: "Reorder Reminders for Repeat Purchases",
    description: "How reorder reminders work for D2C brands: which products suit them, how to time the message to the product, and templates that bring repeat purchases.",
    keyword: "reorder reminders",
    category: "WhatsApp & Retention",
    date: "2026-10-17",
    answer: "Reorder reminders are messages sent to past customers around the time a consumable product is likely to run out, inviting them to buy it again. To use them well, estimate how long each product lasts, send the reminder shortly before that point with a direct link to reorder, and stop once the customer has purchased or opted out.",
    takeaways: [
      "Reorder reminders work for products that are used up and bought again.",
      "Time the reminder to how long the product lasts, not to your campaign calendar.",
      "Make reordering a single tap by linking straight to the product or a pre-filled cart.",
      "Skip customers who already reordered, returned the product or complained about it.",
    ],
    visual: "board",
    sections: [
      {
        h: "What is a reorder reminder?",
        p: [
          "A reorder reminder is a prompt to buy again, sent when the customer is likely to need the product. It is different from a promotion. A promotion goes to everyone on a date you chose. A reorder reminder goes to one customer on a date set by their own purchase. It is closer to a service than to advertising.",
          "The idea is simple. Someone bought a product that gets used up. At some point the pack will be nearly empty. If your message arrives around then, with an easy way to reorder, you save them a search and keep them from picking up a competing product at the nearest shop.",
        ],
      },
      {
        h: "Which products suit reorder reminders?",
        p: [
          "Reorder reminders fit anything with a predictable life. If a customer who likes the product will need more of it, and you can roughly guess when, it is a candidate. They do not fit one-off purchases. Nobody needs a reminder to buy a second pair of the same shoes a month later.",
          "Start with your best-selling consumables, where the pattern is clearest. Look at customers who have bought the same item more than once and see how far apart those orders were. That gap, more than any guess based on pack size, tells you when people actually come back.",
        ],
        list: [
          "Supplements, health foods and wellness products taken daily.",
          "Skincare, haircare and personal care items.",
          "Tea, coffee, snacks and pantry staples.",
          "Pet food and pet care supplies.",
          "Baby care products that are used continuously.",
          "Refills, filters and replacement parts with a known service life.",
        ],
      },
      {
        h: "How do you time a reorder reminder?",
        p: [
          "Work out how long one unit lasts and send the reminder a little before that. Here is an example for illustration only: if a pack holds thirty daily servings, it lasts about a month, so a reminder a few days before the month is up, allowing for delivery time, is a sensible first guess. Count from the delivery date, not the order date.",
          "Then check the guess against behaviour. If customers tend to reorder later than the pack size suggests, they are using less than the label says, and your reminder is early. Shift it. For customers who bought several units at once, multiply the wait accordingly, or you will remind them while the cupboard is still full.",
        ],
        table: {
          cols: ["Product type", "How to estimate the cycle", "When to remind"],
          rows: [
            ["Daily-use consumable with a fixed count", "Servings in the pack divided by daily use", "A few days before it runs out, allowing for delivery"],
            ["Product used at a variable rate", "Typical gap between repeat orders in your own data", "Slightly before that typical gap"],
            ["Multi-pack or bundle", "Single-unit cycle multiplied by units bought", "Near the end of the last unit"],
            ["Refill or replacement part", "The stated service life of the part", "Shortly before the service life ends"],
          ],
        },
      },
      {
        h: "What should a reorder reminder say?",
        p: [
          "Keep it short and specific. Name the product the customer bought, say that it may be running low, and give a link that takes them straight to it. Use the customer's name. Do not dress it up as an urgent offer. The honest reason for the message, that they may need more, is persuasive enough.",
          "Send reminders only to customers who agreed to receive messages of this kind, and include a simple way to stop. Replace the placeholders below with your own variables. If you sell several products to the same customer, remind them about the one they buy most, not about each item separately.",
        ],
        list: [
          "Hi {{name}}, your {{product_name}} from {{store_name}} may be running low. You can reorder here: {{reorder_link}}. Reply STOP if you do not want these reminders.",
          "Hi {{name}}, it has been about {{weeks}} weeks since your last order of {{product_name}}. Need a refill? {{reorder_link}}",
          "Hello {{name}}, this is {{store_name}}. If you are nearly out of {{product_name}}, your usual order is one tap away: {{reorder_link}}. Any questions, just reply.",
          "Hi {{name}}, hope {{product_name}} is working well for you. Whenever you are ready for the next pack, here is the link: {{reorder_link}}",
          "Hi {{name}}, a quick reminder from {{store_name}} about {{product_name}}. Would you like the same pack again, or a different size? Reply and we will help.",
        ],
      },
      {
        h: "What mistakes make reorder reminders annoying?",
        p: [
          "The first is reminding someone who has already bought. If a customer reordered last week and still gets a message saying they may be running low, they learn that your reminders are not really about them. Check for a recent order before every send. The same applies to customers who returned the product or raised a complaint about it.",
          "The second is repetition. One reminder is helpful, a second a week or so later is acceptable, and anything beyond that is nagging. If two reminders bring no order, the customer has moved on or still has stock. Leave them, and let a later win-back campaign take over if they stay quiet for a long time.",
        ],
      },
      {
        h: "How does CodeCrest help with reorder reminders?",
        p: [
          "CodeCrest syncs orders, customers and products from Shopify, and a backfill imports past orders so there is purchase history to work from on day one. Reorder is one of its built-in task and message types. A reorder reminder can be timed to the product and sent on WhatsApp from your store's own number, using your template.",
          "Reminders can go out automatically, or appear as tasks for an agent to send or call. Each message is logged on the customer's timeline, and a customer's orders sit on one record merged by phone number. Reports show how many customers reordered, so you can see whether the timing you chose is working.",
        ],
      },
    ],
    faqs: [
      ["How many reorder reminders should I send per purchase?", "One, and at most a second about a week later if there is no order. Beyond that the message stops being a service and becomes pressure. Always check for a new order before sending the second reminder."],
      ["Should a reorder reminder include a discount?", "It does not need one. The customer already knows and uses the product, so convenience is the draw. If you discount every reminder, customers will wait for it. Consider a subscription or a larger pack as the way to offer better value."],
      ["What if I do not know how long my product lasts?", "Look at customers who bought the same product twice and measure the time between their orders. The typical gap is your starting point. With no repeat data yet, use the pack size and suggested use, then adjust as orders come in."],
      ["Is WhatsApp or email better for reorder reminders?", "Use the channel the customer opted in to and responds on. WhatsApp is quick and easy to reply to, which helps when the customer wants a different size or has a question. Email works well as a quieter second channel."],
      ["How are reorder reminders different from subscriptions?", "A subscription charges and ships automatically on a schedule. A reorder reminder leaves the decision with the customer each time. Reminders suit customers who do not want a commitment, and they are a useful way to learn real usage before you offer subscriptions."],
    ],
    related: ["features/whatsapp-automation", "features/shopify-order-management", "tools/customer-lifetime-value-calculator", "blog/customer-win-back-campaigns"],
  },
  {
    slug: "how-to-ask-customers-for-reviews",
    title: "How to ask customers for reviews without being pushy",
    metaTitle: "How to Ask Customers for Reviews (With Templates)",
    description: "How to ask customers for reviews after delivery: the right timing, honest wording, copy-ready WhatsApp templates and what to do with negative feedback.",
    keyword: "how to ask customers for reviews",
    category: "WhatsApp & Retention",
    date: "2026-10-25",
    answer: "To ask customers for reviews, wait until the order is delivered and the customer has had time to use the product, then send one short, personal message with a direct link to the review form. Ask for honest feedback, not a positive rating. Make it quick to complete, thank people who respond, and act on complaints.",
    takeaways: [
      "Ask after the customer has used the product, not the moment it is delivered.",
      "Request honest feedback and never ask only happy customers or pay for praise.",
      "One direct link and a short message get more responses than a long form.",
      "A negative review is a support case first and should be answered quickly.",
    ],
    visual: "chat",
    sections: [
      {
        h: "When is the right time to ask a customer for a review?",
        p: [
          "After delivery, and after enough time to form an opinion. That gap depends on the product. A phone cover can be judged within a day or two. A skincare product or a supplement needs longer before the customer can say anything useful. Ask too early and you get a review of the packaging, or no reply at all.",
          "Never ask before the parcel has arrived. A review request that lands while the order is still in transit, or after a failed delivery, tells the customer your messages are not connected to reality. Tie the request to the delivered status, add a waiting period that suits the product, and skip any order with an open complaint or return.",
        ],
      },
      {
        h: "How do you ask for a review without being pushy?",
        p: [
          "Ask once, plainly, and make it easy. Use the customer's name, mention the product, say that their view helps other shoppers, and give one link. That is the whole message. The request should feel like a person at the store asking how it went, not like a system collecting ratings.",
          "Ask for honesty. Wording such as 'tell us what you think' invites a real answer. Wording that asks for five stars does not, and customers find it off-putting. If someone does not respond, one gentle follow-up is reasonable. After that, let it go. A customer who feels chased will remember the chasing longer than the product.",
        ],
      },
      {
        h: "What are good review request templates?",
        p: [
          "The templates below are written for WhatsApp but work on email and SMS with small changes. Each one is short enough to read without expanding the message. Replace the placeholders with your own variables, and send only to customers who agreed to receive messages from you on that channel.",
          "Test the review link yourself on a phone before you send anything. If the link opens a login page or a long form, most people will stop there. The best review flow asks for a rating and a sentence, and lets a photo be added as an option.",
        ],
        list: [
          "Hi {{name}}, your {{product_name}} from {{store_name}} was delivered recently. How has it been? We would value your honest review: {{review_link}}",
          "Hi {{name}}, thank you for ordering from {{store_name}}. If you have a minute, please tell other shoppers what you think of {{product_name}}: {{review_link}}",
          "Hello {{name}}, this is {{agent_name}} from {{store_name}}. Is everything fine with order {{order_id}}? If something is not right, reply here and I will help. If all is well, a short review would mean a lot: {{review_link}}",
          "Hi {{name}}, a quick question about {{product_name}}: what did you like, and what could be better? Share your thoughts here: {{review_link}}",
          "Hi {{name}}, thank you for your review of {{product_name}}. We read every one, and yours helps other customers choose.",
        ],
      },
      {
        h: "Which channel should you use to ask for reviews?",
        p: [
          "Use the channel where the customer already hears from you about their order. If delivery updates went by WhatsApp, a review request there continues the same conversation. If the relationship has been by email, stay on email. Switching channels for the review request alone feels abrupt.",
          "Each channel has strengths. The table compares the usual options. Many stores use one channel for the request and a call only when the response suggests a problem. Whatever you choose, do not send the same request on every channel at once.",
        ],
        table: {
          cols: ["Channel", "Good for", "Watch out for"],
          rows: [
            ["WhatsApp", "Quick replies and photos, a personal tone", "Needs opt-in, and must stay short"],
            ["Email", "Longer requests and a formal record", "Easy to overlook in a crowded inbox"],
            ["SMS", "Customers who are not on WhatsApp", "Very little room for text, and links can look untrustworthy"],
            ["Phone call", "High-value orders and resolving problems", "Takes agent time, so use it selectively"],
            ["Card in the parcel", "A reminder at the moment of unboxing", "Arrives before the customer has used the product"],
          ],
        },
      },
      {
        h: "What should you do with negative feedback?",
        p: [
          "Treat it as a support case before you treat it as a review. Reply quickly, apologise where the store was at fault, and fix the problem: a replacement, a refund or a clear explanation. Most unhappy customers want to be heard and helped. A fast, fair response often matters more to them than the original mistake.",
          "Do not hide negative reviews or argue with them in public. A page with only perfect ratings is less believable than one with a few criticisms and thoughtful replies. Feed what you learn back to whoever can fix the cause, whether that is packaging, sizing information or the courier you use for a region.",
        ],
      },
      {
        h: "What should you never do when asking for reviews?",
        p: [
          "Reviews are only useful to shoppers if they are real. Practices that manufacture or filter them can breach marketplace and platform rules and consumer protection law, and they damage trust when discovered. Check the current rules of any platform where your reviews appear, and avoid the shortcuts listed below.",
          "The test is simple. Would you be comfortable if customers could see exactly how you collect reviews? If yes, carry on. If a practice only works when customers do not know about it, drop it.",
        ],
        list: [
          "Do not write, buy or commission fake reviews.",
          "Do not offer a reward only for positive reviews.",
          "Do not send the review link only to customers you expect to be happy.",
          "Do not ask before the order has been delivered.",
          "Do not send repeated reminders after the customer has ignored two requests.",
          "Do not edit or remove honest criticism because it is unflattering.",
        ],
      },
      {
        h: "How does CodeCrest help with review requests?",
        p: [
          "CodeCrest tracks shipment status through Shiprocket, so it knows when an order is delivered. A review request can then be sent on WhatsApp from your store's own number using your template, or raised as a task for an agent. Review request is one of the built-in task types, alongside reorder and win-back.",
          "Each message and reply is logged on the customer's timeline with their orders and calls. If a customer answers the request with a complaint, the agent who picks it up sees the full history. That makes it easier to resolve the problem first and ask for the review again later, if it is still appropriate.",
        ],
      },
    ],
    faqs: [
      ["How long after delivery should I ask for a review?", "Long enough for the customer to use the product. For simple items that may be a couple of days. For products that take time to show results, wait longer. Set the delay per product type instead of one rule for the whole store."],
      ["Can I offer a discount in exchange for a review?", "Be careful. An incentive tied to a positive review is misleading. If you offer a small thank-you for any honest review, good or bad, disclose it and check the rules of the platform where reviews appear, as some restrict incentives altogether."],
      ["Should I ask every customer or only happy ones?", "Ask everyone whose order was delivered without an open complaint. Asking only customers you expect to be happy filters the results and misleads shoppers. It also hides problems you would want to know about."],
      ["What if very few customers leave reviews?", "Check the basics first. Is the request arriving at a sensible time, is the message short, and does the link open a quick form on a phone? Small fixes there usually matter more than extra reminders."],
      ["Do photo reviews matter?", "They help shoppers see the product in real use, which is valuable for clothing, home and beauty products. Make adding a photo optional and easy. Never require one, since that lowers the number of people who finish the review."],
    ],
    related: ["features/whatsapp-automation", "solutions/customer-support-teams", "integrations/whatsapp", "blog/reorder-reminders-for-repeat-purchases"],
  },
  {
    slug: "customer-win-back-campaigns",
    title: "Customer win-back campaign: how to bring lapsed customers back",
    metaTitle: "Customer Win-Back Campaign: A Practical Guide",
    description: "How to plan a customer win-back campaign: define lapsed customers, build a short message sequence, decide on incentives and measure who really came back.",
    keyword: "customer win-back campaign",
    category: "WhatsApp & Retention",
    date: "2026-11-02",
    answer: "A customer win-back campaign is a short series of messages aimed at past customers who have stopped buying, with the goal of earning one more order. To run one, define what lapsed means for your products, segment those customers, send two or three relevant messages over a few weeks, and stop contacting anyone who does not respond.",
    takeaways: [
      "Define a lapsed customer from your own repeat-purchase pattern, not from a generic rule.",
      "Start the sequence with a reason to return, and hold any incentive for a later step.",
      "Keep the sequence short and remove customers who do not respond.",
      "Judge the campaign by orders from the contacted group, compared with a group you did not contact.",
    ],
    visual: "flow",
    sections: [
      {
        h: "What is a customer win-back campaign?",
        p: [
          "A win-back campaign targets people who bought from you before and then went quiet. They know your brand and have already trusted you with an order. That makes them easier to reach than strangers. Their silence also carries information: something changed, whether a need ended, a competitor appeared or an order went badly.",
          "The campaign is a deliberate, limited attempt to reopen the relationship. It is not a blast to your whole list. It goes to a defined group, says something relevant to them, and ends after a few messages. Customers who return go back into normal communication. Customers who stay silent are left alone.",
        ],
      },
      {
        h: "How do you decide who counts as a lapsed customer?",
        p: [
          "Use your own buying pattern. Look at how long your repeat customers usually take between orders. A customer becomes lapsed when they have gone clearly longer than that without buying. Here is an example for illustration only: if repeat customers typically reorder within about two months, someone silent for four months has broken the pattern.",
          "The threshold differs by product. A daily consumable has a short cycle, so a customer lapses quickly. Clothing or home goods are bought less often, and a long silence is normal. Set the threshold per category if your range is mixed. Exclude customers who opted out, who have an unresolved complaint, or whose last order was returned or refused.",
        ],
      },
      {
        h: "What does a win-back sequence look like?",
        p: [
          "Two or three messages spread over a few weeks is enough. Each one should do something different. The first reconnects. The second gives a concrete reason to return. The third, if you send one, makes a final offer or simply says goodbye politely. Stop the sequence as soon as the customer orders or replies.",
          "The schedule below is a starting point. Leave real gaps between messages. A lapsed customer has not thought about you in months, and three messages in a week will feel like an ambush. Send only to customers who opted in to marketing on the channel you use.",
        ],
        table: {
          cols: ["Step", "Timing", "Content"],
          rows: [
            ["Reconnect", "When the customer crosses your lapsed threshold", "A friendly note, what is new, a link to their usual product"],
            ["Reason to return", "A week or two later", "A new launch, an improvement, or an answer to a common concern"],
            ["Final message", "A further week or two later", "An incentive if you use one, or a polite last note"],
            ["Stop", "After the final message", "No further win-back contact. Keep them out of the next campaign"],
          ],
        },
      },
      {
        h: "What are good win-back message templates?",
        p: [
          "Write as someone who remembers the customer, not as a brand that noticed a gap in its numbers. Mention what they bought. Say what has changed since. Ask a question if you would like an answer, because a reply telling you why they left is worth as much as an order.",
          "Replace the placeholders below with your own variables. Keep any offer truthful: if you give an end date, it must be the real end date. Do not claim an offer is exclusive or limited unless it is.",
        ],
        list: [
          "Hi {{name}}, it has been a while since your last order from {{store_name}}. We have added {{new_product}} since then. Have a look: {{store_link}}",
          "Hi {{name}}, this is {{store_name}}. You ordered {{product_name}} some time ago. Is there anything that stopped you from ordering again? Reply here, we would like to know.",
          "Hello {{name}}, we have made some changes to {{product_name}} based on customer feedback. If you would like to try it again, here is the link: {{product_link}}",
          "Hi {{name}}, as a thank you for being a past customer, here is {{offer}} on your next order at {{store_name}}, valid until {{end_date}}: {{store_link}}",
          "Hi {{name}}, this is our last note for now. If you ever need {{product_name}} again, we are here: {{store_link}}. Reply STOP and we will not message you about offers.",
        ],
      },
      {
        h: "Should a win-back campaign include a discount?",
        p: [
          "Not as the opening move. If the first thing a lapsed customer sees is a discount, you have paid for an order you might have had for free, and you have taught them that going quiet earns a reward. Lead with relevance: something new, something improved, or a simple check-in.",
          "An incentive can make sense as the last step, for customers who ignored the earlier messages. Keep it modest and time-bound, and work out whether the order is still worth it after the discount. Price was often not the reason they left. If your feedback points to slow delivery or a quality issue, fix that first.",
        ],
      },
      {
        h: "How do you measure a win-back campaign?",
        p: [
          "Count orders, not opens. The question is how many contacted customers placed an order afterwards, and how that compares with similar customers you did not contact. Some lapsed customers return unprompted. Holding back a small group lets you see how much of the result the campaign truly caused.",
          "Look past the first order too. A customer who came back for a discount and vanished again is a weak result. One who resumes regular buying is a strong one. Track the items below for each campaign, and keep the definitions the same from one campaign to the next.",
        ],
        list: [
          "Customers contacted, and how many ordered within your chosen window.",
          "Orders from a comparable group that received no messages.",
          "Revenue from returning customers, after any discount given.",
          "Opt-outs and blocks caused by the campaign.",
          "Replies explaining why the customer stopped buying.",
          "How many returning customers ordered a second time later.",
        ],
      },
      {
        h: "How does CodeCrest help with win-back campaigns?",
        p: [
          "CodeCrest keeps each customer's orders, calls and WhatsApp messages on one record, merged by phone number, with history imported from Shopify. Campaigns can be sent to customers who match a segment, such as those inactive for 90 days, from your store's own WhatsApp number using your templates. Sending is queued.",
          "Win-back is also a built-in task type, so lapsed customers worth a personal call can be placed in an agent's queue. Repeat revenue is attributed by matching new orders to the task or message that preceded them, with rules that prevent double counting. Reports show how many customers reordered.",
        ],
      },
    ],
    faqs: [
      ["How is a win-back campaign different from a reorder reminder?", "A reorder reminder is sent around the time a product should run out, to a customer who is still active. A win-back campaign is for customers who have already gone well past that point and stopped responding to normal reminders."],
      ["How often should I run win-back campaigns?", "Run it as a rolling process instead of an occasional event. Each customer enters the sequence when they cross your lapsed threshold and leaves when it ends. Avoid putting the same customer through it again for a long time."],
      ["What if a customer left because of a bad experience?", "A promotional message will make things worse. Check order history for returns, refused deliveries and complaints before including someone. Where there was a problem, a personal apology and a real fix from an agent is the right first step."],
      ["Which channel works best for win-back?", "The one the customer agreed to and used to respond on. WhatsApp suits a short personal note and makes replying easy. Email allows more detail. For high-value past customers, a brief call from an agent can be worth the time."],
      ["When should I stop trying to win a customer back?", "After the sequence ends without a response. Continuing to message silent customers raises opt-outs and blocks. Keep them out of future win-back campaigns, and let them return on their own if they wish."],
    ],
    related: ["features/whatsapp-automation", "solutions/marketing-teams", "tools/customer-lifetime-value-calculator", "blog/rfm-segmentation-for-d2c"],
  },
  {
    slug: "rfm-segmentation-for-d2c",
    title: "RFM segmentation for D2C brands: a plain-English guide",
    metaTitle: "RFM Segmentation for D2C Brands: A Simple Guide",
    description: "RFM segmentation explained for D2C brands: how to score recency, frequency and monetary value, the common segments, and what to send to each one.",
    keyword: "RFM segmentation",
    category: "WhatsApp & Retention",
    date: "2026-11-10",
    answer: "RFM segmentation groups customers by three measures from their order history: recency, how recently they bought; frequency, how often they buy; and monetary value, how much they have spent. Each customer is scored on all three, and the combined scores place them in segments such as loyal, at-risk or new, so each group gets a suitable message.",
    takeaways: [
      "RFM uses only order data you already have: last order date, order count and total spend.",
      "Score each measure on a simple scale and combine the scores into a handful of named segments.",
      "Each segment calls for a different message, from thanking loyal buyers to winning back lapsed ones.",
      "Recalculate regularly, because customers move between segments as time passes.",
    ],
    visual: "matrix",
    sections: [
      {
        h: "What is RFM segmentation?",
        p: [
          "RFM stands for recency, frequency and monetary value. It is a way of sorting customers using three facts about their buying. Recency is the time since their last order. Frequency is the number of orders they have placed. Monetary value is the total they have spent. Together these describe how active and how valuable a customer is.",
          "The method is old and simple, which is why it lasts. It needs no survey, no tracking pixel and no guesswork about interests. Everything comes from the order table. For a D2C brand that wants to stop sending the same message to everyone, it is usually the first segmentation worth doing.",
        ],
      },
      {
        h: "How do you calculate RFM scores?",
        p: [
          "For each customer, work out the three values, then turn each into a score. A common approach is a scale of one to five, where five is best. Sort all customers by recency and split them into five equal groups. The most recent buyers score five. Do the same for frequency and for monetary value.",
          "Here is an example for illustration only: a customer who bought last week, has ordered six times and spent more than most others would score high on all three. One who bought once, long ago, for a small amount would score low on all three. If five levels feel like too much, three work fine for a small customer base.",
        ],
        list: [
          "Export orders with customer identifier, order date and order value.",
          "Remove cancelled, refused and returned orders so they do not count as purchases.",
          "For each customer, find the days since last order, the order count and the total spend.",
          "Rank customers on each measure and assign a score from one to five.",
          "Combine the three scores and map the combinations to named segments.",
          "Repeat on a regular schedule, such as monthly.",
        ],
      },
      {
        h: "What are the common RFM segments?",
        p: [
          "Raw scores are hard to act on. Three measures at five levels give far more combinations than anyone can manage. The usual answer is to collapse them into a small set of named segments that a marketer can plan around. Six to eight segments are plenty for most stores.",
          "The names below are conventional, and different sources draw the boundaries differently. Adjust them to your business. What matters is that everyone on the team uses the same definitions, and that each segment has a clear action attached.",
        ],
        table: {
          cols: ["Segment", "Typical profile", "What to do"],
          rows: [
            ["Champions", "Bought recently, buy often, spend the most", "Thank them, give early access, ask for reviews and referrals"],
            ["Loyal", "Buy regularly, recent enough", "Reorder reminders, bundles and larger packs"],
            ["New", "One recent order", "Onboard well and encourage a second order"],
            ["At risk", "Used to buy often, not recently", "Win-back sequence, ask what changed"],
            ["Big spenders gone quiet", "High spend, long silence", "A personal message or call from an agent"],
            ["Lost", "One old order, low spend", "One last message at most, then stop"],
          ],
        },
      },
      {
        h: "How should a D2C brand use each segment?",
        p: [
          "Match the effort to the value. Champions and loyal customers deserve attention that is not a discount: first look at launches, a thank-you, a request for feedback. They would have bought anyway, so cutting the price for them gives away margin. Use their goodwill for reviews and referrals instead.",
          "New customers need a good first experience and a nudge towards a second order, since the second purchase is where a habit starts. At-risk customers need a win-back sequence while they still remember you. Lost customers need restraint. Message them rarely or not at all, and only with consent, because sending to people who never respond harms your sender reputation.",
        ],
      },
      {
        h: "What are the limits of RFM?",
        p: [
          "RFM describes what customers did, not why. It cannot tell you that a loyal customer went quiet because of a late delivery. It also treats all products alike. A customer who buys a long-lasting product will look inactive when they are simply not due yet. If your catalogue mixes fast and slow cycles, score them separately.",
          "It is also a snapshot. A segment assigned in one month is out of date a few months later. In COD-heavy stores, be careful with what counts as an order. A refused or returned parcel is not a purchase, and counting it inflates frequency and spend. Clean the data before you score it.",
        ],
      },
      {
        h: "How does CodeCrest help with segmentation?",
        p: [
          "RFM depends on clean order history, and that is where CodeCrest starts. It syncs orders and customers from Shopify, merges duplicate customers by phone number, and tracks delivery and return status through Shiprocket, so delivered orders can be told apart from returned ones. Reports cover revenue and how many customers reordered, and export to Excel.",
          "On the action side, WhatsApp campaigns can be sent to customers who match a segment, such as repeat buyers or those inactive for 90 days, from your store's own number. Reorder and win-back are built-in task types, so customers who merit a personal call can be put in front of an agent.",
        ],
      },
    ],
    faqs: [
      ["Do I need special software to do RFM segmentation?", "No. A spreadsheet with an export of your orders is enough to begin. You need one row per customer with last order date, number of orders and total spend. Software helps later, when you want the segments refreshed and acted on automatically."],
      ["How often should RFM scores be updated?", "Monthly suits most D2C stores. Fast-moving consumables may justify more frequent updates, and slow-moving categories less. The point is that segments should reflect current behaviour before you send a campaign based on them."],
      ["Which of the three measures matters most?", "Recency is usually the strongest signal of whether a customer will buy again soon, because recent buyers still have you in mind. Frequency and monetary value then tell you how much effort that customer is worth."],
      ["Does RFM work for a store with few repeat customers?", "It is less informative when most customers have bought only once, since frequency barely varies. You can still use recency and spend to separate new buyers from old ones, and focus first on earning the second order."],
      ["How is RFM different from customer lifetime value?", "RFM sorts customers into groups based on past behaviour. Customer lifetime value estimates how much a customer will be worth over the whole relationship. They complement each other: RFM tells you who to contact, and lifetime value tells you what you can afford to spend."],
    ],
    related: ["features/analytics-reports", "solutions/marketing-teams", "tools/customer-lifetime-value-calculator", "blog/customer-win-back-campaigns"],
  },
];

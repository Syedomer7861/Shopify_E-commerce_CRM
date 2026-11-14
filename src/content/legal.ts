// Public legal pages (/legal/<slug>). Every statement here was checked against
// the code on the "Updated" date: the services named are the ones the app
// actually calls, the retention numbers are the ones the jobs enforce. When a
// provider, data type or retention job changes, update this file with it.
//
// Deliberately absent until the owner supplies them: registered company name,
// postal address and a named Grievance Officer. Requests go through the
// contact form, which is a real, monitored channel.

export type LegalBlock = string | string[]; // paragraph, or bullet list
export type LegalSection = { heading: string; body: LegalBlock[] };
export type LegalDoc = { slug: string; title: string; summary: string; updated: string; sections: LegalSection[] };

export const LEGAL_UPDATED = "2026-11-15";

const CONTACT = "Use the form at /contact and choose the subject that fits. We reply from a real inbox and keep a record of every request.";

const PROCESSORS: string[] = [
  "Supabase: database, sign-in and file storage. Data is stored in the Sydney, Australia region.",
  "Vercel: hosts the website and the application. Server functions run in Sydney, Australia.",
  "Upstash: short-lived request counters used to stop abuse (rate limiting).",
  "Razorpay: subscription payments. Card and bank details are entered on Razorpay and never reach our servers.",
  "PostHog (United States): product usage analytics, described under Cookies and analytics below.",
  "Google: optional Google sign-in, Google Sheets and Drive features a workspace turns on, our own backups to Google Drive, and Gemini AI features when enabled.",
  "OpenAI: AI writing and summarising features, when enabled for a workspace.",
  "Services a workspace connects itself: Shopify, Shiprocket, WhatsApp (Meta WhatsApp Business Platform, Twilio, or a linked WhatsApp account), Exotel or Twilio for calls. Data flows to these only when the workspace sets them up.",
];

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "privacy",
    title: "Privacy Policy",
    summary: "What CodeCrest collects, why, who processes it, how long it is kept and how to reach us about it.",
    updated: LEGAL_UPDATED,
    sections: [
      {
        heading: "Who we are and what this covers",
        body: [
          "CodeCrest is an operations platform for e-commerce teams: orders, customers, calling and WhatsApp follow-ups, shipping, tasks and team management. This policy covers our website, the CodeCrest application and the people who use them.",
          "Two kinds of data pass through CodeCrest, and our role differs for each:",
          [
            "Your account and our website: your name, email, sign-in details, billing and messages you send us. For this data we decide how it is used, so we are responsible for it.",
            "Your workspace's business data: the customers, orders, calls and staff records your organisation keeps in CodeCrest. Your organisation decides what goes in and why; we process it only to run the service for them. Questions about that data are best sent to the organisation first, and we will help them answer.",
          ],
        ],
      },
      {
        heading: "What we collect",
        body: [
          [
            "Account details: name, email address, role and the workspace you belong to. Passwords are handled by our sign-in provider and stored only as a secure hash. If you use Google sign-in, we receive your name and email from Google.",
            "Workspace business data your organisation adds or connects: customer names, phone numbers, addresses and order history (for example from Shopify), shipment and delivery status (for example from Shiprocket), abandoned carts, tasks, notes, call logs, WhatsApp messages and quotes.",
            "Call recordings, when your organisation uploads or records calls in CodeCrest.",
            "Team and HR records, when your organisation uses those modules: attendance, shifts, leave, and salary or payroll entries.",
            "Field check-ins: when a field user checks in, the app asks the device for its location and may take a photo. The browser asks for permission first and nothing is captured if it is refused.",
            "Messages you send through our contact form: name, email, company and what you wrote.",
            "Billing: plan, invoices and payment status from Razorpay. We do not receive or store card numbers.",
            "Technical data: IP address and request details needed to secure the service, the activity history (audit log) of changes made inside a workspace, and browser push-notification subscriptions if you turn notifications on.",
          ],
        ],
      },
      {
        heading: "Why we use it",
        body: [
          [
            "To provide the service: sign you in, show your workspace its data, send the messages and run the automations your organisation sets up.",
            "To keep it secure: enforce each workspace's separation from every other, apply role permissions, limit abusive traffic and keep an audit trail.",
            "To bill for subscriptions and keep financial records the law requires.",
            "To reply when you contact us.",
            "With your permission, to understand which pages and features are used, so we can improve them.",
          ],
          "We do not sell personal data and we do not use workspace business data to advertise to anyone.",
        ],
      },
      {
        heading: "Who processes it for us",
        body: [
          "We use the following providers to run CodeCrest. Each receives only what its job needs.",
          PROCESSORS,
          "Because our database and servers are in Australia and some providers are in the United States, personal data is processed outside India. We only transfer data in the ways the Digital Personal Data Protection Act, 2023 allows.",
        ],
      },
      {
        heading: "Cookies and analytics",
        body: [
          "We use cookies that are necessary to keep you signed in and to remember your session. The service does not work without them.",
          "Analytics only run if you choose \"Allow analytics\" in the cookie banner. If you do, we use PostHog to see which pages and features are used, and remember which page or campaign first brought you to our website. If you send us the contact form, that source is saved with your message so we know which pages help. Choosing \"Essential only\" means PostHog never loads and no source is stored.",
          "Your choice is saved in a cookie for one year. To change it, clear this site's cookies and the banner will ask again. We do not use advertising cookies.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          [
            "Account and workspace data: for as long as the workspace is active, and until it is deleted at the organisation's request.",
            "Incoming integration logs (webhooks): deleted automatically after 60 days.",
            "Billing records: kept for as long as tax and accounting law requires.",
            "Backups: copies are kept in Google Drive for recovery and are replaced as new backups are taken, so deleted data can remain in a backup for a limited time after deletion.",
          ],
        ],
      },
      {
        heading: "How we protect it",
        body: [
          "Every workspace is separated from every other at the database level, not only in the screens, and each user sees only what their role allows. Connections are encrypted with HTTPS. Sign-in for platform administrators requires a second factor. Changes inside a workspace are recorded in an audit log.",
          "No system is perfectly secure. If a personal data breach happens, we will inform the people affected and the Data Protection Board of India as the DPDP Act requires, and tell affected organisations promptly.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "You can ask to see a summary of your personal data, correct or complete it, have it erased, withdraw consent you gave, raise a grievance, and nominate someone to act for you if you die or cannot act. The DPDP page explains each right and how we handle the request.",
          "If the data is held by an organisation that uses CodeCrest, that organisation decides on the request; we will pass it to them and help them act on it.",
        ],
      },
      {
        heading: "Children",
        body: ["CodeCrest is a tool for businesses and is not meant for anyone under 18. We do not knowingly collect children's data for our own purposes."],
      },
      {
        heading: "Changes and contact",
        body: [
          "We will update this page when what we collect or who processes it changes, and change the date at the top. Significant changes will also be announced inside the app.",
          CONTACT,
        ],
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms of Service",
    summary: "The agreement between CodeCrest and the organisations and people who use it.",
    updated: LEGAL_UPDATED,
    sections: [
      {
        heading: "Agreement",
        body: [
          "These terms apply when an organisation opens a CodeCrest workspace and when anyone signs in to one. By using CodeCrest you agree to them. If you accept them for an organisation, you confirm you are allowed to do so.",
        ],
      },
      {
        heading: "Accounts and access",
        body: [
          [
            "Workspace administrators invite users and set their roles. They are responsible for who has access and for removing people who leave.",
            "Keep your sign-in details private. Tell us straight away if you think your account has been misused.",
            "Each account is for one person. Do not share logins.",
          ],
        ],
      },
      {
        heading: "Your data",
        body: [
          "Your organisation owns the business data it puts into CodeCrest. We use it only to provide and secure the service for you, as described in the Privacy Policy.",
          "Your organisation is responsible for having a lawful basis for the personal data it adds, including its customers' and staff's data, and for giving any notices and getting any consent the law requires. This includes consent before recording calls and before sending marketing messages on WhatsApp or other channels.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "You must not use CodeCrest to:",
          [
            "send spam or messages to people who have not agreed to receive them, or break WhatsApp's, Meta's or any carrier's rules;",
            "store or send unlawful, infringing or harmful content;",
            "try to reach another workspace's data, get around permissions, or probe, overload or disrupt the service;",
            "copy, resell or reverse engineer the service except where the law allows it.",
          ],
          "We may suspend access that breaks these rules or puts the service or other customers at risk. Where we can, we will tell you first.",
        ],
      },
      {
        heading: "Connected services",
        body: [
          "CodeCrest connects to services such as Shopify, Shiprocket, WhatsApp, Razorpay, Exotel and Google. Those services have their own terms. We are not responsible for their availability or their changes, which can affect features that depend on them.",
        ],
      },
      {
        heading: "Plans and payment",
        body: [
          [
            "Current plans and prices are shown on the pricing page. Prices are charged in advance for each billing period through Razorpay.",
            "If a payment fails and is not resolved, the workspace is placed on hold: its data is kept, but it cannot be used until billing is fixed.",
            "You can cancel at any time. Cancelling stops future renewals.",
            "If we change a plan's price, we will tell you before it applies to your next billing period.",
          ],
        ],
      },
      {
        heading: "Availability and changes",
        body: [
          "We work to keep CodeCrest available and to fix problems quickly, but we do not promise it will be uninterrupted or free of errors. We improve the product continuously and may change or retire features; we will give notice before removing something you depend on.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "The service is provided as it is. To the extent the law allows, we are not liable for indirect or consequential losses such as lost profits or lost data, and our total liability for any claim is limited to the fees your organisation paid us in the 12 months before the claim. Nothing in these terms limits liability that the law does not allow to be limited.",
        ],
      },
      {
        heading: "Ending the agreement",
        body: [
          "An organisation can stop using CodeCrest at any time. We may end or suspend a workspace that seriously or repeatedly breaks these terms. When a workspace ends, the organisation can ask us for an export of its data and then for its deletion.",
        ],
      },
      {
        heading: "Law and contact",
        body: [
          "These terms are governed by the laws of India. We will update them when needed and change the date at the top; continuing to use CodeCrest after a change means accepting it.",
          CONTACT,
        ],
      },
    ],
  },
  {
    slug: "dpdp",
    title: "Your Rights Under India's DPDP Act",
    summary: "How CodeCrest meets the Digital Personal Data Protection Act, 2023 and how to use your rights under it.",
    updated: LEGAL_UPDATED,
    sections: [
      {
        heading: "The law and our role",
        body: [
          "India's Digital Personal Data Protection Act, 2023 (DPDP Act) and the DPDP Rules, 2025 set how digital personal data may be used and give people rights over it.",
          [
            "For your CodeCrest account, our website and our contact form, CodeCrest is the Data Fiduciary: we decide why and how that data is used.",
            "For the business data an organisation keeps in its workspace (its customers, orders, calls and staff records), that organisation is the Data Fiduciary and CodeCrest is its Data Processor. We act only on its instructions.",
          ],
        ],
      },
      {
        heading: "Your rights",
        body: [
          [
            "Access: a summary of the personal data we hold about you and how it is used, and who it has been shared with.",
            "Correction and erasure: fix data that is wrong or incomplete, update it, or have it erased when it is no longer needed for the purpose it was collected for, unless the law requires us to keep it.",
            "Withdraw consent: where we rely on your consent, you can withdraw it as easily as you gave it. Withdrawing does not affect what was done before.",
            "Grievance redressal: complain to us about how your data is handled, and get a response.",
            "Nomination: name another person to use these rights for you if you die or become unable to.",
          ],
        ],
      },
      {
        heading: "How to make a request",
        body: [
          "Send your request through the form at /contact. Tell us what you want and which email you use with CodeCrest so we can find your data. We may ask you to confirm your identity before acting, to make sure we do not give your data to someone else.",
          "If your data was added by an organisation that uses CodeCrest (for example, you are one of its customers), we will pass your request to that organisation, because it decides on its own data, and help it respond.",
          "We respond to grievances within the time the DPDP Rules allow, which is at most 90 days, and aim to be much quicker.",
        ],
      },
      {
        heading: "If you are not satisfied",
        body: [
          "If our answer does not resolve your grievance, you can complain to the Data Protection Board of India. The Act asks that you first raise it with us.",
        ],
      },
      {
        heading: "What we do to comply",
        body: [
          [
            "Use personal data only for the purposes described in our Privacy Policy, and collect only what those purposes need.",
            "Keep each organisation's data separate from every other at the database level, restrict access by role, and keep an audit log of changes.",
            "Delete integration logs automatically after 60 days and delete workspace data when an organisation asks.",
            "Use processors only under terms that require them to protect the data, and transfer data outside India only as the Act permits.",
            "Notify affected people and the Data Protection Board of a personal data breach as the Act requires.",
          ],
        ],
      },
    ],
  },
];

export const getLegalDoc = (slug: string) => LEGAL_DOCS.find((d) => d.slug === slug);

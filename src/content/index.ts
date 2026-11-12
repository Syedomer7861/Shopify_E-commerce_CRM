import type { Page, Section, SectionKey } from "./types";
import { features } from "./features";
import { solutions } from "./solutions";
import { integrations } from "./integrations";
import { comparisons } from "./comparisons";
import { resources } from "./resources";
import { getPost } from "./blog";

export * from "./types";

export const SECTIONS: Section[] = [
  {
    key: "features", label: "Product", kind: "product", pages: features,
    title: "Features",
    description: "Every CodeCrest feature: Shopify order management, cart recovery, shipping and RTO, WhatsApp automation, tasks, HR, workspaces, permissions, approvals and more.",
    intro: "One platform for the work after checkout and the business behind it. Each feature works on its own and shares people, roles and data with the rest.",
  },
  {
    key: "solutions", label: "Solutions", kind: "product", pages: solutions,
    title: "Solutions by team and business type",
    description: "How D2C brands, COD-heavy stores, support, operations and marketing teams, multi-branch businesses and agencies use CodeCrest.",
    intro: "The same platform, set up around the way your team works.",
  },
  {
    key: "integrations", label: "Integrations", kind: "product", pages: integrations,
    title: "Integrations",
    description: "Connect CodeCrest to Shopify, Shiprocket, WhatsApp, Exotel, Twilio, Gmail, Google Sheets and Google Drive, or import from CSV and Excel.",
    intro: "Connect the tools your store already runs on. Every connection belongs to your organisation alone.",
  },
  {
    key: "compare", label: "Compare", kind: "article", pages: comparisons,
    title: "Compare CodeCrest",
    description: "Honest comparisons of CodeCrest with Zoho CRM, HubSpot, Salesforce, ServiceNow, ClickUp and spreadsheets, including when the other option fits better.",
    intro: "Straight comparisons, including when another product is the better fit.",
  },
  {
    key: "resources", label: "Resources", kind: "article", pages: resources,
    title: "Guides and resources",
    description: "Practical guides for e-commerce operations: reducing RTO, COD verification, cart recovery, NDR management, choosing a CRM, access control, glossary and FAQ.",
    intro: "Practical guides for the people who run orders, deliveries and teams.",
  },
];

export const getSection = (key: string) => SECTIONS.find((s) => s.key === key);
export const getPage = (section: string, slug: string) => getSection(section)?.pages.find((p) => p.slug === slug);

/** Resolve a "section/slug" reference to a link label, or null if it is stale. */
export function resolveRef(ref: string): { href: string; title: string; section: string } | null {
  const [section, slug] = ref.split("/") as [SectionKey | "tools" | "blog", string];
  if (section === "blog") {
    const post = getPost(slug);
    return post ? { href: `/blog/${slug}`, title: post.metaTitle || post.title, section: "Blog" } : null;
  }
  if (section === "tools") {
    const t = TOOLS.find((x) => x.slug === slug);
    return t ? { href: `/tools/${slug}`, title: t.name, section: "Free tool" } : null;
  }
  const p = getPage(section, slug);
  return p ? { href: `/${section}/${slug}`, title: p.metaTitle || p.title, section: getSection(section)!.label } : null;
}

export type Tool = { slug: string; name: string; description: string; answer: string; faqs: [string, string][] };

export const TOOLS: Tool[] = [
  {
    slug: "rto-loss-calculator", name: "RTO Loss Calculator",
    description: "Free RTO loss calculator. Estimate what return-to-origin costs your store each month and how much a lower RTO rate would save.",
    answer: "Enter your monthly orders, COD share, RTO rate and shipping costs to estimate monthly RTO loss: forward shipping, return shipping and handling on every returned order, plus the saving if you reduce the rate.",
    faqs: [
      ["How is RTO loss calculated?", "Returned orders × (forward shipping + return shipping + packaging and handling). Lost margin on the sale is shown separately."],
      ["Why is RTO applied to COD orders only?", "Returns are concentrated in COD orders. Prepaid returns exist but are usually far lower; add them to the rate if yours are significant."],
    ],
  },
  {
    slug: "cart-recovery-calculator", name: "Abandoned Cart Recovery Calculator",
    description: "Free abandoned cart recovery calculator. See how much revenue sits in abandoned checkouts and what each point of recovery rate is worth.",
    answer: "Enter monthly abandoned checkouts, average order value and a recovery rate to see recovered orders and revenue per month and per year, and what one extra percentage point of recovery adds.",
    faqs: [
      ["What recovery rate should I use?", "Use your own current rate if you track it, then test a higher one to see the upside. Rates vary widely with category, price and follow-up method."],
      ["Does this include discounts?", "No. If you recover carts with a discount, reduce the average order value accordingly."],
    ],
  },
  {
    slug: "cod-vs-prepaid-calculator", name: "COD vs Prepaid Profit Calculator",
    description: "Free COD vs prepaid calculator. Compare profit per order after shipping, COD fees, payment gateway fees and returns for each payment mode.",
    answer: "Enter your order value, product cost, shipping, COD fee, gateway fee and the return rate for each mode to compare expected profit per order for COD and prepaid.",
    faqs: [
      ["Why can COD be less profitable?", "COD orders usually carry a collection fee and a higher return rate, and each return costs shipping both ways."],
      ["What discount can I afford to offer for prepaid?", "Up to the difference in expected profit per order shown by the calculator."],
    ],
  },
  {
    slug: "volumetric-weight-calculator", name: "Volumetric Weight Calculator",
    description: "Free volumetric weight calculator for couriers. Enter box dimensions in cm to get volumetric and chargeable weight with a 5000 or custom divisor.",
    answer: "Volumetric weight in kg is length × width × height in cm divided by the courier's divisor, commonly 5000. Couriers bill the higher of actual weight and volumetric weight, called chargeable weight.",
    faqs: [
      ["Which divisor should I use?", "5000 is common for courier shipments, but divisors differ by courier and service. Check your rate card."],
      ["What is chargeable weight?", "The greater of the parcel's actual weight and its volumetric weight."],
    ],
  },
  {
    slug: "whatsapp-link-generator", name: "WhatsApp Link Generator",
    description: "Free WhatsApp link generator. Create a wa.me click-to-chat link with a pre-filled message for your website, Instagram bio or order emails.",
    answer: "Enter a phone number with country code and an optional message to generate a wa.me link. Anyone who opens it starts a WhatsApp chat with that number, with your message already typed.",
    faqs: [
      ["Do I need the WhatsApp Business API?", "No. Click-to-chat links work with any WhatsApp account."],
      ["Is the number stored?", "No. The link is built in your browser and nothing is sent to us."],
    ],
  },
  {
    slug: "customer-lifetime-value-calculator", name: "Customer Lifetime Value Calculator",
    description: "Free customer lifetime value calculator for e-commerce. Estimate LTV from average order value, purchase frequency, lifespan and gross margin.",
    answer: "Customer lifetime value is average order value × orders per year × years retained × gross margin. Use it to decide how much you can spend to acquire or win back a customer.",
    faqs: [
      ["Should LTV use revenue or margin?", "Margin. Revenue-based LTV overstates what a customer is worth."],
      ["How do I raise LTV?", "Increase repeat purchases with reorder reminders and win-back, raise order value, and keep delivery reliable so customers return."],
    ],
  },
];

export const allPages = (): { href: string; page: Page; section: Section }[] =>
  SECTIONS.flatMap((section) => section.pages.map((page) => ({ href: `/${section.key}/${page.slug}`, page, section })));

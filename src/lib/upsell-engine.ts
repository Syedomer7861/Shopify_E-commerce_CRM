/**
 * Rule-based Upsell Engine for CureForever Products.
 */
export interface UpsellSuggestion {
  product_name: string;
  price: number;
  reason: string;
  script: string;
}

const UPSELL_RULES: Record<string, UpsellSuggestion[]> = {
  "biotin": [
    {
      product_name: "Korean Marine Collagen",
      price: 899,
      reason: "Ultimate Hair & Skin pairing.",
      script: "Since you're taking the Biotin for your hair and skin, our Korean Marine Collagen is the perfect pair. It boosts your skin's natural glow from within. Shall I include it?"
    }
  ],
  "cuplift": [
    {
      product_name: "Everyday Essentials for Women",
      price: 699,
      reason: "Complete women's wellness support.",
      script: "For the Cuplift tablets, it's highly recommended to maintain overall hormonal balance. Our Everyday Essentials for Women pairs perfectly with it. Should I add it to your order?"
    }
  ],
  "shilajit": [
    {
      product_name: "Testosterone Booster",
      price: 799,
      reason: "Maximizes energy, stamina, and muscle gain.",
      script: "I see you ordered Shilajit! Many of our male customers pair this with our Testosterone Booster for 2x stamina and energy results. Would you like to try it at a special discount?"
    },
    {
      product_name: "M-Power Power Capsules",
      price: 649,
      reason: "Synergistic stamina boost.",
      script: "Shilajit works incredibly well when paired with M-Power Capsules for peak performance and stress relief. Should I add a bottle for you?"
    }
  ],
  "whey": [
    {
      product_name: "Micronised Creatine",
      price: 599,
      reason: "Essential muscle building stack.",
      script: "Sir/Ma'am, since you're getting the Whey Protein, I highly recommend adding our Micronised Creatine. It's the ultimate stack for muscle gain and recovery. Shall I include it?"
    }
  ],
  "creatine": [
    {
      product_name: "Omega-3 Duo",
      price: 499,
      reason: "Joint support and muscle recovery.",
      script: "To help your muscles recover faster while using Creatine, our Omega-3 Duo is highly recommended. Should I add it to your order today?"
    }
  ],
  "glutathione": [
    {
      product_name: "Korean Marine Collagen",
      price: 899,
      reason: "Anti-aging and skin health.",
      script: "Since you ordered Glutathione for your skin, you should definitely pair it with our Marine Collagen. They are our #1 bestseller combo for a radiant glow. Shall I add it?"
    }
  ],
  "menopause": [
    {
      product_name: "Vitamin D3 + K2 MK7",
      price: 499,
      reason: "Bone health and hormonal balance.",
      script: "Alongside the Menopause Care, Vitamin D3 + K2 is essential for maintaining bone density and longevity. Shall I add a month's supply for you?"
    }
  ],
  "curcumin": [
    {
      product_name: "Pre & Probiotics",
      price: 549,
      reason: "Gut health and immunity.",
      script: "Curcumin is great for immunity, and pairing it with our Pre & Probiotics ensures maximum absorption and gut health. Would you like to add it to your order?"
    }
  ],
  "ashwagandha": [
    {
      product_name: "Magnesium Glycinate",
      price: 599,
      reason: "Ultimate stress relief and sleep stack.",
      script: "You've chosen Ashwagandha for stress relief! Pairing it with Magnesium Glycinate before bed provides the deepest, most restorative sleep. Should I add it?"
    }
  ],
  "berberine": [
    {
      product_name: "Omega-3 Duo",
      price: 499,
      reason: "Metabolism and longevity.",
      script: "Berberine is excellent for metabolism. Adding Omega-3 Duo will further support your longevity and cardiovascular health. Shall I include it today?"
    }
  ]
};

export function getUpsellSuggestions(items: any[]): UpsellSuggestion[] {
  const suggestions: UpsellSuggestion[] = [];
  const itemTitles = items.map(i => (i.title || i.name || "").toLowerCase());

  for (const [trigger, upsells] of Object.entries(UPSELL_RULES)) {
    if (itemTitles.some(title => title.includes(trigger))) {
      // Add upsells that aren't already in the cart
      upsells.forEach(u => {
        if (!itemTitles.some(title => title.includes(u.product_name.toLowerCase()))) {
          suggestions.push(u);
        }
      });
    }
  }

  // Global default if no specific match
  if (suggestions.length === 0) {
    suggestions.push({
      product_name: "Omega-3 Duo",
      price: 499,
      reason: "High conversion everyday essential.",
      script: "We're currently offering a special discount on our Omega-3 Duo, which is essential for daily energy, brain health, and immunity. It's our best seller this month. Should I add one for you?"
    });
  }

  return suggestions;
}

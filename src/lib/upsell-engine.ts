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
  "face wash": [
    {
      product_name: "Advanced Vitamin C Serum",
      price: 599,
      reason: "Commonly bought with face wash for 2x glow results.",
      script: "Sir/Ma'am, since you're starting the Face Wash, I highly recommend our Vitamin C Serum. Most of our customers use them together for 2x faster glow. Should I add it to your order for just ₹599 extra?"
    }
  ],
  "hair oil": [
    {
      product_name: "Anti-Dandruff Shampoo",
      price: 449,
      reason: "Oil users often need a mild shampoo to prevent buildup.",
      script: "I see you've ordered the Hair Oil. Many customers also take our mild shampoo to ensure the oil works perfectly without causing buildup. It's only ₹449 today, shall I include it?"
    }
  ],
  "shampoo": [
    {
       product_name: "Silk Conditioner",
       price: 399,
       reason: "Conditioner is essential after our clarifying shampoo.",
       script: "Our shampoo works best when followed by the Silk Conditioner to lock in moisture. It's on a special offer right now for ₹399. Would you like to try it?"
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
      product_name: "Mystery Gift Box (Trial Pack)",
      price: 299,
      reason: "High conversion impulse add-on.",
      script: "We also have a special 'Discovery Box' with 3 trial samples for just ₹299. It's our best seller this month. Should I add one for you?"
    });
  }

  return suggestions;
}

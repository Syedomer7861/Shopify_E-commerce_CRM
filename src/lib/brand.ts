/**
 * Message templates were written for CureForever, the first organisation.
 * Every other organisation must not send CureForever's name, links, review
 * page or tracking site to its own customers. `rebrand` swaps the name for the
 * organisation's own and drops CureForever-only links. For CureForever itself
 * (or while the name is still loading) text is returned unchanged.
 */
const SEED = /cureforever/i;

// "You can track it here: <link> ." / "Please leave us a review here: <link>" and bare links.
const SEED_LINK_PHRASE = /\s*(?:You can track it here|track it here|Please leave us a review here|Click here to order again|order your refill here)\s*:?\s*https?:\/\/[^\s]*(?:cureforever|placeid=ChIJv5_GsCGRyzsR2_y1wjbi3Ck)[^\s]*\s*\.?/gi;
const SEED_LINK = /https?:\/\/[^\s]*(?:cureforever\.(?:in|shiprocket\.co)|placeid=ChIJv5_GsCGRyzsR2_y1wjbi3Ck)[^\s]*/gi;

export function isSeedBrand(brand: string | null | undefined): boolean {
  return !brand || SEED.test(brand);
}

export function rebrand(text: string, brand: string | null | undefined): string {
  if (!text || isSeedBrand(brand)) return text;
  return text
    .replace(SEED_LINK_PHRASE, "")
    .replace(SEED_LINK, "")
    .replace(/CureForever Care/g, `${brand} team`)
    .replace(/CureForever Wellness Pvt\. Ltd\./g, brand!)
    .replace(/CureForever/gi, brand!)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,!?])/g, "$1")
    .trim();
}

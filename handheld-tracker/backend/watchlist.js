// watchlist.js — the "what to keep an eye on" config that drives discovery and
// price sourcing. Edit this file to watch more makers, retailers, crowdfunding
// platforms, or next-gen processors; the rest of the pipeline picks it up.

const enc = encodeURIComponent;

// Retailers to track for prices (and coupon codes). `coupons: true` marks stores
// that frequently run codes worth capturing. `brands` scopes a single-brand store
// so we don't scrape it for devices it can't sell. Edit this list to add/remove
// tracked stores — sourcesFor() and the scrape job pick it up automatically.
export const RETAILERS = {
  MechDIY:     { build: n => ({ store: "MechDIY",      url: `https://mechdiy.com/search?q=${enc(n)}` }),               coupons: true },
  LitNXT:      { build: n => ({ store: "LitNXT",       url: `https://litnxt.com/search?type=product&q=${enc(n)}` }),    coupons: true },
  GoGameGeek:  { build: n => ({ store: "GoGameGeek",   url: `https://gogamegeek.com/?s=${enc(n)}&post_type=product` }), coupons: true },
  TrimUIStore: { build: n => ({ store: "TrimUI Store", url: `https://trimui.com/search?q=${enc(n)}` }),                 coupons: true, brands: ["TrimUI"] },
};

// The retailers that apply to a given brand (single-brand stores are filtered out
// for other brands).
export function retailersForBrand(brand) {
  return Object.values(RETAILERS)
    .filter(r => !r.brands || r.brands.includes(brand))
    .map(r => r.build);
}

// Crowdfunding / preorder platforms — where upcoming devices show up first.
export const CROWDFUNDING = {
  Indiegogo:   n => ({ store: "Indiegogo",   url: `https://www.indiegogo.com/search#/?q=${enc(n)}` }),
  Kickstarter: n => ({ store: "Kickstarter", url: `https://www.kickstarter.com/discover/advanced?term=${enc(n)}` }),
};

// Manufacturers to watch for new releases.
export const MANUFACTURERS = [
  "Anbernic", "Retroid", "Miyoo", "Powkiddy", "TrimUI", "AYANEO",
  "AYN", "GKD", "MagicX", "Mangmi", "ModRetro",
];

// Next-gen / flagship SoCs we KNOW are top-tier ("known-good"). Used as a
// fallback so a new handheld using one is rated correctly even before public
// benchmark databases list it — the live benchmark scrape still takes priority
// when available. Values are forward-looking AnTuTu estimates; anything at this
// level maxes the emulation matrix anyway (the tier scale caps at Snapdragon 8
// Elite class), so exact precision isn't required — placement is.
export const NEXT_GEN_SOCS = {
  "Snapdragon 8 Elite Gen 5": 4000000,
  "Snapdragon 8 Elite Gen 4": 3600000,
  "Snapdragon 8 Elite Gen 3": 3300000,
  "Snapdragon 8 Elite Gen 2": 3300000,
  "Snapdragon 8 Gen 5":       2600000,
  "MediaTek Dimensity 9500":  3300000,
  "MediaTek Dimensity 9400":  2700000,
  "Snapdragon G4 Gen 1":      1900000,
};

// Forward-looking discovery searches (used live; mock discovery has its own set).
export const DISCOVERY_QUERIES = [
  "newly released retro gaming handheld 2026 specs",
  "new retro handheld Snapdragon Dimensity announcement 2026",
  "upcoming retro gaming handheld preorder Indiegogo Kickstarter",
  "new TrimUI handheld analog sticks",
  "new flagship Android retro handheld next gen processor",
  ...MANUFACTURERS.map(m => `new ${m} handheld 2026 release specs`),
];

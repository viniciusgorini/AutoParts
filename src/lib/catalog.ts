import { CURRENCY, type Currency } from "@/lib/money";

/**
 * Synthetic catalogue. Every value here is fictional: no real pricing, no
 * personal data, no real inventory system behind it.
 *
 * `localCategoryId` is the store's own taxonomy and is what the storefront
 * shows. `agentPayCategory` is the AgentPay taxonomy value a mandate scopes
 * against; the two are deliberately separate so the store keeps its own
 * merchandising vocabulary.
 */

export const CATALOG_VERSION = "autoparts-catalog-2026-08-29";

export type StockState = "in_stock" | "low_stock" | "out_of_stock";

export type Product = {
  id: string;
  sku: string;
  merchantId: string;
  name: string;
  description: string;
  localCategoryId: string;
  localCategoryLabel: string;
  agentPayCategory: string;
  unitPriceCents: number;
  currency: Currency;
  availableQuantity: number;
  searchTerms: readonly string[];
  brand: string;
  compatibility: readonly string[];
  attributes: Readonly<Record<string, string>>;
  image: { emoji: string; accent: string };
};

const CATALOG_MERCHANT_PLACEHOLDER = "mrc_autoparts";

const products: readonly Product[] = [
  {
    id: "prd_tire_std_205_55_r16",
    sku: "AP-TIRE-20555R16-STD",
    merchantId: CATALOG_MERCHANT_PLACEHOLDER,
    name: "Set of 4 tires 205/55 R16",
    description:
      "Four all-season 205/55 R16 tires, load index 91V, backed by a 37,000 mile warranty.",
    localCategoryId: "tires",
    localCategoryLabel: "Tires",
    agentPayCategory: "tires",
    unitPriceCents: 154_800,
    currency: CURRENCY,
    availableQuantity: 12,
    searchTerms: ["tire", "tires", "205/55", "r16", "all season", "wheel"],
    brand: "SteadyRoll",
    compatibility: ["Ford Focus 2013-2019", "VW Golf 2014-2020", "Honda Civic 2012-2016"],
    attributes: { size: "205/55 R16", loadIndex: "91V", season: "All-season", pieces: "4" },
    image: { emoji: "\u{1F6DE}", accent: "#1f2937" },
  },
  {
    id: "prd_tire_prm_205_55_r16",
    sku: "AP-TIRE-20555R16-PRM",
    merchantId: CATALOG_MERCHANT_PLACEHOLDER,
    name: "Premium set of 4 tires 205/55 R16",
    description:
      "Premium set of four 205/55 R16 tires with low road noise and an A wet-grip rating.",
    localCategoryId: "tires",
    localCategoryLabel: "Tires",
    agentPayCategory: "tires",
    unitPriceCents: 172_000,
    currency: CURRENCY,
    availableQuantity: 6,
    searchTerms: ["premium tire", "205/55", "r16", "quiet", "wet grip"],
    brand: "SteadyRoll Sport",
    compatibility: ["Ford Focus 2013-2019", "Toyota Corolla 2015-2021"],
    attributes: { size: "205/55 R16", loadIndex: "94W", wetGrip: "A", pieces: "4" },
    image: { emoji: "\u{1F3C1}", accent: "#7f1d1d" },
  },
  {
    id: "prd_acc_jack_2t",
    sku: "AP-ACC-JACK-2T",
    merchantId: CATALOG_MERCHANT_PLACEHOLDER,
    name: "Hydraulic floor jack, 2 ton",
    description: "Low-profile trolley jack with a dual pump and a 4,400 lb capacity.",
    localCategoryId: "tools",
    localCategoryLabel: "Tools",
    agentPayCategory: "accessories",
    unitPriceCents: 38_900,
    currency: CURRENCY,
    availableQuantity: 9,
    searchTerms: ["jack", "hydraulic", "trolley", "2 ton", "lift", "tool"],
    brand: "TorqueMax",
    compatibility: ["Passenger vehicles up to 4,400 lb"],
    attributes: { capacity: "2 ton", minHeight: "3.3 in", maxHeight: "15 in" },
    image: { emoji: "\u{1F6E0}️", accent: "#78350f" },
  },
  {
    id: "prd_acc_floor_mats",
    sku: "AP-ACC-MATS-UNIV",
    merchantId: CATALOG_MERCHANT_PLACEHOLDER,
    name: "Floor mats (set of 4)",
    description: "Universal all-weather mats, trim-to-fit, with an anti-slip backing.",
    localCategoryId: "accessories",
    localCategoryLabel: "Accessories",
    agentPayCategory: "accessories",
    unitPriceCents: 12_900,
    currency: CURRENCY,
    availableQuantity: 40,
    searchTerms: ["mat", "mats", "carpet", "rubber", "universal"],
    brand: "DryCabin",
    compatibility: ["Universal - sedans and hatchbacks"],
    attributes: { pieces: "4", material: "TPE rubber", trimToFit: "Yes" },
    image: { emoji: "\u{1F9E9}", accent: "#1e3a8a" },
  },
  {
    id: "prd_brk_pads_front",
    sku: "AP-BRK-PADS-FRT",
    merchantId: CATALOG_MERCHANT_PLACEHOLDER,
    name: "Front brake pads",
    description: "Set of ceramic front brake pads, low dust and reduced noise.",
    localCategoryId: "brakes",
    localCategoryLabel: "Brakes",
    agentPayCategory: "accessories",
    unitPriceCents: 21_500,
    currency: CURRENCY,
    availableQuantity: 25,
    searchTerms: ["pad", "pads", "brake", "braking", "ceramic", "front"],
    brand: "SureStop",
    compatibility: ["Ford Focus 2013-2019", "VW Golf 2014-2020"],
    attributes: { position: "Front", material: "Ceramic", pieces: "4" },
    image: { emoji: "\u{1F6D1}", accent: "#991b1b" },
  },
  {
    id: "prd_bat_60ah",
    sku: "AP-BAT-60AH",
    merchantId: CATALOG_MERCHANT_PLACEHOLDER,
    name: "Car battery 60Ah",
    description: "Sealed 60Ah 12V battery, 500 CCA, maintenance free, 18 month warranty.",
    localCategoryId: "electrical",
    localCategoryLabel: "Electrical",
    agentPayCategory: "accessories",
    unitPriceCents: 49_900,
    currency: CURRENCY,
    availableQuantity: 3,
    searchTerms: ["battery", "60ah", "12v", "starting", "electrical"],
    brand: "TrueVolt",
    compatibility: ["Ford Focus 2013-2019", "Honda Civic 2012-2016", "Fiat Argo 2017-2023"],
    attributes: { capacity: "60 Ah", voltage: "12 V", cca: "500", warranty: "18 months" },
    image: { emoji: "\u{1F50B}", accent: "#065f46" },
  },
  {
    id: "prd_oil_5w30_4l",
    sku: "AP-OIL-5W30-4L",
    merchantId: CATALOG_MERCHANT_PLACEHOLDER,
    name: "Full synthetic engine oil 5W30, 1 gal",
    description:
      "Full synthetic 5W30 API SP engine oil, one gallon, for flex-fuel and turbo engines.",
    localCategoryId: "fluids",
    localCategoryLabel: "Fluids",
    agentPayCategory: "accessories",
    unitPriceCents: 18_400,
    currency: CURRENCY,
    availableQuantity: 60,
    searchTerms: ["oil", "5w30", "synthetic", "engine", "lubricant"],
    brand: "SynthPeak",
    compatibility: ["Flex-fuel and turbo engines meeting API SP"],
    attributes: { viscosity: "5W30", volume: "1 gal", standard: "API SP" },
    image: { emoji: "\u{1F6E2}️", accent: "#92400e" },
  },
  {
    id: "prd_flt_oil_std",
    sku: "AP-FLT-OIL-STD",
    merchantId: CATALOG_MERCHANT_PLACEHOLDER,
    name: "Oil filter",
    description: "Oil filter with an anti-drainback valve and high-retention synthetic media.",
    localCategoryId: "filters",
    localCategoryLabel: "Filters",
    agentPayCategory: "accessories",
    unitPriceCents: 4_900,
    currency: CURRENCY,
    availableQuantity: 0,
    searchTerms: ["filter", "oil filter", "oil change", "service"],
    brand: "PureFlow",
    compatibility: ["Ford Focus 2013-2019", "VW Golf 2014-2020", "Fiat Argo 2017-2023"],
    attributes: { type: "Spin-on", thread: "M20 x 1.5", valve: "Anti-drainback" },
    image: { emoji: "\u{2699}️", accent: "#374151" },
  },
];

export function stockState(product: Product): StockState {
  if (product.availableQuantity <= 0) return "out_of_stock";
  if (product.availableQuantity <= 5) return "low_stock";
  return "in_stock";
}

/** Products are returned with the configured merchant id already applied. */
export function listProducts(merchantId: string): readonly Product[] {
  return products.map((product) => ({ ...product, merchantId }));
}

export function findProductBySku(merchantId: string, sku: string): Product | null {
  const normalised = sku.trim().toUpperCase();
  return listProducts(merchantId).find((product) => product.sku.toUpperCase() === normalised) ?? null;
}

export function findProductById(merchantId: string, id: string): Product | null {
  return listProducts(merchantId).find((product) => product.id === id) ?? null;
}

export function localCategories(merchantId: string): readonly { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const product of listProducts(merchantId)) {
    seen.set(product.localCategoryId, product.localCategoryLabel);
  }
  return [...seen].map(([id, label]) => ({ id, label }));
}

function normaliseText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export const SEARCH_LIMIT_DEFAULT = 10;
export const SEARCH_LIMIT_MAX = 50;

export function searchProducts(input: {
  merchantId: string;
  query: string;
  limit?: number;
  localCategoryId?: string;
}): readonly Product[] {
  const limit = Math.min(Math.max(input.limit ?? SEARCH_LIMIT_DEFAULT, 1), SEARCH_LIMIT_MAX);
  const tokens = normaliseText(input.query).split(/\s+/).filter(Boolean);
  const catalogue = listProducts(input.merchantId).filter(
    (product) => !input.localCategoryId || product.localCategoryId === input.localCategoryId,
  );

  if (tokens.length === 0) {
    return catalogue.slice(0, limit);
  }

  const scored = catalogue
    .map((product) => {
      const haystacks = [
        normaliseText(product.name),
        normaliseText(product.description),
        normaliseText(product.sku),
        normaliseText(product.brand),
        normaliseText(product.localCategoryLabel),
        normaliseText(product.searchTerms.join(" ")),
        normaliseText(product.compatibility.join(" ")),
      ];
      // Every token must match somewhere: a query is a conjunction, not a
      // union, so an unrelated term cannot drag in the whole catalogue.
      const hits = tokens.map((token) => haystacks.findIndex((haystack) => haystack.includes(token)));
      if (hits.some((index) => index === -1)) {
        return { product, score: 0 };
      }
      // Earlier fields (name, description) outrank later ones.
      const score = hits.reduce((total, index) => total + (10 - index), 0);
      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.product.sku.localeCompare(right.product.sku));

  return scored.slice(0, limit).map((entry) => entry.product);
}

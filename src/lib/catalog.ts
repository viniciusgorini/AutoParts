export const MERCHANT_ID = "mrc_autoparts";
export const MERCHANT_NAME = "AutoParts B2B Fleet Supply";
export const CATALOG_VERSION = "autoparts-2026-08-30";

export type ProductCategory =
  | "fleet.tires"
  | "fleet.brakes"
  | "fleet.shop-accessories"
  | "fleet.maintenance"
  | "fleet.electrical";
export type ProductVisual = "tire" | "jack" | "mat" | "brake" | "battery" | "oil" | "filter";

export type Product = {
  id: string;
  sku: string;
  merchantId: typeof MERCHANT_ID;
  name: string;
  description: string;
  category: ProductCategory;
  priceCents: number;
  currency: "USD";
  availableQuantity: number;
  searchTerms: string[];
  brand: string;
  compatibility: string;
  attributes: Record<string, string | number | boolean>;
  visual: ProductVisual;
};

export const categoryLabels: Record<ProductCategory, string> = {
  "fleet.tires": "Tires",
  "fleet.brakes": "Brakes",
  "fleet.shop-accessories": "Accessories",
  "fleet.maintenance": "Maintenance",
  "fleet.electrical": "Electrical",
};

export const products: Product[] = [
  {
    id: "prd_tire_std",
    sku: "prd_tire_std",
    merchantId: MERCHANT_ID,
    name: "Standard Fleet Tire Set",
    description: "Four 205/55 R16 all-season tires with fleet-grade durability and a 60,000-mile warranty.",
    category: "fleet.tires",
    priceCents: 154_800,
    currency: "USD",
    availableQuantity: 12,
    searchTerms: ["tire", "tires", "wheel", "205/55", "r16", "kit", "set", "fleet"],
    brand: "RoadMax",
    compatibility: "16-inch wheel · 205/55 R16",
    attributes: { quantity: 4, warrantyMonths: 60, loadIndex: 91 },
    visual: "tire",
  },
  {
    id: "prd_tire_prm",
    sku: "prd_tire_prm",
    merchantId: MERCHANT_ID,
    name: "Premium Fleet Tire Set",
    description: "Four high-performance 205/55 R16 tires with low noise and an A-rated wet grip.",
    category: "fleet.tires",
    priceCents: 172_000,
    currency: "USD",
    availableQuantity: 8,
    searchTerms: ["tire", "premium", "205/55", "r16", "quiet", "performance", "fleet"],
    brand: "Velocity Pro",
    compatibility: "16-inch wheel · 205/55 R16",
    attributes: { quantity: 4, warrantyMonths: 72, wetGrip: "A" },
    visual: "tire",
  },
  {
    id: "prd_acc_jack",
    sku: "prd_acc_jack",
    merchantId: MERCHANT_ID,
    name: "Hydraulic Trolley Jack (2-Ton)",
    description: "Dual-pump rapid-lift shop jack with a low profile and reinforced caster wheels.",
    category: "fleet.shop-accessories",
    priceCents: 38_900,
    currency: "USD",
    availableQuantity: 6,
    searchTerms: ["jack", "hydraulic", "trolley", "tool", "2 ton", "fleet bay"],
    brand: "TorquePro",
    compatibility: "Cars and light commercial vehicles",
    attributes: { capacityKg: 2000, minimumHeightMm: 135, maximumHeightMm: 340 },
    visual: "jack",
  },
  {
    id: "prd_acc_mats",
    sku: "prd_acc_mats",
    merchantId: MERCHANT_ID,
    name: "All-Weather Floor Mats",
    description: "Four washable, trimmable heavy-duty rubber mats with anti-slip backing.",
    category: "fleet.shop-accessories",
    priceCents: 12_900,
    currency: "USD",
    availableQuantity: 20,
    searchTerms: ["mat", "mats", "rubber", "interior", "universal", "floor"],
    brand: "AutoComfort",
    compatibility: "Universal · 4 pieces",
    attributes: { quantity: 4, material: "Rubber", washable: true },
    visual: "mat",
  },
  {
    id: "prd_brake_hd",
    sku: "prd_brake_hd",
    merchantId: MERCHANT_ID,
    name: "Heavy-Duty Ceramic Brake Pads",
    description: "Fleet ceramic pads with dual shims, low dust, and integrated wear sensors.",
    category: "fleet.brakes",
    priceCents: 14_500,
    currency: "USD",
    availableQuantity: 15,
    searchTerms: ["pad", "pads", "brake", "brakes", "ceramic", "heavy duty"],
    brand: "StopSafe",
    compatibility: "Passenger and light-duty fleet vehicles",
    attributes: { axle: "Front", material: "Ceramic", wearSensor: true },
    visual: "brake",
  },
  {
    id: "prd_battery_60ah",
    sku: "prd_battery_60ah",
    merchantId: MERCHANT_ID,
    name: "Fleet Battery 60 Ah",
    description: "Maintenance-free 12 V battery with high cold-cranking power and a 24-month warranty.",
    category: "fleet.electrical",
    priceCents: 18_900,
    currency: "USD",
    availableQuantity: 9,
    searchTerms: ["battery", "60ah", "electrical", "starter", "12v", "fleet"],
    brand: "VoltOne",
    compatibility: "12 V · Right positive terminal",
    attributes: { capacityAh: 60, voltage: 12, warrantyMonths: 24 },
    visual: "battery",
  },
  {
    id: "prd_oil_synth",
    sku: "prd_oil_synth",
    merchantId: MERCHANT_ID,
    name: "Synthetic Fleet Motor Oil (5W-30)",
    description: "Five-quart synthetic formulation designed for severe use and extended drain intervals.",
    category: "fleet.maintenance",
    priceCents: 4_800,
    currency: "USD",
    availableQuantity: 18,
    searchTerms: ["oil", "motor", "5w30", "5w-30", "lubricant", "synthetic", "fleet"],
    brand: "Motrix",
    compatibility: "Gasoline engines · Check the vehicle manual",
    attributes: { volumeQuarts: 5, viscosity: "5W-30", synthetic: true },
    visual: "oil",
  },
  {
    id: "prd_filter_oil",
    sku: "prd_filter_oil",
    merchantId: MERCHANT_ID,
    name: "Premium Oil Filter",
    description: "High-efficiency filter media that traps contaminants and protects fleet engines.",
    category: "fleet.maintenance",
    priceCents: 1_800,
    currency: "USD",
    availableQuantity: 24,
    searchTerms: ["filter", "oil", "motor", "engine", "service", "maintenance"],
    brand: "CleanFlow",
    compatibility: "Multiple 1.0–2.0 L engines",
    attributes: { thread: "M20 x 1.5", heightMm: 86, bypassValve: true },
    visual: "filter",
  },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function searchProducts(query: string, category?: ProductCategory | "all", limit = products.length) {
  const term = normalize(query);
  return products
    .filter((product) => !category || category === "all" || product.category === category)
    .filter((product) => {
      if (!term) return true;
      return normalize([
        product.name,
        product.description,
        product.sku,
        product.brand,
        categoryLabels[product.category],
        ...product.searchTerms,
      ].join(" ")).includes(term);
    })
    .slice(0, Math.max(0, Math.min(limit, 50)));
}

export function getProduct(productId: string) {
  return products.find((product) => product.id === productId);
}

"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  BatteryCharging,
  Bot,
  Check,
  ChevronRight,
  CircleGauge,
  CreditCard,
  Droplets,
  Filter,
  Landmark,
  Layers3,
  Loader2,
  LockKeyhole,
  Menu,
  Minus,
  Octagon,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Truck,
  Wrench,
  X,
} from "lucide-react";

import { calculateCart, formatUsd, type CartLine } from "@/lib/cart";
import {
  categoryLabels,
  searchProducts,
  type Product,
  type ProductCategory,
  type ProductVisual as ProductVisualName,
} from "@/lib/catalog";

type PaymentMethod = "bank" | "card" | "agentpay";
type CheckoutStatus = "idle" | "connecting" | "ready" | "error" | "finished";

const categories = Object.entries(categoryLabels) as Array<[ProductCategory, string]>;

const visualIcons: Record<ProductVisualName, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  tire: CircleGauge,
  jack: Wrench,
  mat: Layers3,
  brake: Octagon,
  battery: BatteryCharging,
  oil: Droplets,
  filter: Filter,
};

function ProductVisual({ product, compact = false }: { product: Product; compact?: boolean }) {
  const Icon = visualIcons[product.visual] ?? Package;
  return (
    <div className={`product-visual product-visual-${product.visual} ${compact ? "size-16 rounded-xl" : "h-48 rounded-2xl"}`}>
      <div className="product-orbit" />
      <Icon className={compact ? "size-8" : "size-24"} strokeWidth={1.15} />
      {!compact && <span className="product-code">{product.sku.split("-")[0]}</span>}
    </div>
  );
}

export function Storefront() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("agentpay");
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>("idle");

  const visibleProducts = useMemo(() => searchProducts(query, category), [query, category]);
  const cartLines = useMemo<CartLine[]>(
    () => Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })),
    [cart],
  );
  const totals = useMemo(() => calculateCart(cartLines), [cartLines]);
  const cartQuantity = totals.items.reduce((total, item) => total + item.quantity, 0);

  function addToCart(product: Product) {
    setCart((current) => ({
      ...current,
      [product.id]: Math.min((current[product.id] ?? 0) + 1, product.availableQuantity),
    }));
  }

  function buyWithAgentPay(product: Product) {
    setCart({ [product.id]: 1 });
    setPaymentMethod("agentpay");
    setCheckoutStatus("idle");
    setCheckoutOpen(true);
  }

  function changeQuantity(productId: string, nextQuantity: number, maximum: number) {
    if (nextQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((current) => ({ ...current, [productId]: Math.min(nextQuantity, maximum) }));
  }

  function removeFromCart(productId: string) {
    setCart((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  function openCheckout() {
    setCartOpen(false);
    setCheckoutStatus("idle");
    setCheckoutOpen(true);
  }

  async function continueCheckout() {
    if (paymentMethod !== "agentpay") {
      setCheckoutStatus("finished");
      return;
    }

    setCheckoutStatus("connecting");
    try {
      const response = await fetch("/.well-known/agentpay.json", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Discovery unavailable");
      setCheckoutStatus("ready");
    } catch {
      setCheckoutStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#171816]">
      <div className="bg-[#171816] text-white">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-2 text-xs sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 text-white/75"><Truck className="size-3.5" /> Fast nationwide delivery</span>
          <div className="hidden items-center gap-5 text-white/65 sm:flex"><span>Support center</span><span>My orders</span></div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-black/8 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <button className="rounded-lg p-2 text-[#4b4c47] hover:bg-[#f2f2ef] md:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
          <a href="#home" className="flex shrink-0 items-center gap-2.5" aria-label="AutoParts home">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#e8491d] text-white shadow-[0_6px_18px_rgba(232,73,29,.25)]"><Wrench className="size-5" strokeWidth={2.4} /></span>
            <span className="text-xl font-black tracking-[-0.04em]">Auto<span className="text-[#e8491d]">Parts</span></span>
          </a>
          <nav className="ml-5 hidden items-center gap-6 text-sm font-medium text-[#555650] lg:flex"><a href="#products" className="hover:text-[#e8491d]">Products</a><a href="#categories" className="hover:text-[#e8491d]">Categories</a><a href="#benefits" className="hover:text-[#e8491d]">How it works</a></nav>
          <label className="ml-auto hidden h-11 min-w-0 max-w-md flex-1 items-center gap-2 rounded-xl border border-[#deded8] bg-[#fafaf8] px-3 text-[#777871] focus-within:border-[#e8491d] focus-within:bg-white md:flex">
            <Search className="size-4 shrink-0" /><span className="sr-only">Search products</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by part, brand, or SKU" className="min-w-0 flex-1 bg-transparent text-sm text-[#171816] outline-none placeholder:text-[#96978f]" />
          </label>
          <span className="hidden items-center gap-1.5 rounded-full bg-[#f1f0ff] px-3 py-1.5 text-xs font-semibold text-[#4b43c8] xl:inline-flex"><ShieldCheck className="size-3.5" /> AgentPay accepted</span>
          <button onClick={() => setCartOpen(true)} className="relative flex size-11 items-center justify-center rounded-xl border border-[#deded8] bg-white transition hover:border-[#bebfb7] hover:bg-[#fafaf8]" aria-label={`Open cart with ${cartQuantity} items`}>
            <ShoppingCart className="size-5" />{cartQuantity > 0 && <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-[#e8491d] px-1 text-[11px] font-bold leading-5 text-white">{cartQuantity}</span>}
          </button>
        </div>
        <div className="px-4 pb-3 md:hidden"><label className="mx-auto flex h-11 max-w-[1240px] items-center gap-2 rounded-xl border border-[#deded8] bg-[#fafaf8] px-3 text-[#777871]"><Search className="size-4" /><span className="sr-only">Search products</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for a part" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div>
      </header>

      <main id="home">
        <section className="mx-auto max-w-[1240px] px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
          <div className="relative overflow-hidden rounded-[28px] bg-[#20221f] px-6 py-10 text-white sm:px-10 sm:py-12 lg:grid lg:grid-cols-[1.25fr_.75fr] lg:items-center lg:px-14 lg:py-14">
            <div className="pointer-events-none absolute -right-16 -top-24 size-96 rounded-full border-[64px] border-white/[0.025]" />
            <div className="relative z-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/75"><Check className="size-3.5 text-[#ff7952]" /> Curated parts with clear compatibility</span>
              <h1 className="mt-5 max-w-2xl text-4xl font-black leading-[1.04] tracking-[-0.055em] sm:text-5xl lg:text-[58px]">The right part to keep your fleet moving.</h1>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/62 sm:text-base">Tires, brakes, batteries, and maintenance essentials with live stock, transparent pricing, and secure checkout.</p>
              <div className="mt-7 flex flex-wrap gap-3"><a href="#products" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#e8491d] px-5 text-sm font-bold transition hover:bg-[#d63d13]">View products <ArrowRight className="size-4" /></a><a href="#categories" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-5 text-sm font-semibold text-white/85 hover:bg-white/[0.09]">Browse categories</a></div>
            </div>
            <div className="relative mt-10 hidden min-h-72 items-center justify-center lg:flex">
              <div className="hero-wheel"><CircleGauge className="size-44 text-[#d7d8d2]" strokeWidth={0.8} /><div className="hero-wheel-hub"><Wrench className="size-8" /></div></div>
              <div className="absolute bottom-1 left-1 rounded-2xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur"><div className="text-xs text-white/50">Free shipping</div><div className="mt-1 text-sm font-bold">on orders over $2,000</div></div>
            </div>
          </div>
        </section>

        <section id="benefits" className="mx-auto grid max-w-[1240px] grid-cols-1 gap-3 px-4 py-6 sm:grid-cols-3 sm:px-6 lg:px-8">
          {[[Truck, "Tracked delivery", "Clear timelines on every order"], [ShieldCheck, "Protected purchase", "Secure payments and data"], [Wrench, "Easy compatibility", "Technical details without the guesswork"]].map(([Icon, title, description]) => {
            const FeatureIcon = Icon as typeof Truck;
            return <div key={String(title)} className="flex items-center gap-3 rounded-2xl border border-black/6 bg-white px-4 py-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#fff0ea] text-[#e8491d]"><FeatureIcon className="size-5" /></span><div><div className="text-sm font-bold">{String(title)}</div><div className="mt-0.5 text-xs text-[#777871]">{String(description)}</div></div></div>;
          })}
        </section>

        <section id="categories" className="mx-auto max-w-[1240px] px-4 pt-2 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Find it faster</p><h2 className="section-title">Shop by category</h2></div>{category !== "all" && <button onClick={() => setCategory("all")} className="text-sm font-semibold text-[#e8491d]">Clear filter</button>}</div>
          <div className="mt-5 flex gap-3 overflow-x-auto pb-2"><button onClick={() => setCategory("all")} className={`category-pill ${category === "all" ? "category-pill-active" : ""}`}><Package className="size-5" /> All</button>{categories.map(([value, label]) => <button key={value} onClick={() => setCategory(value)} className={`category-pill ${category === value ? "category-pill-active" : ""}`}>{label}</button>)}</div>
        </section>

        <section id="products" className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">AutoParts catalog</p><h2 className="section-title">Featured fleet parts</h2><p className="mt-2 text-sm text-[#73746e]">Demo-ready inventory for fleet procurement.</p></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#666760] shadow-sm ring-1 ring-black/5">{visibleProducts.length} products</span></div>
          {visibleProducts.length > 0 ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => (
                <article key={product.id} className="group overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-[0_2px_8px_rgba(20,20,18,.03)] transition hover:-translate-y-1 hover:shadow-[0_14px_40px_rgba(20,20,18,.09)]">
                  <div className="relative p-3 pb-0"><ProductVisual product={product} /><span className="absolute left-5 top-5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#555650] shadow-sm backdrop-blur">{product.brand}</span><span className="absolute right-5 top-5 rounded-full bg-[#eaf7ee] px-2.5 py-1 text-[10px] font-bold text-[#22733d]">In stock</span></div>
                  <div className="p-5"><div className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#999a93]">{categoryLabels[product.category]} · {product.sku}</div><h3 className="mt-2 text-[17px] font-extrabold leading-5 tracking-[-0.025em]">{product.name}</h3><p className="mt-2 line-clamp-2 min-h-10 text-[12.5px] leading-5 text-[#73746e]">{product.description}</p><div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-[#60615b]"><Check className="size-3.5 text-[#e8491d]" /> {product.compatibility}</div>
                    <div className="mt-5 flex items-end justify-between gap-3 border-t border-black/6 pt-4"><div><div className="text-[10px] text-[#8a8b84]">cash price</div><div className="mt-0.5 text-xl font-black tracking-[-0.03em]">{formatUsd(product.priceCents)}</div><div className="text-[10px] text-[#8a8b84]">{product.availableQuantity} units</div></div><button onClick={() => addToCart(product)} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#171816] text-white transition hover:bg-[#e8491d]" aria-label={`Add ${product.name} to cart`}><Plus className="size-5" /></button></div>
                    <button onClick={() => buyWithAgentPay(product)} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#deded8] text-xs font-bold text-[#4b43c8] transition hover:border-[#bbb8ff] hover:bg-[#f4f3ff]"><ShieldCheck className="size-4" /> Buy with AgentPay</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="mt-6 rounded-3xl border border-dashed border-[#cbccc4] bg-white px-6 py-16 text-center"><Search className="mx-auto size-8 text-[#a3a49c]" /><h3 className="mt-4 text-lg font-bold">No parts found</h3><p className="mt-1 text-sm text-[#777871]">Try another name, brand, or SKU.</p></div>}
        </section>
      </main>

      <footer className="border-t border-black/7 bg-white"><div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8"><div><div className="text-lg font-black">Auto<span className="text-[#e8491d]">Parts</span></div><p className="mt-3 max-w-xs text-xs leading-5 text-[#777871]">An independent mock store built for human and autonomous fleet procurement.</p></div><div><div className="footer-title">Store</div><p className="footer-link">Products</p><p className="footer-link">Categories</p><p className="footer-link">My orders</p></div><div><div className="footer-title">Help</div><p className="footer-link">Delivery</p><p className="footer-link">Returns</p><p className="footer-link">Contact us</p></div><div><div className="footer-title">Payment</div><span className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#f4f3ff] px-3 py-2 text-xs font-bold text-[#4b43c8]"><ShieldCheck className="size-4" /> AgentPay integrated</span></div></div></footer>

      {cartOpen && <CartDrawer totals={totals} cartQuantity={cartQuantity} onClose={() => setCartOpen(false)} onChangeQuantity={changeQuantity} onRemove={removeFromCart} onCheckout={openCheckout} />}
      {checkoutOpen && <CheckoutModal totals={totals} paymentMethod={paymentMethod} setPaymentMethod={(method) => { setPaymentMethod(method); setCheckoutStatus("idle"); }} status={checkoutStatus} onContinue={continueCheckout} onClose={() => setCheckoutOpen(false)} />}
    </div>
  );
}

function CartDrawer({ totals, cartQuantity, onClose, onChangeQuantity, onRemove, onCheckout }: { totals: ReturnType<typeof calculateCart>; cartQuantity: number; onClose: () => void; onChangeQuantity: (id: string, quantity: number, maximum: number) => void; onRemove: (id: string) => void; onCheckout: () => void }) {
  return <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" role="presentation" onMouseDown={onClose}><aside className="ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Shopping cart" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-black/7 px-5 py-5"><div><h2 className="text-lg font-black">Your cart</h2><p className="text-xs text-[#777871]">{cartQuantity} {cartQuantity === 1 ? "item" : "items"}</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-[#f2f2ef]" aria-label="Close cart"><X className="size-5" /></button></div><div className="flex-1 overflow-y-auto p-5">{totals.items.length === 0 ? <div className="flex h-full flex-col items-center justify-center text-center"><span className="flex size-16 items-center justify-center rounded-full bg-[#f2f2ef]"><ShoppingCart className="size-7 text-[#777871]" /></span><h3 className="mt-4 font-bold">Your cart is empty</h3><p className="mt-1 max-w-xs text-sm text-[#777871]">Add a fleet part to begin your order.</p><button onClick={onClose} className="mt-5 rounded-xl bg-[#171816] px-5 py-3 text-sm font-bold text-white">View products</button></div> : <div className="space-y-5">{totals.items.map(({ product, quantity, lineTotalCents }) => <div key={product.id} className="flex gap-3"><ProductVisual product={product} compact /><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{product.name}</div><div className="mt-0.5 text-[11px] text-[#888981]">{product.sku}</div><div className="mt-2 flex items-center justify-between gap-2"><div className="flex items-center rounded-lg border border-[#deded8]"><button onClick={() => onChangeQuantity(product.id, quantity - 1, product.availableQuantity)} className="p-1.5" aria-label="Decrease quantity"><Minus className="size-3.5" /></button><span className="min-w-7 text-center text-xs font-bold">{quantity}</span><button onClick={() => onChangeQuantity(product.id, quantity + 1, product.availableQuantity)} className="p-1.5" aria-label="Increase quantity"><Plus className="size-3.5" /></button></div><span className="text-sm font-black">{formatUsd(lineTotalCents)}</span></div></div><button onClick={() => onRemove(product.id)} className="self-start rounded-lg p-1.5 text-[#999a93] hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${product.name}`}><Trash2 className="size-4" /></button></div>)}</div>}</div>{totals.items.length > 0 && <CartTotals totals={totals} onContinue={onCheckout} />}</aside></div>;
}

function CartTotals({ totals, onContinue }: { totals: ReturnType<typeof calculateCart>; onContinue: () => void }) {
  return <div className="border-t border-black/7 bg-[#fafaf8] p-5"><div className="space-y-2 text-sm"><div className="flex justify-between text-[#666760]"><span>Subtotal</span><span>{formatUsd(totals.subtotalCents)}</span></div><div className="flex justify-between text-[#666760]"><span>Shipping</span><span>{totals.shippingCents === 0 ? "Free" : formatUsd(totals.shippingCents)}</span></div><div className="flex justify-between text-[#666760]"><span>Estimated tax</span><span>{formatUsd(totals.taxCents)}</span></div><div className="flex justify-between border-t border-black/7 pt-3 text-base font-black"><span>Total</span><span>{formatUsd(totals.totalCents)}</span></div></div><button onClick={onContinue} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e8491d] text-sm font-bold text-white transition hover:bg-[#d63d13]">Continue to payment <ChevronRight className="size-4" /></button><p className="mt-3 flex items-center justify-center gap-1.5 text-[10.5px] text-[#85867f]"><LockKeyhole className="size-3" /> Demo environment: no real payment will be processed</p></div>;
}

function CheckoutModal({ totals, paymentMethod, setPaymentMethod, status, onContinue, onClose }: { totals: ReturnType<typeof calculateCart>; paymentMethod: PaymentMethod; setPaymentMethod: (method: PaymentMethod) => void; status: CheckoutStatus; onContinue: () => void; onClose: () => void }) {
  const methods: Array<{ id: PaymentMethod; title: string; description: string; icon: typeof Landmark }> = [{ id: "bank", title: "Bank transfer", description: "Mock same-day bank payment", icon: Landmark }, { id: "card", title: "Card", description: "Mock business credit card", icon: CreditCard }, { id: "agentpay", title: "AgentPay", description: "Payment authorized by your procurement agent", icon: Bot }];
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}><div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]" role="dialog" aria-modal="true" aria-label="Payment" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-black/7 px-5 py-4 sm:px-6"><div><h2 className="text-lg font-black">Complete your order</h2><p className="text-xs text-[#777871]">Choose a payment method</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-[#f2f2ef]" aria-label="Close payment"><X className="size-5" /></button></div><div className="p-5 sm:p-6"><div className="rounded-2xl bg-[#f7f7f5] p-4"><div className="flex items-center justify-between text-sm"><span className="text-[#666760]">{totals.items.length} {totals.items.length === 1 ? "product" : "products"}</span><span className="text-lg font-black">{formatUsd(totals.totalCents)}</span></div></div>{status === "idle" && <><h3 className="mt-6 text-sm font-bold">Payment method</h3><div className="mt-3 space-y-2">{methods.map(({ id, title, description, icon: Icon }) => <button key={id} onClick={() => setPaymentMethod(id)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${paymentMethod === id ? "border-[#655cf6] bg-[#f6f5ff] ring-1 ring-[#655cf6]" : "border-[#deded8] hover:bg-[#fafaf8]"}`}><span className={`flex size-10 items-center justify-center rounded-xl ${id === "agentpay" ? "bg-[#655cf6] text-white" : "bg-[#f0f0ed] text-[#555650]"}`}><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{title}</span><span className="mt-0.5 block text-xs text-[#777871]">{description}</span></span><span className={`size-4 rounded-full border-[5px] ${paymentMethod === id ? "border-[#655cf6]" : "border-[#c7c8c0]"}`} /></button>)}</div>{paymentMethod === "agentpay" && <div className="mt-4 flex gap-3 rounded-2xl bg-[#f3f2ff] p-4 text-xs leading-5 text-[#4b43c8]"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><p>AgentPay verifies the agent identity, mandate, and spending limits before authorization. AutoParts never receives card credentials.</p></div>}<button onClick={onContinue} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#171816] text-sm font-bold text-white hover:bg-[#292a27]">Continue with {paymentMethod === "agentpay" ? "AgentPay" : paymentMethod === "bank" ? "bank transfer" : "card"} <ArrowRight className="size-4" /></button></>}{status === "connecting" && <div className="py-12 text-center"><Loader2 className="mx-auto size-9 animate-spin text-[#655cf6]" /><h3 className="mt-4 font-bold">Connecting to AgentPay</h3><p className="mt-1 text-sm text-[#777871]">Checking the merchant discovery document…</p></div>}{status === "ready" && <StatusPanel tone="success" title="AutoParts is connected to AgentPay" description="Discovery succeeded. A procurement agent can now request a signed quote and submit an authorized payment token." onClose={onClose} />}{status === "finished" && <StatusPanel tone="success" title="Mock order created" description="The payment method was selected. No real charge was made in this demo environment." onClose={onClose} />}{status === "error" && <StatusPanel tone="error" title="Connection unavailable" description="AgentPay did not respond. Retry safely without duplicating the order." onClose={onClose} onRetry={onContinue} />}</div></div></div>;
}

function StatusPanel({ tone, title, description, onClose, onRetry }: { tone: "success" | "error"; title: string; description: string; onClose: () => void; onRetry?: () => void }) {
  return <div className="py-8 text-center"><span className={`mx-auto flex size-14 items-center justify-center rounded-full ${tone === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{tone === "success" ? <Check className="size-7" strokeWidth={2.5} /> : <X className="size-7" />}</span><h3 className="mt-4 text-lg font-black">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#777871]">{description}</p><div className="mt-6 flex justify-center gap-2">{onRetry && <button onClick={onRetry} className="rounded-xl border border-[#deded8] px-4 py-2.5 text-sm font-bold">Try again</button>}<button onClick={onClose} className="rounded-xl bg-[#171816] px-5 py-2.5 text-sm font-bold text-white">Done</button></div></div>;
}

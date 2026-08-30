"use client";

import { useMemo, useState } from "react";

import type { PublicProduct } from "@/lib/handlers";
import { formatMoney } from "@/lib/money";
import { priceLineTotals } from "@/lib/pricing";

type Category = { id: string; label: string };

type CartLine = { product: PublicProduct; quantity: number };

type CheckoutStage =
  | { kind: "idle" }
  | { kind: "quoting" }
  | { kind: "verifying" }
  | { kind: "approved"; message: string; orderRef: string; detail: unknown }
  | { kind: "approval_required"; message: string; detail: unknown }
  | { kind: "refused"; message: string; detail: unknown }
  | { kind: "error"; message: string; retryable: boolean };

type CheckoutResponse = {
  outcome: "approved" | "approval_required" | "refused" | "error";
  message: string;
  merchantOrderRef: string | null;
  quote: unknown;
  decision: unknown;
};

const STOCK_LABEL: Record<PublicProduct["stockState"], string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Unavailable",
};

const STOCK_CLASS: Record<PublicProduct["stockState"], string> = {
  in_stock: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  low_stock: "bg-amber-50 text-amber-700 ring-amber-200",
  out_of_stock: "bg-slate-100 text-slate-500 ring-slate-200",
};

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matches(product: PublicProduct, query: string): boolean {
  const tokens = normalise(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalise(
    [
      product.name,
      product.description,
      product.merchantSku,
      product.brand,
      product.merchantCategoryLabel,
      product.compatibility.join(" "),
      Object.values(product.attributes).join(" "),
    ].join(" "),
  );
  return tokens.every((token) => haystack.includes(token));
}

export function Storefront(props: {
  merchantName: string;
  merchantId: string;
  registryUrl: string;
  catalogVersion: string;
  categories: readonly Category[];
  products: readonly PublicProduct[];
  demoCheckoutEnabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<readonly CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mandateId, setMandateId] = useState("");
  const [stage, setStage] = useState<CheckoutStage>({ kind: "idle" });
  const [technicalOpen, setTechnicalOpen] = useState(false);

  const visible = useMemo(
    () =>
      props.products.filter(
        (product) => (!category || product.merchantCategoryId === category) && matches(product, query),
      ),
    [props.products, category, query],
  );

  const totals = useMemo(
    () => priceLineTotals(cart.map((line) => line.product.unitPriceCents * line.quantity)),
    [cart],
  );

  const cartCategories = useMemo(
    () => [...new Set(cart.map((line) => line.product.agentPayCategory))],
    [cart],
  );
  const mixedCart = cartCategories.length > 1;

  function addToCart(product: PublicProduct, quantity = 1) {
    if (product.stockState === "out_of_stock") return;
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (!existing) return [...current, { product, quantity }];
      return current.map((line) =>
        line.product.id === product.id
          ? { ...line, quantity: Math.min(line.quantity + quantity, product.availableQuantity) }
          : line,
      );
    });
  }

  function setQuantity(productId: string, quantity: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.product.id === productId
            ? { ...line, quantity: Math.max(0, Math.min(quantity, line.product.availableQuantity)) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function removeFromCart(productId: string) {
    setCart((current) => current.filter((line) => line.product.id !== productId));
  }

  function openCheckout(product?: PublicProduct) {
    if (product) addToCart(product);
    setStage({ kind: "idle" });
    setCheckoutOpen(true);
  }

  async function runCheckout() {
    if (cart.length === 0 || mixedCart) return;

    setStage({ kind: "quoting" });
    try {
      setStage({ kind: "verifying" });
      const response = await fetch("/api/storefront/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: cart.map((line) => ({ merchantSku: line.product.merchantSku, quantity: line.quantity })),
          mandateId: mandateId.trim(),
        }),
      });

      const payload = (await response.json()) as CheckoutResponse | { error: { message: string } };

      if (!response.ok || !("outcome" in payload)) {
        const message =
          "error" in payload ? payload.error.message : "We could not complete this purchase right now.";
        setStage({ kind: "error", message, retryable: response.status >= 500 || response.status === 429 });
        return;
      }

      if (payload.outcome === "approved") {
        setStage({
          kind: "approved",
          message: payload.message,
          orderRef: payload.merchantOrderRef ?? "",
          detail: payload,
        });
        setCart([]);
        return;
      }
      if (payload.outcome === "approval_required") {
        setStage({ kind: "approval_required", message: payload.message, detail: payload });
        return;
      }
      if (payload.outcome === "refused") {
        setStage({ kind: "refused", message: payload.message, detail: payload });
        return;
      }
      setStage({ kind: "error", message: payload.message, retryable: true });
    } catch {
      setStage({
        kind: "error",
        message: "We could not reach the store. Check your connection.",
        retryable: true,
      });
    }
  }

  const itemCount = cart.reduce((total, line) => total + line.quantity, 0);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:gap-6">
          <div className="flex items-center justify-between gap-3 md:justify-start">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-lg bg-orange-600 text-lg font-black text-white"
              >
                A
              </span>
              <div className="leading-tight">
                <p className="text-lg font-bold tracking-tight text-slate-900">{props.merchantName}</p>
                <p className="text-[11px] text-slate-500">Car parts</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              Accepts AgentPay
            </span>
          </div>

          <div className="flex-1">
            <label className="sr-only" htmlFor="busca">
              Search parts
            </label>
            <input
              id="busca"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by part, brand, SKU or vehicle"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => openCheckout()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 active:bg-slate-950"
          >
            Cart
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold">{itemCount}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Parts with agent-authorized checkout
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
            A synthetic catalogue that demonstrates the AgentPay protocol: the store signs the quote, the
            agent presents the mandate, and AgentPay decides whether the purchase may happen.
          </p>
        </section>

        <div className="mb-5 flex flex-wrap gap-2">
          <FilterChip active={category === null} onClick={() => setCategory(null)}>
            All
          </FilterChip>
          {props.categories.map((item) => (
            <FilterChip
              key={item.id}
              active={category === item.id}
              onClick={() => setCategory(category === item.id ? null : item.id)}
            >
              {item.label}
            </FilterChip>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
            No parts match that search.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAdd={() => addToCart(product)}
                onBuy={() => openCheckout(product)}
              />
            ))}
          </ul>
        )}

        <CartPanel
          cart={cart}
          totals={totals}
          mixedCart={mixedCart}
          onQuantity={setQuantity}
          onRemove={removeFromCart}
          onCheckout={() => openCheckout()}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-500 sm:px-6">
          Demonstration store. No real payment is processed and every value here is fictional.
        </div>
      </footer>

      {checkoutOpen && (
        <CheckoutDialog
          cart={cart}
          totals={totals}
          mixedCart={mixedCart}
          stage={stage}
          mandateId={mandateId}
          demoEnabled={props.demoCheckoutEnabled}
          technicalOpen={technicalOpen}
          merchantId={props.merchantId}
          registryUrl={props.registryUrl}
          catalogVersion={props.catalogVersion}
          onMandateId={setMandateId}
          onToggleTechnical={() => setTechnicalOpen((open) => !open)}
          onClose={() => setCheckoutOpen(false)}
          onConfirm={runCheckout}
          onQuantity={setQuantity}
          onRemove={removeFromCart}
        />
      )}
    </div>
  );
}

function FilterChip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        props.active
          ? "bg-orange-600 text-white"
          : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
      }`}
    >
      {props.children}
    </button>
  );
}

function ProductCard(props: { product: PublicProduct; onAdd: () => void; onBuy: () => void }) {
  const { product } = props;
  const unavailable = product.stockState === "out_of_stock";

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300">
      <div
        aria-hidden
        className="grid h-28 place-items-center text-4xl"
        style={{ backgroundColor: `${product.attributes.accent ?? "#f1f5f9"}` }}
      >
        <span className="rounded-lg bg-white/80 px-3 py-1.5">{iconFor(product)}</span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{product.name}</h2>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STOCK_CLASS[product.stockState]}`}
          >
            {STOCK_LABEL[product.stockState]}
          </span>
        </div>

        <p className="text-xs text-slate-600">{product.description}</p>

        <dl className="mt-0.5 space-y-0.5 text-[11px] text-slate-500">
          <div className="flex gap-1.5">
            <dt className="font-medium text-slate-600">SKU</dt>
            <dd className="font-mono">{product.merchantSku}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-medium text-slate-600">Brand</dt>
            <dd>{product.brand}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-medium text-slate-600">Fits</dt>
            <dd className="truncate" title={product.compatibility.join(", ")}>
              {product.compatibility.join(", ")}
            </dd>
          </div>
        </dl>

        <p className="mt-auto pt-2 text-lg font-bold text-slate-900">{formatMoney(product.unitPriceCents)}</p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={unavailable}
            onClick={props.onAdd}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to cart
          </button>
          <button
            type="button"
            disabled={unavailable}
            onClick={props.onBuy}
            className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Buy with AgentPay
          </button>
        </div>
      </div>
    </li>
  );
}

function iconFor(product: PublicProduct): string {
  if (product.merchantCategoryId === "tires") return "\u{1F6DE}";
  if (product.merchantCategoryId === "brakes") return "\u{1F6D1}";
  if (product.merchantCategoryId === "electrical") return "\u{1F50B}";
  if (product.merchantCategoryId === "fluids") return "\u{1F6E2}️";
  if (product.merchantCategoryId === "tools") return "\u{1F6E0}️";
  if (product.merchantCategoryId === "filters") return "⚙️";
  return "\u{1F9E9}";
}

function CartPanel(props: {
  cart: readonly CartLine[];
  totals: ReturnType<typeof priceLineTotals>;
  mixedCart: boolean;
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
}) {
  if (props.cart.length === 0) return null;

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-bold text-slate-900">Cart</h2>
      <ul className="divide-y divide-slate-100">
        {props.cart.map((line) => (
          <li key={line.product.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{line.product.name}</p>
              <p className="font-mono text-[11px] text-slate-500">{line.product.merchantSku}</p>
            </div>
            <QuantityStepper
              value={line.quantity}
              max={line.product.availableQuantity}
              onChange={(quantity) => props.onQuantity(line.product.id, quantity)}
            />
            <p className="w-28 text-right text-sm font-semibold text-slate-900">
              {formatMoney(line.product.unitPriceCents * line.quantity)}
            </p>
            <button
              type="button"
              onClick={() => props.onRemove(line.product.id)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-200 px-5 py-4">
        <Totals totals={props.totals} />
        {props.mixedCart && <MixedCartNotice />}
        <button
          type="button"
          onClick={props.onCheckout}
          className="mt-3 w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700"
        >
          Continue with AgentPay
        </button>
      </div>
    </section>
  );
}

function QuantityStepper(props: { value: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg ring-1 ring-slate-300">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => props.onChange(props.value - 1)}
        className="px-2.5 py-1 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{props.value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={props.value >= props.max}
        onClick={() => props.onChange(props.value + 1)}
        className="px-2.5 py-1 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function Totals(props: { totals: ReturnType<typeof priceLineTotals> }) {
  return (
    <dl className="space-y-1 text-sm">
      <Row label="Subtotal" value={formatMoney(props.totals.subtotalCents)} />
      <Row
        label="Shipping"
        value={props.totals.shippingCents === 0 ? "Free" : formatMoney(props.totals.shippingCents)}
      />
      <Row label="Tax" value={formatMoney(props.totals.taxCents)} />
      <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
        <dt>Total</dt>
        <dd>{formatMoney(props.totals.totalCents)}</dd>
      </div>
    </dl>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{props.label}</dt>
      <dd className="tabular-nums">{props.value}</dd>
    </div>
  );
}

function MixedCartNotice() {
  return (
    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
      This cart mixes categories. AgentPay authorizes one category per purchase, so split the items and
      check out one category at a time.
    </p>
  );
}

function CheckoutDialog(props: {
  cart: readonly CartLine[];
  totals: ReturnType<typeof priceLineTotals>;
  mixedCart: boolean;
  stage: CheckoutStage;
  mandateId: string;
  demoEnabled: boolean;
  technicalOpen: boolean;
  merchantId: string;
  registryUrl: string;
  catalogVersion: string;
  onMandateId: (value: string) => void;
  onToggleTechnical: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  const busy = props.stage.kind === "quoting" || props.stage.kind === "verifying";
  const canConfirm =
    props.demoEnabled && !busy && !props.mixedCart && props.cart.length > 0 && props.mandateId.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Checkout AgentPay"
      className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-bold text-slate-900">Check out with AgentPay</h2>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {props.cart.length === 0 ? (
            <p className="text-sm text-slate-600">Your cart is empty.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {props.cart.map((line) => (
                  <li key={line.product.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-800">{line.product.name}</span>
                    <QuantityStepper
                      value={line.quantity}
                      max={line.product.availableQuantity}
                      onChange={(quantity) => props.onQuantity(line.product.id, quantity)}
                    />
                    <span className="w-24 text-right font-semibold tabular-nums">
                      {formatMoney(line.product.unitPriceCents * line.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="rounded-lg bg-slate-50 p-3">
                <Totals totals={props.totals} />
              </div>

              {props.mixedCart && <MixedCartNotice />}

              <div>
                <label htmlFor="mandato" className="block text-sm font-semibold text-slate-800">
                  AgentPay mandate identifier
                </label>
                <p className="mt-0.5 text-xs text-slate-500">
                  You create and approve the mandate inside AgentPay. AutoParts only presents it for
                  verification.
                </p>
                <input
                  id="mandato"
                  value={props.mandateId}
                  onChange={(event) => props.onMandateId(event.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-200 focus:outline-none"
                />
              </div>

              {!props.demoEnabled && (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
                  Browser checkout is disabled on this deployment. Complete the purchase from your own
                  AgentPay agent, which signs the request with its own key.
                </p>
              )}

              <StageBanner stage={props.stage} />

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={!canConfirm}
                  onClick={props.onConfirm}
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Verifying..." : "Confirm purchase"}
                </button>
                {props.stage.kind === "error" && props.stage.retryable && (
                  <button
                    type="button"
                    onClick={props.onConfirm}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    Try again
                  </button>
                )}
              </div>
            </>
          )}

          <details
            open={props.technicalOpen}
            onToggle={props.onToggleTechnical}
            className="rounded-lg border border-slate-200"
          >
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600">
              Technical panel (demo audit)
            </summary>
            <div className="space-y-2 border-t border-slate-200 px-3 py-2 text-[11px]">
              <p className="text-slate-600">
                Merchant <span className="font-mono">{props.merchantId}</span>
              </p>
              <p className="text-slate-600">
                Registry <span className="font-mono">{props.registryUrl}</span>
              </p>
              <p className="text-slate-600">
                Catalogue <span className="font-mono">{props.catalogVersion}</span>
              </p>
              {"detail" in props.stage && (
                <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-slate-100">
                  {JSON.stringify(props.stage.detail, null, 2)}
                </pre>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function StageBanner(props: { stage: CheckoutStage }) {
  const { stage } = props;
  if (stage.kind === "idle") return null;

  const tone =
    stage.kind === "approved"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : stage.kind === "approval_required"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : stage.kind === "refused" || stage.kind === "error"
          ? "bg-rose-50 text-rose-800 ring-rose-200"
          : "bg-slate-50 text-slate-700 ring-slate-200";

  const text =
    stage.kind === "quoting"
      ? "Creating the signed quote..."
      : stage.kind === "verifying"
        ? "Connecting to AgentPay and verifying the mandate..."
        : stage.message;

  return (
    <div className={`rounded-lg px-3 py-2.5 text-sm ring-1 ${tone}`} role="status" aria-live="polite">
      <p className="font-semibold">{text}</p>
      {stage.kind === "approved" && stage.orderRef && (
        <p className="mt-0.5 text-xs opacity-80">
          Order <span className="font-mono">{stage.orderRef}</span>
        </p>
      )}
    </div>
  );
}

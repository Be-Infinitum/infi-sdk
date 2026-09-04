/**
 * IIFE entry for the `<script>` tag. Exposes the global and self-starts.
 *
 * Separate from `loader.ts` so the module stays testable without a global, and
 * so this file is the only place the global's name is decided.
 */
import { destroy, mount, scan, start } from "./loader.js";
import { createCheckoutEmbed } from "./core.js";

type Api = {
  mount: typeof mount;
  destroy: typeof destroy;
  scan: typeof scan;
  create: typeof createCheckoutEmbed;
  /** Drive an embed by the element's id, for a merchant's own Pay button. */
  submit: (elementId: string) => Promise<void>;
  getEmail: (elementId: string) => Promise<string>;
  setEmail: (elementId: string, value: string) => Promise<void>;
  getTaxId: (elementId: string) => Promise<string>;
  setTaxId: (elementId: string, value: string) => Promise<void>;
};

function handleFor(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`[infi] no element with id "${elementId}".`);
  const handle = mount(el);
  if (!handle) throw new Error(`[infi] the element "${elementId}" is not a checkout.`);
  return handle;
}

const api: Api = {
  mount,
  destroy,
  scan,
  create: createCheckoutEmbed,
  submit: (id) => handleFor(id).submit(),
  getEmail: (id) => handleFor(id).getEmail(),
  setEmail: (id, value) => handleFor(id).setEmail(value),
  getTaxId: (id) => handleFor(id).getTaxId(),
  setTaxId: (id, value) => handleFor(id).setTaxId(value),
};

// Named for the product, not abbreviated: a global on a merchant's page shares
// a namespace with everything else they loaded.
(globalThis as unknown as { infiCheckout: Api }).infiCheckout = api;

start();

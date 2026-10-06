/**
 * The languages the elements speak — the frames (checkout, portal, login) and
 * the few words the React components draw themselves. A new language is a
 * new entry in MESSAGES here and a new messages folder in the Infi frontend.
 */
export const SUPPORTED_LOCALES = ["pt-BR", "en"] as const;
export type InfiLocale = (typeof SUPPORTED_LOCALES)[number];
export const FALLBACK_LOCALE: InfiLocale = "pt-BR";

/** Narrow any BCP-47 tag to a supported one; `undefined` when none fits. */
export function matchLocale(tag: string | null | undefined): InfiLocale | undefined {
  const t = (tag ?? "").trim().toLowerCase();
  if (t === "pt" || t.startsWith("pt-")) return "pt-BR";
  if (t === "en" || t.startsWith("en-")) return "en";
  return undefined;
}

/**
 * The language to show when the site did not say: the page's own
 * `<html lang>` (the site's language) first, then the buyer's browser.
 * `undefined` off the browser, or when nothing is supported.
 */
export function detectLocale(): InfiLocale | undefined {
  const doc = globalThis.document;
  const fromPage = matchLocale(doc?.documentElement?.lang);
  if (fromPage) return fromPage;
  const nav = globalThis.navigator;
  for (const tag of nav?.languages ?? (nav?.language ? [nav.language] : [])) {
    const m = matchLocale(tag);
    if (m) return m;
  }
  return undefined;
}

/** Explicit (prop, provider) wins; else detected; else the fallback. */
export function resolveLocale(explicit?: string | null): InfiLocale {
  return matchLocale(explicit) ?? detectLocale() ?? FALLBACK_LOCALE;
}

export interface ElementMessages {
  buy: string;
  subscribe: string;
  cycle: Record<"weekly" | "monthly" | "annual", string>;
  checkoutTitle: string;
  portalTitle: string;
  loginTitle: string;
  /** Words the natively drawn pieces use: preview mode and the product page. */
  ui: {
    previewBadge: string;
    faqTitle: string;
    guarantee: (days: number) => string;
    coupon: string;
    applyCoupon: string;
    pix: string;
    card: string;
    pixInstructions: string;
    copyCode: string;
    cardNumber: string;
    cardExpiry: string;
    cardCvc: string;
    cardName: string;
    pay: string;
    buyer: string;
    orders: string;
    order: string;
    paid: string;
    subscriptions: string;
    active: string;
    nextBilling: string;
    guaranteeUntil: string;
    total: string;
  };
  signInWithInfi: string;
  /** FeedbackElement (BE-437). */
  feedback: {
    open: string;
    title: string;
    placeholder: string;
    send: string;
    sending: string;
    thanks: string;
    failed: string;
    close: string;
    reactions: Record<"love" | "like" | "neutral" | "dislike", string>;
  };
}

export const MESSAGES: Record<InfiLocale, ElementMessages> = {
  "pt-BR": {
    buy: "Comprar",
    subscribe: "Assinar",
    cycle: { weekly: "/semana", monthly: "/mês", annual: "/ano" },
    checkoutTitle: "Pagamento",
    portalTitle: "Minhas compras",
    loginTitle: "Entrar",
    ui: {
      previewBadge: "Prévia — nada é cobrado",
      faqTitle: "Perguntas frequentes",
      guarantee: (d) => `Garantia de ${d} dias: devolvemos seu dinheiro se não gostar.`,
      coupon: "Cupom de desconto",
      applyCoupon: "Aplicar",
      pix: "Pix",
      card: "Cartão",
      pixInstructions: "Abra o app do seu banco e escaneie o QR code ou copie o código.",
      copyCode: "Copiar código",
      cardNumber: "Número do cartão",
      cardExpiry: "Validade",
      cardCvc: "CVC",
      cardName: "Nome no cartão",
      pay: "Pagar",
      buyer: "Comprador",
      orders: "Pedidos",
      order: "Pedido",
      paid: "Pago",
      subscriptions: "Assinaturas",
      active: "Ativa",
      nextBilling: "Próxima cobrança",
      guaranteeUntil: "Garantia até",
      total: "Total",
    },
    signInWithInfi: "Entrar com Infi",
    feedback: {
      open: "Feedback",
      title: "O que você está achando?",
      placeholder: "Conte o que funcionou ou o que atrapalhou (opcional)",
      send: "Enviar",
      sending: "Enviando…",
      thanks: "Obrigado! Recebemos sua mensagem.",
      failed: "Não foi possível enviar. Tente de novo.",
      close: "Fechar",
      reactions: { love: "Amei", like: "Gostei", neutral: "Indiferente", dislike: "Não gostei" },
    },
  },
  en: {
    buy: "Buy",
    subscribe: "Subscribe",
    cycle: { weekly: "/week", monthly: "/month", annual: "/year" },
    checkoutTitle: "Checkout",
    portalTitle: "My purchases",
    loginTitle: "Sign in",
    ui: {
      previewBadge: "Preview — nothing is charged",
      faqTitle: "Frequently asked questions",
      guarantee: (d) => `${d}-day guarantee: your money back if you don't like it.`,
      coupon: "Discount code",
      applyCoupon: "Apply",
      pix: "Pix",
      card: "Card",
      pixInstructions: "Open your bank app and scan the QR code or copy the code.",
      copyCode: "Copy code",
      cardNumber: "Card number",
      cardExpiry: "Expiry",
      cardCvc: "CVC",
      cardName: "Name on card",
      pay: "Pay",
      buyer: "Buyer",
      orders: "Orders",
      order: "Order",
      paid: "Paid",
      subscriptions: "Subscriptions",
      active: "Active",
      nextBilling: "Next charge",
      guaranteeUntil: "Guarantee until",
      total: "Total",
    },
    signInWithInfi: "Sign in with Infi",
    feedback: {
      open: "Feedback",
      title: "How is it going?",
      placeholder: "Tell us what worked or what got in the way (optional)",
      send: "Send",
      sending: "Sending…",
      thanks: "Thank you! We got your message.",
      failed: "Could not send. Try again.",
      close: "Close",
      reactions: { love: "Love it", like: "Like it", neutral: "Indifferent", dislike: "Dislike it" },
    },
  },
};

export function messagesFor(locale?: string | null): ElementMessages {
  return MESSAGES[matchLocale(locale) ?? FALLBACK_LOCALE];
}

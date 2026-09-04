/**
 * The wire between a merchant's page and the Infi checkout iframe.
 *
 * This file is duplicated byte-for-byte in the frontend that serves the embed
 * (`src/lib/embed/protocol.ts`). A `diff` between the two is a release step —
 * the two halves are deployed from different repos and nothing else pins them
 * together.
 *
 * Nothing here imports anything: no DOM, no React, no Node. It is the contract.
 */

/**
 * Namespace and major version fused into one field, so a single `===` rejects
 * both another library's postMessage traffic and a future protocol revision.
 * Bump it only for a breaking change; additive fields do not need it.
 */
export const PROTOCOL = "checkout/v1";
export type Protocol = typeof PROTOCOL;

/** Every message, both directions, carries these. */
export interface Envelope {
  readonly __infi: Protocol;
  /**
   * Minted by the parent per iframe and echoed by the child, so two embeds on
   * one page never see each other's traffic.
   */
  readonly embedId: string;
}

/**
 * What the payer can pay with. Deliberately not imported from `@beinfi/sdk`:
 * its `PaymentMethod` still lists `boleto`, which the checkout hardcodes as
 * unavailable, and omits `crypto`, which it offers.
 */
export type PaymentMethod = "pix" | "card" | "crypto";

/**
 * The three states a merchant's page can act on, named as Whop names them so a
 * reader coming from `@whop/checkout` needs no translation. `disabled` means a
 * charge is in flight or the form is incomplete — not that the embed is broken.
 */
export type CheckoutState = "loading" | "ready" | "disabled";

/** Why the embed stopped being payable. */
export type EmbedErrorCode =
  | "customer_tax_id_required"
  | "charge_already_processing"
  | "method_switch_failed"
  | "invoice_not_open"
  | "charge_in_progress"
  | "client_key_missing"
  | "session_expired"
  | "unavailable"
  | "handshake_timeout"
  | "unknown";

/** Payload of `complete`. See the note on `onComplete` in the README: this is
 *  a client-side event on a page the merchant controls, not proof of payment. */
export interface CompletePayload {
  /** Link-mode checkout session, when the purchase started from a link. */
  readonly sessionId: string | null;
  readonly invoiceId: string | null;
  readonly paymentId: string | null;
  readonly method: PaymentMethod;
}

/** Sent by the iframe to the merchant's page. */
export type EmbedToParent = Envelope &
  (
    | { readonly type: "ready" }
    /** Content height in CSS pixels, measured on the embed's own root. */
    | { readonly type: "resize"; readonly height: number }
    | {
        readonly type: "state";
        readonly state: CheckoutState;
        readonly method: PaymentMethod | null;
      }
    /**
     * A charge exists and the payer has something to do — a pix code to pay, a
     * card challenge to finish. `expiresAt` is the server's deadline, absent
     * when the server did not give one. Never a client-invented value.
     */
    | {
        readonly type: "payment_pending";
        readonly method: PaymentMethod;
        readonly paymentId: string;
        readonly expiresAt: string | null;
      }
    | { readonly type: "complete"; readonly payload: CompletePayload }
    | {
        readonly type: "error";
        readonly message: string;
        readonly code: EmbedErrorCode;
      }
    /** The embed wants the TOP window sent somewhere (returnUrl). The parent
     *  navigates; a cross-origin frame must not do it itself. */
    | { readonly type: "navigate"; readonly url: string }
    | {
        readonly type: "reply";
        readonly requestId: string;
        readonly ok: boolean;
        readonly value?: unknown;
        readonly error?: string;
      }
  );

/**
 * `Omit` over a union member-by-member. A plain `Omit<EmbedToParent, …>`
 * collapses the union into one object type and loses every variant's own
 * fields, so the child cannot build a message without casting.
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A message the child sends, before the envelope is stamped on. */
export type EmbedMessage = DistributiveOmit<EmbedToParent, "__infi" | "embedId">;

/** Methods the parent can call on the embed, over the reply channel. */
export type EmbedRequestMethod =
  | "submit"
  | "getEmail"
  | "setEmail"
  | "getTaxId"
  | "setTaxId";

/** Sent by the merchant's page to the iframe. */
export type ParentToEmbed = Envelope &
  (
    | {
        readonly type: "request";
        readonly requestId: string;
        readonly method: EmbedRequestMethod;
        readonly arg?: string;
      }
  );

/**
 * Narrow an untrusted `MessageEvent.data` to a protocol frame.
 *
 * It checks only what makes the message *ours*. Origin and source are the
 * caller's job and must be checked first — a forged page can put anything in
 * `data`, so this function proves nothing about who sent it.
 */
export function isEmbedFrame(data: unknown, embedId: string): data is EmbedToParent {
  if (typeof data !== "object" || data === null) return false;
  const frame = data as Partial<Envelope> & { type?: unknown };
  return (
    frame.__infi === PROTOCOL &&
    frame.embedId === embedId &&
    typeof frame.type === "string"
  );
}

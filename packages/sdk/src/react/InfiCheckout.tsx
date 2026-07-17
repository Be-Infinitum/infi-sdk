"use client";

import { useState } from "react";
import { InfiPixQr } from "./InfiPixQr.js";
import { InfiCardForm } from "./InfiCardForm.js";
import type { Payment } from "../resources/pay.js";

export interface InfiCheckoutProps {
  slug: string;
  invoiceId: string;
  baseUrl?: string;
  /** Which methods to offer (default both). */
  methods?: Array<"pix" | "card">;
  className?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  pixClassName?: string;
  cardClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
  /** Fired when the invoice is paid (pix) or a card charge is created. */
  onPaid?: (payment?: Payment) => void;
  onError?: (error: Error) => void;
}

/**
 * Embedded checkout: pix (QR) + card tabs over the public slug-based endpoints.
 * Pure composition of <InfiPixQr> and <InfiCardForm>; bring your own styling via
 * the *ClassName props.
 */
export function InfiCheckout({
  slug,
  invoiceId,
  baseUrl,
  methods = ["pix", "card"],
  className,
  tabClassName,
  activeTabClassName,
  pixClassName,
  cardClassName,
  inputClassName,
  buttonClassName,
  onPaid,
  onError,
}: InfiCheckoutProps) {
  const [tab, setTab] = useState<"pix" | "card">(methods[0] ?? "pix");

  return (
    <div className={className} data-infi-checkout>
      {methods.length > 1 ? (
        <div role="tablist" data-infi-checkout-tabs>
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={tab === m}
              className={tab === m ? activeTabClassName : tabClassName}
              onClick={() => setTab(m)}
            >
              {m === "pix" ? "Pix" : "Cartão"}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "pix" ? (
        <InfiPixQr
          slug={slug}
          invoiceId={invoiceId}
          baseUrl={baseUrl}
          className={pixClassName}
          onPaid={() => onPaid?.()}
          onError={onError}
        />
      ) : (
        <InfiCardForm
          slug={slug}
          invoiceId={invoiceId}
          baseUrl={baseUrl}
          className={cardClassName}
          inputClassName={inputClassName}
          buttonClassName={buttonClassName}
          onPaid={(p) => onPaid?.(p)}
          onError={onError}
        />
      )}
    </div>
  );
}

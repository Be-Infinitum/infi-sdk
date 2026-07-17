"use client";

import { useCallback, useState, type FormEvent } from "react";
import { PayResource, type CardInput, type Payment } from "../resources/pay.js";

export interface InfiCardFormProps {
  slug: string;
  invoiceId: string;
  baseUrl?: string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  submitLabel?: string;
  /** Fired when the card charge is created (confirmed or pending). */
  onPaid?: (payment: Payment) => void;
  onError?: (error: Error) => void;
}

const EMPTY: CardInput = {
  number: "",
  holderName: "",
  expiryMonth: "",
  expiryYear: "",
  ccv: "",
  holderEmail: "",
  holderCpfCnpj: "",
  holderPostalCode: "",
  holderAddressNumber: "",
  holderPhone: "",
};

/**
 * Embedded card charge form. RISK ZONE / PCI: the card fields are sent over TLS
 * to the checkout endpoint, tokenized at the PSP, and never persisted (SAQ-D —
 * the merchant accepts card data transits their backend). This component keeps
 * the values only in React state for the duration of the submit and never logs
 * them. The publishable/hosted-redirect alternative avoids this scope entirely.
 */
export function InfiCardForm({
  slug,
  invoiceId,
  baseUrl,
  className,
  inputClassName,
  buttonClassName,
  submitLabel = "Pagar",
  onPaid,
  onError,
}: InfiCardFormProps) {
  const [card, setCard] = useState<CardInput>(EMPTY);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof CardInput) => (e: { target: { value: string } }) =>
    setCard((c) => ({ ...c, [k]: e.target.value }));

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
        const pay = new PayResource(baseUrl ?? "https://api.beinfi.com");
        const payment = await pay.charge({ slug, invoiceId, method: "card", card });
        // Drop the card values from state immediately after submit.
        setCard(EMPTY);
        onPaid?.(payment);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    },
    [slug, invoiceId, baseUrl, card, onPaid, onError],
  );

  return (
    <form className={className} onSubmit={submit}>
      <input className={inputClassName} aria-label="Número do cartão" inputMode="numeric" autoComplete="cc-number" required placeholder="Número do cartão" value={card.number} onChange={set("number")} />
      <input className={inputClassName} aria-label="Nome no cartão" autoComplete="cc-name" required placeholder="Nome no cartão" value={card.holderName} onChange={set("holderName")} />
      <input className={inputClassName} aria-label="Mês de validade" inputMode="numeric" autoComplete="cc-exp-month" required placeholder="MM" value={card.expiryMonth} onChange={set("expiryMonth")} />
      <input className={inputClassName} aria-label="Ano de validade" inputMode="numeric" autoComplete="cc-exp-year" required placeholder="AAAA" value={card.expiryYear} onChange={set("expiryYear")} />
      <input className={inputClassName} aria-label="CVV" inputMode="numeric" autoComplete="cc-csc" required placeholder="CVV" value={card.ccv} onChange={set("ccv")} />
      <input className={inputClassName} aria-label="Email" type="email" autoComplete="email" required placeholder="Email" value={card.holderEmail} onChange={set("holderEmail")} />
      <input className={inputClassName} aria-label="CPF ou CNPJ" inputMode="numeric" required placeholder="CPF/CNPJ" value={card.holderCpfCnpj} onChange={set("holderCpfCnpj")} />
      <input className={inputClassName} aria-label="CEP" inputMode="numeric" required placeholder="CEP" value={card.holderPostalCode} onChange={set("holderPostalCode")} />
      <input className={inputClassName} aria-label="Número do endereço" required placeholder="Número" value={card.holderAddressNumber} onChange={set("holderAddressNumber")} />
      <button className={buttonClassName} type="submit" disabled={loading}>
        {loading ? "Processando…" : submitLabel}
      </button>
    </form>
  );
}

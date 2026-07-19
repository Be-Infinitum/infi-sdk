"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PayResource, type Payment } from "../resources/pay.js";

export interface InfiPixQrProps {
  /** Tenant slug the invoice belongs to. */
  slug: string;
  /** Invoice to charge. */
  invoiceId: string;
  /** API base URL (default https://api.beinfi.com). */
  apiUrl?: string;
  /** Charge automatically on mount (default true). When false, call via a ref/button. */
  autoCharge?: boolean;
  /** Poll interval for payment confirmation, ms (default 3000). */
  pollIntervalMs?: number;
  className?: string;
  /** Fired once the invoice is confirmed paid. */
  onPaid?: () => void;
  /** Fired on charge/poll error. */
  onError?: (error: Error) => void;
  /** Optional label overrides. */
  copyLabel?: string;
  copiedLabel?: string;
}

/**
 * Drop-in embedded pix charge: creates a pix charge, renders the QR from the
 * copy-paste (EMV) payload, shows a copy button + expiry, and polls until the
 * invoice is paid. The QR image uses an optional `qrcode` peer dependency; if it
 * is not installed the copy-paste code (a valid pix payment on its own) is shown.
 */
export function InfiPixQr({
  slug,
  invoiceId,
  apiUrl,
  autoCharge = true,
  pollIntervalMs = 3000,
  className,
  onPaid,
  onError,
  copyLabel = "Copiar código pix",
  copiedLabel = "Copiado!",
}: InfiPixQrProps) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);

  const pay = new PayResource(apiUrl ?? "https://api.beinfi.com");

  const charge = useCallback(async () => {
    setLoading(true);
    try {
      const p = await pay.charge({ slug, invoiceId, method: "pix" });
      setPayment(p);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, invoiceId, apiUrl]);

  // Auto-charge once on mount.
  useEffect(() => {
    if (autoCharge && !startedRef.current) {
      startedRef.current = true;
      void charge();
    }
  }, [autoCharge, charge]);

  // Render the QR from the payload (optional `qrcode` dep; copy-paste fallback).
  useEffect(() => {
    const payload = payment?.pixPayload;
    if (!payload) return;
    let cancelled = false;
    (async () => {
      try {
        // Optional peer dep. Computed specifier so the build doesn't hard-require
        // `qrcode`; absence falls back to the copy-paste code below.
        const spec = "qrcode";
        const mod = (await import(/* @vite-ignore */ spec)) as {
          toString: (text: string, opts: Record<string, unknown>) => Promise<string>;
        };
        const svg = await mod.toString(payload, { type: "svg", margin: 1, width: 220 });
        if (!cancelled) setQrSvg(svg);
      } catch {
        // qrcode not installed — copy-paste code remains the fallback.
        if (!cancelled) setQrSvg(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payment?.pixPayload]);

  // Poll for confirmation once a charge exists.
  useEffect(() => {
    if (!payment || paid) return;
    const controller = new AbortController();
    void pay
      .waitForPaid({ slug, invoiceId, intervalMs: pollIntervalMs, signal: controller.signal })
      .then((ok) => {
        if (ok) {
          setPaid(true);
          onPaid?.();
        }
      })
      .catch((err) => onError?.(err instanceof Error ? err : new Error(String(err))));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment, paid, slug, invoiceId, pollIntervalMs]);

  const copy = useCallback(async () => {
    if (!payment?.pixPayload) return;
    try {
      await navigator.clipboard.writeText(payment.pixPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard denied — the code is still visible to select manually */
    }
  }, [payment?.pixPayload]);

  if (paid) {
    return <div className={className} data-infi-pix-state="paid">Pagamento confirmado.</div>;
  }
  if (loading || !payment) {
    return <div className={className} data-infi-pix-state="loading">Gerando código pix…</div>;
  }
  if (!payment.pixPayload) {
    return <div className={className} data-infi-pix-state="error">Não foi possível gerar o código pix.</div>;
  }

  return (
    <div className={className} data-infi-pix-state="pending">
      {qrSvg ? (
        // eslint-disable-next-line react/no-danger
        <div data-infi-pix-qr dangerouslySetInnerHTML={{ __html: qrSvg }} />
      ) : null}
      <code data-infi-pix-payload style={{ wordBreak: "break-all", display: "block" }}>
        {payment.pixPayload}
      </code>
      <button type="button" onClick={copy} data-infi-pix-copy>
        {copied ? copiedLabel : copyLabel}
      </button>
      {payment.pixExpiresAt ? <PixExpiry expiresAt={payment.pixExpiresAt} /> : null}
    </div>
  );
}

/** Live countdown to the pix expiry. */
function PixExpiry({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  return (
    <span data-infi-pix-expiry>
      {remaining > 0 ? `Expira em ${mm}:${String(ss).padStart(2, "0")}` : "Código expirado"}
    </span>
  );
}

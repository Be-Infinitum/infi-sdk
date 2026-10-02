import { createSignals, type SignalsClient, type SignalsOptions } from "@beinfi/elements";
import { useContext, useEffect } from "react";
import { InfiContext, SignalsContext } from "./provider.js";

export interface InfiSignalsProps {
  /** Whether the visitor agreed. While false nothing is collected. Default true. */
  consent?: boolean;
  /** Your customer's id once they sign in; leave out for anonymous visitors. */
  externalId?: string;
  /** Turn single automatic captures off. */
  capture?: SignalsOptions["capture"];
  /** Override the Infi API host (local backend). */
  apiUrl?: string;
}

/**
 * Collects what visitors do on your site and sends it to your Infi dashboard
 * (Comportamento): pages, the sections you mark with `data-infi-section`,
 * scroll depth, the CTAs you mark with `data-infi-cta`, checkout steps, and
 * JavaScript and network errors. Renders nothing. Put it once, inside
 * `<InfiProvider publishableKey="pk_…">`.
 */
export function InfiSignals({ consent = true, externalId, capture, apiUrl }: InfiSignalsProps) {
  const infi = useContext(InfiContext);
  const slot = useContext(SignalsContext);
  const key = infi?.publishableKey;
  const environment = infi?.environment;
  const captureKey = JSON.stringify(capture ?? {});

  useEffect(() => {
    if (!key || !environment || !slot) return;
    const client = createSignals({
      publishableKey: key,
      environment,
      apiUrl,
      consent,
      externalId,
      capture: JSON.parse(captureKey) as SignalsOptions["capture"],
    });
    slot.setSignals(client);
    return () => {
      client.destroy();
      slot.setSignals(null);
    };
    // consent and externalId change the running client below, not a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, environment, apiUrl, captureKey]);

  const client = slot?.signals;
  useEffect(() => client?.setConsent(consent), [client, consent]);
  useEffect(() => client?.identify(externalId), [client, externalId]);
  return null;
}

const noop: SignalsClient = {
  track: () => {},
  checkout: () => {},
  identify: () => {},
  setConsent: () => {},
  flush: async () => {},
  feedback: async () => {
    throw new Error("Feedback needs <InfiSignals> inside <InfiProvider publishableKey>.");
  },
  destroy: () => {},
};

/**
 * Your own events: `useSignals().track("plan_compared", { plan: "pro" })`.
 * Without `<InfiSignals>` it is a no-op, so components can call it anywhere.
 */
export function useSignals(): SignalsClient {
  return useContext(SignalsContext)?.signals ?? noop;
}

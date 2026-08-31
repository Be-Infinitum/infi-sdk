/**
 * Building `accepts[]` — the half of the exchange the merchant controls.
 *
 * Every hazard in §2.2 lives here: atomic units, the asset as a contract
 * address, the EIP-712 domain passed through untouched, and `resource` as a flat
 * URL with `description` / `mimeType` as siblings rather than nested.
 */

import { atomicForQuantity } from "./amount.js";
import { X402_VERSION, type PaymentRequirements, type PaymentRequiredBody } from "./types.js";

/** The mount-time settings a 402 is built from. */
export interface ResolvedRailSettings {
  network: string;
  /** Contract address or mint. Never a ticker. */
  asset: string;
  /** From the token contract. Hardcoding 6 overcharges the first non-USDC asset. */
  assetDecimals: number;
  /** The merchant's wallet. Always. */
  payTo: string;
  maxTimeoutSeconds: number;
  /** EIP-712 domain. Omit it and no client can sign at all. */
  extra?: Record<string, unknown>;
}

/** One priced route, resolved at mount. */
export interface ResolvedRoute {
  meter: string;
  /** Ceiling quantity: 1 for a fixed route, `max` for a variable one. */
  quantity: string;
  /** Price of one unit of the meter, in the asset's currency. */
  unitAmount: string;
  description: string;
  mimeType: string;
  /** Declare the route to the Bazaar (§9.1). On by default. */
  discoverable: boolean;
  /** Full override of `outputSchema`. Wins over `discoverable`/`inputSchema`. */
  outputSchema?: Record<string, unknown>;
  /** JSON schema of the route's input, published for discovery. */
  inputSchema?: Record<string, unknown>;
  maxTimeoutSeconds?: number;
}

/**
 * Discovery intent, in the shape that ships.
 *
 * The docs describe an `extensions` object; the v1 middleware emits
 * `outputSchema.input.discoverable` **[E]**. Build what ships, and keep it in
 * one place so the v2 branch is a diff here and nowhere else (§9.1.3).
 */
function discoverySchema(route: ResolvedRoute, method: string): Record<string, unknown> | undefined {
  if (route.outputSchema) return route.outputSchema;
  if (!route.discoverable) return undefined;
  return {
    input: {
      type: "http",
      method: method.toUpperCase(),
      discoverable: true,
      ...(route.inputSchema ? { schema: route.inputSchema } : {}),
    },
  };
}

/** One `accepts[]` entry for this route on this request. */
export function buildRequirements(
  settings: ResolvedRailSettings,
  route: ResolvedRoute,
  request: { resource: string; method: string },
): PaymentRequirements {
  const outputSchema = discoverySchema(route, request.method);
  return {
    scheme: "exact",
    network: settings.network,
    // RISK ZONE (money): atomic units, converted in exactly one place.
    maxAmountRequired: atomicForQuantity(route.unitAmount, route.quantity, settings.assetDecimals),
    resource: request.resource,
    description: route.description,
    mimeType: route.mimeType,
    payTo: settings.payTo,
    maxTimeoutSeconds: route.maxTimeoutSeconds ?? settings.maxTimeoutSeconds,
    asset: settings.asset,
    ...(outputSchema ? { outputSchema } : {}),
    ...(settings.extra ? { extra: settings.extra } : {}),
  };
}

/** The 402 body. `error` carries the protocol's reason, not a sentence of ours. */
export function paymentRequiredBody(
  error: string,
  accepts: PaymentRequirements[],
): PaymentRequiredBody {
  return { x402Version: X402_VERSION, error, accepts };
}

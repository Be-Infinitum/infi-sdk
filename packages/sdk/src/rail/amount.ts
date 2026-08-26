/**
 * One conversion, one place (rail design §4.4).
 *
 * RISK ZONE (money). The wire speaks ATOMIC units and everything else in this
 * codebase speaks decimals. `"5000"` is 0.005 USDC at six decimals: a wrong
 * exponent is a factor of 10^6 on a real charge and the result still looks like
 * a plausible amount. So the conversion exists exactly here, it is exercised by
 * `amount.test.ts`, and no other file in `rail/` may do exponent arithmetic.
 *
 * `decimals` always comes from the asset (the backend reads it from the token
 * contract), never from a constant: the same ticker is a different token with
 * possibly different decimals on every chain, and `extra.name` is a display
 * string, not an authority.
 *
 * All arithmetic is BigInt on parsed decimal strings. No float ever touches an
 * amount — `0.1 + 0.2` is not a money type.
 */

import { InfiError } from "../errors.js";

interface Parsed {
  /** Unscaled integer value. */
  digits: bigint;
  /** Number of decimal places `digits` is scaled by. */
  scale: number;
}

function invalid(what: string, value: unknown): never {
  throw new InfiError(
    `rail: ${what} must be a non-negative decimal number, got ${JSON.stringify(value)}`,
    400,
    "rail_invalid_amount",
  );
}

/** Parse a non-negative decimal string (or safe integer) into BigInt digits + scale. */
function parseDecimal(input: string | number, what: string): Parsed {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) invalid(what, input);
    // Only integers survive as numbers: a float literal is already imprecise by
    // the time it reaches us, so a decimal price has to arrive as a string.
    if (!Number.isSafeInteger(input)) invalid(what, input);
    if (input < 0) invalid(what, input);
    return { digits: BigInt(input), scale: 0 };
  }
  const raw = input.trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) invalid(what, input);
  const [intPart = "0", fracPart = ""] = raw.split(".");
  return {
    digits: BigInt(intPart + fracPart),
    scale: fracPart.length,
  };
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new InfiError(
      `rail: asset decimals must be an integer between 0 and 36, got ${decimals}. ` +
        "It comes from the token contract, never from a constant.",
      400,
      "rail_invalid_asset_decimals",
    );
  }
}

/** Render BigInt digits at `scale` as a normalized decimal string. */
function render(digits: bigint, scale: number): string {
  if (scale === 0) return digits.toString();
  const s = digits.toString().padStart(scale + 1, "0");
  const intPart = s.slice(0, s.length - scale);
  const fracPart = s.slice(s.length - scale).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

/**
 * Decimal amount -> atomic units, as a string.
 *
 * Rounds UP. `maxAmountRequired` is a ceiling the payer signs, and a merchant
 * that rounded down would be selling the fraction for free; §5.1's true-up
 * credits the agent for whatever it did not use.
 */
export function atomicFromDecimal(amount: string | number, decimals: number): string {
  assertDecimals(decimals);
  const { digits, scale } = parseDecimal(amount, "amount");
  if (scale <= decimals) {
    return (digits * 10n ** BigInt(decimals - scale)).toString();
  }
  // More decimal places than the asset can express: round up to the next unit.
  const divisor = 10n ** BigInt(scale - decimals);
  const quotient = digits / divisor;
  return (digits % divisor === 0n ? quotient : quotient + 1n).toString();
}

/**
 * Atomic units -> the invoice's decimal amount.
 *
 * `decimalFromAtomic("5000", 6) === "0.005"`. This is the direction that is
 * wrong by a factor of a million when the exponent slips.
 */
export function decimalFromAtomic(atomic: string | number, decimals: number): string {
  assertDecimals(decimals);
  const { digits, scale } = parseDecimal(atomic, "atomic amount");
  if (scale !== 0) invalid("atomic amount", atomic);
  return render(digits, decimals);
}

/**
 * The price of one request, in atomic units: `unitAmount x quantity`.
 *
 * `unitAmount` is denominated in the asset (USD for USDC), and `quantity` is the
 * route's ceiling — 1 for a fixed-price route, `max` for a variable one.
 */
export function atomicForQuantity(
  unitAmount: string | number,
  quantity: string | number,
  decimals: number,
): string {
  assertDecimals(decimals);
  const unit = parseDecimal(unitAmount, "unit amount");
  const qty = parseDecimal(quantity, "quantity");
  const product = render(unit.digits * qty.digits, unit.scale + qty.scale);
  return atomicFromDecimal(product, decimals);
}

/** Compare two atomic-unit strings. Returns -1, 0 or 1. */
export function compareAtomic(a: string, b: string): number {
  const left = parseDecimal(a, "atomic amount");
  const right = parseDecimal(b, "atomic amount");
  if (left.scale !== 0 || right.scale !== 0) invalid("atomic amount", left.scale !== 0 ? a : b);
  if (left.digits === right.digits) return 0;
  return left.digits < right.digits ? -1 : 1;
}

/** Compare two decimal strings. Returns -1, 0 or 1. */
export function compareDecimal(a: string | number, b: string | number): number {
  const left = parseDecimal(a, "amount");
  const right = parseDecimal(b, "amount");
  const scale = Math.max(left.scale, right.scale);
  const l = left.digits * 10n ** BigInt(scale - left.scale);
  const r = right.digits * 10n ** BigInt(scale - right.scale);
  if (l === r) return 0;
  return l < r ? -1 : 1;
}

/** `a - b`, clamped at zero. Used to debit a grace allowance. */
export function subtractDecimalClamped(a: string | number, b: string | number): string {
  const left = parseDecimal(a, "amount");
  const right = parseDecimal(b, "amount");
  const scale = Math.max(left.scale, right.scale);
  const l = left.digits * 10n ** BigInt(scale - left.scale);
  const r = right.digits * 10n ** BigInt(scale - right.scale);
  return l <= r ? "0" : render(l - r, scale);
}

/** Normalize a decimal string (`"0.50"` -> `"0.5"`, `"1.000"` -> `"1"`). */
export function normalizeDecimal(amount: string | number): string {
  const { digits, scale } = parseDecimal(amount, "amount");
  return render(digits, scale);
}

/** True when the decimal amount is exactly zero. */
export function isZeroDecimal(amount: string | number): boolean {
  return parseDecimal(amount, "amount").digits === 0n;
}

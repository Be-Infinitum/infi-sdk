import { Infi } from "../src/index.js";

/**
 * Ready-to-use client, on a sandbox account that already has an owner.
 * The anonymous account (`/public/v1/claimables`) was removed in ADR 0076 and answers 410;
 * the key comes from an account created through agent signup or the dashboard.
 */
export async function setup(): Promise<Infi> {
  const secretKey = process.env.INFI_SECRET_KEY;
  if (!secretKey) {
    throw new Error("set INFI_SECRET_KEY to an sk_test_ key from a sandbox account of yours");
  }
  const apiUrl = process.env.INFI_API_URL?.replace(/\/+$/, "");
  return new Infi({ secretKey, apiUrl });
}

let n = 0;
export function step(title: string): void {
  n += 1;
  console.log(`\n── ${n}. ${title}`);
}

export function show(label: string, value: unknown): void {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  console.log(`   ${label}: ${text}`);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Short suffix for keys that are unique per run. */
export const uniq = () => crypto.randomUUID().slice(0, 8);

import { InfiError } from "../src/index.js";

/** Runs `fn` expecting an InfiError with the given status; fails if it doesn't come. */
export async function expectError(status: number, fn: () => Promise<unknown>): Promise<InfiError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof InfiError) {
      if (e.status !== status) throw new Error(`expected HTTP ${status}, got ${e.status} (${e.code}): ${e.message}`);
      return e;
    }
    throw e;
  }
  throw new Error(`expected HTTP ${status}, but the call succeeded`);
}

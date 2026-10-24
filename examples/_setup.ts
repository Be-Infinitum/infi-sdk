import { Infi } from "../src/index.js";

/** Cliente pronto para uso: INFI_SECRET_KEY, ou uma conta de teste nova no backend local. */
export async function setup(): Promise<Infi> {
  const apiUrl = (process.env.INFI_API_URL ?? "https://api-sandbox.beinfi.com").replace(/\/+$/, "");
  let secretKey = process.env.INFI_SECRET_KEY;
  if (!secretKey) {
    // Único fetch direto do exemplo: provisionar uma conta de teste (não faz parte do SDK).
    const res = await fetch(`${apiUrl}/public/v1/claimables`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ ref: "cli" }),
    });
    if (!res.ok) throw new Error(`não consegui provisionar a conta de teste: HTTP ${res.status} ${await res.text()}`);
    secretKey = ((await res.json()) as { apiKeySecret: string }).apiKeySecret;
    console.log(`(conta de teste nova em ${apiUrl})`);
  }
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

/** Sufixo curto para chaves únicas por execução. */
export const uniq = () => crypto.randomUUID().slice(0, 8);

import { InfiError } from "../src/index.js";

/** Executa `fn` esperando um InfiError com o status dado; falha se não vier. */
export async function expectError(status: number, fn: () => Promise<unknown>): Promise<InfiError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof InfiError) {
      if (e.status !== status) throw new Error(`esperava HTTP ${status}, veio ${e.status} (${e.code}): ${e.message}`);
      return e;
    }
    throw e;
  }
  throw new Error(`esperava HTTP ${status}, mas a chamada deu certo`);
}

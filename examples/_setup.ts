import { Infi } from "../src/index.js";

/**
 * Cliente pronto para uso, numa conta de sandbox que já tem dono.
 * A conta anônima (`/public/v1/claimables`) saiu na ADR 0076 e responde 410;
 * a chave vem de uma conta criada pelo cadastro de agente ou pelo painel.
 */
export async function setup(): Promise<Infi> {
  const secretKey = process.env.INFI_SECRET_KEY;
  if (!secretKey) {
    throw new Error("defina INFI_SECRET_KEY com uma chave sk_test_ de uma conta de sandbox sua");
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

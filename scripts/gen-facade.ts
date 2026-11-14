// Gera src/generated/facade.ts a partir do contrato SDK (ADR 0055, D2/D3).
// Uso: bun scripts/gen-facade.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const METHODS = ["get", "put", "post", "delete", "patch", "options", "head"] as const;
const NAME = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export interface Op {
  operationId: string;
  tag: string;
  action: string;
  method: string;
  path: string;
  scope: string;
}

export function camel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
export function pascal(s: string): string {
  const c = camel(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Valida o contrato e devolve as operações. Lança Error com mensagem clara. */
export function collectOps(doc: any): Op[] {
  const ops: Op[] = [];
  const seen = new Set<string>();
  for (const [path, item] of Object.entries<any>(doc?.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (!op) continue;
      const where = `${method.toUpperCase()} ${path}`;
      const id = op.operationId;
      if (typeof id !== "string" || !id) throw new Error(`${where}: falta operationId`);
      const tags: unknown[] = op.tags ?? [];
      if (tags.length !== 1 || typeof tags[0] !== "string") {
        throw new Error(`${where} (${id}): precisa de exatamente uma tag, tem ${tags.length}`);
      }
      const tag = tags[0] as string;
      if (!NAME.test(tag)) throw new Error(`${where}: tag "${tag}" fora do padrão snake_case`);
      const prefix = `${tag}_`;
      const action = id.startsWith(prefix) ? id.slice(prefix.length) : "";
      if (!action || !NAME.test(action)) {
        throw new Error(`${where}: operationId "${id}" deve ser "${tag}_<ação em snake_case>"`);
      }
      if (seen.has(id)) throw new Error(`${where}: operationId "${id}" duplicado`);
      seen.add(id);
      if (op["x-infi-facade"] !== true) throw new Error(`${where} (${id}): falta x-infi-facade: true`);
      const scope = op["x-infi-scope"];
      if (typeof scope !== "string" || !scope) throw new Error(`${where} (${id}): falta x-infi-scope`);
      ops.push({ operationId: id, tag, action, method: method.toUpperCase(), path, scope });
    }
  }
  if (ops.length === 0) throw new Error("contrato sem operações");
  return ops;
}

export function generate(ops: Op[]): string {
  const tags = [...new Set(ops.map((o) => o.tag))];
  const out: string[] = [];
  out.push(`// GERADO por scripts/gen-facade.ts — não edite
import type { operations } from "./openapi.js";
import type { CallOptions, Transport } from "../http.js";

type TransportHeaders = "Idempotency-Key" | "If-Match" | "X-Infi-Channel";
type Obj<T> = [T] extends [never] ? {} : T extends object ? T : {};
type Part<K extends keyof operations, P extends string> = operations[K]["parameters"] extends { [Q in P]?: infer V } ? Obj<NonNullable<V>> : {};
type Rest<K extends keyof operations> = Omit<Part<K, "header">, TransportHeaders>;
type Present<T> = [keyof T] extends [never] ? false : true;
type Opt<N extends string, T, Required extends boolean> = Present<T> extends false ? {} : Required extends true ? { [Q in N]: T } : { [Q in N]?: T };
type PathP<K extends keyof operations> = Opt<"path", Part<K, "path">, true>;
type QueryP<K extends keyof operations> = Opt<"query", Part<K, "query">, {} extends Part<K, "query"> ? false : true>;
type HeaderP<K extends keyof operations> = Opt<"headers", Rest<K>, {} extends Rest<K> ? false : true>;
type BodyOf<K extends keyof operations> = operations[K] extends { requestBody: { content: { "application/json": infer B } } }
  ? B
  : operations[K] extends { requestBody?: { content: { "application/json": infer B } } }
    ? B
    : never;
type BodyP<K extends keyof operations> = [BodyOf<K>] extends [never]
  ? {}
  : operations[K] extends { requestBody: unknown } ? { body: BodyOf<K> } : { body?: BodyOf<K> };
export type Params<K extends keyof operations> = PathP<K> & QueryP<K> & HeaderP<K> & BodyP<K>;
type Args<K extends keyof operations, O> = {} extends Params<K> ? [params?: Params<K>, options?: O] : [params: Params<K>, options?: O];
export type Result<K extends keyof operations> = operations[K]["responses"] extends infer R
  ? { [S in keyof R & (200 | 201 | 202)]: R[S] extends { content: { "application/json": infer B } } ? B : void }[keyof R & (200 | 201 | 202)]
  : never;
`);
  for (const tag of tags) {
    out.push(`export class ${pascal(tag)}Resource {
  constructor(private readonly t: Transport) {}
`);
    for (const o of ops.filter((x) => x.tag === tag)) {
      const mutation = o.method !== "GET";
      const name = camel(o.action);
      const opt = mutation ? "MutationOptions" : "CallOptions";
      out.push(`  /** ${o.method} ${o.path} (scope ${o.scope}) */
  ${name}(...args: Args<"${o.operationId}", ${opt}>): Promise<Result<"${o.operationId}">> {
    const [params, options] = args as [any, any];
    return this.t.request({ method: "${o.method}", path: "${o.path}", pathParams: params?.path, query: params?.query, headers: params?.headers, body: params?.body, ...options }) as any;
  }
`);
    }
    out.push(`}\n`);
  }
  out.push(`export type MutationOptions = CallOptions;

export interface Resources {
${tags.map((t) => `  ${camel(t)}: ${pascal(t)}Resource;`).join("\n")}
}

export function buildResources(t: Transport): Resources {
  return {
${tags.map((t) => `    ${camel(t)}: new ${pascal(t)}Resource(t),`).join("\n")}
  };
}

/** Operações do contrato, para o teste de alcance. */
export const OPERATIONS = ${JSON.stringify(
    ops.map((o) => ({ operationId: o.operationId, tag: o.tag, property: camel(o.tag), method: camel(o.action), httpMethod: o.method, path: o.path, scope: o.scope })),
    null,
    2,
  )} as const;
`);
  return out.join("\n");
}

if (import.meta.main) {
  const here = dirname(fileURLToPath(import.meta.url));
  const input = resolve(here, "../api/openapi.sdk.json");
  try {
    const ops = collectOps(JSON.parse(readFileSync(input, "utf8")));
    writeFileSync(resolve(here, "../src/generated/facade.ts"), generate(ops));
    console.log(`facade.ts: ${ops.length} operações`);
  } catch (e) {
    console.error(`gen-facade: ${(e as Error).message}`);
    process.exit(1);
  }
}

import { InfiError } from "@beinfi/sdk";
import pc from "picocolors";

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function die(message: string, code = 1): never {
  console.error(pc.red(message));
  process.exit(code);
}

export function ok(message: string): void {
  console.log(pc.green(message));
}

export function info(message: string): void {
  console.log(pc.dim(message));
}

export type ErrorReport = {
  ok: false;
  error: {
    name: string;
    message: string;
    status?: number;
    code?: string;
    errors?: Array<{ field?: string; description?: string }>;
    fix?: { command?: string; docs?: string; hint?: string };
  };
};

/**
 * One JSON shape for every failure. HTTP/2 has no reason phrase, so an error with
 * no JSON body used to surface as the bare word "Request failed" — keep the status
 * in the message so the reader at least knows what happened.
 */
export function errorReport(err: unknown): ErrorReport {
  if (err instanceof InfiError) {
    const message = err.message === "Request failed" ? `HTTP ${err.status}` : err.message;
    return {
      ok: false,
      error: {
        name: err.name,
        message,
        status: err.status,
        ...(err.code ? { code: err.code } : {}),
        ...(err.errors.length ? { errors: err.errors } : {}),
        ...(err.fix ? { fix: err.fix } : {}),
      },
    };
  }
  const e = err instanceof Error ? err : new Error(String(err));
  return { ok: false, error: { name: e.name, message: e.message } };
}

/** Human rendering of the same report: message, then per-field detail, then the fix. */
export function formatError(report: ErrorReport): string {
  const { error } = report;
  const head = error.status ? `${error.message} (HTTP ${error.status}${error.code ? ` ${error.code}` : ""})` : error.message;
  const lines = [pc.red(head)];
  for (const issue of error.errors ?? []) {
    lines.push(pc.red(`  • ${issue.field ? `${issue.field}: ` : ""}${issue.description ?? ""}`));
  }
  if (error.fix?.command) lines.push(pc.dim(`  fix:  ${error.fix.command}`));
  if (error.fix?.hint) lines.push(pc.dim(`  hint: ${error.fix.hint}`));
  if (error.fix?.docs) lines.push(pc.dim(`  docs: ${error.fix.docs}`));
  return lines.join("\n");
}

/**
 * Terminal handler for every command. Under `--json` the caller is a program, so
 * a failure has to be JSON on stdout — printing prose there broke every agent that
 * parsed our output. Always exits non-zero.
 */
export function fail(err: unknown, json = false): never {
  const report = errorReport(err);
  if (json) console.log(JSON.stringify(report, null, 2));
  else console.error(formatError(report));
  process.exit(1);
}

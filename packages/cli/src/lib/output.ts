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

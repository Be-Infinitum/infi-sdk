import { spawnSync } from "node:child_process";

function detectPackageManager(cwd: string): "bun" | "npm" | "pnpm" {
  const bun = spawnSync("bun", ["--version"], { stdio: "ignore" });
  if (bun.status === 0) return "bun";
  const pnpm = spawnSync("pnpm", ["--version"], { stdio: "ignore" });
  if (pnpm.status === 0) return "pnpm";
  return "npm";
}

export function runInstall(cwd: string): void {
  const pm = detectPackageManager(cwd);
  const args = pm === "npm" ? ["install"] : ["install"];
  const result = spawnSync(pm, args, { cwd, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`${pm} install failed`);
  }
}

export function runDbPush(cwd: string): void {
  const pm = detectPackageManager(cwd);
  const cmd = pm === "bun" ? ["bunx", "prisma", "db", "push"] : ["npx", "prisma", "db", "push"];
  const [bin, ...args] = cmd;
  const result = spawnSync(bin, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error("prisma db push failed (is Postgres running?)");
  }
}

export function runSetup(cwd: string): void {
  const pm = detectPackageManager(cwd);
  const result = spawnSync(pm, ["run", "setup"], { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error("setup script failed");
  }
}

export function startDockerDb(cwd: string): boolean {
  const result = spawnSync("docker", ["compose", "up", "-d", "db"], { cwd, stdio: "inherit" });
  return result.status === 0;
}

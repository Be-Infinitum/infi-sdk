// Roda os exemplos em sequência e imprime ✓/✗ por script.
import { readdirSync } from "node:fs";

const dir = import.meta.dir;
const scripts = readdirSync(dir).filter((f) => /^\d\d-.*\.ts$/.test(f)).sort();
const results: { name: string; ok: boolean; seconds: number }[] = [];

for (const name of scripts) {
  console.log(`\n════════ ${name} ════════`);
  const started = Date.now();
  const proc = Bun.spawn(["bun", `${dir}/${name}`], { stdout: "inherit", stderr: "inherit", env: process.env });
  const code = await proc.exited;
  results.push({ name, ok: code === 0, seconds: Math.round((Date.now() - started) / 1000) });
}

console.log("\n════════ Resumo ════════");
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name} (${r.seconds}s)`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} scripts ok`);
process.exit(failed === 0 ? 0 : 1);

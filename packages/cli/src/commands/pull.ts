import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { fromCompanyDocument, type BillingConfig, type CompanyDocument } from "@beinfi/sdk";
import type { GlobalFlags } from "../lib/client.js";
import { infiClient } from "../lib/client.js";
import { die, ok, printJson } from "../lib/output.js";
import { obsoleteLockNotice } from "../lib/company-file.js";

const CONFIG_FILE = "infi.company.ts";

export function renderConfig(config: BillingConfig): string {
  return `import { defineCompany } from "@beinfi/sdk";\n\nexport default defineCompany(${JSON.stringify(config, null, 2)});\n`;
}

/**
 * `infi pull`: the server's own document for this tenant (GET /config/document),
 * written as `infi.company.ts`. Nothing is rebuilt here, so planning the pulled
 * file against the same tenant changes nothing.
 */
export async function pullCommand(
  flags: GlobalFlags & { file?: string; force?: boolean },
): Promise<void> {
  const file = path.resolve(flags.file ?? CONFIG_FILE);
  if (fs.existsSync(file) && !flags.force) {
    die(`${path.relative(process.cwd(), file)} already exists. Re-run with --force to overwrite.`);
  }

  const document: CompanyDocument = await infiClient(flags).config.document();
  if (!document.products?.length) die("No products found for this tenant.");

  fs.writeFileSync(file, renderConfig(fromCompanyDocument(document)));
  const notice = obsoleteLockNotice(path.dirname(file));

  if (flags.json) {
    printJson({ file: path.relative(process.cwd(), file), products: document.products.length, webhooks: document.webhooks?.length ?? 0 });
    return;
  }
  ok(`Pulled ${document.products.length} product(s) (company as code)`);
  console.log(`  config: ${path.relative(process.cwd(), file)}`);
  console.log(pc.dim("Commit it. `infi sync --plan` against the same tenant shows no changes."));
  if (notice) console.log(pc.dim(notice));
}

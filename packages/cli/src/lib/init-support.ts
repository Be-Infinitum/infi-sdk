import fs from "node:fs";
import path from "node:path";

/**
 * The templates `infi init` scaffolds. Ecommerce digital is the first (Caio,
 * 2026-09-26), then the course and member area (2026-09-28); CRM and
 * Marketplace are retired. Next: AI agent, SaaS.
 */
export type TemplateId = "ecommerce" | "curso";

export type TemplateMeta = { label: string; hint: string };

export const TEMPLATE_META: Record<TemplateId, TemplateMeta> = {
  ecommerce: {
    label: "Ecommerce digital",
    hint: "loja, checkout pix e cartão, entrega digital, assinatura, portal do comprador",
  },
  curso: {
    label: "Curso / área de membros",
    hint: "curso vitalício ou assinatura, área de membros estilo Netflix, progresso, grupo no Telegram/Discord",
  },
};

export const DEFAULT_PORT = 3000;

export function slugFromName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "my-app"
  );
}

export function validateProjectName(name: string): string | undefined {
  if (!name.trim()) return "Project name is required";
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return "Use letters, numbers, dots, dashes, and underscores only";
  }
  return undefined;
}

/**
 * The env file a template ships instead of a key: nothing in a download or a
 * fresh scaffold can leak access to an account. `infi login` writes the real
 * `.env.local`.
 */
export function writeEnvExample(targetDir: string, port: number): void {
  const example = `# Written by \`infi login\` into .env.local — never commit it.
INFI_SECRET_KEY=
INFI_TENANT_SLUG=
APP_URL=http://localhost:${port}

# Optional local override only:
# INFI_API_URL=http://localhost:8088
`;
  fs.writeFileSync(path.join(targetDir, ".env.example"), example);
}

export type TemplateId = "default" | "crm" | "ebook-sale" | "ai-chat" | "marketplace-billing";

export type CliOptions = {
  projectName: string;
  template: TemplateId;
  port: number;
  cwd: string;
  skipProvision: boolean;
  skipInstall: boolean;
  skipSetup: boolean;
  local: boolean;
  yes: boolean;
};

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  default: "Default — Next.js fullstack (auth + checkout + dashboard)",
  crm: "CRM — contacts, pipeline, usage metering",
  "ebook-sale": "Ebook sale — one-time checkout, no login",
  "ai-chat": "AI chat — Vite + Hono, prepaid credits",
  "marketplace-billing": "Marketplace billing — per-org usage",
};

export const DEFAULT_PORT = 3000;

export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "my-app";
}

export function validateProjectName(name: string): string | undefined {
  if (!name.trim()) return "Project name is required";
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return "Use letters, numbers, dots, dashes, and underscores only";
  }
  return undefined;
}

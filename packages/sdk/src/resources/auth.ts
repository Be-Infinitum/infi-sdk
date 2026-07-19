import { parseErrorResponse } from "../errors.js";
import type { CLITokenResponse } from "../types.js";

export type ExchangeCliTokenOptions = {
  apiUrl: string;
  sessionToken: string;
  tenantSlug?: string;
};

/** Exchange a dashboard session token (from `infi login`) for a tenant API key. */
export async function exchangeCliToken(options: ExchangeCliTokenOptions): Promise<CLITokenResponse> {
  const base = options.apiUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/auth/cli/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.sessionToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(options.tenantSlug ? { tenantSlug: options.tenantSlug } : {}),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as CLITokenResponse;
}

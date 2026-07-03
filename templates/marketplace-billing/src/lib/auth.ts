import { redirect } from "next/navigation";
import { getSession } from "@beinfi/nextjs";

export interface Operator {
  id: string;
  email: string | null;
}

/**
 * Resolve the signed-in operator (the integration company's staff) from the
 * infi_session cookie. `getSession` reads the cookie and resolves it via the SDK —
 * no local Session table. The operator just gates the dashboard; the billed orgs
 * are seeded, not per-operator.
 */
export async function getOperator(): Promise<Operator | null> {
  const session = await getSession({
    secretKey: process.env.INFI_SECRET_KEY!,
    baseUrl: process.env.INFI_API_URL,
  });
  if (!session?.customer?.id) return null;
  return {
    id: session.customer.id,
    email: session.customer.email ?? session.identity?.email ?? null,
  };
}

export async function requireOperator(): Promise<Operator> {
  const op = await getOperator();
  if (!op) redirect("/login");
  return op;
}

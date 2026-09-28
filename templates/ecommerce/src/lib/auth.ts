import "server-only";
import { createInfiAuth } from "@beinfi/nextjs";

/**
 * The store's login: anyone signs in with a code mailed by Infi (bought or
 * not), and the session lives in an HttpOnly cookie on this site.
 *
 *   const buyer = await auth.getBuyer();          // null when signed out
 *   buyer?.has("ecommerce/club")                 // bought / subscribed and running
 */
export const auth = createInfiAuth();

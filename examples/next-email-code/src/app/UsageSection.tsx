import { Infi } from "@beinfi/sdk";
import { UsagePanel } from "@beinfi/sdk/react";

// Server component: fetches the state of the app's send-budget customer and
// renders the drop-in UsagePanel. This is the ONLY customer that exists in a
// pre-auth email-code flow (there is no per-user wallet until after login), so
// the panel shows the app's send credit + `email_sends` usage — i.e. the other
// side of the meter recorded by /api/send-code. Renders nothing when the meter
// customer / secret key aren't configured, so the demo still boots without them.
export default async function UsageSection() {
  const customerId = process.env.INFI_METER_CUSTOMER_ID;
  const secretKey = process.env.INFI_SECRET_KEY;
  if (!customerId || !secretKey) return null;

  try {
    const infi = new Infi({ secretKey, baseUrl: process.env.INFI_API_URL });
    const state = await infi.customers.state(customerId);
    return (
      <div className="mx-auto mt-6 max-w-lg px-4 pb-16">
        <UsagePanel state={state} creditLabel="send credits" />
      </div>
    );
  } catch {
    // Never let the usage widget break the login page.
    return null;
  }
}

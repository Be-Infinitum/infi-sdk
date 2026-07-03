import { withMeter } from "@beinfi/nextjs";
import { Infi } from "@beinfi/sdk";

// Meters each email-code send as 1 unit against the app's own budget customer.
//
// Caveat: this is a PRE-AUTH flow — at send time the user has only typed an
// email, there is no verified customer yet. `withMeter` requires a
// `resolveCustomerId` ("who is charged"), so we meter the send against the
// app's own budget customer (`INFI_METER_CUSTOMER_ID`) as an anti-abuse /
// send-quota signal, not against the end user. When that id is unset the
// wrapper returns 400.
//
// `mode: "postpaid"` makes the intent explicit: record every send, never
// hard-block on a wallet balance. An app send budget is a usage signal, not a
// prepaid gate — a legitimate send should never 402 mid-login. (Switch to the
// default "prepaid" only if the demo means to hard-cap sends against credit.)
export const POST = withMeter(
  {
    secretKey: process.env.INFI_SECRET_KEY!,
    baseUrl: process.env.INFI_API_URL,
    meter: "email_sends",
    mode: "postpaid",
    // A send is one unit — skip the LLM token auto-detection entirely.
    value: 1,
    resolveCustomerId: () => process.env.INFI_METER_CUSTOMER_ID,
  },
  async (req) => {
    const { slug, email, redirectTo } = await req.json();
    const infi = new Infi({ baseUrl: process.env.INFI_API_URL });
    await infi.sendEmailCode({ slug, email, redirectTo });
    // sendEmailCode resolves void; return a JSON-serializable ack for withMeter.
    return { sent: true };
  },
);

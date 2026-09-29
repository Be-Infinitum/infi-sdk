import { redirect } from "next/navigation";
import { discordRedirectUri, memberPortal } from "@/lib/member";

export const dynamic = "force-dynamic";

/** Back from Discord: finish the connection, then the paid role lands once you are in the server. */
export default async function DiscordReturn({ searchParams }: { searchParams: Promise<{ code?: string; state?: string }> }) {
  const { code, state } = await searchParams;
  const portal = await memberPortal();
  if (!portal || !code || !state) redirect("/membros");
  await portal.discordConnect({ code, state, redirectUri: discordRedirectUri() });
  redirect("/membros");
}

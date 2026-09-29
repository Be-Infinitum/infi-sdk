import { redirect } from "next/navigation";
import { discordRedirectUri, memberPortal } from "@/lib/member";

export const dynamic = "force-dynamic";

/**
 * Connect Discord: Infi hands back Discord's authorize URL (scope identify,
 * a one-time state bound to this student); Discord sends the student back to
 * /membros/discord/voltar with a code. Register that address in Infi's
 * Discord app for your domain.
 */
export default async function ConnectDiscord() {
  const portal = await memberPortal();
  if (!portal) redirect("/membros");
  const { url } = await portal.discordAuthorize(discordRedirectUri());
  redirect(url);
}

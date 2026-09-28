import type { Transport } from "../http.js";

const enc = encodeURIComponent;

export interface CommunityIntegration {
  id: string;
  provider: "telegram" | "discord";
  accessKey: string;
  externalId: string;
  roleId?: string;
  inviteUrl?: string;
  title?: string;
  status: "active" | "disabled";
  createdAt: string;
}

export interface CommunityMember {
  id: string;
  customerId: string;
  externalId: string;
  status: "invite_pending" | "invited" | "approve_pending" | "assign_pending" | "joined" | "remove_pending" | "removed";
  invitedAt?: string;
  joinedAt?: string;
  removedAt?: string;
  removalReason?: string;
  lastError?: string;
}

/**
 * Community by access: a Telegram group or a Discord role that follows an
 * access key. Pays, gets the invite; access ends, leaves. Server-side, `sk_`.
 */
export class CommunityResource {
  constructor(private readonly t: Transport) {}

  /** Make Infi's bot an admin of the group (invite users, ban members) first. */
  connectTelegram(input: { chatId: string; accessKey: string }, idempotencyKey?: string): Promise<CommunityIntegration> {
    return this.t.request("POST", "/community/telegram", { body: input, requireSecret: true, idempotencyKey });
  }

  /** Infi's Discord bot must be in the server; the role must exist there. */
  connectDiscord(
    input: { guildId: string; roleId: string; accessKey: string; inviteUrl?: string },
    idempotencyKey?: string,
  ): Promise<CommunityIntegration> {
    return this.t.request("POST", "/community/discord", { body: input, requireSecret: true, idempotencyKey });
  }

  async list(): Promise<CommunityIntegration[]> {
    return (await this.t.request<{ integrations: CommunityIntegration[] }>("GET", "/community/integrations", {
      requireSecret: true,
    })).integrations;
  }

  /** Who was invited, added and removed, and why. */
  async members(integrationId: string): Promise<CommunityMember[]> {
    return (await this.t.request<{ members: CommunityMember[] }>(
      "GET", `/community/integrations/${enc(integrationId)}/members`, { requireSecret: true },
    )).members;
  }

  /** Stop managing it; nobody is removed for it. */
  disable(integrationId: string, idempotencyKey?: string): Promise<void> {
    return this.t.request("DELETE", `/community/integrations/${enc(integrationId)}`, { requireSecret: true, idempotencyKey });
  }
}

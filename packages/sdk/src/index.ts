export { Infi } from "./client.js";
export { InfiError, parseErrorResponse } from "./errors.js";
export {
  buildHostedLoginUrl,
  extractCodeFromUrl,
  extractTokenFromUrl,
  startHostedLogin,
} from "./hosted.js";
export { clearSessionCookie, setSessionCookie } from "./session.js";
export type {
  AppIdentity,
  AuthResult,
  CustomerSummary,
  ExchangeCodeOptions,
  InfiConfig,
  InfiRequestLike,
  InfiResponseLike,
  MagicLinkMode,
  SendMagicLinkOptions,
  SessionMode,
  SessionPayload,
  StartHostedLoginOptions,
  ValidateMagicLinkOptions,
} from "./types.js";
export {
  DEFAULT_API_BASE,
  DEFAULT_AUTH_BASE,
  SESSION_COOKIE_NAME,
} from "./types.js";

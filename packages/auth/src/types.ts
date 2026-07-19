import type { AuthResult, SessionIntrospection, SessionMode } from "@beinfi/sdk";

export interface CookieOptions {
  /** Cookie name. Default: `infi_session`. */
  name?: string;
  maxAgeSeconds?: number;
  secure?: boolean;
  path?: string;
}

export interface LoginHandlerOptions {
  slug: string;
  /** Callback path or absolute URL. Relative paths resolve against the incoming request. */
  redirectTo: string;
  /** Infi frontend base URL (serves `/identity/{slug}/login`). NOT the API. */
  authBaseUrl?: string;
  state?: string | ((req: Request) => string | undefined);
}

export interface CallbackHandlerOptions {
  secretKey: string;
  apiUrl?: string;
  /** Where to redirect after a successful exchange. Relative paths resolve against the request. */
  successUrl: string;
  sessionMode?: SessionMode;
  cookie?: CookieOptions;
  onAuth?: (result: AuthResult, req: Request) => Response | Promise<Response | void>;
  errorUrl?: string;
  onError?: (error: unknown, req: Request) => Response;
}

export interface StateHandlerOptions {
  secretKey: string;
  apiUrl?: string;
  cookie?: Pick<CookieOptions, "name">;
  /**
   * Resolve the enrollment/customer id for `customers.state()`.
   * Credits and meter() use the **enrollment** id (`ProductCustomer.id`).
   */
  resolveCustomerId: (
    req: Request,
    session: SessionIntrospection,
  ) => string | undefined | Promise<string | undefined>;
}

export interface RequireSessionOptions {
  secretKey: string;
  apiUrl?: string;
  cookie?: Pick<CookieOptions, "name">;
}

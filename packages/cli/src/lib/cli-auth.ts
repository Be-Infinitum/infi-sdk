/**
 * `infi login` without pasting a secret (B5, Caio 2026-09-26).
 *
 * Two ways in, one outcome — the key of the project this directory is:
 *  - browser: a loopback listener on 127.0.0.1 and an S256 PKCE pair; the
 *    dashboard the person is already logged into approves and sends the code
 *    back to the listener; only this process holds the verifier.
 *  - device code: for an agent with no browser of its own; it shows a short
 *    code, the person types it in the dashboard, the CLI polls.
 *
 * The backend never hands the CLI a dashboard session, and never an sk_live_
 * without a fresh step-up on the approving session.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { InfiError } from "@beinfi/sdk";

export type CliProject = { projectId: string; projectName?: string; machine?: string };

export type CliTokenResponse = {
  email: string;
  tenant: { id: string; slug: string; name: string };
  apiKey: {
    id: string;
    prefix: string;
    lastFour: string;
    name?: string;
    /** Present only when minted by this login. */
    secret?: string;
    /** The project already held this key; its copy lives in the keychain/.env. */
    reused: boolean;
  };
};

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function postJSON<T>(url: string, body: unknown, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const code = (data.error_code as string) ?? ((data.error as { code?: string })?.code ?? "request_failed");
    const message = (data.message as string) ?? ((data.error as { message?: string })?.message ?? res.statusText);
    throw new InfiError(message, res.status, code);
  }
  return data as T;
}

/** Best effort: the URL is always printed too, so a headless box still works. */
export function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The printed URL is the fallback.
  }
}

/**
 * A one-shot listener on 127.0.0.1 that resolves with the code for `state`.
 * The browser is sent on to `doneUrl` (the dashboard's /cli/done) so the
 * person lands on a real page, not on this listener's plain text.
 */
export async function startCallbackServer(state: string, opts: { doneUrl?: string; timeoutMs?: number } = {}): Promise<{
  redirectUri: string;
  code: Promise<string>;
  close: () => void;
}> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  let resolve!: (code: string) => void;
  let reject!: (err: Error) => void;
  const code = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const finish = (res: http.ServerResponse, result: "approved" | "denied") => {
    if (!opts.doneUrl) {
      const text = result === "approved" ? "Pronto — pode voltar ao terminal." : "Login negado. Nenhuma chave foi criada.";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><meta charset=utf-8><title>Infi</title><p>${text}</p>`);
      return;
    }
    const to = new URL(opts.doneUrl);
    to.searchParams.set("result", result);
    res.writeHead(302, { Location: to.toString() }).end();
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    // A code for another login (or a forged request) is refused and ignored.
    if (url.searchParams.get("state") !== state) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Login inválido. Rode `infi login` de novo.");
      return;
    }
    if (url.searchParams.get("error") === "access_denied") {
      finish(res, "denied");
      reject(new Error("Login denied in the browser. No key was created."));
      return;
    }
    if (!url.searchParams.get("code")) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Login inválido. Rode `infi login` de novo.");
      return;
    }
    finish(res, "approved");
    resolve(url.searchParams.get("code")!);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  const timer = setTimeout(() => reject(new Error("Login timed out. Run `infi login` again.")), timeoutMs);
  const close = () => {
    clearTimeout(timer);
    server.close();
  };
  code.finally(close).catch(() => {});
  return { redirectUri: `http://127.0.0.1:${port}/callback`, code, close };
}

export type BrowserLoginOptions = {
  apiBase: string;
  appBase: string;
  project: CliProject;
  rotate?: boolean;
  /** Ask the dashboard for a live key: it runs a step-up before approving. */
  live?: boolean;
  onUrl?: (url: string) => void;
  fetchImpl?: typeof fetch;
  open?: (url: string) => void;
};

/** The dashboard page that approves a CLI login (frontend: /cli/login). */
export function loginUrl(appBase: string, p: {
  state: string;
  challenge: string;
  redirectUri: string;
  project: CliProject;
  live?: boolean;
}): string {
  const u = new URL(`${appBase.replace(/\/$/, "")}/cli/login`);
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("project_id", p.project.projectId);
  if (p.project.projectName) u.searchParams.set("project_name", p.project.projectName);
  if (p.project.machine) u.searchParams.set("machine", p.project.machine);
  if (p.live) u.searchParams.set("mode", "live");
  return u.toString();
}

export async function browserLogin(opts: BrowserLoginOptions): Promise<CliTokenResponse> {
  const state = randomBytes(16).toString("hex");
  const { verifier, challenge } = pkcePair();
  const listener = await startCallbackServer(state, { doneUrl: `${opts.appBase.replace(/\/$/, "")}/cli/done` });
  const url = loginUrl(opts.appBase, {
    state,
    challenge,
    redirectUri: listener.redirectUri,
    project: opts.project,
    live: opts.live,
  });
  opts.onUrl?.(url);
  (opts.open ?? openBrowser)(url);
  const code = await listener.code;
  return postJSON<CliTokenResponse>(
    `${opts.apiBase.replace(/\/$/, "")}/auth/cli/exchange`,
    { code, codeVerifier: verifier, rotate: opts.rotate ?? false },
    opts.fetchImpl,
  );
}

export type DeviceStart = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
};

export type DeviceLoginOptions = {
  apiBase: string;
  project: CliProject;
  rotate?: boolean;
  onCode: (start: DeviceStart) => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

/** RFC 8628: poll at `interval`, back off 5 s on slow_down, stop on anything terminal. */
export async function deviceLogin(opts: DeviceLoginOptions): Promise<CliTokenResponse> {
  const base = opts.apiBase.replace(/\/$/, "");
  const start = await postJSON<DeviceStart>(`${base}/auth/cli/device`, opts.project, opts.fetchImpl);
  opts.onCode(start);
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let interval = Math.max(1, start.interval) * 1000;
  const deadline = Date.now() + start.expiresIn * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    try {
      return await postJSON<CliTokenResponse>(
        `${base}/auth/cli/device/token`,
        { deviceCode: start.deviceCode, rotate: opts.rotate ?? false },
        opts.fetchImpl,
      );
    } catch (err) {
      if (!(err instanceof InfiError)) throw err;
      if (err.code === "authorization_pending") continue;
      if (err.code === "slow_down") {
        interval += 5000;
        continue;
      }
      throw err;
    }
  }
  throw new InfiError("The login code expired. Run `infi login` again.", 400, "expired_token");
}

/** An agent session has no browser of its own: prefer the device code there. */
export function prefersDeviceCode(env: NodeJS.ProcessEnv = process.env, isTTY = process.stdout.isTTY): boolean {
  if (env.INFI_LOGIN_DEVICE === "1") return true;
  if (env.CI || env.CLAUDECODE || env.CURSOR_AGENT || env.CODEX_SANDBOX) return true;
  return !isTTY;
}

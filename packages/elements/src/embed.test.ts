import { afterEach, describe, expect, it, vi } from "vitest";
import { PORTAL_PROTOCOL, createPortalEmbed, portalEmbedUrl } from "./embed.js";

function deliver(source: unknown, origin: string, data: unknown) {
  window.dispatchEvent(new MessageEvent("message", { source: source as MessageEventSource, origin, data }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("portal embed", () => {
  it("never puts the token in the URL", () => {
    const url = portalEmbedUrl({ slug: "loja", mode: "sandbox", token: "bt_secret", embedId: "e1", parentOrigin: "https://loja.test" });
    expect(url).toMatch(/^https:\/\/app-sandbox.beinfi.com\/embed\/sandbox\/loja\/portal\?embedId=e1&parentOrigin=https%3A%2F%2Floja.test&locale=(pt-BR|en)$/);
    expect(url).not.toContain("bt_");
  });

  it("serves the store login from the same frame host, under /login", () => {
    const url = portalEmbedUrl({ slug: "loja", mode: "live", view: "login", embedId: "e1", parentOrigin: "https://loja.test" });
    expect(new URL(url).pathname).toBe("/embed/loja/login");
  });

  it("hands the kept token over after the handshake, and reports a new one", async () => {
    const onToken = vi.fn();
    const handle = createPortalEmbed(document.body, { slug: "loja", mode: "live", token: "bt_kept", onToken });
    const embedId = new URL(handle.iframe.src).searchParams.get("embedId")!;
    const posted = vi.spyOn(handle.iframe.contentWindow!, "postMessage");
    deliver(handle.iframe.contentWindow, "https://app.beinfi.com", { __infi: PORTAL_PROTOCOL, embedId, type: "ready" });
    await Promise.resolve();
    expect(posted).toHaveBeenCalledWith(
      { __infi: PORTAL_PROTOCOL, embedId, type: "set_token", token: "bt_kept" },
      "https://app.beinfi.com",
    );
    deliver(handle.iframe.contentWindow, "https://app.beinfi.com", {
      __infi: PORTAL_PROTOCOL, embedId, type: "token", token: "bt_new", expiresAt: "t",
    });
    expect(onToken).toHaveBeenCalledWith("bt_new", "t");
    handle.destroy();
  });

  it("ignores a forged message: wrong origin, wrong frame or another embed", () => {
    const onToken = vi.fn();
    const handle = createPortalEmbed(document.body, { slug: "loja", mode: "live", onToken });
    const embedId = new URL(handle.iframe.src).searchParams.get("embedId")!;
    const forged = { __infi: PORTAL_PROTOCOL, embedId, type: "token", token: "bt_evil", expiresAt: "t" };
    deliver(handle.iframe.contentWindow, "https://evil.test", forged);
    deliver(window, "https://app.beinfi.com", forged);
    deliver(handle.iframe.contentWindow, "https://app.beinfi.com", { ...forged, embedId: "other" });
    expect(onToken).not.toHaveBeenCalled();
    handle.destroy();
  });
});

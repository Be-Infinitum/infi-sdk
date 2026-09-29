import * as elements from "@beinfi/elements";
import * as elementsReact from "@beinfi/elements-react";
import { describe, expect, it } from "vitest";
import * as legacy from "./index.js";
import * as legacyReact from "./react/index.js";

// @beinfi/checkout is the legacy entry point: it must hand out the very same
// functions as @beinfi/elements, under the names it always had.
describe("legacy @beinfi/checkout", () => {
  it("re-exports the core from @beinfi/elements", () => {
    expect(legacy.createCheckoutEmbed).toBe(elements.createCheckoutEmbed);
    expect(legacy.buildEmbedUrl).toBe(elements.buildEmbedUrl);
    expect(legacy.isEmbedFrame).toBe(elements.isCheckoutFrame);
    expect(legacy.PROTOCOL).toBe("checkout/v1");
  });

  it("re-exports the React component from @beinfi/elements-react", () => {
    expect(legacyReact.InfiCheckoutEmbed).toBe(elementsReact.InfiCheckoutEmbed);
    expect(legacyReact.useCheckoutEmbedControls).toBe(elementsReact.useCheckoutEmbedControls);
  });
});

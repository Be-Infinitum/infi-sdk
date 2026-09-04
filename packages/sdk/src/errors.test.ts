import { describe, expect, it } from "vitest";
import { InfiError, parseErrorResponse, requireSlug,
  requireTaxId,
} from "./errors.js";
import { INFI_ERROR_FIXES, fixForCode } from "./error-fixes.js";

function jsonResponse(body: unknown, status = 422): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// The wire shape a 422 actually has (flat `error_code` + `errors[]`).
const VALIDATION_BODY = {
  error_code: "validation_failed",
  message: "One or more fields are invalid.",
  errors: [
    {
      field: "productId",
      description: "product has no published version; publish it before creating a payment link",
    },
  ],
};

describe("parseErrorResponse", () => {
  it("keeps the field-level details a validation error carries", async () => {
    const err = await parseErrorResponse(jsonResponse(VALIDATION_BODY));

    expect(err.status).toBe(422);
    expect(err.code).toBe("validation_failed");
    expect(err.errors).toEqual([
      {
        field: "productId",
        description: "product has no published version; publish it before creating a payment link",
      },
    ]);
  });

  it("folds the first field description into message, so logging it is enough", async () => {
    const err = await parseErrorResponse(jsonResponse(VALIDATION_BODY));

    expect(err.message).toContain("One or more fields are invalid.");
    expect(err.message).toContain("productId");
    expect(err.message).toContain("product has no published version");
  });

  it("serializes errors[] in toJSON for --json output", async () => {
    const err = await parseErrorResponse(jsonResponse(VALIDATION_BODY));

    expect(err.toJSON()).toMatchObject({
      status: 422,
      code: "validation_failed",
      errors: [{ field: "productId" }],
    });
  });

  it("accepts the nested contract envelope too", async () => {
    const err = await parseErrorResponse(
      jsonResponse({
        error: {
          code: "validation_failed",
          message: "Invalid request.",
          details: [{ field: "slug", message: "required" }],
        },
      }),
    );

    expect(err.code).toBe("validation_failed");
    expect(err.errors).toEqual([{ field: "slug", description: "required" }]);
  });

  it("leaves errors empty (never undefined) when the API sends none", async () => {
    const err = await parseErrorResponse(
      jsonResponse({ message: "Payment link not found." }, 404),
    );

    expect(err.errors).toEqual([]);
    expect(err.message).toBe("Payment link not found.");
  });

  it("survives a non-JSON body", async () => {
    const err = await parseErrorResponse(new Response("<html>502</html>", { status: 502 }));

    expect(err.status).toBe(502);
    expect(err.errors).toEqual([]);
  });
});

describe("requireSlug", () => {
  it("throws a coded error instead of letting `undefined` reach a URL", () => {
    expect(() => requireSlug(undefined, "checkout")).toThrowError(InfiError);
    try {
      requireSlug("   ", "checkout");
    } catch (e) {
      const err = e as InfiError;
      expect(err.status).toBe(400);
      expect(err.code).toBe("missing_slug");
      expect(err.message).toContain("checkout");
      // The fix table should have something runnable for it.
      expect(err.fix?.hint).toBeTruthy();
    }
  });

  it("returns the trimmed slug", () => {
    expect(requireSlug(" acme ", "checkout")).toBe("acme");
  });
});

// The API answers every error with a tracer_id and InfiError used to drop it, so a
// user reporting a failure had nothing for support to search on. Both envelopes are
// covered: flat handler responses carry `tracer_id`, middleware ones nest it.
describe("InfiError tracerId", () => {
  it("keeps the tracer_id from a flat error body", async () => {
    const res = new Response(
      JSON.stringify({ message: "Nope.", error_code: "unauthorized", tracer_id: "ce0a9ed6" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
    const err = await parseErrorResponse(res);
    expect(err.tracerId).toBe("ce0a9ed6");
    expect(err.toJSON().tracerId).toBe("ce0a9ed6");
  });

  it("keeps the request_id from the nested middleware envelope", async () => {
    const res = new Response(
      JSON.stringify({ error: { code: "rate_limited", message: "Slow down.", request_id: "e0484f60" } }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
    const err = await parseErrorResponse(res);
    expect(err.tracerId).toBe("e0484f60");
  });
});

describe("err.fix", () => {
  // A cold-start tester printed `${err.fix}` and got "[object Object]", then
  // followed the `docs` pointer to AGENTS.md — a file that is not in the package
  // and not on the web.
  it("interpolates as one readable line", () => {
    const fix = fixForCode("missing_secret_key");
    expect(String(fix)).toContain("INFI_SECRET_KEY");
    expect(String(fix)).toContain("Run: infi doctor --json");
    // Never a command that CREATES state as the remedy for "cannot find your state".
    expect(String(fix)).not.toContain("infi claim create");
    expect(String(fix)).not.toBe("[object Object]");
  });

  it("still serializes as a plain object, for agents that parse it", () => {
    const parsed = JSON.parse(JSON.stringify(fixForCode("missing_secret_key")));
    expect(parsed).toEqual({
      command: "infi doctor --json",
      hint: expect.stringContaining("INFI_SECRET_KEY"),
      docs: "https://beinfi.com/pt-br/docs/inicio-rapido",
    });
    // Own property, not the one every object inherits: the toString we attach
    // must not be enumerable, or it would land in --json output.
    expect(Object.prototype.hasOwnProperty.call(parsed, "toString")).toBe(false);
  });

  it("every docs pointer is a public URL, never a repo path", () => {
    for (const [code, fix] of Object.entries(INFI_ERROR_FIXES)) {
      if (fix.docs) expect(fix.docs, code).toMatch(/^https:\/\/beinfi\.com\//);
    }
  });
});

describe("requireTaxId", () => {
  it("accepts a CPF and a CNPJ, formatted or not", () => {
    expect(requireTaxId("52998224725")).toBe("52998224725");
    expect(requireTaxId("529.982.247-25")).toBe("52998224725");
    expect(requireTaxId("11222333000181")).toBe("11222333000181");
    expect(requireTaxId("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("rejects absence with the code the checkout answers with", () => {
    // Same code the public charge endpoint returns, so a caller can handle one
    // thing whether it failed early here or late there.
    for (const bad of [undefined, "", "   ", "-.-"]) {
      try {
        requireTaxId(bad);
        throw new Error(`expected a throw for ${JSON.stringify(bad)}`);
      } catch (e) {
        expect(e).toBeInstanceOf(InfiError);
        expect((e as InfiError).code).toBe("customer_tax_id_required");
        expect((e as InfiError).status).toBe(400);
      }
    }
  });

  it("rejects a truncated document instead of passing it to the provider", () => {
    // Presence alone would let this through, and it fails at the PSP — the same
    // late failure with an extra step.
    for (const bad of ["529982247", "5299822472", "112223330001", "1"]) {
      expect(() => requireTaxId(bad)).toThrow(/CPF \(11 digits\) or CNPJ \(14 digits\)/);
    }
  });
});

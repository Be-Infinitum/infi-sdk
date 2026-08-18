import { describe, expect, it } from "vitest";
import { InfiError, parseErrorResponse } from "@beinfi/sdk";
import { errorReport, formatError } from "./output.js";

describe("errorReport", () => {
  it("carries status, code and per-field detail from an InfiError", async () => {
    // Verbatim body from POST /public/v1/claimables with {"intent":"one-time"}.
    const err = await parseErrorResponse(
      new Response(
        JSON.stringify({
          error_code: "validation_failed",
          message: "The request body contains an unknown field.",
          errors: [
            {
              field: "intent",
              description: "unrecognized field; remove it or check the spelling",
            },
          ],
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    const report = errorReport(err);

    expect(report.ok).toBe(false);
    expect(report.error.status).toBe(422);
    expect(report.error.code).toBe("validation_failed");
    expect(report.error.errors).toEqual([
      { field: "intent", description: "unrecognized field; remove it or check the spelling" },
    ]);
    expect(formatError(report)).toContain("intent");
  });

  it("replaces the bare 'Request failed' fallback with the status", () => {
    // HTTP/2 sends no reason phrase, so a non-JSON error body left the CLI
    // printing one useless word.
    const report = errorReport(new InfiError("Request failed", 404));
    expect(report.error.message).toBe("HTTP 404");
  });

  it("surfaces fix.command / fix.hint, which several docs pages promise", () => {
    const report = errorReport(new InfiError("no key", 400, "missing_secret_key"));
    expect(report.error.fix?.command).toBeTruthy();
    expect(formatError(report)).toContain("fix:");
  });

  it("still reports a plain Error", () => {
    const report = errorReport(new Error("boom"));
    expect(report).toEqual({ ok: false, error: { name: "Error", message: "boom" } });
  });
});

describe("fix population", () => {
  // company-as-code.mdx tells agents to read InfiError.fix.command / .hint, and
  // it was undefined on every real 401/404/422.
  it("fills fix for the codes the live API returns", () => {
    for (const code of ["validation_failed", "auth_001", "unauthorized", "not_found"]) {
      const report = errorReport(new InfiError("x", 422, code));
      expect(report.error.fix?.hint, code).toBeTruthy();
    }
  });
});

# Spec — create-beinfi-app (capstone; roadmap)

**Status:** Parked (roadmap). Build AFTER: the marketplace example lands, the SDK is published,
and the examples are normalized into copyable templates. Do not start until those gate.

## Vision

`npx create-beinfi-app` → a founder goes from zero to a running, **billable** app in one command:
pick a starter, pick a framework, we **auto-provision an Infi sandbox** and write the keys into
the app's `.env`. "create-next-app for revenue infrastructure" / the neon.new one-command move.

## Flow

```
npx create-beinfi-app my-app
  → pick a starter:   CRM · Ebook sale · AI chat (credits) · Marketplace billing
  → pick a framework: Next.js · Vite+Hono · (more later)
  → scaffold:         degit the examples/<starter> template → rename → install
  → provision:        create an Infi sandbox → write sk_test_ + slug into .env
  → next steps:       print the claim URL + `bun run dev`
```

## Pieces

1. **Templates** = the normalized `examples/*` (published `@beinfi/sdk`, self-contained,
   `.env.example`). The CLI `degit`s the chosen subdir. (Prereq: "copyable starters" pass.)
2. **Framework variants**: today CRM/ebook are Next.js, ai-chat is Vite+Hono. Grow a matrix
   (starter × framework). Start with what exists; add SvelteKit/Remix/etc. as adapters land.
3. **Auto-sandbox provisioning** — the differentiator. Reuse existing infra:
   - **MCP `beinfi_connect`** (repo `beinfi-mcp`) already provisions tenant + product + `sk_test_`
     + claim URL headlessly (see docs/lovable.mdx). The CLI can call the same backend endpoint
     (`POST /public/v1/sandbox`, `ref="cli"`) directly.
   - Or the existing **`beinfi-cli`** (`/Users/caiofelix/Infinitum/beinfi-cli`) if it exposes a
     non-interactive `sandbox create`. **Open: verify headless provisioning exists / add it.**
   - Write `INFI_SECRET_KEY` (+ slug, pay/auth bases) into `.env`; print the `new.beinfi.com/claim/{id}`
     URL so the founder claims ownership.
4. **Package**: `packages/create-beinfi-app` in this monorepo, published as `create-beinfi-app`
   so `npx`/`npm create beinfi-app` works. Minimal deps (giget/degit + prompts).

## Sequencing (gates)
1. Finish the **marketplace** example (surfaces the last SDK findings).
2. **Publish** `@beinfi/sdk` + `@beinfi/nextjs`.
3. **Normalize examples → templates** (published dep + dev override so they build in-repo AND clone clean).
4. Build **create-beinfi-app** (scaffold + provision).

## Open questions
- Sandbox provisioning: call the backend `POST /public/v1/sandbox` directly from the CLI, or shell
  out to `beinfi-cli`? (Confirm the CLI has a headless command; if not, the direct endpoint is simplest.)
- Distribution of the sandbox `sk_test_`: written to `.env` locally only; never committed.
- Framework matrix: which frameworks at launch (Next.js + Vite for sure).

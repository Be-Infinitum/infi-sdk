# @beinfi/mcp

MCP server for Cursor / Claude agents. Built on `@beinfi/sdk` + CLI libs (company as code).

## Tools

| Tool | Description |
|------|-------------|
| `infi_bootstrap` | Claim + `infi.company.ts` from intent + sync + doctor |
| `infi_claim_create` | Sandbox tenant (`ref`, optional `intent`) |
| `infi_doctor` | Setup diagnostics |
| `infi_go_live_status` | Claim → merchant-of-record admission → `sk_live_` guidance (never invents keys) |
| `infi_sync_plan` | Plan on the server (`POST /config/plan`). Any key; writes nothing |
| `infi_sync_apply` | Plan + apply. Sandbox: applies, returns new webhook secrets once. **Live: proposes** and returns the approval link |
| `infi_pull` | The tenant's company document (`GET /config/document`) |

## Cursor config

```json
{
  "mcpServers": {
    "infi": {
      "command": "npx",
      "args": ["-y", "@beinfi/mcp"]
    }
  }
}
```

## Live keys

With `sk_live_`, `infi_sync_apply` only **proposes**: the server stores the change as a
planned revision and answers 202 with an `approvalUrl`. The tool returns that link for
the human; approving is a dashboard action behind step-up, which no key can obtain, so
nothing changes on live until a person does it. The tool never retries.

Held changes come back as an error listing the option that resolves each
(`adoptUnmanaged`, `archiveOrphaned`, `overwriteDrift`) — the agent asks the human.

`infi_bootstrap`, `infi_onboard` and `infi_claim_create` provision a sandbox and still
refuse any key that is not `sk_test_`.

See [`AGENTS.md`](../../AGENTS.md), ADR 0004 and backend ADR 0025.

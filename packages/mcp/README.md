# @beinfi/mcp

MCP server for Cursor / Claude agents. Built on `@beinfi/sdk` + CLI libs (company as code).

## Tools

| Tool | Description |
|------|-------------|
| `infi_bootstrap` | Claim + `infi.company.ts` from intent + sync + doctor |
| `infi_claim_create` | Sandbox tenant (`ref`, optional `intent`) |
| `infi_doctor` | Setup diagnostics |
| `infi_go_live_status` | Claim → account → KYC guidance (never invents `sk_live_`) |
| `infi_sync_plan` / `infi_sync_apply` | Company-as-code reconcile |
| `infi_pull` | Read backend catalog |

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

See [`AGENTS.md`](../../AGENTS.md) and ADR 0004.
